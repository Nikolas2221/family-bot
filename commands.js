const { ChannelType, SlashCommandBuilder } = require('discord.js');
const copy = require('./copy');

async function registerCommands(guild) {
  const commands = [
    new SlashCommandBuilder().setName('family').setDescription(copy.commands.familyDescription),
    new SlashCommandBuilder().setName('apply').setDescription(copy.commands.applyDescription),
    new SlashCommandBuilder().setName('applypanel').setDescription(copy.commands.applyPanelDescription),
    new SlashCommandBuilder().setName('applications').setDescription(copy.commands.applicationsDescription),
    new SlashCommandBuilder().setName('setup').setDescription(copy.commands.setupDescription),
    new SlashCommandBuilder().setName('adminpanel').setDescription(copy.commands.adminPanelDescription),
    new SlashCommandBuilder().setName('help').setDescription(copy.commands.helpDescription),
    new SlashCommandBuilder()
      .setName('setrole')
      .setDescription(copy.commands.setRoleDescription)
      .addStringOption(option =>
        option
          .setName(copy.commands.roleTargetOptionName)
          .setDescription(copy.commands.roleTargetDescription)
          .setRequired(true)
          .addChoices(
            { name: copy.commands.roleTargetLeader, value: 'leader' },
            { name: copy.commands.roleTargetDeputy, value: 'deputy' },
            { name: copy.commands.roleTargetElder, value: 'elder' },
            { name: copy.commands.roleTargetMember, value: 'member' },
            { name: copy.commands.roleTargetNewbie, value: 'newbie' }
          )
      )
      .addRoleOption(option =>
        option.setName(copy.commands.roleValueOptionName).setDescription(copy.commands.roleValueDescription).setRequired(true)
      ),
    new SlashCommandBuilder()
      .setName('setchannel')
      .setDescription(copy.commands.setChannelDescription)
      .addStringOption(option =>
        option
          .setName(copy.commands.channelTargetOptionName)
          .setDescription(copy.commands.channelTargetDescription)
          .setRequired(true)
          .addChoices(
            { name: copy.commands.channelTargetPanel, value: 'panel' },
            { name: copy.commands.channelTargetApplications, value: 'applications' },
            { name: copy.commands.channelTargetLogs, value: 'logs' },
            { name: copy.commands.channelTargetDiscipline, value: 'disciplineLogs' }
          )
      )
      .addChannelOption(option =>
        option
          .setName(copy.commands.channelValueOptionName)
          .setDescription(copy.commands.channelValueDescription)
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(true)
      ),
    new SlashCommandBuilder()
      .setName('setfamilytitle')
      .setDescription(copy.commands.setFamilyTitleDescription)
      .addStringOption(option =>
        option
          .setName(copy.commands.familyTitleOptionName)
          .setDescription(copy.commands.familyTitleOptionDescription)
          .setRequired(true)
      ),
    new SlashCommandBuilder().setName('leaderboard').setDescription(copy.commands.leaderboardDescription),
    new SlashCommandBuilder().setName('voiceactivity').setDescription(copy.commands.voiceActivityDescription),
    new SlashCommandBuilder()
      .setName('activityreport')
      .setDescription(copy.commands.activityReportDescription)
      .addUserOption(option =>
        option.setName(copy.commands.userOptionName).setDescription(copy.commands.profileUserDescription).setRequired(false)
      ),
    new SlashCommandBuilder()
      .setName('aiadvisor')
      .setDescription(copy.commands.aiAdvisorDescription)
      .addUserOption(option =>
        option.setName(copy.commands.userOptionName).setDescription(copy.commands.profileUserDescription).setRequired(false)
      ),
    new SlashCommandBuilder()
      .setName('subscription')
      .setDescription(copy.commands.subscriptionDescription)
      .addStringOption(option =>
        option
          .setName(copy.commands.planOptionName)
          .setDescription(copy.commands.planDescription)
          .setRequired(true)
          .addChoices({ name: 'Free — 0$', value: 'free' }, { name: 'Premium — 5$', value: 'premium' })
      ),
    new SlashCommandBuilder()
      .setName('blacklistadd')
      .setDescription(copy.commands.blacklistAddDescription)
      .addUserOption(option =>
        option.setName(copy.commands.userOptionName).setDescription(copy.commands.targetUserDescription).setRequired(true)
      )
      .addStringOption(option =>
        option.setName(copy.commands.reasonOptionName).setDescription(copy.commands.reasonDescription).setRequired(true)
      ),
    new SlashCommandBuilder()
      .setName('blacklistremove')
      .setDescription(copy.commands.blacklistRemoveDescription)
      .addUserOption(option =>
        option.setName(copy.commands.userOptionName).setDescription(copy.commands.targetUserDescription).setRequired(true)
      ),
    new SlashCommandBuilder()
      .setName('unbanid')
      .setDescription(copy.commands.unbanIdDescription)
      .addStringOption(option =>
        option.setName(copy.commands.userIdOptionName).setDescription(copy.commands.userIdDescription).setRequired(true)
      ),
    new SlashCommandBuilder().setName('banlist').setDescription(copy.commands.banListDescription),
    new SlashCommandBuilder().setName('blacklistlist').setDescription(copy.commands.blacklistListDescription),
    new SlashCommandBuilder().setName('testaccept').setDescription(copy.commands.testAcceptDescription),
    new SlashCommandBuilder().setName('debugconfig').setDescription(copy.commands.debugConfigDescription),
    new SlashCommandBuilder()
      .setName('profile')
      .setDescription(copy.commands.profileDescription)
      .addUserOption(option =>
        option.setName(copy.commands.userOptionName).setDescription(copy.commands.profileUserDescription).setRequired(false)
      ),
    new SlashCommandBuilder()
      .setName('warn')
      .setDescription(copy.commands.warnDescription)
      .addUserOption(option =>
        option.setName(copy.commands.userOptionName).setDescription(copy.commands.targetUserDescription).setRequired(true)
      )
      .addStringOption(option =>
        option.setName(copy.commands.reasonOptionName).setDescription(copy.commands.reasonDescription).setRequired(true)
      ),
    new SlashCommandBuilder()
      .setName('commend')
      .setDescription(copy.commands.commendDescription)
      .addUserOption(option =>
        option.setName(copy.commands.userOptionName).setDescription(copy.commands.targetUserDescription).setRequired(true)
      )
      .addStringOption(option =>
        option.setName(copy.commands.reasonOptionName).setDescription(copy.commands.reasonDescription).setRequired(true)
      ),
    new SlashCommandBuilder()
      .setName('ai')
      .setDescription(copy.commands.aiDescription)
      .addStringOption(option =>
        option.setName(copy.commands.queryOptionName).setDescription(copy.commands.queryDescription).setRequired(true)
      )
  ].map(command => command.toJSON());

  await guild.commands.set(commands);
}

module.exports = { registerCommands };
