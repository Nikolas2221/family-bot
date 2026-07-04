import crypto from 'node:crypto';
import { EmbedBuilder, MessageFlags, PermissionFlagsBits } from 'discord.js';
import type { DatabaseApi, ReportRequestConfig, ReportRequestType } from '../types';
import {
  REPORT_REQUEST_DEFINITIONS,
  buildReportRequestEmbed,
  buildReportRequestLogEmbed,
  buildReportRequestModal,
  buildReportRequestPanel,
  isReportRequestType,
  readReportRequestValues
} from '../report-requests-ui';

export interface ReportRequestService {
  handleInteraction(interaction: any): Promise<boolean>;
}

function ephemeral(payload: Record<string, unknown> = {}) {
  return { ...payload, flags: MessageFlags.Ephemeral };
}

function isAdministrator(member: any): boolean {
  return Boolean(member?.permissions?.has?.(PermissionFlagsBits.Administrator));
}

function formatChannel(channelId?: string): string {
  return channelId ? `<#${channelId}>` : 'не настроен';
}

function createReportId(type: ReportRequestType): string {
  return `${type}-${crypto.randomBytes(4).toString('hex')}`;
}

export function createReportRequestService(options: {
  database: DatabaseApi;
  fetchTextChannel(guild: any, channelId?: string | null): Promise<any | null>;
  resolveGuildSettings(guildId: string): any;
  canManageReports?: (interaction: any) => boolean;
}): ReportRequestService {
  const { database, fetchTextChannel, resolveGuildSettings } = options;

  function canManage(interaction: any): boolean {
    if (typeof options.canManageReports === 'function') return options.canManageReports(interaction);
    return isAdministrator(interaction.member);
  }

  function getConfig(guildId: string, type: ReportRequestType): ReportRequestConfig | null {
    return resolveGuildSettings(guildId).reportRequests?.[type] || null;
  }

  function saveConfig(guildId: string, type: ReportRequestType, patch: Partial<ReportRequestConfig>): ReportRequestConfig {
    const current = getConfig(guildId, type) || {
      panelChannelId: '',
      targetChannelId: '',
      logChannelId: '',
      panelMessageId: '',
      updatedAt: ''
    };
    const next = {
      ...current,
      ...patch,
      updatedAt: new Date().toISOString()
    };
    database.updateGuildSettings(guildId, {
      reportRequests: {
        [type]: next
      }
    });
    return next;
  }

  async function fetchMessage(channel: any, messageId: string): Promise<any | null> {
    if (!messageId || typeof channel?.messages?.fetch !== 'function') return null;
    return channel.messages.fetch(messageId).catch(() => null);
  }

  async function publishPanel(guild: any, type: ReportRequestType, config: ReportRequestConfig): Promise<any> {
    const channel = await fetchTextChannel(guild, config.panelChannelId);
    if (!channel?.send) {
      throw new Error('panel_channel_missing');
    }

    const payload = {
      ...buildReportRequestPanel(type, config),
      allowedMentions: { parse: [] }
    };
    const existing = await fetchMessage(channel, config.panelMessageId);
    const message = existing
      ? await existing.edit(payload)
      : await channel.send(payload);

    if (message?.id && message.id !== config.panelMessageId) {
      saveConfig(guild.id, type, { ...config, panelMessageId: message.id });
    }

    return message;
  }

  async function handleSetup(interaction: any): Promise<void> {
    if (!canManage(interaction)) {
      await interaction.reply(ephemeral({ content: 'Недостаточно прав для настройки отчётов.' }));
      return;
    }

    const type = interaction.options.getString('type', true);
    if (!isReportRequestType(type)) {
      await interaction.reply(ephemeral({ content: 'Неизвестный тип отчёта.' }));
      return;
    }

    const panelChannel = interaction.options.getChannel('panel_channel', true);
    const targetChannel = interaction.options.getChannel('target_channel', true);
    const logChannel = interaction.options.getChannel('log_channel', true);

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const config = saveConfig(interaction.guild.id, type, {
      panelChannelId: panelChannel.id,
      targetChannelId: targetChannel.id,
      logChannelId: logChannel.id
    });

    try {
      await publishPanel(interaction.guild, type, config);
      await interaction.editReply({
        content: `Панель "${REPORT_REQUEST_DEFINITIONS[type].label}" опубликована/обновлена.\nКарточка: ${formatChannel(panelChannel.id)}\nОтчёты: ${formatChannel(targetChannel.id)}\nЛоги: ${formatChannel(logChannel.id)}`
      });
    } catch (error) {
      console.warn('Report request panel publish failed:', error);
      await interaction.editReply({ content: 'Не удалось опубликовать панель. Проверь канал панели и права бота.' });
    }
  }

  async function handleRefresh(interaction: any): Promise<void> {
    if (!canManage(interaction)) {
      await interaction.reply(ephemeral({ content: 'Недостаточно прав для обновления панелей отчётов.' }));
      return;
    }

    const type = interaction.options.getString('type', true);
    if (!isReportRequestType(type)) {
      await interaction.reply(ephemeral({ content: 'Неизвестный тип отчёта.' }));
      return;
    }

    const config = getConfig(interaction.guild.id, type);
    if (!config?.panelChannelId) {
      await interaction.reply(ephemeral({ content: 'Панель этого отчёта ещё не настроена. Используй /reportform setup.' }));
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      await publishPanel(interaction.guild, type, config);
      await interaction.editReply({ content: `Панель "${REPORT_REQUEST_DEFINITIONS[type].label}" обновлена.` });
    } catch (error) {
      console.warn('Report request panel refresh failed:', error);
      await interaction.editReply({ content: 'Не удалось обновить панель. Проверь канал панели и права бота.' });
    }
  }

  async function handleStatus(interaction: any): Promise<void> {
    if (!canManage(interaction)) {
      await interaction.reply(ephemeral({ content: 'Недостаточно прав для просмотра настроек отчётов.' }));
      return;
    }

    const settings = resolveGuildSettings(interaction.guild.id);
    const lines = Object.values(REPORT_REQUEST_DEFINITIONS).map(definition => {
      const config = settings.reportRequests?.[definition.type] || {};
      return [
        `**${definition.label}**`,
        `Карточка: ${formatChannel(config.panelChannelId)}`,
        `Отчёты: ${formatChannel(config.targetChannelId)}`,
        `Логи: ${formatChannel(config.logChannelId)}`
      ].join('\n');
    });

    await interaction.reply(ephemeral({
      embeds: [new EmbedBuilder()
        .setColor(0x64748b)
        .setTitle('🧾 Настройки отчётов')
        .setDescription(lines.join('\n\n'))
        .setFooter({ text: `Система отчётов • ${new Date().toLocaleString('ru-RU')}` })]
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

  async function handleOpenButton(interaction: any, type: ReportRequestType): Promise<void> {
    if (!interaction.guild) {
      await interaction.reply(ephemeral({ content: 'Отчёты нельзя отправлять в личных сообщениях.' }));
      return;
    }

    const config = getConfig(interaction.guild.id, type);
    if (!config?.targetChannelId) {
      await interaction.reply(ephemeral({ content: 'Этот тип отчёта ещё не настроен.' }));
      return;
    }

    await interaction.showModal(buildReportRequestModal(type));
  }

  async function sendLog(guild: any, config: ReportRequestConfig, payload: Record<string, unknown>): Promise<void> {
    if (!config.logChannelId) return;
    const channel = await fetchTextChannel(guild, config.logChannelId);
    if (!channel?.send) return;
    await channel.send({ ...payload, allowedMentions: { parse: [] } }).catch((error: unknown) => {
      console.warn('Report request log failed:', error);
    });
  }

  async function handleModal(interaction: any, type: ReportRequestType): Promise<void> {
    if (!interaction.guild) {
      await interaction.reply(ephemeral({ content: 'Отчёты нельзя отправлять в личных сообщениях.' }));
      return;
    }

    const config = getConfig(interaction.guild.id, type);
    if (!config?.targetChannelId) {
      await interaction.reply(ephemeral({ content: 'Этот тип отчёта ещё не настроен.' }));
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const targetChannel = await fetchTextChannel(interaction.guild, config.targetChannelId);
    if (!targetChannel?.send) {
      await interaction.editReply({ content: 'Не удалось отправить отчёт. Проверь канал отчётов и права бота.' });
      return;
    }

    const values = readReportRequestValues(type, interaction.fields);
    const reportId = createReportId(type);

    try {
      const message = await targetChannel.send({
        embeds: [buildReportRequestEmbed({
          type,
          values,
          reporter: interaction.user,
          reportId
        })],
        allowedMentions: { parse: [] }
      });

      await sendLog(interaction.guild, config, {
        embeds: [buildReportRequestLogEmbed({
          type,
          values,
          reporter: interaction.user,
          reportId,
          guildId: interaction.guild.id,
          targetChannelId: targetChannel.id,
          targetMessageId: message?.id
        })]
      });

      await interaction.editReply({ content: `Отчёт отправлен: ${formatChannel(targetChannel.id)}` });
    } catch (error) {
      console.error('Report request submit failed:', error);
      await interaction.editReply({ content: 'Не удалось отправить отчёт. Проверь канал отчётов и права бота.' });
    }
  }

  async function handleInteraction(interaction: any): Promise<boolean> {
    if (interaction.isChatInputCommand?.() && interaction.commandName === 'reportform') {
      await handleCommand(interaction);
      return true;
    }

    if (interaction.isButton?.()) {
      const match = String(interaction.customId || '').match(/^report_request_open:(up_rank|contracts|payouts)$/u);
      if (match && isReportRequestType(match[1])) {
        await handleOpenButton(interaction, match[1]);
        return true;
      }
    }

    if (interaction.isModalSubmit?.()) {
      const match = String(interaction.customId || '').match(/^report_request_modal:(up_rank|contracts|payouts)$/u);
      if (match && isReportRequestType(match[1])) {
        await handleModal(interaction, match[1]);
        return true;
      }
    }

    return false;
  }

  return { handleInteraction };
}
