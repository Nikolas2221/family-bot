import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} from 'discord.js';
import type { MediaShareSettings } from './types';

export type MediaShareKind = 'video' | 'stream';

export const MEDIA_SHARE_KINDS: Record<MediaShareKind, {
  label: string;
  emoji: string;
  title: string;
  buttonStyle: ButtonStyle;
  placeholder: string;
}> = {
  video: {
    label: 'Видео',
    emoji: '🎬',
    title: 'Публикация видео',
    buttonStyle: ButtonStyle.Primary,
    placeholder: 'https://youtube.com/watch?v=...'
  },
  stream: {
    label: 'Стрим',
    emoji: '🔴',
    title: 'Публикация стрима',
    buttonStyle: ButtonStyle.Danger,
    placeholder: 'https://twitch.tv/... или https://youtube.com/live/...'
  }
};

export function isMediaShareKind(value: unknown): value is MediaShareKind {
  return value === 'video' || value === 'stream';
}

function timestampLabel(date = new Date()): string {
  return date.toLocaleString('ru-RU');
}

function safe(value: unknown, fallback = 'Не указано', limit = 1024): string {
  return (String(value || '').trim() || fallback).slice(0, limit);
}

export function buildMediaSharePanel(config?: Partial<MediaShareSettings>) {
  return {
    embeds: [new EmbedBuilder()
      .setColor(0x7c3aed)
      .setTitle('🎞️ Медиа-публикации')
      .setDescription([
        'Есть запись заезда, семейного момента или прямой эфир? Отправь ссылку через кнопку ниже.',
        '',
        'Доступ к отправке получает роль с настроенного уровня и все роли выше неё.',
        config?.minRoleId ? `Минимальная роль: <@&${config.minRoleId}>` : 'Минимальная роль ещё не настроена.',
        config?.targetChannelId ? `Публикации уходят в: <#${config.targetChannelId}>` : 'Канал публикаций ещё не настроен.'
      ].join('\n'))
      .setFooter({ text: `Медиа-панель • ${timestampLabel()}` })],
    components: [new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('media_share_open:video')
        .setLabel('Поделиться видео')
        .setEmoji(MEDIA_SHARE_KINDS.video.emoji)
        .setStyle(MEDIA_SHARE_KINDS.video.buttonStyle),
      new ButtonBuilder()
        .setCustomId('media_share_open:stream')
        .setLabel('Поделиться стримом')
        .setEmoji(MEDIA_SHARE_KINDS.stream.emoji)
        .setStyle(MEDIA_SHARE_KINDS.stream.buttonStyle)
    )]
  };
}

export function buildMediaShareModal(kind: MediaShareKind): ModalBuilder {
  const definition = MEDIA_SHARE_KINDS[kind];
  return new ModalBuilder()
    .setCustomId(`media_share_modal:${kind}`)
    .setTitle(definition.title)
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('url')
          .setLabel('Ссылка на контент')
          .setPlaceholder(definition.placeholder)
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(300)
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('note')
          .setLabel('Описание')
          .setPlaceholder('Кратко напиши, что это за публикация')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(false)
          .setMaxLength(700)
      )
    );
}

export function buildMediaSharePublicationEmbed(input: {
  kind: MediaShareKind;
  url: string;
  note?: string;
  author: { id: string; username?: string; globalName?: string; tag?: string };
  moderator?: string;
}) {
  const definition = MEDIA_SHARE_KINDS[input.kind];
  return new EmbedBuilder()
    .setColor(input.kind === 'stream' ? 0xe11d48 : 0x5865f2)
    .setTitle(`${definition.emoji} ${definition.label} от участника`)
    .addFields(
      { name: 'Автор публикации', value: `<@${input.author.id}>`, inline: true },
      { name: 'Модератор', value: safe(input.moderator, 'Автопубликация'), inline: true },
      { name: 'Контент', value: safe(input.url, 'Ссылка не указана', 300), inline: false },
      { name: 'Описание', value: safe(input.note, 'Без описания', 700), inline: false }
    )
    .setFooter({ text: `Медиа-публикация • ${timestampLabel()}` })
    .setTimestamp();
}

export function buildMediaShareLogEmbed(input: {
  kind: MediaShareKind;
  url: string;
  note?: string;
  author: { id: string; username?: string; globalName?: string; tag?: string };
  moderator?: string;
  targetChannelId: string;
  targetMessageId?: string;
  guildId: string;
}) {
  const definition = MEDIA_SHARE_KINDS[input.kind];
  const messageLink = input.targetMessageId
    ? `https://discord.com/channels/${input.guildId}/${input.targetChannelId}/${input.targetMessageId}`
    : 'Не указано';

  return new EmbedBuilder()
    .setColor(0x334155)
    .setTitle(`🧾 Лог медиа: ${definition.label}`)
    .addFields(
      { name: 'Автор публикации', value: `<@${input.author.id}>`, inline: true },
      { name: 'Модератор', value: safe(input.moderator, 'Автопубликация'), inline: true },
      { name: 'Контент', value: safe(input.url, 'Ссылка не указана', 300), inline: false },
      { name: 'Канал', value: `<#${input.targetChannelId}>`, inline: true },
      { name: 'Сообщение', value: messageLink, inline: false },
      { name: 'Описание', value: safe(input.note, 'Без описания', 700), inline: false }
    )
    .setFooter({ text: `Логи медиа • ${timestampLabel()}` })
    .setTimestamp();
}
