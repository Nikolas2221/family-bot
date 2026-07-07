import { EmbedBuilder, MessageFlags, PermissionFlagsBits } from 'discord.js';
import type { DatabaseApi, MediaShareRequestRecord, MediaShareSettings } from '../types';
import {
  buildMediaShareLogEmbed,
  buildMediaShareModal,
  buildMediaSharePanel,
  buildMediaSharePublicationEmbed,
  buildMediaShareReviewButtons,
  buildMediaShareReviewEmbed,
  isMediaShareKind,
  MEDIA_SHARE_KINDS,
  MEDIA_SHARE_NOTE_LIMIT,
  type MediaShareKind
} from '../media-share-ui';

export interface MediaShareService {
  handleInteraction(interaction: any): Promise<boolean>;
}

const DEFAULT_MEDIA_MODERATOR_ROLE_ID = '1522316775251775658';

function ephemeral(payload: Record<string, unknown> = {}) {
  return { ...payload, flags: MessageFlags.Ephemeral };
}

function isAdministrator(member: any): boolean {
  return Boolean(member?.permissions?.has?.(PermissionFlagsBits.Administrator));
}

function normalizeUrl(value: unknown): string {
  const url = String(value || '').trim().slice(0, 300);
  return /^https?:\/\/\S{4,}$/iu.test(url) ? url : '';
}

function emptyConfig(): MediaShareSettings {
  return {
    panelChannelId: '',
    targetChannelId: '',
    logChannelId: '',
    minRoleId: '',
    moderatorRoleId: String(process.env.MEDIA_MODERATOR_ROLE_ID || DEFAULT_MEDIA_MODERATOR_ROLE_ID).trim(),
    panelMessageId: '',
    updatedAt: '',
    pendingRequests: []
  };
}

function formatChannel(channelId?: string): string {
  return channelId ? `<#${channelId}>` : 'не настроен';
}

function formatRole(roleId?: string): string {
  return roleId ? `<@&${roleId}>` : 'не настроена';
}

function createRequestId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

export function createMediaShareService(options: {
  database: DatabaseApi;
  fetchTextChannel(guild: any, channelId?: string | null): Promise<any | null>;
  resolveGuildSettings(guildId: string): any;
  canManageMedia?: (interaction: any) => boolean;
}): MediaShareService {
  const { database, fetchTextChannel, resolveGuildSettings } = options;

  function canManage(interaction: any): boolean {
    if (typeof options.canManageMedia === 'function') return options.canManageMedia(interaction);
    return isAdministrator(interaction.member);
  }

  function getConfig(guildId: string): MediaShareSettings {
    return { ...emptyConfig(), ...(resolveGuildSettings(guildId).mediaShare || {}) };
  }

  function saveConfig(guildId: string, patch: Partial<MediaShareSettings>): MediaShareSettings {
    const next = {
      ...getConfig(guildId),
      ...patch,
      updatedAt: new Date().toISOString()
    };
    database.updateGuildSettings(guildId, { mediaShare: next });
    return next;
  }

  function findRequest(guildId: string, requestId: string): MediaShareRequestRecord | null {
    return (getConfig(guildId).pendingRequests || []).find(request => request.id === requestId) || null;
  }

  function upsertRequest(guildId: string, request: MediaShareRequestRecord): void {
    const config = getConfig(guildId);
    saveConfig(guildId, {
      pendingRequests: [
        request,
        ...(config.pendingRequests || []).filter(item => item.id !== request.id)
      ].slice(0, 100)
    });
  }

  async function fetchMessage(channel: any, messageId: string): Promise<any | null> {
    if (!messageId || typeof channel?.messages?.fetch !== 'function') return null;
    return channel.messages.fetch(messageId).catch(() => null);
  }

  async function publishPanel(guild: any, config: MediaShareSettings): Promise<any> {
    const channel = await fetchTextChannel(guild, config.panelChannelId);
    if (!channel?.send) throw new Error('media_panel_channel_missing');

    const payload = { ...buildMediaSharePanel(config), allowedMentions: { parse: [] } };
    const existing = await fetchMessage(channel, config.panelMessageId);
    const message = existing ? await existing.edit(payload) : await channel.send(payload);
    if (message?.id && message.id !== config.panelMessageId) {
      saveConfig(guild.id, { panelMessageId: message.id });
    }
    return message;
  }

  async function hasShareAccess(interaction: any, config: MediaShareSettings): Promise<boolean> {
    if (isAdministrator(interaction.member)) return true;
    if (!config.minRoleId || !interaction.member) return false;
    if (interaction.member.roles?.cache?.has?.(config.minRoleId)) return true;

    const minRole = interaction.guild?.roles?.cache?.get?.(config.minRoleId)
      || await interaction.guild?.roles?.fetch?.(config.minRoleId).catch(() => null);
    const highest = interaction.member.roles?.highest;
    if (!minRole || typeof highest?.position !== 'number' || typeof minRole.position !== 'number') return false;
    return highest.position >= minRole.position;
  }

  function canModerateMedia(interaction: any, config: MediaShareSettings): boolean {
    if (canManage(interaction)) return true;
    const moderatorRoleId = config.moderatorRoleId || DEFAULT_MEDIA_MODERATOR_ROLE_ID;
    return Boolean(moderatorRoleId && interaction.member?.roles?.cache?.has?.(moderatorRoleId));
  }

  async function handleSetup(interaction: any): Promise<void> {
    if (!canManage(interaction)) {
      await interaction.reply(ephemeral({ content: 'Недостаточно прав для настройки медиа-панели.' }));
      return;
    }

    const panelChannel = interaction.options.getChannel('panel_channel', true);
    const targetChannel = interaction.options.getChannel('target_channel', true);
    const logChannel = interaction.options.getChannel('log_channel', true);
    const minRole = interaction.options.getRole('min_role', true);

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const config = saveConfig(interaction.guild.id, {
      panelChannelId: panelChannel.id,
      targetChannelId: targetChannel.id,
      logChannelId: logChannel.id,
      minRoleId: minRole.id,
      moderatorRoleId: String(process.env.MEDIA_MODERATOR_ROLE_ID || DEFAULT_MEDIA_MODERATOR_ROLE_ID).trim()
    });

    try {
      await publishPanel(interaction.guild, config);
      await interaction.editReply({
        content: [
          'Медиа-панель опубликована/обновлена.',
          `Карточка: ${formatChannel(panelChannel.id)}`,
          `Публикации после одобрения: ${formatChannel(targetChannel.id)}`,
          `Заявки/логи: ${formatChannel(logChannel.id)}`,
          `Минимальная роль отправки: ${formatRole(minRole.id)}`,
          `Роль модерации: ${formatRole(config.moderatorRoleId)}`
        ].join('\n')
      });
    } catch (error) {
      console.warn('Media share panel publish failed:', error);
      await interaction.editReply({ content: 'Не удалось опубликовать медиа-панель. Проверь канал и права бота.' });
    }
  }

  async function handleRefresh(interaction: any): Promise<void> {
    if (!canManage(interaction)) {
      await interaction.reply(ephemeral({ content: 'Недостаточно прав для обновления медиа-панели.' }));
      return;
    }

    const config = getConfig(interaction.guild.id);
    if (!config.panelChannelId) {
      await interaction.reply(ephemeral({ content: 'Медиа-панель ещё не настроена. Используй /mediashare setup.' }));
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      await publishPanel(interaction.guild, config);
      await interaction.editReply({ content: 'Медиа-панель обновлена.' });
    } catch (error) {
      console.warn('Media share panel refresh failed:', error);
      await interaction.editReply({ content: 'Не удалось обновить медиа-панель. Проверь канал и права бота.' });
    }
  }

  async function handleStatus(interaction: any): Promise<void> {
    if (!canManage(interaction)) {
      await interaction.reply(ephemeral({ content: 'Недостаточно прав для просмотра настроек медиа-панели.' }));
      return;
    }

    const config = getConfig(interaction.guild.id);
    await interaction.reply(ephemeral({
      embeds: [new EmbedBuilder()
        .setColor(0x7c3aed)
        .setTitle('🎞️ Настройки медиа-панели')
        .setDescription([
          `Карточка: ${formatChannel(config.panelChannelId)}`,
          `Публикации после одобрения: ${formatChannel(config.targetChannelId)}`,
          `Заявки/логи: ${formatChannel(config.logChannelId)}`,
          `Минимальная роль отправки: ${formatRole(config.minRoleId)}`,
          `Роль модерации: ${formatRole(config.moderatorRoleId || DEFAULT_MEDIA_MODERATOR_ROLE_ID)}`,
          `Ожидают проверки: ${(config.pendingRequests || []).filter(request => request.status === 'pending').length}`
        ].join('\n'))
        .setFooter({ text: `Медиа-панель • ${new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })} МСК` })]
    }));
  }

  async function handleCommand(interaction: any): Promise<void> {
    if (!interaction.guild) {
      await interaction.reply(ephemeral({ content: 'Эта команда доступна только на сервере.' }));
      return;
    }

    const subcommand = interaction.options.getSubcommand();
    if (subcommand === 'setup') return handleSetup(interaction);
    if (subcommand === 'refresh') return handleRefresh(interaction);
    if (subcommand === 'status') return handleStatus(interaction);
  }

  async function handleOpenButton(interaction: any, kind: MediaShareKind): Promise<void> {
    if (!interaction.guild) {
      await interaction.reply(ephemeral({ content: 'Медиа нельзя отправлять в личных сообщениях.' }));
      return;
    }

    const config = getConfig(interaction.guild.id);
    if (!config.targetChannelId || !config.logChannelId || !config.minRoleId) {
      await interaction.reply(ephemeral({ content: 'Медиа-панель ещё не настроена.' }));
      return;
    }

    if (!(await hasShareAccess(interaction, config))) {
      await interaction.reply(ephemeral({ content: `Доступно только для роли ${formatRole(config.minRoleId)} и выше.` }));
      return;
    }

    await interaction.showModal(buildMediaShareModal(kind));
  }

  async function handleModal(interaction: any, kind: MediaShareKind): Promise<void> {
    if (!interaction.guild) {
      await interaction.reply(ephemeral({ content: 'Медиа нельзя отправлять в личных сообщениях.' }));
      return;
    }

    const config = getConfig(interaction.guild.id);
    if (!config.targetChannelId || !config.logChannelId || !config.minRoleId) {
      await interaction.reply(ephemeral({ content: 'Медиа-панель ещё не настроена.' }));
      return;
    }

    if (!(await hasShareAccess(interaction, config))) {
      await interaction.reply(ephemeral({ content: `Доступно только для роли ${formatRole(config.minRoleId)} и выше.` }));
      return;
    }

    const title = String(interaction.fields.getTextInputValue('title') || '').trim().slice(0, 80);
    const url = normalizeUrl(interaction.fields.getTextInputValue('url'));
    const note = String(interaction.fields.getTextInputValue('note') || '').trim();
    if (!title) {
      await interaction.reply(ephemeral({ content: 'Укажи название публикации.' }));
      return;
    }
    if (!url) {
      await interaction.reply(ephemeral({ content: 'Укажи корректную http/https-ссылку на видео или стрим.' }));
      return;
    }
    if (note.length > MEDIA_SHARE_NOTE_LIMIT) {
      await interaction.reply(ephemeral({
        content: `Описание не может быть длиннее ${MEDIA_SHARE_NOTE_LIMIT} символов. Сейчас: ${note.length}/${MEDIA_SHARE_NOTE_LIMIT}.`
      }));
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const reviewChannel = await fetchTextChannel(interaction.guild, config.logChannelId);
    if (!reviewChannel?.send) {
      await interaction.editReply({ content: 'Не удалось создать заявку на медиа. Проверь канал заявок/логов и права бота.' });
      return;
    }

    const request: MediaShareRequestRecord = {
      id: createRequestId(),
      guildId: interaction.guild.id,
      kind,
      title,
      url,
      note,
      authorId: interaction.user.id,
      authorName: interaction.user.globalName || interaction.user.username || interaction.user.tag || '',
      status: 'pending',
      createdAt: new Date().toISOString(),
      targetChannelId: config.targetChannelId
    };

    try {
      const moderatorRoleId = config.moderatorRoleId || DEFAULT_MEDIA_MODERATOR_ROLE_ID;
      const message = await reviewChannel.send({
        content: moderatorRoleId ? `<@&${moderatorRoleId}>` : '',
        embeds: [buildMediaShareReviewEmbed({
          id: request.id,
          kind,
          title,
          url,
          note,
          author: interaction.user,
          status: 'pending',
          createdAt: new Date(request.createdAt)
        })],
        components: buildMediaShareReviewButtons(request.id),
        allowedMentions: { parse: [], roles: moderatorRoleId ? [moderatorRoleId] : [] }
      });

      request.ticketChannelId = reviewChannel.id;
      request.ticketMessageId = message?.id || '';
      upsertRequest(interaction.guild.id, request);
      await interaction.editReply({ content: `${MEDIA_SHARE_KINDS[kind].label} отправлено на модерацию: <#${reviewChannel.id}>` });
    } catch (error) {
      console.error('Media share submit failed:', error);
      await interaction.editReply({ content: 'Не удалось создать заявку на медиа. Проверь канал модерации и права бота.' });
    }
  }

  async function publishApproved(interaction: any, request: MediaShareRequestRecord, config: MediaShareSettings): Promise<string | null> {
    const targetChannel = await fetchTextChannel(interaction.guild, request.targetChannelId || config.targetChannelId);
    if (!targetChannel?.send) return null;

    const message = await targetChannel.send({
      embeds: [buildMediaSharePublicationEmbed({
        kind: request.kind,
        title: request.title,
        url: request.url,
        note: request.note,
        author: { id: request.authorId, username: request.authorName },
        moderator: `<@${interaction.user.id}>`
      })],
      allowedMentions: { parse: [] }
    });

    request.targetChannelId = targetChannel.id;
    request.targetMessageId = message?.id || '';
    return message?.id || '';
  }

  async function logApproved(interaction: any, request: MediaShareRequestRecord, config: MediaShareSettings): Promise<void> {
    const logChannel = await fetchTextChannel(interaction.guild, config.logChannelId);
    if (!logChannel?.send) return;

    await logChannel.send({
      embeds: [buildMediaShareLogEmbed({
        kind: request.kind,
        title: request.title,
        url: request.url,
        note: request.note,
        author: { id: request.authorId, username: request.authorName },
        moderator: `<@${interaction.user.id}>`,
        targetChannelId: request.targetChannelId || config.targetChannelId,
        targetMessageId: request.targetMessageId,
        guildId: interaction.guild.id
      })],
      allowedMentions: { parse: [] }
    }).catch((error: unknown) => console.warn('Media share log failed:', error));
  }

  async function handleReviewDecision(interaction: any, requestId: string, decision: 'approved' | 'declined'): Promise<void> {
    if (!interaction.guild) {
      await interaction.reply(ephemeral({ content: 'Медиа нельзя модерировать в личных сообщениях.' }));
      return;
    }

    const config = getConfig(interaction.guild.id);
    if (!canModerateMedia(interaction, config)) {
      await interaction.reply(ephemeral({ content: 'Модерировать медиа могут только администраторы или роль модераторов.' }));
      return;
    }

    const request = findRequest(interaction.guild.id, requestId);
    if (!request) {
      await interaction.reply(ephemeral({ content: 'Заявка на медиа не найдена.' }));
      return;
    }
    if (request.status !== 'pending') {
      await interaction.reply(ephemeral({ content: 'Эта заявка уже была рассмотрена.' }));
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    request.status = decision;
    request.reviewedAt = new Date().toISOString();
    request.reviewedBy = interaction.user.id;

    if (decision === 'approved') {
      const targetMessageId = await publishApproved(interaction, request, config);
      if (!targetMessageId) {
        request.status = 'pending';
        await interaction.editReply({ content: 'Не удалось опубликовать медиа. Проверь канал публикаций и права бота.' });
        return;
      }
      await logApproved(interaction, request, config);
    }

    upsertRequest(interaction.guild.id, request);
    await interaction.message?.edit?.({
      embeds: [buildMediaShareReviewEmbed({
        id: request.id,
        kind: request.kind,
        title: request.title,
        url: request.url,
        note: request.note,
        author: { id: request.authorId, username: request.authorName },
        moderator: `<@${interaction.user.id}>`,
        status: request.status,
        createdAt: new Date(request.createdAt)
      })],
      components: buildMediaShareReviewButtons(request.id, true),
      allowedMentions: { parse: [] }
    }).catch((error: unknown) => console.warn('Media share review message update failed:', error));

    await interaction.editReply({
      content: decision === 'approved'
        ? `Медиа одобрено и опубликовано: ${formatChannel(request.targetChannelId || config.targetChannelId)}`
        : 'Медиа отклонено. Публикация не отправлена.'
    });
  }

  async function handleButton(interaction: any): Promise<boolean> {
    const openMatch = String(interaction.customId || '').match(/^media_share_open:(video|stream)$/u);
    if (openMatch && isMediaShareKind(openMatch[1])) {
      await handleOpenButton(interaction, openMatch[1]);
      return true;
    }

    const decisionMatch = String(interaction.customId || '').match(/^media_share_(approve|decline):([a-z0-9]+)$/u);
    if (decisionMatch) {
      await handleReviewDecision(interaction, decisionMatch[2], decisionMatch[1] === 'approve' ? 'approved' : 'declined');
      return true;
    }

    return false;
  }

  async function handleInteraction(interaction: any): Promise<boolean> {
    if (interaction.isChatInputCommand?.() && interaction.commandName === 'mediashare') {
      await handleCommand(interaction);
      return true;
    }

    if (interaction.isButton?.()) {
      return handleButton(interaction);
    }

    if (interaction.isModalSubmit?.()) {
      const match = String(interaction.customId || '').match(/^media_share_modal:(video|stream)$/u);
      if (match && isMediaShareKind(match[1])) {
        await handleModal(interaction, match[1]);
        return true;
      }
    }

    return false;
  }

  return { handleInteraction };
}
