const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} = require('discord.js');

function getStatusEmoji(member) {
  const status = member.presence?.status || 'offline';
  if (status === 'online') return '🟢';
  if (status === 'idle') return '🟡';
  if (status === 'dnd') return '⛔';
  return '⚫';
}

function statusWeight(member) {
  const status = member.presence?.status || 'offline';
  if (status === 'online') return 0;
  if (status === 'idle') return 1;
  if (status === 'dnd') return 2;
  return 3;
}

function sortMembers(members, activityScore) {
  return [...members].sort((a, b) => {
    const byStatus = statusWeight(a) - statusWeight(b);
    if (byStatus !== 0) return byStatus;

    const byActivity = activityScore(b.id) - activityScore(a.id);
    if (byActivity !== 0) return byActivity;

    return a.displayName.localeCompare(b.displayName, 'ru');
  });
}

function chunk(items, size) {
  const parts = [];
  for (let index = 0; index < items.length; index += size) {
    parts.push(items.slice(index, index + size));
  }
  return parts;
}

function panelButtons() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('family_refresh').setLabel('Обновить').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('family_apply').setLabel('Подать заявку').setStyle(ButtonStyle.Success)
    )
  ];
}

function buildFamilyMenuEmbed() {
  return new EmbedBuilder()
    .setTitle('🌆 Панель семьи')
    .setColor(0x8b5cf6)
    .setDescription('Выбери действие ниже.')
    .setTimestamp();
}

function buildApplyModal() {
  const modal = new ModalBuilder().setCustomId('family_apply_modal').setTitle('Заявка в семью');
  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('nickname').setLabel('Ваш ник').setStyle(TextInputStyle.Short).setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('age').setLabel('Ваш возраст').setStyle(TextInputStyle.Short).setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('text')
        .setLabel('Почему хотите в семью')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
    )
  );
  return modal;
}

function buildApplicationsPanelEmbed() {
  return new EmbedBuilder()
    .setTitle('📨 Заявки в семью')
    .setColor(0x22c55e)
    .setDescription('Нажми кнопку ниже, чтобы подать заявку в семью.')
    .setFooter({ text: 'Majestic Style • Family Applications' })
    .setTimestamp();
}

function buildApplicationsPanelButtons() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('family_apply').setLabel('Подать заявку').setStyle(ButtonStyle.Success)
    )
  ];
}

function buildApplicationEmbed({ user, nickname, age, text, applicationId, source = 'Заявка' }) {
  return new EmbedBuilder()
    .setColor(0x22c55e)
    .setTitle('📝 Заявка в семью')
    .setDescription(`> **${source} от <@${user.id}>**\n> Статус: **На рассмотрении**`)
    .addFields(
      { name: '👤 Пользователь', value: `<@${user.id}>`, inline: true },
      { name: '📛 Ник', value: nickname, inline: true },
      { name: '🎂 Возраст', value: age, inline: true },
      { name: '📄 Текст заявки', value: text, inline: false },
      { name: '🆔 Номер заявки', value: `\`${applicationId}\``, inline: true }
    )
    .setFooter({ text: 'Majestic Style • Family Applications' })
    .setTimestamp();
}

function buildApplicationButtons(applicationId, userId) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`app_accept:${applicationId}:${userId}`).setLabel('✅ Принять').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`app_ai:${applicationId}:${userId}`).setLabel('🤖 AI-анализ').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`app_review:${applicationId}:${userId}`).setLabel('🕒 На рассмотрении').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`app_reject:${applicationId}:${userId}`).setLabel('❌ Отклонить').setStyle(ButtonStyle.Danger)
    )
  ];
}

function buildAcceptLogEmbed({ member, moderatorUser, reason = 'Собеседование', rankName = '1 ранг' }) {
  return new EmbedBuilder()
    .setColor(0x16a34a)
    .setTitle('🏠 Отчёт о приёме в семью')
    .setDescription(`**<@${moderatorUser.id}> принимает <@${member.id}> в семью**`)
    .addFields(
      {
        name: '👤 Принят в семью',
        value: [
          `**Пользователь:** <@${member.id}>`,
          `**Ник:** ${member.displayName}`,
          `**Discord ID:** \`${member.id}\``
        ].join('\n'),
        inline: false
      },
      {
        name: '🕴 Кто принял',
        value: [
          `**Пользователь:** <@${moderatorUser.id}>`,
          `**Ник:** ${moderatorUser.username}`,
          `**Discord ID:** \`${moderatorUser.id}\``
        ].join('\n'),
        inline: false
      },
      {
        name: '📋 Детали приёма',
        value: [`**Причина:** ${reason}`, `**Принят на:** ${rankName}`].join('\n'),
        inline: false
      }
    )
    .setFooter({ text: 'Family Log System' })
    .setTimestamp();
}

function buildRejectLogEmbed({ user, moderatorUser, reason = 'Отказ' }) {
  return new EmbedBuilder()
    .setColor(0xef4444)
    .setTitle('❌ Отчёт об отказе')
    .setDescription(`**<@${moderatorUser.id}> отклоняет заявку <@${user.id}>**`)
    .addFields(
      {
        name: '👤 Кандидат',
        value: `**Пользователь:** <@${user.id}>\n**Discord ID:** \`${user.id}\``,
        inline: false
      },
      {
        name: '🕴 Кто отклонил',
        value: `**Пользователь:** <@${moderatorUser.id}>\n**Discord ID:** \`${moderatorUser.id}\``,
        inline: false
      },
      { name: '📋 Причина', value: reason, inline: false }
    )
    .setFooter({ text: 'Family Log System' })
    .setTimestamp();
}

function buildWarnLogEmbed({ targetUser, moderatorUser, reason }) {
  return new EmbedBuilder()
    .setColor(0xf97316)
    .setTitle('⚠️ Выговор')
    .setDescription(`**<@${moderatorUser.id}> выдал выговор <@${targetUser.id}>**`)
    .addFields(
      { name: '👤 Участник', value: `<@${targetUser.id}>\n\`${targetUser.id}\``, inline: true },
      { name: '🕴 Выдал', value: `<@${moderatorUser.id}>\n\`${moderatorUser.id}\``, inline: true },
      { name: '📋 Причина', value: reason, inline: false }
    )
    .setFooter({ text: 'Discipline Log' })
    .setTimestamp();
}

function buildCommendLogEmbed({ targetUser, moderatorUser, reason }) {
  return new EmbedBuilder()
    .setColor(0x3b82f6)
    .setTitle('🏅 Похвала')
    .setDescription(`**<@${moderatorUser.id}> отметил <@${targetUser.id}>**`)
    .addFields(
      { name: '👤 Участник', value: `<@${targetUser.id}>\n\`${targetUser.id}\``, inline: true },
      { name: '🕴 Выдал', value: `<@${moderatorUser.id}>\n\`${moderatorUser.id}\``, inline: true },
      { name: '📋 Причина', value: reason, inline: false }
    )
    .setFooter({ text: 'Discipline Log' })
    .setTimestamp();
}

function buildProfileEmbed(member, { activityScore, memberData, familyRoleIds }) {
  const familyRoles = member.roles.cache
    .filter(role => familyRoleIds.includes(role.id))
    .map(role => `<@&${role.id}>`)
    .join(', ') || 'Нет';

  return new EmbedBuilder()
    .setColor(0x8b5cf6)
    .setTitle('👤 Профиль участника')
    .setDescription(`> Информация о <@${member.id}>`)
    .setThumbnail(member.user.displayAvatarURL())
    .addFields(
      { name: '📛 Ник', value: member.displayName, inline: true },
      { name: '👤 Discord', value: `<@${member.id}>`, inline: true },
      { name: '🆔 ID', value: `\`${member.id}\``, inline: true },
      { name: '📌 Роли семьи', value: familyRoles, inline: false },
      { name: '📈 Активность', value: String(activityScore(member.id)), inline: true },
      { name: '⚠️ Выговоры', value: String(memberData.warns || 0), inline: true },
      { name: '🏅 Похвалы', value: String(memberData.commends || 0), inline: true },
      { name: '💬 Сообщения', value: String(memberData.messageCount || 0), inline: true },
      { name: '🟢 Статус', value: `${getStatusEmoji(member)} ${member.presence?.status || 'offline'}`, inline: true }
    )
    .setFooter({ text: 'Family Profile System' })
    .setTimestamp();
}

function buildApplicationsListEmbed(applications) {
  const description = applications.length
    ? applications.map((application, index) => `${index + 1}. \`${application.id}\` • <@${application.discordId}> • ${application.status}`).join('\n')
    : 'Нет заявок';

  return new EmbedBuilder()
    .setTitle('🗂 Последние заявки')
    .setColor(0x22c55e)
    .setDescription(description)
    .setTimestamp();
}

async function buildFamilyEmbeds(guild, { roles, familyTitle, updateIntervalMs, activityScore }) {
  const configuredRoles = roles
    .map(item => ({ ...item, role: guild.roles.cache.get(item.id) }))
    .filter(item => item.role)
    .sort((a, b) => b.role.position - a.role.position);

  const result = [];
  let embed = new EmbedBuilder()
    .setTitle(familyTitle)
    .setColor(0x8b5cf6)
    .setDescription('🟢 Онлайн • 🟡 Отошёл • ⛔ Не беспокоить • ⚫ Оффлайн')
    .setTimestamp()
    .setFooter({ text: `Обновление каждые ${Math.floor(updateIntervalMs / 1000)} сек.` });

  let total = 0;
  let fieldCount = 0;

  for (const item of configuredRoles) {
    const members = sortMembers(item.role.members.map(member => member), activityScore);
    if (!members.length) continue;

    total += members.length;
    const lines = members.map(member => `${getStatusEmoji(member)} <@${member.id}> • ${activityScore(member.id)} очк.`);
    const parts = chunk(lines, 15);

    for (let index = 0; index < parts.length; index += 1) {
      if (fieldCount >= 25) {
        result.push(embed);
        embed = new EmbedBuilder().setColor(0x8b5cf6).setTimestamp();
        fieldCount = 0;
      }

      embed.addFields({
        name: index === 0 ? `${item.name} (${members.length})` : `${item.name} — продолжение`,
        value: parts[index].join('\n'),
        inline: false
      });
      fieldCount += 1;
    }
  }

  if (fieldCount === 0) {
    embed.setDescription('Нет участников в выбранных ролях.');
  }

  embed.setAuthor({ name: `Всего участников: ${total}` });
  result.push(embed);
  return result;
}

module.exports = {
  buildAcceptLogEmbed,
  buildApplicationButtons,
  buildApplicationEmbed,
  buildApplicationsListEmbed,
  buildApplicationsPanelButtons,
  buildApplicationsPanelEmbed,
  buildApplyModal,
  buildCommendLogEmbed,
  buildFamilyEmbeds,
  buildFamilyMenuEmbed,
  buildProfileEmbed,
  buildRejectLogEmbed,
  buildWarnLogEmbed,
  panelButtons
};
