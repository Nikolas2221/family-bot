import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} from 'discord.js';
import type { AfkRequestRecord } from './types';

function dateTime(value: Date | string = new Date()): string {
  return new Date(value).toLocaleString('ru-RU');
}

function clean(value: unknown, fallback = 'Не указана', limit = 1024): string {
  return (String(value || '').trim() || fallback).slice(0, limit);
}

export function buildAfkPanel() {
  return {
    embeds: [new EmbedBuilder()
      .setColor(0x2ecc71)
      .setTitle('🏖️ Заявка на АФК-отпуск')
      .setDescription([
        'Если вы планируете отсутствовать, заполните форму ниже и отправьте её в этот канал.',
        '',
        '**📋 Форма**',
        '1. Ник и статик',
        '2. С какой даты по какую',
        '3. Причина отпуска',
        '',
        '**📌 Пример**',
        '1. Username #12345',
        '2. 11.06.2026 - 13.06.2026',
        '3. Еду отдохнуть на дачу',
        '',
        '**✅ Одобрение**',
        'Если ваш отпуск одобрен, администрация поставит положительную реакцию на ваш пост.'
      ].join('\n'))
      .setFooter({ text: `АФК-отпуск • ${dateTime()}` })],
    components: [new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('afk_request_create').setLabel('Подать заявку').setEmoji('📝').setStyle(ButtonStyle.Success)
    )]
  };
}

export function buildAfkRequestModal(): ModalBuilder {
  return new ModalBuilder().setCustomId('afk_request_modal').setTitle('Заявка на АФК-отпуск').addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder().setCustomId('nickname_static').setLabel('Ник и статик')
        .setPlaceholder('Например: Username #12345').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(100)
    ),
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder().setCustomId('start_date').setLabel('Дата начала')
        .setPlaceholder('Например: 11.06.2026').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(10)
    ),
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder().setCustomId('end_date').setLabel('Дата окончания')
        .setPlaceholder('Например: 13.06.2026').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(10)
    ),
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder().setCustomId('reason').setLabel('Причина отпуска')
        .setPlaceholder('Например: Еду отдохнуть на дачу').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1000)
    )
  );
}

function statusLabel(status: AfkRequestRecord['status']): string {
  if (status === 'approved') return 'Одобрено';
  if (status === 'declined') return 'Отклонено';
  return 'На рассмотрении';
}

function statusColor(status: AfkRequestRecord['status']): number {
  if (status === 'approved') return 0x2ecc71;
  if (status === 'declined') return 0xe74c3c;
  return 0xf39c12;
}

export function buildAfkRequestEmbed(request: AfkRequestRecord): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(statusColor(request.status))
    .setTitle('🏖️ Заявка на АФК-отпуск')
    .addFields(
      { name: 'Пользователь', value: `<@${request.userId}>`, inline: true },
      { name: 'ID заявки', value: request.id, inline: true },
      { name: 'Ник и статик', value: clean(request.nicknameStatic) },
      { name: 'Период', value: `${request.startDate} - ${request.endDate}` },
      { name: 'Причина', value: clean(request.reason) },
      { name: 'Статус', value: statusLabel(request.status), inline: true },
      { name: 'Дата подачи', value: dateTime(request.createdAt), inline: true }
    )
    .setFooter({ text: `Заявка на АФК-отпуск • ${dateTime()}` });
  if (request.reviewedBy) {
    const reviewer = request.reviewedByName
      || (/^\d{16,20}$/u.test(request.reviewedBy) ? `<@${request.reviewedBy}>` : request.reviewedBy);
    embed.addFields({ name: 'Рассмотрел', value: clean(reviewer), inline: true });
  }
  if (request.status === 'declined') embed.addFields({ name: 'Причина отклонения', value: clean(request.declineReason) });
  return embed;
}

export function buildAfkReviewButtons(requestId: string, disabled = false) {
  return [new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`afk_approve_${requestId}`).setLabel('Одобрить').setEmoji('✅').setStyle(ButtonStyle.Success).setDisabled(disabled),
    new ButtonBuilder().setCustomId(`afk_decline_${requestId}`).setLabel('Отклонить').setEmoji('❌').setStyle(ButtonStyle.Danger).setDisabled(disabled)
  )];
}

export function buildAfkDeclineModal(requestId: string): ModalBuilder {
  return new ModalBuilder().setCustomId(`afk_decline_modal_${requestId}`).setTitle('Отклонение АФК-отпуска').addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder().setCustomId('reason').setLabel('Причина отклонения')
        .setPlaceholder('Обязательно укажи причину отказа')
        .setStyle(TextInputStyle.Paragraph).setRequired(true).setMinLength(3).setMaxLength(500)
    )
  );
}

export function buildAfkLog(title: string, fields: Array<{ name: string; value: string; inline?: boolean }>, color = 0x3498db): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .addFields(fields.map(field => ({ ...field, value: clean(field.value) })))
    .setFooter({ text: `Логи АФК-отпусков • ${dateTime()}` });
}

export { dateTime, statusLabel };
