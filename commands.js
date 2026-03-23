const crypto = require('crypto');
const { ChannelType, SlashCommandBuilder } = require('discord.js');
const copy = require('./copy');

function buildCommands() {
  return [
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
            { name: copy.commands.roleTargetNewbie, value: 'newbie' },
            { name: copy.commands.roleTargetMute, value: 'mute' },
            { name: copy.commands.roleTargetAutorole, value: 'autorole' }
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
            { name: copy.commands.channelTargetWelcome, value: 'welcome' },
            { name: copy.commands.channelTargetLogs, value: 'logs' },
            { name: copy.commands.channelTargetDiscipline, value: 'disciplineLogs' },
            { name: copy.commands.channelTargetUpdates, value: 'updates' },
            { name: copy.commands.channelTargetReports, value: 'reports' }
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
    new SlashCommandBuilder()
      .setName('setmode')
      .setDescription(copy.commands.setModeDescription)
      .addStringOption(option =>
        option
          .setName(copy.commands.modeOptionName)
          .setDescription(copy.commands.modeOptionDescription)
          .setRequired(true)
          .addChoices(
            { name: copy.commands.modeFamily, value: 'family' },
            { name: copy.commands.modeHybrid, value: 'hybrid' },
            { name: copy.commands.modeServer, value: 'server' }
          )
      ),
    new SlashCommandBuilder()
      .setName('setmodule')
      .setDescription(copy.commands.setModuleDescription)
      .addStringOption(option =>
        option
          .setName(copy.commands.moduleOptionName)
          .setDescription(copy.commands.moduleOptionDescription)
          .setRequired(true)
          .addChoices(
            { name: copy.commands.moduleFamily, value: 'family' },
            { name: copy.commands.moduleApplications, value: 'applications' },
            { name: copy.commands.moduleModeration, value: 'moderation' },
            { name: copy.commands.moduleSecurity, value: 'security' },
            { name: copy.commands.moduleAnalytics, value: 'analytics' },
            { name: copy.commands.moduleAi, value: 'ai' },
            { name: copy.commands.moduleWelcome, value: 'welcome' },
            { name: copy.commands.moduleAutomod, value: 'automod' },
            { name: copy.commands.moduleSubscriptions, value: 'subscriptions' },
            { name: copy.commands.moduleCustomCommands, value: 'customCommands' },
            { name: copy.commands.moduleMusic, value: 'music' }
          )
      )
      .addStringOption(option =>
        option
          .setName(copy.commands.stateOptionName)
          .setDescription(copy.commands.stateOptionDescription)
          .setRequired(true)
          .addChoices(
            { name: copy.commands.stateOn, value: 'on' },
            { name: copy.commands.stateOff, value: 'off' }
          )
      ),
    new SlashCommandBuilder()
      .setName('automod')
      .setDescription(copy.commands.automodDescription)
      .addSubcommand(subcommand =>
        subcommand
          .setName(copy.commands.automodStatusSubcommand)
          .setDescription(copy.commands.automodStatusDescription)
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName(copy.commands.automodToggleSubcommand)
          .setDescription(copy.commands.automodToggleDescription)
          .addStringOption(option =>
            option
              .setName(copy.commands.automodRuleOptionName)
              .setDescription(copy.commands.automodRuleOptionDescription)
              .setRequired(true)
              .addChoices(
                { name: copy.commands.automodRuleInvites, value: 'invites' },
                { name: copy.commands.automodRuleLinks, value: 'links' },
                { name: copy.commands.automodRuleCaps, value: 'caps' },
                { name: copy.commands.automodRuleMentions, value: 'mentions' },
                { name: copy.commands.automodRuleSpam, value: 'spam' },
                { name: copy.commands.automodRuleBadWords, value: 'badWords' }
              )
          )
          .addStringOption(option =>
            option
              .setName(copy.commands.stateOptionName)
              .setDescription(copy.commands.stateOptionDescription)
              .setRequired(true)
              .addChoices(
                { name: copy.commands.stateOn, value: 'on' },
                { name: copy.commands.stateOff, value: 'off' }
              )
          )
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName(copy.commands.automodLimitSubcommand)
          .setDescription(copy.commands.automodLimitDescription)
          .addStringOption(option =>
            option
              .setName(copy.commands.automodTargetOptionName)
              .setDescription(copy.commands.automodTargetOptionDescription)
              .setRequired(true)
              .addChoices(
                { name: copy.commands.automodTargetCapsPercent, value: 'capsPercent' },
                { name: copy.commands.automodTargetCapsMinLength, value: 'capsMinLength' },
                { name: copy.commands.automodTargetMentionLimit, value: 'mentionLimit' },
                { name: copy.commands.automodTargetSpamCount, value: 'spamCount' },
                { name: copy.commands.automodTargetSpamWindow, value: 'spamWindowSeconds' }
              )
          )
          .addIntegerOption(option =>
            option
              .setName(copy.commands.valueOptionName)
              .setDescription(copy.commands.valueOptionDescription)
              .setRequired(true)
          )
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName(copy.commands.automodWordsSubcommand)
          .setDescription(copy.commands.automodWordsDescription)
          .addStringOption(option =>
            option
              .setName(copy.commands.actionOptionName)
              .setDescription(copy.commands.actionOptionDescription)
              .setRequired(true)
              .addChoices(
                { name: copy.commands.automodWordAddAction, value: 'add' },
                { name: copy.commands.automodWordRemoveAction, value: 'remove' },
                { name: copy.commands.automodWordListAction, value: 'list' },
                { name: copy.commands.automodWordClearAction, value: 'clear' }
              )
          )
          .addStringOption(option =>
            option
              .setName(copy.commands.wordOptionName)
              .setDescription(copy.commands.wordOptionDescription)
              .setRequired(false)
          )
      ),
    new SlashCommandBuilder()
      .setName('setart')
      .setDescription(copy.commands.setArtDescription)
      .addStringOption(option =>
        option
          .setName(copy.commands.artTargetOptionName)
          .setDescription(copy.commands.artTargetDescription)
          .setRequired(true)
          .addChoices(
            { name: copy.commands.artTargetFamily, value: 'familyBanner' },
            { name: copy.commands.artTargetApplications, value: 'applicationsBanner' }
          )
      )
      .addStringOption(option =>
        option
          .setName(copy.commands.artUrlOptionName)
          .setDescription(copy.commands.artUrlDescription)
          .setRequired(true)
      ),
    new SlashCommandBuilder()
      .setName('welcome')
      .setDescription(copy.commands.welcomeDescription)
      .addSubcommand(subcommand =>
        subcommand
          .setName(copy.commands.welcomeStatusSubcommand)
          .setDescription(copy.commands.welcomeStatusDescription)
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName(copy.commands.welcomeToggleSubcommand)
          .setDescription(copy.commands.welcomeToggleDescription)
          .addStringOption(option =>
            option
              .setName(copy.commands.stateOptionName)
              .setDescription(copy.commands.stateOptionDescription)
              .setRequired(true)
              .addChoices(
                { name: copy.commands.stateOn, value: 'on' },
                { name: copy.commands.stateOff, value: 'off' }
              )
          )
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName(copy.commands.welcomeChannelSubcommand)
          .setDescription(copy.commands.welcomeChannelDescription)
          .addChannelOption(option =>
            option
              .setName(copy.commands.channelValueOptionName)
              .setDescription(copy.commands.channelValueDescription)
              .addChannelTypes(ChannelType.GuildText)
              .setRequired(true)
          )
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName(copy.commands.welcomeDmSubcommand)
          .setDescription(copy.commands.welcomeDmDescription)
          .addStringOption(option =>
            option
              .setName(copy.commands.stateOptionName)
              .setDescription(copy.commands.stateOptionDescription)
              .setRequired(true)
              .addChoices(
                { name: copy.commands.stateOn, value: 'on' },
                { name: copy.commands.stateOff, value: 'off' }
              )
          )
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName(copy.commands.welcomeMessageSubcommand)
          .setDescription(copy.commands.welcomeMessageDescription)
          .addStringOption(option =>
            option
              .setName(copy.commands.messageOptionName)
              .setDescription(copy.commands.messageOptionDescription)
              .setRequired(true)
          )
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName(copy.commands.welcomeTestSubcommand)
          .setDescription(copy.commands.welcomeTestDescription)
      ),
    new SlashCommandBuilder()
      .setName('autorole')
      .setDescription(copy.commands.autoroleDescription)
      .addSubcommand(subcommand =>
        subcommand
          .setName(copy.commands.autoroleStatusSubcommand)
          .setDescription(copy.commands.autoroleStatusDescription)
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName(copy.commands.autoroleSetSubcommand)
          .setDescription(copy.commands.autoroleSetDescription)
          .addRoleOption(option =>
            option
              .setName(copy.commands.roleValueOptionName)
              .setDescription(copy.commands.roleValueDescription)
              .setRequired(true)
          )
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName(copy.commands.autoroleClearSubcommand)
          .setDescription(copy.commands.autoroleClearDescription)
      ),
    new SlashCommandBuilder()
      .setName('reactionrole')
      .setDescription(copy.commands.reactionRoleDescription)
      .addSubcommand(subcommand =>
        subcommand
          .setName(copy.commands.reactionRoleStatusSubcommand)
          .setDescription(copy.commands.reactionRoleStatusDescription)
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName(copy.commands.reactionRoleAddSubcommand)
          .setDescription(copy.commands.reactionRoleAddDescription)
          .addStringOption(option =>
            option
              .setName(copy.commands.messageIdOptionName)
              .setDescription(copy.commands.messageIdOptionDescription)
              .setRequired(true)
          )
          .addStringOption(option =>
            option
              .setName(copy.commands.emojiOptionName)
              .setDescription(copy.commands.emojiOptionDescription)
              .setRequired(true)
          )
          .addRoleOption(option =>
            option
              .setName(copy.commands.roleValueOptionName)
              .setDescription(copy.commands.roleValueDescription)
              .setRequired(true)
          )
          .addChannelOption(option =>
            option
              .setName(copy.commands.channelOptionName)
              .setDescription(copy.commands.channelOptionDescription)
              .addChannelTypes(ChannelType.GuildText)
              .setRequired(false)
          )
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName(copy.commands.reactionRoleRemoveSubcommand)
          .setDescription(copy.commands.reactionRoleRemoveDescription)
          .addStringOption(option =>
            option
              .setName(copy.commands.messageIdOptionName)
              .setDescription(copy.commands.messageIdOptionDescription)
              .setRequired(true)
          )
          .addStringOption(option =>
            option
              .setName(copy.commands.emojiOptionName)
              .setDescription(copy.commands.emojiOptionDescription)
              .setRequired(true)
          )
      ),
    new SlashCommandBuilder()
      .setName('reportschedule')
      .setDescription(copy.commands.reportScheduleDescription)
      .addSubcommand(subcommand =>
        subcommand
          .setName(copy.commands.reportScheduleStatusSubcommand)
          .setDescription(copy.commands.reportScheduleStatusDescription)
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName(copy.commands.reportScheduleSetSubcommand)
          .setDescription(copy.commands.reportScheduleSetDescription)
          .addStringOption(option =>
            option
              .setName(copy.commands.periodOptionName)
              .setDescription(copy.commands.periodOptionDescription)
              .setRequired(true)
              .addChoices(
                { name: copy.commands.periodWeekly, value: 'weekly' },
                { name: copy.commands.periodMonthly, value: 'monthly' }
              )
          )
          .addChannelOption(option =>
            option
              .setName(copy.commands.channelValueOptionName)
              .setDescription(copy.commands.channelValueDescription)
              .addChannelTypes(ChannelType.GuildText)
              .setRequired(false)
          )
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName(copy.commands.reportScheduleOffSubcommand)
          .setDescription(copy.commands.reportScheduleOffDescription)
          .addStringOption(option =>
            option
              .setName(copy.commands.periodOptionName)
              .setDescription(copy.commands.periodOptionDescription)
              .setRequired(true)
              .addChoices(
                { name: copy.commands.periodWeekly, value: 'weekly' },
                { name: copy.commands.periodMonthly, value: 'monthly' }
              )
          )
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName(copy.commands.reportScheduleSendSubcommand)
          .setDescription(copy.commands.reportScheduleSendDescription)
          .addStringOption(option =>
            option
              .setName(copy.commands.periodOptionName)
              .setDescription(copy.commands.periodOptionDescription)
              .setRequired(true)
              .addChoices(
                { name: copy.commands.periodWeekly, value: 'weekly' },
                { name: copy.commands.periodMonthly, value: 'monthly' }
              )
          )
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
      .setName('serverreport')
      .setDescription(copy.commands.serverReportDescription)
      .addStringOption(option =>
        option
          .setName(copy.commands.periodOptionName)
          .setDescription(copy.commands.periodOptionDescription)
          .setRequired(true)
          .addChoices(
            { name: copy.commands.periodWeekly, value: 'weekly' },
            { name: copy.commands.periodMonthly, value: 'monthly' }
          )
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
      .addUserOption(option =>
        option.setName(copy.commands.userOptionName).setDescription(copy.commands.targetUserDescription).setRequired(false)
      )
      .addStringOption(option =>
        option.setName(copy.commands.nicknameOptionName).setDescription(copy.commands.nicknameOptionDescription).setRequired(false)
      ),
    new SlashCommandBuilder()
      .setName('purge')
      .setDescription(copy.commands.purgeDescription)
      .addIntegerOption(option =>
        option.setName(copy.commands.countOptionName).setDescription(copy.commands.countOptionDescription).setRequired(true)
      )
      .addChannelOption(option =>
        option
          .setName(copy.commands.channelOptionName)
          .setDescription(copy.commands.channelOptionDescription)
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(false)
      ),
    new SlashCommandBuilder()
      .setName('purgeuser')
      .setDescription(copy.commands.purgeUserDescription)
      .addUserOption(option =>
        option.setName(copy.commands.userOptionName).setDescription(copy.commands.targetUserDescription).setRequired(true)
      )
      .addIntegerOption(option =>
        option.setName(copy.commands.countOptionName).setDescription(copy.commands.countOptionDescription).setRequired(true)
      )
      .addChannelOption(option =>
        option
          .setName(copy.commands.channelOptionName)
          .setDescription(copy.commands.channelOptionDescription)
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(false)
      ),
    new SlashCommandBuilder()
      .setName('clearallchannel')
      .setDescription(copy.commands.clearAllChannelDescription)
      .addStringOption(option =>
        option
          .setName(copy.commands.confirmOptionName)
          .setDescription(copy.commands.confirmOptionDescription)
          .setRequired(true)
      )
      .addChannelOption(option =>
        option
          .setName(copy.commands.channelOptionName)
          .setDescription(copy.commands.channelOptionDescription)
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(false)
      ),
    new SlashCommandBuilder()
      .setName('kickroless')
      .setDescription(copy.commands.kickRolessDescription),
    new SlashCommandBuilder()
      .setName('mute')
      .setDescription(copy.commands.muteDescription)
      .addUserOption(option =>
        option.setName(copy.commands.userOptionName).setDescription(copy.commands.targetUserDescription).setRequired(true)
      )
      .addStringOption(option =>
        option.setName(copy.commands.reasonOptionName).setDescription(copy.commands.reasonDescription).setRequired(false)
      ),
    new SlashCommandBuilder()
      .setName('unmute')
      .setDescription(copy.commands.unmuteDescription)
      .addUserOption(option =>
        option.setName(copy.commands.userOptionName).setDescription(copy.commands.targetUserDescription).setRequired(true)
      ),
    new SlashCommandBuilder()
      .setName('lockchannel')
      .setDescription(copy.commands.lockChannelDescription)
      .addChannelOption(option =>
        option
          .setName(copy.commands.channelOptionName)
          .setDescription(copy.commands.channelOptionDescription)
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(false)
      ),
    new SlashCommandBuilder()
      .setName('unlockchannel')
      .setDescription(copy.commands.unlockChannelDescription)
      .addChannelOption(option =>
        option
          .setName(copy.commands.channelOptionName)
          .setDescription(copy.commands.channelOptionDescription)
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(false)
      ),
    new SlashCommandBuilder()
      .setName('slowmode')
      .setDescription(copy.commands.slowmodeDescription)
      .addIntegerOption(option =>
        option.setName(copy.commands.secondsOptionName).setDescription(copy.commands.secondsOptionDescription).setRequired(true)
      )
      .addChannelOption(option =>
        option
          .setName(copy.commands.channelOptionName)
          .setDescription(copy.commands.channelOptionDescription)
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(false)
      ),
    new SlashCommandBuilder()
      .setName('warnhistory')
      .setDescription(copy.commands.warnHistoryDescription)
      .addUserOption(option =>
        option.setName(copy.commands.userOptionName).setDescription(copy.commands.targetUserDescription).setRequired(true)
      ),
    new SlashCommandBuilder()
      .setName('clearwarns')
      .setDescription(copy.commands.clearWarnsDescription)
      .addUserOption(option =>
        option.setName(copy.commands.userOptionName).setDescription(copy.commands.targetUserDescription).setRequired(true)
      )
  ].map(command => command.toJSON());
}

function getCommandsSignature(commands = buildCommands()) {
  return crypto.createHash('sha1').update(JSON.stringify(commands)).digest('hex');
}

async function registerCommands(guild, commands = buildCommands()) {
  await guild.commands.set(commands);
  return commands;
}

module.exports = { buildCommands, getCommandsSignature, registerCommands };
