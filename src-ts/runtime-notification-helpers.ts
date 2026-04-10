import { EmbedBuilder, type Guild, type GuildMember, type User } from 'discord.js';
import type { CopyCatalog, EmbedsApi, ReleaseNoteGroups } from './types';

interface TextChannelLike {
  send(payload: Record<string, unknown>): Promise<unknown>;
}

interface GuildSettingsLike {
  familyTitle: string;
  channels: {
    logs?: string;
    updates?: string;
    automod?: string;
    welcome?: string;
    applications?: string;
    panel?: string;
    rules?: string;
    disciplineLogs?: string;
  };
  visuals: {
    applicationsBanner?: string;
  };
  welcome: {
    enabled: boolean;
    dmEnabled: boolean;
    message: string;
  };
  verification: {
    enabled: boolean;
    roleId?: string;
  };
  verificationRoleId?: string;
  autoroleRoleId?: string;
}

interface DatabaseLike {
  getGuild(guildId: string): { maintenance?: { lastUpdateAnnouncementId?: string } };
  updateGuildMaintenance(guildId: string, patch: { lastUpdateAnnouncementId: string }): void;
}

interface NotificationHelpersOptions {
  copy: CopyCatalog;
  embeds: EmbedsApi;
  database: DatabaseLike;
  EmbedBuilderCtor: typeof EmbedBuilder;
  fetchTextChannel(guild: Guild, channelId?: string | null): Promise<TextChannelLike | null>;
  isPremiumGuild(guildId: string): boolean;
  resolveGuildSettings(guildId: string): GuildSettingsLike;
  currentBuildSignature: string;
  productVersionLabel: string;
  productVersionSemver: string;
  deployBuildId: string;
  deployCommitMessage: string;
  getUpdateChangeGroups(
    commitMessage: string,
    getReleaseGroups: (commitMessage?: string | null) => ReleaseNoteGroups
  ): ReleaseNoteGroups;
  getCurrentReleaseChangeGroups(commitMessage?: string | null): ReleaseNoteGroups;
}

async function sendDirectNotification(
  user: User | null | undefined,
  {
    title,
    description,
    color = 0x7c3aed,
    footer = 'BRHD - Phoenix - Notify'
  }: {
    title: string;
    description: string;
    color?: number;
    footer?: string;
  },
  EmbedBuilderCtor: typeof EmbedBuilder
): Promise<boolean> {
  if (!user) return false;

  const channel = await user.createDM().catch(() => null);
  if (!channel) return false;

  const embed = new EmbedBuilderCtor()
    .setColor(color)
    .setTitle(title)
    .setDescription(description)
    .setFooter({ text: footer })
    .setTimestamp();

  return channel.send({ embeds: [embed] }).then(() => true).catch(() => false);
}

export function createNotificationRuntimeHelpers(options: NotificationHelpersOptions) {
  const {
    copy,
    embeds,
    database,
    EmbedBuilderCtor,
    fetchTextChannel,
    isPremiumGuild,
    resolveGuildSettings,
    currentBuildSignature,
    productVersionLabel,
    productVersionSemver,
    deployBuildId,
    deployCommitMessage,
    getUpdateChangeGroups,
    getCurrentReleaseChangeGroups
  } = options;

  async function sendAcceptanceDm({
    guild,
    member,
    moderatorUser,
    reason,
    rankName
  }: {
    guild: Guild;
    member: GuildMember;
    moderatorUser: User;
    reason: string;
    rankName: string;
  }) {
    return sendDirectNotification(
      member.user,
      {
        title: 'Заявка принята',
        color: 0x10b981,
        footer: 'BRHD - Phoenix - Family',
        description: [
          `Ты принят в семью **${resolveGuildSettings(guild.id).familyTitle}** на сервере **${guild.name}**.`,
          '',
          `Модератор: <@${moderatorUser.id}>`,
          `Причина: ${reason}`,
          `Выданный ранг: ${rankName}`
        ].join('\n')
      },
      EmbedBuilderCtor
    );
  }

  async function sendDisciplineDm(
    type: 'warn' | 'commend',
    guild: Guild,
    targetUser: User,
    moderatorUser: User,
    reason: string
  ) {
    const isWarn = type === 'warn';
    return sendDirectNotification(
      targetUser,
      {
        title: isWarn ? 'Получен выговор' : 'Получена похвала',
        color: isWarn ? 0xf97316 : 0x2563eb,
        footer: 'BRHD - Phoenix - Discipline',
        description: [
          `Сервер: **${guild.name}**`,
          `Модератор: <@${moderatorUser.id}>`,
          `Причина: ${reason}`,
          '',
          isWarn
            ? 'Следи за активностью и дисциплиной, чтобы не получить дополнительные санкции.'
            : 'Так держать. Активность и вклад в семью замечены.'
        ].join('\n')
      },
      EmbedBuilderCtor
    );
  }

  async function sendRankDm(guild: Guild, member: GuildMember, result: Record<string, any>) {
    if (!result?.ok) return false;

    const isPromotion = result.code === 'promoted' || result.code === 'auto_applied';
    const title = isPromotion ? 'Ранг повышен' : 'Ранг понижен';

    return sendDirectNotification(
      member.user,
      {
        title,
        color: isPromotion ? 0x10b981 : 0xe11d48,
        footer: 'BRHD - Phoenix - Ranks',
        description: [
          `Сервер: **${guild.name}**`,
          `Было: ${result.fromRole?.name || '—'}`,
          `Стало: ${result.toRole?.name || '—'}`,
          result.score !== undefined ? `Текущие очки активности: ${result.score}` : null
        ]
          .filter(Boolean)
          .join('\n')
      },
      EmbedBuilderCtor
    );
  }

  async function sendBlacklistDm(user: User, guild: Guild, reason: string) {
    return sendDirectNotification(
      user,
      {
        title: 'Чёрный список',
        color: 0xe11d48,
        footer: 'BRHD - Phoenix - Security',
        description: [
          `Твой доступ на сервер **${guild.name}** ограничен.`,
          `Причина: ${reason}`,
          '',
          'Если это ошибка, свяжись с администрацией сервера.'
        ].join('\n')
      },
      EmbedBuilderCtor
    );
  }

  async function sendAfkWarningDm(member: GuildMember) {
    return sendDirectNotification(
      member.user,
      {
        title: 'Предупреждение об AFK',
        color: 0xf59e0b,
        footer: 'BRHD - Phoenix - Activity',
        description: [
          `На сервере **${member.guild.name}** от тебя не было активности уже 3 дня.`,
          'Если не проявишь активность, администрация может кикнуть тебя за AFK.',
          '',
          'Отправь сообщение, зайди в голосовой канал или просто прояви активность в Discord.'
        ].join('\n')
      },
      EmbedBuilderCtor
    );
  }

  async function sendAcceptLog(
    guild: Guild,
    member: GuildMember,
    moderatorUser: User,
    reason = copy.applications.acceptReason,
    rankName = copy.applications.acceptRank
  ) {
    if (!isPremiumGuild(guild.id)) return;
    const { channels } = resolveGuildSettings(guild.id);
    if (!channels.logs) return;
    const channel = await fetchTextChannel(guild, channels.logs);
    if (!channel) return;

    await channel.send({
      embeds: [embeds.buildAcceptLogEmbed({ member, moderatorUser, reason, rankName })]
    });
  }

  async function sendDisciplineLog(guild: Guild, embed: EmbedBuilder) {
    if (!isPremiumGuild(guild.id)) return;
    const { channels } = resolveGuildSettings(guild.id);
    if (!channels.disciplineLogs) return;
    const channel = await fetchTextChannel(guild, channels.disciplineLogs);
    if (!channel) return;
    await channel.send({ embeds: [embed] });
  }

  async function sendSecurityLog(guild: Guild, content: string) {
    if (!isPremiumGuild(guild.id)) return;
    const { channels } = resolveGuildSettings(guild.id);
    if (!channels.logs) return;
    const channel = await fetchTextChannel(guild, channels.logs);
    if (!channel) return;
    await channel.send({ content }).catch(() => {});
  }

  async function sendServerLogEmbed(guild: Guild, embed: EmbedBuilder) {
    const { channels } = resolveGuildSettings(guild.id);
    if (!channels.logs) return;
    const channel = await fetchTextChannel(guild, channels.logs);
    if (!channel) return;
    await channel.send({ embeds: [embed] }).catch(() => {});
  }

  async function announceBuildUpdate(guild: Guild) {
    const record = database.getGuild(guild.id);
    if (record.maintenance?.lastUpdateAnnouncementId === currentBuildSignature) {
      return;
    }

    const settings = resolveGuildSettings(guild.id);
    const channelId = settings.channels.updates || settings.channels.logs;
    if (!channelId) return;

    const channel = await fetchTextChannel(guild, channelId);
    if (!channel) return;

    const sent = await channel
      .send({
        embeds: [
          embeds.buildUpdateAnnouncementEmbed({
            versionLabel: productVersionLabel,
            semver: productVersionSemver,
            buildId: deployBuildId,
            commitMessage: deployCommitMessage,
            changeLines: getUpdateChangeGroups(deployCommitMessage, getCurrentReleaseChangeGroups)
          })
        ]
      })
      .catch(() => null);

    if (sent) {
      database.updateGuildMaintenance(guild.id, { lastUpdateAnnouncementId: currentBuildSignature });
    }
  }

  async function sendAutomodLog(guild: Guild, payload: Record<string, unknown>) {
    const embed = embeds.buildAutomodActionEmbed(payload);
    const settings = resolveGuildSettings(guild.id);
    const channelId = settings.channels.automod || settings.channels.logs;
    if (!channelId) return;
    const channel = await fetchTextChannel(guild, channelId);
    if (!channel) return;
    await channel.send({ embeds: [embed] }).catch(() => {});
  }

  async function sendWelcomeInvite(member: GuildMember) {
    const settings = resolveGuildSettings(member.guild.id);
    if (!settings.welcome.enabled) return;

    const channel =
      (await fetchTextChannel(member.guild, settings.channels.welcome)) ||
      (await fetchTextChannel(member.guild, settings.channels.applications)) ||
      (await fetchTextChannel(member.guild, settings.channels.panel));

    const embed = embeds.buildWelcomeEmbed(
      member,
      settings.familyTitle,
      settings.visuals.applicationsBanner,
      settings.welcome.message,
      {
        rulesChannelId: settings.channels.rules,
        panelChannelId: settings.channels.panel,
        applicationsChannelId: settings.channels.applications,
        verificationEnabled: settings.verification.enabled
      }
    );

    if (channel) {
      await channel
        .send({
          content: [`<@${member.id}>`, settings.welcome.message || ''].filter(Boolean).join('\n'),
          embeds: [embed],
          components: embeds.buildWelcomeButtons()
        })
        .catch(() => {});
    }

    if (settings.welcome.dmEnabled) {
      await member.send({ embeds: [embed] }).catch(() => {});
    }
  }

  async function applyAutorole(member: GuildMember) {
    const settings = resolveGuildSettings(member.guild.id);
    if (!settings.autoroleRoleId) return false;

    const role =
      member.guild.roles.cache.get(settings.autoroleRoleId) ||
      (await member.guild.roles.fetch(settings.autoroleRoleId).catch(() => null));
    if (!role) return false;

    return member.roles.add(role, `Autorole via bot for ${member.id}`).then(() => true).catch(() => false);
  }

  function getVerificationRoleId(guildId: string) {
    const settings = resolveGuildSettings(guildId);
    return settings.verification.roleId || settings.verificationRoleId || settings.autoroleRoleId || '';
  }

  async function applyVerificationRole(member: GuildMember) {
    const roleId = getVerificationRoleId(member.guild.id);
    if (!roleId) return { ok: false, roleId: '' };

    const role = member.guild.roles.cache.get(roleId) || (await member.guild.roles.fetch(roleId).catch(() => null));
    if (!role) return { ok: false, roleId };

    const hasRole = member.roles.cache.has(role.id);
    if (hasRole) return { ok: true, roleId: role.id, already: true };

    const ok = await member.roles
      .add(role, `Verification via bot for ${member.id}`)
      .then(() => true)
      .catch(() => false);

    return { ok, roleId: role.id };
  }

  return {
    announceBuildUpdate,
    applyAutorole,
    applyVerificationRole,
    getVerificationRoleId,
    sendAcceptLog,
    sendAcceptanceDm,
    sendAfkWarningDm,
    sendAutomodLog,
    sendBlacklistDm,
    sendDisciplineDm,
    sendDisciplineLog,
    sendRankDm,
    sendSecurityLog,
    sendServerLogEmbed,
    sendWelcomeInvite
  };
}
