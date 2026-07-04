import { EmbedBuilder, MessageFlags, PermissionFlagsBits } from 'discord.js';
import type { DatabaseApi, MediaShareSettings } from '../types';
import {
  buildMediaShareLogEmbed,
  buildMediaShareModal,
  buildMediaSharePanel,
  buildMediaSharePublicationEmbed,
  isMediaShareKind,
  MEDIA_SHARE_KINDS,
  type MediaShareKind
} from '../media-share-ui';

export interface MediaShareService {
  handleInteraction(interaction: any): Promise<boolean>;
}

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
    panelMessageId: '',
    updatedAt: ''
  };
}

function formatChannel(channelId?: string): string {
  return channelId ? `<#${channelId}>` : 'не настроен';
}

function formatRole(roleId?: string): string {
  return roleId ? `<@&${roleId}>` : 'не настроена';
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
      minRoleId: minRole.id
    });

    try {
      await publishPanel(interaction.guild, config);
      await interaction.editReply({
        content: [
          'Медиа-панель опубликована/обновлена.',
          `Карточка: ${formatChannel(panelChannel.id)}`,
          `Публикации: ${formatChannel(targetChannel.id)}`,
          `Логи: ${formatChannel(logChannel.id)}`,
          `Минимальная роль: ${formatRole(minRole.id)}`
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
          `Публикации: ${formatChannel(config.targetChannelId)}`,
          `Логи: ${formatChannel(config.logChannelId)}`,
          `Минимальная роль: ${formatRole(config.minRoleId)}`
        ].join('\n'))
        .setFooter({ text: `Медиа-панель • ${new Date().toLocaleString('ru-RU')}` })]
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
    if (!config.targetChannelId || !config.minRoleId) {
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
    if (!config.targetChannelId || !config.minRoleId) {
      await interaction.reply(ephemeral({ content: 'Медиа-панель ещё не настроена.' }));
      return;
    }

    if (!(await hasShareAccess(interaction, config))) {
      await interaction.reply(ephemeral({ content: `Доступно только для роли ${formatRole(config.minRoleId)} и выше.` }));
      return;
    }

    const url = normalizeUrl(interaction.fields.getTextInputValue('url'));
    const note = String(interaction.fields.getTextInputValue('note') || '').trim().slice(0, 700);
    if (!url) {
      await interaction.reply(ephemeral({ content: 'Укажи корректную http/https-ссылку на видео или стрим.' }));
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const targetChannel = await fetchTextChannel(interaction.guild, config.targetChannelId);
    if (!targetChannel?.send) {
      await interaction.editReply({ content: 'Не удалось отправить публикацию. Проверь канал публикаций и права бота.' });
      return;
    }

    try {
      const message = await targetChannel.send({
        embeds: [buildMediaSharePublicationEmbed({
          kind,
          url,
          note,
          author: interaction.user,
          moderator: 'Автопубликация'
        })],
        allowedMentions: { parse: [] }
      });

      const logChannel = await fetchTextChannel(interaction.guild, config.logChannelId);
      if (logChannel?.send) {
        await logChannel.send({
          embeds: [buildMediaShareLogEmbed({
            kind,
            url,
            note,
            author: interaction.user,
            moderator: 'Автопубликация',
            targetChannelId: targetChannel.id,
            targetMessageId: message?.id,
            guildId: interaction.guild.id
          })],
          allowedMentions: { parse: [] }
        }).catch((error: unknown) => console.warn('Media share log failed:', error));
      }

      await interaction.editReply({ content: `${MEDIA_SHARE_KINDS[kind].label} отправлено: ${formatChannel(targetChannel.id)}` });
    } catch (error) {
      console.error('Media share submit failed:', error);
      await interaction.editReply({ content: 'Не удалось отправить публикацию. Проверь канал публикаций и права бота.' });
    }
  }

  async function handleInteraction(interaction: any): Promise<boolean> {
    if (interaction.isChatInputCommand?.() && interaction.commandName === 'mediashare') {
      await handleCommand(interaction);
      return true;
    }

    if (interaction.isButton?.()) {
      const match = String(interaction.customId || '').match(/^media_share_open:(video|stream)$/u);
      if (match && isMediaShareKind(match[1])) {
        await handleOpenButton(interaction, match[1]);
        return true;
      }
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
