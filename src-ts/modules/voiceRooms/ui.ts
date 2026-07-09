import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle
} from 'discord.js';

export function buildVoiceRoomsCommandData() {
  return new SlashCommandBuilder()
    .setName('voice')
    .setDescription('Управление временной голосовой комнатой')
    .addSubcommand(subcommand =>
      subcommand
        .setName('name')
        .setDescription('Переименовать свою голосовую комнату')
        .addStringOption(option => option.setName('название').setDescription('Новое название').setRequired(true).setMaxLength(100))
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('limit')
        .setDescription('Изменить лимит участников')
        .addIntegerOption(option =>
          option.setName('лимит').setDescription('0 = без лимита').setRequired(true).setMinValue(0).setMaxValue(99)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('bitrate')
        .setDescription('Изменить битрейт комнаты в kbps')
        .addIntegerOption(option => option.setName('kbps').setDescription('Например: 64, 96, 128').setRequired(true).setMinValue(8))
    )
    .addSubcommand(subcommand => subcommand.setName('lock').setDescription('Закрыть комнату'))
    .addSubcommand(subcommand => subcommand.setName('unlock').setDescription('Открыть комнату'))
    .addSubcommand(subcommand => subcommand.setName('hide').setDescription('Скрыть комнату'))
    .addSubcommand(subcommand => subcommand.setName('show').setDescription('Показать комнату'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('allow')
        .setDescription('Дать пользователю доступ')
        .addUserOption(option => option.setName('пользователь').setDescription('Кому дать доступ').setRequired(true))
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('deny')
        .setDescription('Убрать доступ у пользователя')
        .addUserOption(option => option.setName('пользователь').setDescription('У кого убрать доступ').setRequired(true))
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('kick')
        .setDescription('Выгнать пользователя из комнаты')
        .addUserOption(option => option.setName('пользователь').setDescription('Кого выгнать').setRequired(true))
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('ban')
        .setDescription('Запретить пользователю вход в комнату')
        .addUserOption(option => option.setName('пользователь').setDescription('Кого заблокировать').setRequired(true))
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('transfer')
        .setDescription('Передать владение комнатой')
        .addUserOption(option => option.setName('пользователь').setDescription('Новый владелец').setRequired(true))
    )
    .addSubcommand(subcommand => subcommand.setName('delete').setDescription('Удалить свою голосовую комнату'));
}

function buildVoiceControlPanelEmbedLegacy(roomName: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('🎛 Управление голосовой комнатой')
    .setDescription([
      `Комната **${roomName}** создана.`,
      'Управляй ей кнопками ниже или командой `/voice`.',
      '',
      '🔒 Закрыть / 🔓 Открыть — управление входом',
      '👁 Скрыть / 🌐 Показать — видимость комнаты',
      '✏️ Название, 👥 Лимит, 🎚 Битрейт — настройки',
      '✅ Доступ / ❌ Убрать / 👢 Выгнать — участники',
      '👑 Передать — новый владелец',
      '🗑 Удалить — удалить комнату'
    ].join('\n'));
}

export function buildVoiceControlPanelEmbed(roomName: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('🎛️ Панель управления Voice Room')
    .setDescription([
      `Ваша комната Voice Room — **${roomName}** создана.`,
      'Управляйте ей кнопками ниже, либо командами `/voice`.',
      '',
      '🔒 **Закрыть** — никто новый не сможет зайти без вашего разрешения.',
      '🔓 **Открыть** — снова разрешить вход всем, у кого есть доступ к серверу.',
      '👁️ **Скрыть** — комната пропадёт из списка каналов для всех, кроме вас и тех, кому вы дали доступ.',
      '🌐 **Показать** — снова сделать комнату видимой в списке каналов.',
      '✏️ **Переименовать** — изменить название комнаты.',
      '👥 **Лимит** — задать максимум участников (0 = без лимита).',
      '🎚️ **Битрейт** — изменить качество звука в комнате (kbps).',
      '🥾 **Выгнать** — отключить конкретного участника от вашей комнаты.',
      '✅ **Добавить доступ** — разрешить конкретному пользователю видеть и заходить в закрытую/скрытую комнату.',
      '❌ **Убрать доступ** — отозвать ранее выданный доступ у пользователя.',
      '👑 **Передать владельца** — сделать другого участника комнаты новым владельцем.',
      '🗑️ **Удалить комнату** — удалить вашу Voice Room (с подтверждением).'
    ].join('\n'));
}

export function buildVoiceControlPanelComponents() {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('vr:lock').setEmoji('🔒').setLabel('Закрыть').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('vr:unlock').setEmoji('🔓').setLabel('Открыть').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('vr:hide').setEmoji('👁').setLabel('Скрыть').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('vr:show').setEmoji('🌐').setLabel('Показать').setStyle(ButtonStyle.Secondary)
    ),
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('vr:rename:modal').setEmoji('✏️').setLabel('Название').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('vr:limit:modal').setEmoji('👥').setLabel('Лимит').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('vr:bitrate:modal').setEmoji('🎚').setLabel('Битрейт').setStyle(ButtonStyle.Primary)
    ),
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('vr:allow:modal').setEmoji('✅').setLabel('Доступ').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('vr:deny:modal').setEmoji('❌').setLabel('Убрать').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('vr:kick:modal').setEmoji('👢').setLabel('Выгнать').setStyle(ButtonStyle.Secondary)
    ),
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('vr:transfer:modal').setEmoji('👑').setLabel('Передать').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('vr:delete:confirm').setEmoji('🗑').setLabel('Удалить').setStyle(ButtonStyle.Danger)
    )
  ];
}

export function buildVoiceModal(customId: string, title: string, label: string, placeholder = ''): ModalBuilder {
  const input = new TextInputBuilder()
    .setCustomId('value')
    .setLabel(label.slice(0, 45))
    .setStyle(TextInputStyle.Short)
    .setRequired(true);
  if (placeholder) input.setPlaceholder(placeholder.slice(0, 100));

  return new ModalBuilder()
    .setCustomId(customId)
    .setTitle(title.slice(0, 45))
    .addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
}
