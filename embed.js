const { EmbedBuilder } = require('discord.js');

function buildFamilyAcceptEmbed({
  acceptedUser,
  acceptedNick,
  moderatorUser,
  moderatorNick,
  reason = 'Собеседование',
  rankName = '1 ранг'
}) {
  return new EmbedBuilder()
    .setColor(0x16a34a)
    .setTitle('🏠 Приём в семью')
    .setDescription(
      `> **<@${acceptedUser.id}> принят в семью**\n> Принял: <@${moderatorUser.id}>`
    )
    .addFields(
      { name: '👤 Кандидат', value: `${acceptedNick}\nID: ${acceptedUser.id}` },
      { name: '👑 Принял', value: `${moderatorNick}\nID: ${moderatorUser.id}` },
      { name: '📋 Детали', value: `Причина: ${reason}\nРанг: ${rankName}` }
    )
    .setThumbnail(acceptedUser.displayAvatarURL())
    .setTimestamp();
}

module.exports = { buildFamilyAcceptEmbed };
