import crypto from 'node:crypto';
import { MessageFlags, PermissionFlagsBits } from 'discord.js';
import { getUnsafeAssignableRoleReasonAsync } from '../role-safety';
import type { AfkLeaveConfig, AfkPanelRecord, AfkRequestRecord, StorageApi } from '../types';
import type { TelegramNotificationService } from '../telegram';
import {
  buildAfkDeclineModal,
  buildAfkLog,
  buildAfkPanel,
  buildAfkRequestEmbed,
  buildAfkRequestModal,
  buildAfkReviewButtons,
  statusLabel
} from '../afk-leave-ui';

interface ParsedAfkForm {
  nicknameStatic: string;
  startDate: string;
  endDate: string;
  reason: string;
}

export interface AfkLeaveService {
  handleInteraction(interaction: any): Promise<boolean>;
  handleMessage(message: any): Promise<boolean>;
  findRequest(requestId: string): AfkRequestRecord | null;
  pendingFor(guildId: string, userId: string): AfkRequestRecord | null;
  reviewFromTelegram(requestId: string, decision: 'approved' | 'declined', actorId: string, actorName: string, declineReason?: string): Promise<'ok' | 'not_found' | 'already_reviewed' | 'busy' | 'reason_required' | 'guild_missing' | 'failed'>;
}

function parseDate(value: string): Date | null {
  const match = String(value || '').trim().match(/^(\d{2})\.(\d{2})\.(\d{4})$/u);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date : null;
}

function normalizeDate(value: string): string {
  return String(value || '').trim();
}

export function validateAfkForm(form: ParsedAfkForm): string {
  if (!form.nicknameStatic.trim()) return 'Укажи ник и статик.';
  const start = parseDate(form.startDate);
  const end = parseDate(form.endDate);
  if (!start || !end) return 'Используй даты в формате ДД.ММ.ГГГГ.';
  if (start.getTime() > end.getTime()) return 'Дата окончания не может быть раньше даты начала.';
  if (!form.reason.trim()) return 'Укажи причину отпуска.';
  return '';
}

export function parseAfkMessage(content: string): ParsedAfkForm | null {
  const values: Record<string, string> = {};
  let current = '';
  for (const rawLine of String(content || '').split(/\r?\n/u)) {
    const line = rawLine.trim();
    const match = line.match(/^([123])[.)]\s*(.*)$/u);
    if (match) {
      current = match[1];
      values[current] = match[2].trim();
    } else if (current && line) {
      values[current] = `${values[current]} ${line}`.trim();
    }
  }
  if (!values['1'] || !values['2'] || !values['3']) return null;
  const dates = values['2'].match(/(\d{2}\.\d{2}\.\d{4})\s*(?:-|—|–|по)\s*(\d{2}\.\d{2}\.\d{4})/u);
  if (!dates) return null;
  return {
    nicknameStatic: values['1'].slice(0, 100),
    startDate: dates[1],
    endDate: dates[2],
    reason: values['3'].slice(0, 1000)
  };
}

export function createAfkLeaveService(options: {
  storage: StorageApi;
  client: any;
  config: AfkLeaveConfig;
  telegramNotifications?: Pick<TelegramNotificationService, 'notifyAfkRequestCreated'>;
  now?: () => Date;
}): AfkLeaveService {
  const { storage, client, config, telegramNotifications } = options;
  const now = options.now || (() => new Date());
  const submissionLocks = new Set<string>();
  const reviewLocks = new Set<string>();

  function store() {
    const current = storage.getStore();
    current.afkPanels = current.afkPanels || {};
    current.afkRequests = Array.isArray(current.afkRequests) ? current.afkRequests : [];
    return current;
  }

  function findRequest(requestId: string): AfkRequestRecord | null {
    const normalized = String(requestId || '').trim().replace(/^#/, '');
    return store().afkRequests.find(request => request.id === normalized) || null;
  }

  function pendingFor(guildId: string, userId: string): AfkRequestRecord | null {
    return store().afkRequests.find(request => request.guildId === guildId && request.userId === userId && request.status === 'pending') || null;
  }

  function canManage(member: any): boolean {
    return Boolean(
      member?.permissions?.has?.(PermissionFlagsBits.Administrator)
      || (config.managerRoleId && member?.roles?.cache?.has?.(config.managerRoleId))
    );
  }

  async function getAfkChannel(guild: any): Promise<any | null> {
    if (!config.channelId) return null;
    const channel = guild.channels.cache.get(config.channelId)
      || await guild.channels.fetch(config.channelId).catch(() => null);
    return channel?.isTextBased?.() ? channel : null;
  }

  async function sendLog(guild: any, payload: Record<string, unknown>): Promise<void> {
    if (!config.logChannelId) return;
    const channel = guild.channels.cache.get(config.logChannelId)
      || await guild.channels.fetch(config.logChannelId).catch(() => null);
    if (!channel?.isTextBased?.()) return;
    await channel.send(payload).catch((error: unknown) => console.warn('AFK leave log failed:', error));
  }

  function messageUrl(request: AfkRequestRecord): string {
    if (!request.guildId || !request.channelId || !request.messageId) return 'Не указано';
    return `https://discord.com/channels/${request.guildId}/${request.channelId}/${request.messageId}`;
  }

  function missingPermissions(channel: any, guild: any): string[] {
    const permissions = channel.permissionsFor?.(guild.members.me) || guild.members.me?.permissions;
    if (!permissions?.has) return ['Send Messages', 'Embed Links', 'Add Reactions', 'Read Message History'];
    return [
      [PermissionFlagsBits.SendMessages, 'Send Messages'],
      [PermissionFlagsBits.EmbedLinks, 'Embed Links'],
      [PermissionFlagsBits.AddReactions, 'Add Reactions'],
      [PermissionFlagsBits.ReadMessageHistory, 'Read Message History']
    ].filter(([flag]) => !permissions.has(flag)).map(([, label]) => String(label));
  }

  async function publishPanel(interaction: any): Promise<void> {
    if (!interaction.guild) {
      await interaction.reply({ content: 'Команда недоступна в личных сообщениях.', flags: MessageFlags.Ephemeral });
      return;
    }
    if (!canManage(interaction.member)) {
      await interaction.reply({ content: 'Недостаточно прав для управления АФК-панелью.', flags: MessageFlags.Ephemeral });
      return;
    }
    if (!config.channelId) {
      await interaction.reply({ content: 'AFK_CHANNEL_ID не настроен.', flags: MessageFlags.Ephemeral });
      return;
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const channel = await getAfkChannel(interaction.guild);
    if (!channel) {
      await interaction.editReply({ content: 'Канал АФК-отпусков не найден.' });
      return;
    }
    const missing = missingPermissions(channel, interaction.guild);
    if (missing.length) {
      await interaction.editReply({ content: `Боту не хватает прав: ${missing.join(', ')}.` });
      return;
    }

    const panels = store().afkPanels;
    const saved = panels[interaction.guild.id];
    if (saved?.channelId && saved.channelId !== channel.id && saved.messageId) {
      const oldChannel = await client.channels.fetch(saved.channelId).catch(() => null);
      const oldMessage = oldChannel?.isTextBased?.()
        ? await oldChannel.messages.fetch(saved.messageId).catch(() => null)
        : null;
      await oldMessage?.delete?.().catch(() => null);
    }
    let panelMessage = saved?.channelId === channel.id && saved.messageId
      ? await channel.messages.fetch(saved.messageId).catch(() => null)
      : null;
    const payload = buildAfkPanel();
    const timestamp = now().toISOString();
    let created = false;
    if (panelMessage) {
      await panelMessage.edit(payload);
    } else {
      panelMessage = await channel.send(payload);
      created = true;
    }

    const panelRecord: AfkPanelRecord = {
      guildId: interaction.guild.id,
      channelId: channel.id,
      messageId: panelMessage.id,
      createdAt: saved?.createdAt || timestamp,
      updatedAt: timestamp
    };
    panels[interaction.guild.id] = panelRecord;
    storage.save();

    let pinWarning = '';
    if (config.pinPanel && !panelMessage.pinned) {
      const pinned = await panelMessage.pin().then(() => true).catch(() => false);
      if (!pinned) pinWarning = ' Не удалось закрепить сообщение: проверь право Manage Messages.';
    }
    await interaction.editReply({
      content: `Панель АФК-отпуска ${created ? 'опубликована' : 'обновлена'}.${pinWarning}`
    });
  }

  async function sendCreatedLog(guild: any, request: AfkRequestRecord): Promise<void> {
    await sendLog(guild, { embeds: [buildAfkLog('🏖️ Новая заявка на АФК-отпуск', [
      { name: 'Пользователь', value: `<@${request.userId}>`, inline: true },
      { name: 'ID пользователя', value: request.userId, inline: true },
      { name: 'Ник и статик', value: request.nicknameStatic },
      { name: 'Период', value: `${request.startDate} - ${request.endDate}` },
      { name: 'Причина', value: request.reason },
      { name: 'Сообщение заявки', value: messageUrl(request) },
      { name: 'Дата подачи', value: new Date(request.createdAt).toLocaleString('ru-RU') }
    ], 0xf39c12)] });
  }

  async function notifyTelegram(request: AfkRequestRecord): Promise<void> {
    if (!telegramNotifications) return;
    await telegramNotifications.notifyAfkRequestCreated({ request }).catch((error: unknown) => {
      console.warn('AFK Telegram notification failed:', error);
    });
  }

  function makeRequest(guildId: string, channelId: string, userId: string, form: ParsedAfkForm, source: 'modal' | 'message'): AfkRequestRecord {
    return {
      id: crypto.randomBytes(4).toString('hex'),
      guildId,
      channelId,
      messageId: '',
      userId,
      nicknameStatic: form.nicknameStatic.trim().slice(0, 100),
      startDate: normalizeDate(form.startDate),
      endDate: normalizeDate(form.endDate),
      reason: form.reason.trim().slice(0, 1000),
      status: 'pending',
      createdAt: now().toISOString(),
      reviewedAt: null,
      reviewedBy: null,
      declineReason: null,
      source
    };
  }

  async function submitModal(interaction: any): Promise<void> {
    if (!interaction.guild) return;
    const lockKey = `${interaction.guild.id}:${interaction.user.id}`;
    if (submissionLocks.has(lockKey)) {
      await interaction.reply({ content: 'Заявка уже создаётся.', flags: MessageFlags.Ephemeral });
      return;
    }
    submissionLocks.add(lockKey);
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      const existing = pendingFor(interaction.guild.id, interaction.user.id);
      if (existing) {
        await interaction.editReply({ content: `У тебя уже есть заявка на рассмотрении: ${existing.id}.` });
        return;
      }
      const channel = await getAfkChannel(interaction.guild);
      if (!channel) {
        await interaction.editReply({ content: 'Канал АФК-отпусков не найден.' });
        return;
      }
      const form: ParsedAfkForm = {
        nicknameStatic: interaction.fields.getTextInputValue('nickname_static'),
        startDate: interaction.fields.getTextInputValue('start_date'),
        endDate: interaction.fields.getTextInputValue('end_date'),
        reason: interaction.fields.getTextInputValue('reason')
      };
      const error = validateAfkForm(form);
      if (error) {
        await interaction.editReply({ content: error });
        return;
      }
      const request = makeRequest(interaction.guild.id, channel.id, interaction.user.id, form, 'modal');
      const message = await channel.send({
        embeds: [buildAfkRequestEmbed(request)],
        components: buildAfkReviewButtons(request.id),
        allowedMentions: { parse: [] }
      });
      request.messageId = message.id;
      store().afkRequests.unshift(request);
      storage.save();
      await message.react('⏳').catch(() => null);
      await sendCreatedLog(interaction.guild, request);
      await notifyTelegram(request);
      await interaction.editReply({ content: `Заявка принята на рассмотрение. ID: ${request.id}` });
    } catch (error) {
      console.error('AFK modal submission failed:', error);
      await interaction.editReply({ content: 'Не удалось создать заявку. Попробуй позже.' }).catch(() => null);
    } finally {
      submissionLocks.delete(lockKey);
    }
  }

  async function handleMessage(message: any): Promise<boolean> {
    if (!config.useMessageForm || !config.channelId || message.channel?.id !== config.channelId) return false;
    if (!message.guild || message.author?.bot || message.webhookId) return false;
    const form = parseAfkMessage(message.content);
    if (!form || validateAfkForm(form)) {
      await message.reply({
        content: 'Заявка заполнена неверно. Используй форму: 1. Ник и статик 2. Даты 3. Причина.',
        allowedMentions: { repliedUser: true }
      }).catch(() => null);
      return true;
    }
    const existing = pendingFor(message.guild.id, message.author.id);
    if (existing) {
      await message.reply({ content: `У тебя уже есть заявка на рассмотрении: ${existing.id}.`, allowedMentions: { repliedUser: true } }).catch(() => null);
      return true;
    }
    const request = makeRequest(message.guild.id, message.channel.id, message.author.id, form, 'message');
    request.messageId = message.id;
    store().afkRequests.unshift(request);
    storage.save();
    await message.react('⏳').catch(() => null);
    await message.reply({ content: `Заявка принята на рассмотрение. ID: ${request.id}`, allowedMentions: { repliedUser: true } }).catch(() => null);
    await sendCreatedLog(message.guild, request);
    await notifyTelegram(request);
    return true;
  }

  async function fetchRequestMessage(request: AfkRequestRecord): Promise<any | null> {
    const channel = await client.channels.fetch(request.channelId).catch(() => null);
    if (!channel?.isTextBased?.()) return null;
    return channel.messages.fetch(request.messageId).catch(() => null);
  }

  async function notifyUser(request: AfkRequestRecord): Promise<void> {
    if (!config.allowDmNotify) return;
    const user = await client.users.fetch(request.userId).catch(() => null);
    if (!user) return;
    const content = request.status === 'approved'
      ? 'Ваша заявка на АФК-отпуск была одобрена.'
      : `Ваша заявка на АФК-отпуск была отклонена. Причина: ${request.declineReason || 'Не указана'}`;
    await user.send({ content }).catch(() => null);
  }

  type ReviewResult = 'ok' | 'not_found' | 'already_reviewed' | 'busy' | 'reason_required' | 'failed';

  async function applyReview(input: {
    guild: any;
    requestId: string;
    decision: 'approved' | 'declined';
    declineReason?: string;
    actorId: string;
    actorName?: string;
  }): Promise<ReviewResult> {
    const { guild, requestId, decision, declineReason = '', actorId, actorName = '' } = input;
    if (decision === 'declined' && String(declineReason).trim().length < 3) return 'reason_required';
    const request = findRequest(requestId);
    if (!request || request.guildId !== guild.id) return 'not_found';
    if (request.status !== 'pending') return 'already_reviewed';
    if (reviewLocks.has(request.id)) return 'busy';
    reviewLocks.add(request.id);
    try {
      if (request.status !== 'pending') return 'already_reviewed';
      request.status = decision;
      request.reviewedAt = now().toISOString();
      request.reviewedBy = actorId;
      request.reviewedByName = actorName || null;
      request.declineReason = decision === 'declined' ? (String(declineReason || '').trim().slice(0, 500) || 'Не указана') : null;
      storage.save();

      if (decision === 'approved' && config.approvedRoleId) {
        const member = guild.members.cache?.get?.(request.userId)
          || await guild.members.fetch(request.userId).catch(() => null);
        if (!member) {
          console.warn(`AFK approved role was not assigned: member ${request.userId} not found`);
        } else {
          const canInspectRoles = Boolean(guild.roles?.cache || guild.roles?.fetch);
          let role = guild.roles?.cache?.get?.(config.approvedRoleId) || null;
          if (!role && typeof guild.roles?.fetch === 'function') {
            role = await guild.roles.fetch(config.approvedRoleId).catch(() => null);
          }
          const unsafeReason = role ? await getUnsafeAssignableRoleReasonAsync(role, { guild }) : '';
          if (canInspectRoles && !role) {
            console.warn(`AFK approved role assignment blocked for ${config.approvedRoleId}: роль не найдена`);
          } else if (unsafeReason) {
            console.warn(`AFK approved role assignment blocked for ${config.approvedRoleId}: ${unsafeReason}`);
          } else {
            await member.roles.add(role || config.approvedRoleId, `AFK request ${request.id} approved by ${actorName || actorId}`)
              .catch((error: unknown) => console.warn('AFK approved role assignment failed:', error));
          }
        }
      }

      const message = await fetchRequestMessage(request);
      if (message) {
        if (request.source === 'modal' || message.author?.id === client.user?.id) {
          await message.edit({ embeds: [buildAfkRequestEmbed(request)], components: [] }).catch(() => null);
        }
        await message.react(decision === 'approved' ? '✅' : '❌').catch(() => null);
        const pendingReaction = message.reactions?.resolve?.('⏳');
        await pendingReaction?.users?.remove?.(client.user?.id).catch(() => null);
      }
      await notifyUser(request);

      const approved = decision === 'approved';
      const reviewerLabel = actorName || `<@${actorId}>`;
      await sendLog(guild, { embeds: [buildAfkLog(
        approved ? '✅ Заявка на АФК-отпуск одобрена' : '❌ Заявка на АФК-отпуск отклонена',
        [
          { name: 'Пользователь', value: `<@${request.userId}>`, inline: true },
          { name: approved ? 'Одобрил' : 'Отклонил', value: reviewerLabel, inline: true },
          { name: 'Период', value: `${request.startDate} - ${request.endDate}` },
          ...(approved ? [] : [{ name: 'Причина отклонения', value: request.declineReason || 'Не указана' }]),
          { name: approved ? 'Дата одобрения' : 'Дата отклонения', value: new Date(request.reviewedAt).toLocaleString('ru-RU') },
          { name: 'Сообщение заявки', value: messageUrl(request) }
        ],
        approved ? 0x2ecc71 : 0xe74c3c
      )] });
      return 'ok';
    } catch (error) {
      console.error('AFK request review failed:', error);
      return 'failed';
    } finally {
      reviewLocks.delete(request.id);
    }
  }

  async function review(interaction: any, requestId: string, decision: 'approved' | 'declined', declineReason = ''): Promise<void> {
    if (!interaction.guild || !canManage(interaction.member)) {
      await interaction.reply({ content: 'Недостаточно прав для рассмотрения заявок.', flags: MessageFlags.Ephemeral });
      return;
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const result = await applyReview({
      guild: interaction.guild,
      requestId,
      decision,
      declineReason,
      actorId: interaction.user.id
    });
    const content = result === 'ok'
      ? `Заявка ${requestId}: ${statusLabel(decision)}.`
      : result === 'not_found'
        ? 'Заявка не найдена.'
        : result === 'already_reviewed'
          ? 'Эта заявка уже была рассмотрена.'
          : result === 'busy'
            ? 'Эта заявка уже рассматривается другим сотрудником.'
            : result === 'reason_required'
              ? 'Обязательно укажи причину отказа.'
            : 'Не удалось изменить статус заявки.';
    await interaction.editReply({ content });
  }

  async function reviewFromTelegram(
    requestId: string,
    decision: 'approved' | 'declined',
    actorId: string,
    actorName: string,
    declineReason = ''
  ): Promise<'ok' | 'not_found' | 'already_reviewed' | 'busy' | 'reason_required' | 'guild_missing' | 'failed'> {
    const request = findRequest(requestId);
    if (!request) return 'not_found';
    const guild = client.guilds.cache.get(request.guildId)
      || await client.guilds.fetch(request.guildId).catch(() => null);
    if (!guild) return 'guild_missing';
    return applyReview({
      guild,
      requestId,
      decision,
      declineReason,
      actorId: `telegram:${actorId}`,
      actorName: `${actorName} (Telegram)`
    });
  }

  async function showStatus(interaction: any): Promise<void> {
    const requests = store().afkRequests
      .filter(request => request.guildId === interaction.guild.id && request.userId === interaction.user.id)
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    const request = requests[0];
    await interaction.reply({
      content: request
        ? `Заявка ${request.id}\nПериод: ${request.startDate} - ${request.endDate}\nСтатус: ${statusLabel(request.status)}${request.declineReason ? `\nПричина: ${request.declineReason}` : ''}`
        : 'У тебя пока нет заявок на АФК-отпуск.',
      flags: MessageFlags.Ephemeral
    });
  }

  async function handleCommand(interaction: any): Promise<void> {
    if (!interaction.guild) {
      await interaction.reply({ content: 'Команда недоступна в личных сообщениях.', flags: MessageFlags.Ephemeral });
      return;
    }
    const subcommand = interaction.options.getSubcommand();
    if (subcommand === 'setup' || subcommand === 'refresh') return publishPanel(interaction);
    if (subcommand === 'status') return showStatus(interaction);
    if (!canManage(interaction.member)) {
      await interaction.reply({ content: 'Недостаточно прав для управления АФК-отпусками.', flags: MessageFlags.Ephemeral });
      return;
    }
    if (subcommand === 'list') {
      const pending = store().afkRequests.filter(request => request.guildId === interaction.guild.id && request.status === 'pending');
      await interaction.reply({
        content: pending.length
          ? pending.slice(0, 25).map((request, index) => `${index + 1}. **${request.id}** • <@${request.userId}> • ${request.startDate} - ${request.endDate}`).join('\n')
          : 'Заявок на рассмотрении нет.',
        flags: MessageFlags.Ephemeral
      });
      return;
    }
    const requestId = interaction.options.getString('id', true);
    if (subcommand === 'approve') return review(interaction, requestId, 'approved');
    if (subcommand === 'decline') return review(interaction, requestId, 'declined', interaction.options.getString('reason') || '');
  }

  async function handleInteraction(interaction: any): Promise<boolean> {
    if (interaction.isChatInputCommand?.() && interaction.commandName === 'afk') {
      await handleCommand(interaction);
      return true;
    }
    if (interaction.isButton?.()) {
      if (interaction.customId === 'afk_request_create') {
        if (!interaction.guild) {
          await interaction.reply({ content: 'Заявки нельзя подавать в личных сообщениях.', flags: MessageFlags.Ephemeral });
        } else if (!config.useModal) {
          await interaction.reply({ content: 'Отправь заявку сообщением по форме из панели.', flags: MessageFlags.Ephemeral });
        } else if (pendingFor(interaction.guild.id, interaction.user.id)) {
          await interaction.reply({ content: 'У тебя уже есть заявка на рассмотрении.', flags: MessageFlags.Ephemeral });
        } else {
          await interaction.showModal(buildAfkRequestModal());
        }
        return true;
      }
      const approve = interaction.customId.match(/^afk_approve_([a-f0-9]{8})$/u);
      if (approve) {
        await review(interaction, approve[1], 'approved');
        return true;
      }
      const decline = interaction.customId.match(/^afk_decline_([a-f0-9]{8})$/u);
      if (decline) {
        if (!canManage(interaction.member)) {
          await interaction.reply({ content: 'Недостаточно прав для рассмотрения заявок.', flags: MessageFlags.Ephemeral });
        } else {
          const request = findRequest(decline[1]);
          if (!request || request.status !== 'pending') {
            await interaction.reply({ content: request ? 'Эта заявка уже была рассмотрена.' : 'Заявка не найдена.', flags: MessageFlags.Ephemeral });
          } else {
            await interaction.showModal(buildAfkDeclineModal(decline[1]));
          }
        }
        return true;
      }
    }
    if (interaction.isModalSubmit?.()) {
      if (interaction.customId === 'afk_request_modal') {
        await submitModal(interaction);
        return true;
      }
      const decline = interaction.customId.match(/^afk_decline_modal_([a-f0-9]{8})$/u);
      if (decline) {
        await review(interaction, decline[1], 'declined', interaction.fields.getTextInputValue('reason'));
        return true;
      }
    }
    return false;
  }

  return { handleInteraction, handleMessage, findRequest, pendingFor, reviewFromTelegram };
}
