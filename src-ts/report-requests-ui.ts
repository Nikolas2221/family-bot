import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} from 'discord.js';
import type { ReportRequestConfig, ReportRequestType } from './types';

type ReportField = {
  id: string;
  label: string;
  placeholder: string;
  style?: TextInputStyle;
  required?: boolean;
  maxLength?: number;
};

export const REPORT_REQUEST_DEFINITIONS: Record<ReportRequestType, {
  type: ReportRequestType;
  emoji: string;
  label: string;
  panelTitle: string;
  reportTitle: string;
  color: number;
  fields: ReportField[];
}> = {
  up_rank: {
    type: 'up_rank',
    emoji: '📈',
    label: 'Отчёт на повышение',
    panelTitle: '📈 Отчёт на повышение',
    reportTitle: '📈 Отчёт на повышение',
    color: 0x22c55e,
    fields: [
      { id: 'nickname_static', label: 'Ник и статик', placeholder: 'Например: Username #12345', maxLength: 120 },
      { id: 'current_rank', label: 'Текущая роль/ранг', placeholder: 'Например: Новичок / 1 ранг', maxLength: 100 },
      { id: 'target_rank', label: 'Желаемая роль/ранг', placeholder: 'Например: Участник / 2 ранг', maxLength: 100 },
      { id: 'work', label: 'Что сделал', placeholder: 'Кратко опиши активность, работу, помощь семье', style: TextInputStyle.Paragraph, maxLength: 1500 },
      { id: 'evidence', label: 'Доказательства / ссылки', placeholder: 'Скриншоты, видео, сообщения, ссылки', style: TextInputStyle.Paragraph, required: false, maxLength: 1000 }
    ]
  },
  contracts: {
    type: 'contracts',
    emoji: '📄',
    label: 'Отчёт о контрактах',
    panelTitle: '📄 Отчёт о контрактах',
    reportTitle: '📄 Отчёт о контрактах',
    color: 0x3b82f6,
    fields: [
      { id: 'nickname_static', label: 'Ник и статик', placeholder: 'Например: Username #12345', maxLength: 120 },
      { id: 'period', label: 'Период отчёта', placeholder: 'Например: 01.07.2026 - 03.07.2026', maxLength: 100 },
      { id: 'count', label: 'Количество контрактов', placeholder: 'Например: 12', maxLength: 60 },
      { id: 'amount', label: 'Сумма / результат', placeholder: 'Например: 120000$ / выполнено', maxLength: 120 },
      { id: 'evidence', label: 'Доказательства / ссылки', placeholder: 'Скриншоты, видео, таблица, ссылки', style: TextInputStyle.Paragraph, required: false, maxLength: 1000 }
    ]
  },
  payouts: {
    type: 'payouts',
    emoji: '💸',
    label: 'Отчёт о выплатах',
    panelTitle: '💸 Отчёт о выплатах',
    reportTitle: '💸 Отчёт о выплатах',
    color: 0xf59e0b,
    fields: [
      { id: 'nickname_static', label: 'Ник и статик', placeholder: 'Например: Username #12345', maxLength: 120 },
      { id: 'recipient', label: 'Кому выплачено', placeholder: 'Ник/статик или Discord участника', maxLength: 120 },
      { id: 'amount', label: 'Сумма выплаты', placeholder: 'Например: 50000$', maxLength: 80 },
      { id: 'reason', label: 'За что выплата', placeholder: 'Кратко укажи основание выплаты', style: TextInputStyle.Paragraph, maxLength: 1000 },
      { id: 'evidence', label: 'Доказательства / ссылки', placeholder: 'Скриншот выплаты, таблица, ссылки', style: TextInputStyle.Paragraph, required: false, maxLength: 1000 }
    ]
  }
};

export function isReportRequestType(value: unknown): value is ReportRequestType {
  return Object.prototype.hasOwnProperty.call(REPORT_REQUEST_DEFINITIONS, String(value || ''));
}

function timestampLabel(date = new Date()): string {
  return date.toLocaleString('ru-RU');
}

function safe(value: unknown, fallback = 'Не указано', limit = 1024): string {
  return (String(value || '').trim() || fallback).slice(0, limit);
}

export function buildReportRequestPanel(type: ReportRequestType, config?: Partial<ReportRequestConfig>) {
  const definition = REPORT_REQUEST_DEFINITIONS[type];
  return {
    embeds: [new EmbedBuilder()
      .setColor(definition.color)
      .setTitle(definition.panelTitle)
      .setDescription([
        'Заполни форму ниже, чтобы отправить отчёт.',
        '',
        '**Что нужно указать:**',
        ...definition.fields.map((field, index) => `${index + 1}. ${field.label}`),
        '',
        config?.targetChannelId ? `Отчёты отправляются в: <#${config.targetChannelId}>` : 'Канал для отчётов пока не настроен.',
        config?.logChannelId ? `Логи отправляются в: <#${config.logChannelId}>` : 'Канал логов пока не настроен.'
      ].join('\n'))
      .setFooter({ text: `${definition.label} • ${timestampLabel()}` })],
    components: [new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`report_request_open:${type}`)
        .setLabel('Подать отчёт')
        .setEmoji(definition.emoji)
        .setStyle(ButtonStyle.Success)
    )]
  };
}

export function buildReportRequestModal(type: ReportRequestType): ModalBuilder {
  const definition = REPORT_REQUEST_DEFINITIONS[type];
  const modal = new ModalBuilder()
    .setCustomId(`report_request_modal:${type}`)
    .setTitle(definition.label);

  for (const field of definition.fields) {
    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId(field.id)
        .setLabel(field.label)
        .setPlaceholder(field.placeholder)
        .setStyle(field.style || TextInputStyle.Short)
        .setRequired(field.required !== false)
        .setMaxLength(field.maxLength || 500)
    ));
  }

  return modal;
}

export function readReportRequestValues(type: ReportRequestType, fields: { getTextInputValue(id: string): string }): Record<string, string> {
  const definition = REPORT_REQUEST_DEFINITIONS[type];
  return Object.fromEntries(definition.fields.map(field => [
    field.id,
    safe(fields.getTextInputValue(field.id), field.required === false ? 'Не указано' : '', field.maxLength || 1024)
  ]));
}

export function buildReportRequestEmbed(input: {
  type: ReportRequestType;
  values: Record<string, string>;
  reporter: { id: string; username?: string; globalName?: string; tag?: string };
  reportId: string;
}) {
  const definition = REPORT_REQUEST_DEFINITIONS[input.type];
  return new EmbedBuilder()
    .setColor(definition.color)
    .setTitle(definition.reportTitle)
    .setDescription(`Отчёт отправил <@${input.reporter.id}>`)
    .addFields(
      { name: 'ID отчёта', value: input.reportId, inline: true },
      { name: 'Пользователь', value: `<@${input.reporter.id}>`, inline: true },
      { name: 'Discord ID', value: input.reporter.id, inline: true },
      ...definition.fields.map(field => ({
        name: field.label,
        value: safe(input.values[field.id], field.required === false ? 'Не указано' : 'Не заполнено')
      }))
    )
    .setFooter({ text: `${definition.label} • ${timestampLabel()}` })
    .setTimestamp();
}

export function buildReportRequestLogEmbed(input: {
  type: ReportRequestType;
  values: Record<string, string>;
  reporter: { id: string; username?: string; globalName?: string; tag?: string };
  reportId: string;
  guildId: string;
  targetChannelId: string;
  targetMessageId?: string;
}) {
  const definition = REPORT_REQUEST_DEFINITIONS[input.type];
  const messageLink = input.targetMessageId
    ? `https://discord.com/channels/${input.guildId}/${input.targetChannelId}/${input.targetMessageId}`
    : 'Не указано';

  return new EmbedBuilder()
    .setColor(0x64748b)
    .setTitle(`🧾 Лог: ${definition.label}`)
    .addFields(
      { name: 'ID отчёта', value: input.reportId, inline: true },
      { name: 'Тип', value: definition.label, inline: true },
      { name: 'Пользователь', value: `<@${input.reporter.id}>`, inline: true },
      { name: 'Канал отчётов', value: `<#${input.targetChannelId}>`, inline: true },
      { name: 'Сообщение', value: messageLink, inline: false },
      { name: 'Ключевое поле', value: safe(input.values.nickname_static || Object.values(input.values)[0]) }
    )
    .setFooter({ text: `Логи отчётов • ${timestampLabel()}` })
    .setTimestamp();
}
