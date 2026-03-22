const { SlashCommandBuilder } = require('discord.js');

async function registerCommands(guild) {
  const commands = [
    new SlashCommandBuilder().setName('family').setDescription('Открыть меню семьи'),
    new SlashCommandBuilder().setName('apply').setDescription('Подать заявку в семью'),
    new SlashCommandBuilder().setName('applypanel').setDescription('Отправить панель заявок'),
    new SlashCommandBuilder().setName('applications').setDescription('Показать последние заявки'),
    new SlashCommandBuilder().setName('testaccept').setDescription('Тест красивого лога приёма'),
    new SlashCommandBuilder()
      .setName('profile')
      .setDescription('Профиль участника')
      .addUserOption(option => option.setName('пользователь').setDescription('Кого посмотреть').setRequired(false)),
    new SlashCommandBuilder()
      .setName('warn')
      .setDescription('Выдать выговор')
      .addUserOption(option => option.setName('пользователь').setDescription('Кому').setRequired(true))
      .addStringOption(option => option.setName('причина').setDescription('Причина').setRequired(true)),
    new SlashCommandBuilder()
      .setName('commend')
      .setDescription('Выдать похвалу')
      .addUserOption(option => option.setName('пользователь').setDescription('Кому').setRequired(true))
      .addStringOption(option => option.setName('причина').setDescription('Причина').setRequired(true)),
    new SlashCommandBuilder()
      .setName('ai')
      .setDescription('AI-помощник семьи')
      .addStringOption(option => option.setName('запрос').setDescription('Что нужно?').setRequired(true))
  ].map(command => command.toJSON());

  await guild.commands.set(commands);
}

module.exports = { registerCommands };
