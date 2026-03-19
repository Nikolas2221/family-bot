require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const { buildFamilyAcceptEmbed } = require('./embed');

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
});

client.on('ready', () => {
  console.log('Бот запущен');
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'testaccept') {
    const member = interaction.member;

    const embed = buildFamilyAcceptEmbed({
      acceptedUser: member.user,
      acceptedNick: member.displayName,
      moderatorUser: interaction.user,
      moderatorNick: interaction.user.username,
      reason: 'Собеседование',
      rankName: '1 ранг'
    });

    await interaction.reply({ embeds: [embed] });
  }
});

client.login(process.env.TOKEN);
