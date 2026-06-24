import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} from 'discord.js';
import type { SupportTicketRecord } from './types';

function timestampLabel(date = new Date()): string {
  return date.toLocaleString('ru-RU');
}

function safe(value: unknown, fallback = 'Не указано', limit = 1024): string {
  return (String(value || '').trim() || fallback).slice(0, limit);
}

export function buildTicketPanel() {
  return {
    embeds: [new EmbedBuilder()
      .setColor(0x2ecc71)
      .setTitle('🎟️ Система тикетов')
      .setDescription([
        'Нужна помощь? Создай тикет!',
        '',
        '**Когда создавать тикет:**',
        '• Вопросы по серверу',
        '• Технические проблемы',
        '• Жалобы на участников',
        '• Предложения и идеи',
        '',
        'Нажми кнопку ниже, чтобы создать приватный канал для общения с поддержкой.'
      ].join('\n'))
      .setFooter({ text: `Система поддержки • ${timestampLabel()}` })],
    components: [new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('ticket_create').setLabel('Создать тикет').setEmoji('🎟️').setStyle(ButtonStyle.Success)
    )]
  };
}

export function buildTicketInfo() {
  return {
    embeds: [new EmbedBuilder()
      .setColor(0x3498db)
      .setTitle('❓ Что такое тикет?')
      .setDescription([
        'Тикет — это приватный канал для общения с администрацией или поддержкой.',
        '',
        '**Как это работает:**',
        '1️⃣ Нажми кнопку «Создать тикет»',
        '2️⃣ Бот создаст приватный канал только для тебя и поддержки',
        '3️⃣ Опиши свою проблему или вопрос',
        '4️⃣ Дождись ответа от команды поддержки',
        '5️⃣ После решения вопроса закрой тикет кнопкой',
        '',
        '**Преимущества:**',
        '✅ Приватность — только ты и поддержка видят сообщения',
        '✅ Удобство — вся переписка находится в одном месте',
        '✅ Быстрота — поддержка получает уведомление о новом тикете',
        '',
        '**Правила использования:**',
        '⚠️ Не создавай несколько тикетов одновременно',
        '⚠️ Не спамь в тикете',
        '⚠️ Будь вежлив с поддержкой',
        '⚠️ Закрывай тикет после решения вопроса'
      ].join('\n'))
      .setFooter({ text: `Информация о тикетах • ${timestampLabel()}` })]
  };
}

export function buildTicketCreateModal(): ModalBuilder {
  return new ModalBuilder()
    .setCustomId('ticket_create_modal')
    .setTitle('Создание тикета')
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId('topic').setLabel('Тема обращения')
          .setPlaceholder('Например: Жалоба на участника / Техническая проблема')
          .setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(150)
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId('description').setLabel('Описание ситуации')
          .setPlaceholder('Опиши проблему подробно')
          .setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1500)
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId('evidence').setLabel('Доказательства / ссылки')
          .setPlaceholder('Ссылки на скриншоты, видео, сообщения и т.д.')
          .setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(1000)
      )
    );
}

export function buildTicketControls(disabled = false) {
  return [new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('support_ticket_close').setLabel('Закрыть тикет').setEmoji('🔒').setStyle(ButtonStyle.Danger).setDisabled(disabled),
    new ButtonBuilder().setCustomId('support_ticket_claim').setLabel('Взять тикет').setEmoji('👤').setStyle(ButtonStyle.Primary).setDisabled(disabled),
    new ButtonBuilder().setCustomId('support_ticket_add').setLabel('Добавить участника').setEmoji('➕').setStyle(ButtonStyle.Secondary).setDisabled(disabled),
    new ButtonBuilder().setCustomId('support_ticket_remove').setLabel('Убрать участника').setEmoji('➖').setStyle(ButtonStyle.Secondary).setDisabled(disabled)
  )];
}

export function buildTicketOpenEmbed(ticket: SupportTicketRecord): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(0x2ecc71)
    .setTitle('🎟️ Обращение в поддержку')
    .setDescription([
      `Привет, <@${ticket.userId}>!`,
      '',
      'Опиши свою проблему максимально подробно:',
      '• что случилось',
      '• когда случилось',
      '• кого касается ситуация',
      '• есть ли скриншоты или доказательства',
      '• что именно ты хочешь получить в результате',
      '',
      'Команда поддержки скоро ответит.'
    ].join('\n'))
    .addFields(
      { name: 'Пользователь', value: `<@${ticket.userId}>`, inline: true },
      { name: 'ID пользователя', value: ticket.userId, inline: true },
      { name: 'Статус', value: ticket.status === 'open' ? 'Открыт' : 'Закрыт', inline: true },
      { name: 'Тема', value: safe(ticket.topic) },
      { name: 'Описание', value: safe(ticket.description) },
      { name: 'Доказательства', value: safe(ticket.evidence) },
      { name: 'Создан', value: timestampLabel(new Date(ticket.createdAt)), inline: true }
    )
    .setFooter({ text: `Система поддержки • ${timestampLabel()}` });
  if (ticket.claimedBy) embed.addFields({ name: 'Ответственный', value: `<@${ticket.claimedBy}>`, inline: true });
  return embed;
}

export function buildCloseConfirmation() {
  return {
    content: 'Ты точно хочешь закрыть тикет?',
    components: [new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('support_ticket_close_confirm').setLabel('Подтвердить закрытие').setEmoji('✅').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('support_ticket_close_cancel').setLabel('Отмена').setEmoji('❌').setStyle(ButtonStyle.Secondary)
    )]
  };
}

export function buildCloseReasonModal(): ModalBuilder {
  return new ModalBuilder().setCustomId('support_ticket_close_modal').setTitle('Закрытие тикета').addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder().setCustomId('reason').setLabel('Причина закрытия')
        .setPlaceholder('Укажи причину или оставь поле пустым')
        .setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(500)
    )
  );
}

export function buildParticipantModal(action: 'add' | 'remove'): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(`support_ticket_${action}_modal`)
    .setTitle(action === 'add' ? 'Добавить участника' : 'Убрать участника')
    .addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder().setCustomId('user').setLabel('ID пользователя или mention')
        .setPlaceholder('123456789012345678 или @пользователь')
        .setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(40)
    ));
}

export function buildTicketLog(title: string, fields: Array<{ name: string; value: string; inline?: boolean }>, color = 0x3498db): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .addFields(fields.map(field => ({ ...field, value: safe(field.value, 'Не указано') })))
    .setFooter({ text: `Логи тикетов • ${timestampLabel()}` });
}

