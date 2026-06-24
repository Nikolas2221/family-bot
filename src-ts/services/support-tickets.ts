import {
  ChannelType,
  MessageFlags,
  PermissionFlagsBits,
  type GuildMember,
  type TextChannel
} from 'discord.js';
import type { StorageApi, SupportTicketConfig, SupportTicketRecord } from '../types';
import {
  buildCloseConfirmation,
  buildCloseReasonModal,
  buildParticipantModal,
  buildTicketControls,
  buildTicketCreateModal,
  buildTicketInfo,
  buildTicketLog,
  buildTicketOpenEmbed,
  buildTicketPanel
} from '../support-ticket-ui';

type CloseAccess = { allowed: boolean; isStaff: boolean };

export interface SupportTicketService {
  handleInteraction(interaction: any): Promise<boolean>;
  findByChannel(channelId: string): SupportTicketRecord | null;
  findOpenByUser(guildId: string, userId: string): SupportTicketRecord[];
}

function isAdministrator(member: any): boolean {
  return Boolean(member?.permissions?.has?.(PermissionFlagsBits.Administrator));
}

function hasSupportRole(member: any, roleId: string): boolean {
  return Boolean(roleId && member?.roles?.cache?.has?.(roleId));
}

function safeChannelName(username: string, userId: string): string {
  const ascii = String(username || '')
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9]/gu, '')
    .toLowerCase()
    .slice(0, 20);
  return `ticket-${ascii || 'user'}-${userId.slice(-6)}`.slice(0, 90);
}

function parseUserId(value: unknown): string {
  return String(value || '').match(/\d{16,20}/u)?.[0] || '';
}

function durationLabel(start: string, end: string): string {
  const milliseconds = Math.max(0, Date.parse(end) - Date.parse(start));
  const minutes = Math.floor(milliseconds / 60_000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const parts = [];
  if (days) parts.push(`${days}д`);
  if (hours % 24) parts.push(`${hours % 24}ч`);
  parts.push(`${minutes % 60}м`);
  return parts.join(' ');
}

export function createSupportTicketService(options: {
  storage: StorageApi;
  client: any;
  config: SupportTicketConfig;
  now?: () => Date;
}): SupportTicketService {
  const { storage, client, config } = options;
  const now = options.now || (() => new Date());
  const creationLocks = new Set<string>();

  function tickets(): SupportTicketRecord[] {
    const store = storage.getStore();
    store.supportTickets = Array.isArray(store.supportTickets) ? store.supportTickets : [];
    store.supportTicketCooldowns = store.supportTicketCooldowns || {};
    return store.supportTickets;
  }

  function findByChannel(channelId: string): SupportTicketRecord | null {
    return tickets().find(ticket => ticket.channelId === channelId) || null;
  }

  function findOpenByUser(guildId: string, userId: string): SupportTicketRecord[] {
    return tickets().filter(ticket => ticket.guildId === guildId && ticket.userId === userId && ticket.status === 'open');
  }

  function isStaff(member: any): boolean {
    return isAdministrator(member) || hasSupportRole(member, config.supportRoleId);
  }

  function closeAccess(interaction: any, ticket: SupportTicketRecord): CloseAccess {
    const staff = isStaff(interaction.member);
    return { allowed: staff || interaction.user.id === ticket.userId, isStaff: staff };
  }

  async function fetchConfiguredChannel(channelId: string): Promise<any | null> {
    if (!channelId) return null;
    return client.channels.fetch(channelId).catch(() => null);
  }

  async function sendLog(guild: any, payload: Record<string, unknown>): Promise<void> {
    if (!config.logChannelId) return;
    const channel = guild.channels.cache.get(config.logChannelId)
      || await guild.channels.fetch(config.logChannelId).catch(() => null);
    if (!channel?.isTextBased?.()) return;
    await channel.send(payload).catch((error: unknown) => console.warn('Support ticket log failed:', error));
  }

  async function updateTicketMessage(channel: any, ticket: SupportTicketRecord): Promise<void> {
    if (!ticket.firstMessageId) return;
    const message = await channel.messages.fetch(ticket.firstMessageId).catch(() => null);
    if (!message) return;
    await message.edit({ embeds: [buildTicketOpenEmbed(ticket)], components: buildTicketControls(ticket.status !== 'open') }).catch(() => null);
  }

  function validateSetup(guild: any): string {
    if (!config.categoryId) return 'Категория тикетов не настроена.';
    if (!config.supportRoleId) return 'Роль поддержки не настроена.';
    const botMember = guild.members.me;
    if (!botMember?.permissions?.has?.(PermissionFlagsBits.ManageChannels)) {
      return 'У бота нет разрешения Manage Channels.';
    }
    return '';
  }

  async function showCreateModal(interaction: any): Promise<void> {
    if (!interaction.guild) {
      await interaction.reply({ content: 'Тикеты нельзя создавать в личных сообщениях.', flags: MessageFlags.Ephemeral });
      return;
    }
    const setupError = validateSetup(interaction.guild);
    if (setupError) {
      await interaction.reply({ content: setupError, flags: MessageFlags.Ephemeral });
      return;
    }
    const existing = findOpenByUser(interaction.guild.id, interaction.user.id);
    if (existing.length >= config.maxOpenPerUser) {
      await interaction.reply({ content: `У тебя уже есть открытый тикет: <#${existing[0].channelId}>`, flags: MessageFlags.Ephemeral });
      return;
    }
    const cooldownKey = `${interaction.guild.id}:${interaction.user.id}`;
    const lastCreated = Number(storage.getStore().supportTicketCooldowns[cooldownKey] || 0);
    const secondsLeft = Math.ceil((config.cooldownSeconds * 1000 - (Date.now() - lastCreated)) / 1000);
    if (secondsLeft > 0) {
      await interaction.reply({ content: `Подожди ${secondsLeft} сек. перед созданием нового тикета.`, flags: MessageFlags.Ephemeral });
      return;
    }
    await interaction.showModal(buildTicketCreateModal());
  }

  async function createTicket(interaction: any): Promise<void> {
    const guild = interaction.guild;
    if (!guild) return;
    const lockKey = `${guild.id}:${interaction.user.id}`;
    if (creationLocks.has(lockKey)) {
      await interaction.reply({ content: 'Тикет уже создаётся. Подожди несколько секунд.', flags: MessageFlags.Ephemeral });
      return;
    }
    creationLocks.add(lockKey);
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    let createdChannel: any = null;
    let createdRecord: SupportTicketRecord | null = null;
    try {
      const setupError = validateSetup(guild);
      if (setupError) {
        await interaction.editReply({ content: setupError });
        return;
      }
      const open = findOpenByUser(guild.id, interaction.user.id);
      if (open.length >= config.maxOpenPerUser) {
        await interaction.editReply({ content: `У тебя уже есть открытый тикет: <#${open[0].channelId}>` });
        return;
      }
      const category = guild.channels.cache.get(config.categoryId)
        || await guild.channels.fetch(config.categoryId).catch(() => null);
      if (!category || category.type !== ChannelType.GuildCategory) {
        await interaction.editReply({ content: 'Категория тикетов не найдена. Обратись к администратору.' });
        return;
      }
      const supportRole = guild.roles.cache.get(config.supportRoleId)
        || await guild.roles.fetch(config.supportRoleId).catch(() => null);
      if (!supportRole) {
        await interaction.editReply({ content: 'Роль поддержки не найдена. Обратись к администратору.' });
        return;
      }

      const topic = String(interaction.fields.getTextInputValue('topic') || '').trim().slice(0, 150);
      const description = String(interaction.fields.getTextInputValue('description') || '').trim().slice(0, 1500);
      const evidence = String(interaction.fields.getTextInputValue('evidence') || '').trim().slice(0, 1000);
      const channelName = safeChannelName(interaction.user.username, interaction.user.id);
      const channel = await guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        parent: category.id,
        topic: `support-ticket:${interaction.user.id}`,
        permissionOverwrites: [
          { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
          {
            id: interaction.user.id,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks]
          },
          {
            id: supportRole.id,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks]
          }
        ],
        reason: `Support ticket created by ${interaction.user.id}`
      });
      createdChannel = channel;

      const createdAt = now().toISOString();
      const record: SupportTicketRecord = {
        channelId: channel.id,
        channelName: channel.name,
        userId: interaction.user.id,
        guildId: guild.id,
        createdAt,
        status: 'open',
        topic,
        description,
        evidence,
        claimedBy: null,
        closedAt: null,
        closedBy: null,
        closeReason: null,
        addedUserIds: []
      };
      createdRecord = record;
      tickets().unshift(record);
      storage.getStore().supportTicketCooldowns[lockKey] = Date.now();
      storage.save();

      const firstMessage = await channel.send({
        content: config.pingSupport ? `<@&${supportRole.id}>` : undefined,
        allowedMentions: { roles: config.pingSupport ? [supportRole.id] : [] },
        embeds: [buildTicketOpenEmbed(record)],
        components: buildTicketControls()
      });
      record.firstMessageId = firstMessage.id;
      storage.save();

      await sendLog(guild, {
        embeds: [buildTicketLog('🎟️ Тикет создан', [
          { name: 'Пользователь', value: `<@${record.userId}>`, inline: true },
          { name: 'ID пользователя', value: record.userId, inline: true },
          { name: 'Канал', value: `<#${record.channelId}>`, inline: true },
          { name: 'Тема', value: record.topic },
          { name: 'Описание', value: record.description },
          { name: 'Дата создания', value: new Date(record.createdAt).toLocaleString('ru-RU') }
        ], 0x2ecc71)]
      });
      await interaction.editReply({ content: `Тикет создан: <#${channel.id}>` });
    } catch (error) {
      console.error('Support ticket creation failed:', error);
      if (createdRecord) {
        storage.getStore().supportTickets = tickets().filter(ticket => ticket !== createdRecord);
        delete storage.getStore().supportTicketCooldowns[lockKey];
        storage.save();
      }
      if (createdChannel && createdChannel.deletable !== false) {
        await createdChannel.delete?.('Rollback failed support ticket creation').catch(() => null);
      }
      await interaction.editReply({ content: 'Не удалось создать тикет. Проверь права бота и настройки.' }).catch(() => null);
    } finally {
      creationLocks.delete(lockKey);
    }
  }

  function requireOpenTicket(interaction: any): SupportTicketRecord | null {
    const ticket = findByChannel(interaction.channelId || interaction.channel?.id || '');
    return ticket?.status === 'open' ? ticket : null;
  }

  async function claim(interaction: any): Promise<void> {
    const ticket = requireOpenTicket(interaction);
    if (!ticket) {
      await interaction.reply({ content: 'Эта команда доступна только внутри открытого тикета.', flags: MessageFlags.Ephemeral });
      return;
    }
    if (!isStaff(interaction.member)) {
      await interaction.reply({ content: 'Только поддержка или администратор может взять тикет.', flags: MessageFlags.Ephemeral });
      return;
    }
    if (ticket.claimedBy && ticket.claimedBy !== interaction.user.id && !isAdministrator(interaction.member)) {
      await interaction.reply({ content: `Тикет уже взял <@${ticket.claimedBy}>.`, flags: MessageFlags.Ephemeral });
      return;
    }
    await interaction.deferReply();
    ticket.claimedBy = interaction.user.id;
    storage.save();
    await updateTicketMessage(interaction.channel, ticket);
    await interaction.editReply({ content: `Тикет взял в работу <@${interaction.user.id}>` });
    await sendLog(interaction.guild, { embeds: [buildTicketLog('👤 Тикет взят в работу', [
      { name: 'Канал', value: `<#${ticket.channelId}>` },
      { name: 'Ответственный', value: `<@${interaction.user.id}>` }
    ])] });
  }

  async function manageParticipant(interaction: any, action: 'add' | 'remove', userId: string): Promise<void> {
    const ticket = requireOpenTicket(interaction);
    if (!ticket) {
      await interaction.reply({ content: 'Эта команда доступна только внутри открытого тикета.', flags: MessageFlags.Ephemeral });
      return;
    }
    if (!isStaff(interaction.member)) {
      await interaction.reply({ content: 'Только поддержка или администратор может управлять участниками.', flags: MessageFlags.Ephemeral });
      return;
    }
    if (!userId) {
      await interaction.reply({ content: 'Укажи корректный ID пользователя или mention.', flags: MessageFlags.Ephemeral });
      return;
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const member = await interaction.guild.members.fetch(userId).catch(() => null);
    if (!member) {
      await interaction.editReply({ content: 'Пользователь не найден на сервере.' });
      return;
    }
    if (action === 'remove' && (userId === ticket.userId || hasSupportRole(member, config.supportRoleId) || isAdministrator(member))) {
      await interaction.editReply({ content: 'Нельзя убрать автора тикета, поддержку или администратора.' });
      return;
    }

    if (action === 'add') {
      await interaction.channel.permissionOverwrites.edit(userId, {
        ViewChannel: true, SendMessages: true, ReadMessageHistory: true, AttachFiles: true, EmbedLinks: true
      });
      ticket.addedUserIds = [...new Set([...(ticket.addedUserIds || []), userId])];
    } else {
      await interaction.channel.permissionOverwrites.delete(userId);
      ticket.addedUserIds = (ticket.addedUserIds || []).filter(id => id !== userId);
    }
    storage.save();
    const verb = action === 'add' ? 'добавлен в' : 'удалён из';
    await interaction.channel.send({ content: `<@${userId}> был ${verb} тикета сотрудником <@${interaction.user.id}>` });
    await interaction.editReply({ content: 'Готово.' });
    await sendLog(interaction.guild, { embeds: [buildTicketLog(action === 'add' ? '➕ Участник добавлен' : '➖ Участник удалён', [
      { name: 'Канал', value: `<#${ticket.channelId}>` },
      { name: 'Участник', value: `<@${userId}>` },
      { name: 'Сотрудник', value: `<@${interaction.user.id}>` }
    ])] });
  }

  async function createTranscript(channel: any): Promise<Buffer | null> {
    try {
      const messages: any[] = [];
      let before: string | undefined;
      while (messages.length < 1000) {
        const batch = await channel.messages.fetch({ limit: 100, before });
        if (!batch.size) break;
        messages.push(...batch.values());
        before = batch.last()?.id;
        if (batch.size < 100) break;
      }
      messages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
      const lines = messages.map(message => {
        const date = new Date(message.createdTimestamp).toISOString();
        const author = message.author?.tag || message.author?.username || message.author?.id || 'unknown';
        const attachments = message.attachments?.map?.((attachment: any) => attachment.url).join(' ') || '';
        return `[${date}] ${author}: ${String(message.content || '').replace(/\r?\n/gu, ' ')} ${attachments}`.trim();
      });
      return Buffer.from(lines.join('\n') || 'В тикете нет текстовых сообщений.', 'utf8');
    } catch (error) {
      console.warn('Support ticket transcript failed:', error);
      return null;
    }
  }

  async function closeTicket(interaction: any, reason: string): Promise<void> {
    const ticket = requireOpenTicket(interaction);
    if (!ticket) {
      await interaction.reply({ content: 'Эта команда доступна только внутри открытого тикета.', flags: MessageFlags.Ephemeral });
      return;
    }
    if (!closeAccess(interaction, ticket).allowed) {
      await interaction.reply({ content: 'Ты не можешь закрыть этот тикет.', flags: MessageFlags.Ephemeral });
      return;
    }
    await interaction.deferReply();
    const closedAt = now().toISOString();
    ticket.status = 'closed';
    ticket.closedAt = closedAt;
    ticket.closedBy = interaction.user.id;
    ticket.closeReason = String(reason || '').trim().slice(0, 500) || 'Не указана';
    delete storage.getStore().supportTicketCooldowns[`${ticket.guildId}:${ticket.userId}`];
    storage.save();
    await updateTicketMessage(interaction.channel, ticket);
    await interaction.editReply({ content: `Тикет будет закрыт через ${config.deleteDelaySeconds} секунд.` });
    const transcript = await createTranscript(interaction.channel);
    const logPayload: any = {
      embeds: [buildTicketLog('🔒 Тикет закрыт', [
        { name: 'Создатель тикета', value: `<@${ticket.userId}>`, inline: true },
        { name: 'Закрыл', value: `<@${interaction.user.id}>`, inline: true },
        { name: 'Канал', value: ticket.channelName, inline: true },
        { name: 'Причина', value: ticket.closeReason },
        { name: 'Дата создания', value: new Date(ticket.createdAt).toLocaleString('ru-RU'), inline: true },
        { name: 'Дата закрытия', value: new Date(closedAt).toLocaleString('ru-RU'), inline: true },
        { name: 'Время обработки', value: durationLabel(ticket.createdAt, closedAt) }
      ], 0xe74c3c)]
    };
    if (transcript) logPayload.files = [{ attachment: transcript, name: `transcript-${ticket.channelId}.txt` }];
    await sendLog(interaction.guild, logPayload);
    setTimeout(() => {
      void interaction.channel.delete(`Support ticket closed by ${interaction.user.id}`).catch((error: unknown) => {
        console.warn('Support ticket channel deletion failed:', error);
      });
    }, config.deleteDelaySeconds * 1000);
  }

  async function requestClose(interaction: any): Promise<void> {
    const ticket = requireOpenTicket(interaction);
    if (!ticket) {
      await interaction.reply({ content: 'Эта команда доступна только внутри открытого тикета.', flags: MessageFlags.Ephemeral });
      return;
    }
    if (!closeAccess(interaction, ticket).allowed) {
      await interaction.reply({ content: 'Ты не можешь закрыть этот тикет.', flags: MessageFlags.Ephemeral });
      return;
    }
    await interaction.reply({ ...buildCloseConfirmation(), flags: MessageFlags.Ephemeral });
  }

  async function handleCommand(interaction: any): Promise<void> {
    const subcommand = interaction.options.getSubcommand();
    if (subcommand === 'setup') {
      if (!isAdministrator(interaction.member)) {
        await interaction.reply({ content: 'Требуется разрешение Administrator.', flags: MessageFlags.Ephemeral });
        return;
      }
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const target = config.panelChannelId ? await fetchConfiguredChannel(config.panelChannelId) : interaction.channel;
      if (!target?.isTextBased?.()) {
        await interaction.editReply({ content: 'Канал панели не найден.' });
        return;
      }
      await target.send(buildTicketPanel());
      await interaction.editReply({ content: `Панель тикетов отправлена в <#${target.id}>.` });
      return;
    }
    if (subcommand === 'info') {
      await interaction.reply(buildTicketInfo());
      return;
    }
    if (subcommand === 'close') return requestClose(interaction);
    if (subcommand === 'claim') return claim(interaction);
    if (subcommand === 'add' || subcommand === 'remove') {
      const user = interaction.options.getUser('user', true);
      return manageParticipant(interaction, subcommand, user.id);
    }
    if (subcommand === 'list') {
      if (!isStaff(interaction.member)) {
        await interaction.reply({ content: 'Только поддержка или администратор может просматривать список.', flags: MessageFlags.Ephemeral });
        return;
      }
      const open = tickets().filter(ticket => ticket.guildId === interaction.guild.id && ticket.status === 'open');
      await interaction.reply({
        content: open.length
          ? open.slice(0, 25).map((ticket, index) => `${index + 1}. <#${ticket.channelId}> • <@${ticket.userId}>${ticket.claimedBy ? ` • <@${ticket.claimedBy}>` : ''}`).join('\n')
          : 'Открытых тикетов нет.',
        flags: MessageFlags.Ephemeral
      });
    }
  }

  async function handleInteraction(interaction: any): Promise<boolean> {
    if (interaction.isChatInputCommand?.() && interaction.commandName === 'ticket') {
      await handleCommand(interaction);
      return true;
    }
    if (interaction.isButton?.()) {
      if (interaction.customId === 'ticket_create') {
        await showCreateModal(interaction);
        return true;
      }
      if (interaction.customId === 'support_ticket_close') {
        await requestClose(interaction);
        return true;
      }
      if (interaction.customId === 'support_ticket_claim') {
        await claim(interaction);
        return true;
      }
      if (interaction.customId === 'support_ticket_add' || interaction.customId === 'support_ticket_remove') {
        const action = interaction.customId.endsWith('_add') ? 'add' : 'remove';
        const ticket = requireOpenTicket(interaction);
        if (!ticket) {
          await interaction.reply({ content: 'Эта команда доступна только внутри открытого тикета.', flags: MessageFlags.Ephemeral });
          return true;
        }
        if (!isStaff(interaction.member)) {
          await interaction.reply({ content: 'Только поддержка или администратор может управлять участниками.', flags: MessageFlags.Ephemeral });
          return true;
        }
        await interaction.showModal(buildParticipantModal(action));
        return true;
      }
      if (interaction.customId === 'support_ticket_close_confirm') {
        const ticket = requireOpenTicket(interaction);
        if (!ticket || !closeAccess(interaction, ticket).allowed) {
          await interaction.reply({ content: 'Ты не можешь закрыть этот тикет.', flags: MessageFlags.Ephemeral });
          return true;
        }
        await interaction.showModal(buildCloseReasonModal());
        return true;
      }
      if (interaction.customId === 'support_ticket_close_cancel') {
        await interaction.update({ content: 'Закрытие отменено.', components: [] });
        return true;
      }
    }
    if (interaction.isModalSubmit?.()) {
      if (interaction.customId === 'ticket_create_modal') {
        await createTicket(interaction);
        return true;
      }
      if (interaction.customId === 'support_ticket_close_modal') {
        await closeTicket(interaction, interaction.fields.getTextInputValue('reason'));
        return true;
      }
      if (interaction.customId === 'support_ticket_add_modal' || interaction.customId === 'support_ticket_remove_modal') {
        const action = interaction.customId.includes('_add_') ? 'add' : 'remove';
        await manageParticipant(interaction, action, parseUserId(interaction.fields.getTextInputValue('user')));
        return true;
      }
    }
    return false;
  }

  return { handleInteraction, findByChannel, findOpenByUser };
}

export { durationLabel, parseUserId, safeChannelName };
