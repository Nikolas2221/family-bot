import { MessageFlags } from 'discord.js';

import copy from './copy';
import type { ApplicationsService, EmbedsApi, RoleDefinition } from './types';

function ephemeral(payload: Record<string, any> = {}) {
  return { ...payload, flags: MessageFlags.Ephemeral };
}

function normalizeRankToken(value: unknown): string {
  return String(value || '')
    .toLowerCase()
    .replace(/<@&(\d+)>/g, '$1')
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

interface ApplicationStorageLike {
  getCooldown(userId: string): number;
  setCooldown(userId: string): void;
  createApplication(input: Record<string, unknown>): string;
  findApplication(applicationId: string): any;
  setApplicationTicketInfo(application: any, payload: Record<string, string>): void;
  sanitizeApplicationInput(input: Record<string, unknown>): Record<string, string> & { error?: string };
  setApplicationStatus(application: any, status: string, moderatorId: string): void;
}

interface ApplicationsOptions {
  storage: ApplicationStorageLike;
  fetchTextChannel: (...args: any[]) => Promise<any>;
  applicationsChannelId: string;
  applicationDefaultRole: string;
  logChannelId: string;
  applicationsBanner: string;
  familyRoles?: RoleDefinition[];
  applicationAccessRoleIds?: string[];
  client: any;
  embeds: EmbedsApi;
  sendAcceptLog: (...args: any[]) => Promise<unknown>;
  sendAcceptanceDm?: (...args: any[]) => Promise<unknown>;
}

export function createApplicationsService({
  storage,
  fetchTextChannel,
  applicationsChannelId,
  applicationDefaultRole,
  logChannelId,
  applicationsBanner,
  familyRoles = [],
  applicationAccessRoleIds = [],
  client,
  embeds,
  sendAcceptLog,
  sendAcceptanceDm = async () => {}
}: ApplicationsOptions): ApplicationsService {
  function formatStatus(status: string) {
    return copy.applications.statusLabel(status);
  }

  function getCooldownSecondsLeft(userId: string, cooldownMs: number): number {
    const last = storage.getCooldown(userId);
    if (!last) return 0;
    const leftMs = cooldownMs - (Date.now() - last);
    return leftMs > 0 ? Math.ceil(leftMs / 1000) : 0;
  }

  function isTerminalApplicationStatus(status: string): boolean {
    return status === 'accepted' || status === 'rejected';
  }

  function buildApplicationManagerMentions(): string {
    return applicationAccessRoleIds
      .filter(Boolean)
      .map(roleId => `<@&${roleId}>`)
      .join(' ');
  }

  async function createApplicationTicket(channel: any, application: any, user: any) {
    const managerMentions = buildApplicationManagerMentions();
    const starterMessage = await channel.send({
      content: managerMentions || copy.applications.ticketThreadHeader(user.id, application.id),
      allowedMentions: {
        parse: [],
        roles: applicationAccessRoleIds,
        users: []
      }
    });

    const thread = typeof starterMessage.startThread === 'function'
      ? await starterMessage.startThread({
        name: copy.applications.ticketThreadName(application.nickname || 'candidate', application.id),
        autoArchiveDuration: 1440,
        reason: copy.applications.ticketReason(user.id)
      }).catch(() => null)
      : null;

    const targetChannel = thread || channel;
    const ticketMessage = await targetChannel.send({
      content: thread ? copy.applications.ticketThreadHeader(user.id, application.id) : managerMentions,
      embeds: [
        embeds.buildApplicationEmbed({
          user,
          nickname: application.nickname,
          level: application.level,
          inviter: application.inviter,
          discovery: application.discovery,
          about: application.about,
          age: application.age,
          text: application.text,
          applicationId: application.id
        })
      ],
      components: embeds.buildApplicationButtons(application.id, user.id),
      allowedMentions: {
        parse: [],
        roles: thread ? [] : applicationAccessRoleIds,
        users: []
      }
    });

    if (thread) {
      await starterMessage.edit({
        content: [copy.applications.ticketStarter(user.id, thread.id), managerMentions].filter(Boolean).join('\n'),
        allowedMentions: {
          parse: [],
          roles: applicationAccessRoleIds,
          users: []
        }
      }).catch(() => {});
    }

    storage.setApplicationTicketInfo(application, {
      ticketThreadId: thread?.id || '',
      ticketMessageId: ticketMessage?.id || '',
      ticketStarterMessageId: starterMessage?.id || ''
    });

    return { starterMessage, thread, ticketMessage };
  }

  async function cleanupAcceptedTicket(guild: any, application: any, activeChannel: any = null) {
    const thread = activeChannel?.isThread?.()
      ? activeChannel
      : application.ticketThreadId
        ? await guild.channels.fetch(application.ticketThreadId).catch(() => null)
        : null;

    const fallbackChannel = await fetchTextChannel(guild, applicationsChannelId);
    const starterChannels = [thread?.parent, fallbackChannel].filter(channel => channel && typeof channel.messages?.fetch === 'function');

    for (const [messageId, channel] of [
      [application.ticketStarterMessageId, starterChannels[0]],
      [application.ticketStarterMessageId, starterChannels[1]],
      [application.ticketMessageId, thread]
    ] as Array<[string, any]>) {
      if (!messageId || !channel || typeof channel.messages?.fetch !== 'function') continue;

      const message = await channel.messages.fetch(messageId).catch(() => null);
      if (message && typeof message.delete === 'function') {
        await message.delete().catch(() => {});
      }
    }

    if (thread) {
      const deleted = await thread.delete(copy.applications.ticketReason(application.discordId || 'user')).then(() => true).catch(() => false);
      if (!deleted) {
        await thread.setArchived(true, copy.applications.ticketReason(application.discordId || 'user')).catch(() => {});
        await thread.setLocked(true).catch(() => {});
      }
    }

    storage.setApplicationTicketInfo(application, {
      ticketThreadId: '',
      ticketMessageId: '',
      ticketStarterMessageId: ''
    });
  }

  function resolveAcceptedRoleId(rankName: unknown): string {
    const fallbackRoleId = applicationDefaultRole || familyRoles.find(role => role.key === 'newbie')?.id || '';
    const normalized = normalizeRankToken(rankName);
    if (!normalized) return fallbackRoleId;

    const ordinalAliases = new Map<string, RoleDefinition['key']>([
      ['1', 'newbie'],
      ['1СЂР°РЅРі', 'newbie'],
      ['СЂР°РЅРі1', 'newbie'],
      ['2', 'member'],
      ['2СЂР°РЅРі', 'member'],
      ['СЂР°РЅРі2', 'member'],
      ['3', 'elder'],
      ['3СЂР°РЅРі', 'elder'],
      ['СЂР°РЅРі3', 'elder'],
      ['4', 'deputy'],
      ['4СЂР°РЅРі', 'deputy'],
      ['СЂР°РЅРі4', 'deputy'],
      ['5', 'leader'],
      ['5СЂР°РЅРі', 'leader'],
      ['СЂР°РЅРі5', 'leader']
    ]);

    const directRole = familyRoles.find(role => {
      const aliases = new Set([
        normalizeRankToken(role.id),
        normalizeRankToken(role.key),
        normalizeRankToken(role.name)
      ]);
      return aliases.has(normalized);
    });
    if (directRole?.id) return directRole.id;

    const ordinalKey = ordinalAliases.get(normalized);
    if (ordinalKey) {
      return familyRoles.find(role => role.key === ordinalKey)?.id || fallbackRoleId;
    }

    return fallbackRoleId;
  }

  async function sendApplyPanel(interaction: any) {
    const channel = await fetchTextChannel(interaction.guild, applicationsChannelId);
    if (!channel) {
      return interaction.reply(ephemeral({ content: copy.applications.channelMissing }));
    }

    await channel.send({
      embeds: [embeds.buildApplicationsPanelEmbed({ imageUrl: applicationsBanner })],
      components: embeds.buildApplicationsPanelButtons()
    });

    return interaction.reply(ephemeral({ content: copy.applications.panelSent }));
  }

  async function submitApplication(interaction: any) {
    const sanitized = storage.sanitizeApplicationInput({
      nickname: interaction.fields.getTextInputValue('nickname'),
      level: interaction.fields.getTextInputValue('level'),
      inviter: interaction.fields.getTextInputValue('inviter'),
      discovery: interaction.fields.getTextInputValue('discovery'),
      about: interaction.fields.getTextInputValue('about')
    });

    if (sanitized.error) {
      return interaction.reply(ephemeral({ content: sanitized.error }));
    }

    const { nickname, level, inviter, discovery, about } = sanitized;
    storage.setCooldown(interaction.user.id);
    const applicationId = storage.createApplication({
      userId: interaction.user.id,
      nickname,
      level,
      inviter,
      discovery,
      about
    });
    const application = storage.findApplication(applicationId);

    const channel = await fetchTextChannel(interaction.guild, applicationsChannelId);
    if (!channel || !application) {
      return interaction.reply(ephemeral({ content: copy.applications.channelMissing }));
    }

    await createApplicationTicket(channel, application, interaction.user);

    return interaction.reply(ephemeral({ content: copy.applications.sent }));
  }

  async function accept(interaction: any, applicationId: string, userId: string, details: Record<string, any> = {}) {
    const application = storage.findApplication(applicationId);
    if (!application) {
      return interaction.reply(ephemeral({ content: copy.applications.notFound }));
    }

    if (isTerminalApplicationStatus(application.status)) {
      return interaction.reply(ephemeral({ content: copy.applications.closed(formatStatus(application.status)) }));
    }

    const member = await interaction.guild.members.fetch(userId).catch(() => null);
    if (!member) {
      return interaction.reply(ephemeral({ content: copy.applications.memberNotFound }));
    }

    const acceptedRoleId = resolveAcceptedRoleId(details.rankName);
    if (acceptedRoleId) {
      const role = interaction.guild.roles.cache.get(acceptedRoleId);
      if (role) {
        const added = await member.roles.add(role).then(() => true).catch(() => false);
        if (!added) {
          return interaction.reply({
            content: copy.applications.roleAssignFailed,
            flags: MessageFlags.Ephemeral
          });
        }

        const removableRoleIds = familyRoles
          .filter(item => item.id && item.id !== acceptedRoleId && member.roles.cache.has(item.id))
          .map(item => item.id!) as string[];
        if (removableRoleIds.length) {
          await member.roles.remove(removableRoleIds).catch(() => {});
        }
      }
    }

    storage.setApplicationStatus(application, 'accepted', interaction.user.id);

    const accepted = embeds.buildApplicationEmbed({
      user: { id: userId },
      nickname: application.nickname,
      level: application.level,
      inviter: application.inviter,
      discovery: application.discovery,
      about: application.about,
      age: application.age,
      text: application.text,
      applicationId,
      source: copy.applications.source
    });

    accepted
      .setColor(0x16a34a)
      .setDescription(copy.applications.description(copy.applications.source, userId, copy.applications.statusLabel('accepted')))
      .setFooter({ text: copy.applications.acceptedFooter(interaction.user.username) });

    const reason = String(details.reason || '').trim() || copy.applications.acceptReason;
    const rankName = String(details.rankName || '').trim() || copy.applications.acceptRank;

    const targetMessage = interaction.message || await interaction.channel?.messages?.fetch?.(details.messageId).catch(() => null);

    if (!targetMessage) {
      return interaction.reply(ephemeral({ content: copy.common.unknownError }));
    }

    await targetMessage.edit({ embeds: [accepted], components: embeds.buildApplicationButtons(applicationId, userId, { closed: true }) });
    await sendAcceptLog(interaction.guild, member, interaction.user, reason, rankName);
    await sendAcceptanceDm({
      guild: interaction.guild,
      member,
      moderatorUser: interaction.user,
      reason,
      rankName
    });
    await interaction.reply(ephemeral({ content: copy.applications.acceptedReply(userId) }));
    await cleanupAcceptedTicket(interaction.guild, application, interaction.channel);
    return true;
  }

  async function moveToReview(interaction: any, applicationId: string, userId: string) {
    const application = storage.findApplication(applicationId);
    if (!application) {
      return interaction.reply(ephemeral({ content: copy.applications.notFound }));
    }

    if (isTerminalApplicationStatus(application.status)) {
      return interaction.reply({
        content: copy.applications.closedForReview(formatStatus(application.status)),
        flags: MessageFlags.Ephemeral
      });
    }

    storage.setApplicationStatus(application, 'review', interaction.user.id);

    const review = embeds.buildApplicationEmbed({
      user: { id: userId },
      nickname: application.nickname,
      level: application.level,
      inviter: application.inviter,
      discovery: application.discovery,
      about: application.about,
      age: application.age,
      text: application.text,
      applicationId,
      source: copy.applications.source
    });

    review
      .setColor(0x64748b)
      .setDescription(copy.applications.description(copy.applications.source, userId, copy.applications.statusLabel('review')))
      .setFooter({ text: copy.applications.reviewFooter(interaction.user.username) });

    await interaction.message.edit({ embeds: [review], components: interaction.message.components });
    return interaction.reply(ephemeral({ content: copy.applications.reviewReply }));
  }

  async function reject(interaction: any, applicationId: string, userId: string) {
    const application = storage.findApplication(applicationId);
    if (!application) {
      return interaction.reply(ephemeral({ content: copy.applications.notFound }));
    }

    if (isTerminalApplicationStatus(application.status)) {
      return interaction.reply(ephemeral({ content: copy.applications.closed(formatStatus(application.status)) }));
    }

    storage.setApplicationStatus(application, 'rejected', interaction.user.id);

    const rejected = embeds.buildApplicationEmbed({
      user: { id: userId },
      nickname: application.nickname,
      level: application.level,
      inviter: application.inviter,
      discovery: application.discovery,
      about: application.about,
      age: application.age,
      text: application.text,
      applicationId,
      source: copy.applications.source
    });

    rejected
      .setColor(0xef4444)
      .setDescription(copy.applications.description(copy.applications.source, userId, copy.applications.statusLabel('rejected')))
      .setFooter({ text: copy.applications.rejectedFooter(interaction.user.username) });

    await interaction.message.edit({ embeds: [rejected], components: embeds.buildApplicationButtons(applicationId, userId, { closed: true }) });

    const user = await client.users.fetch(userId).catch(() => null);
    if (user && logChannelId) {
      const channel = await fetchTextChannel(interaction.guild, logChannelId);
      if (channel) {
        await channel.send({
          embeds: [
            embeds.buildRejectLogEmbed({
              user,
              moderatorUser: interaction.user,
              reason: copy.applications.rejectReason
            })
          ]
        });
      }
    }

    return interaction.reply(ephemeral({ content: copy.applications.rejectedReply(userId) }));
  }

  async function closeTicket(interaction: any, applicationId: string) {
    const application = storage.findApplication(applicationId);
    if (!application) {
      return interaction.reply(ephemeral({ content: copy.applications.notFound }));
    }

    if (!interaction.channel?.isThread?.()) {
      return interaction.reply(ephemeral({ content: copy.applications.ticketOnlyInThread }));
    }

    await interaction.reply(ephemeral({ content: copy.applications.ticketClosedReply }));
    await interaction.channel.setArchived(true, copy.applications.ticketReason(application.discordId || 'user')).catch(() => {});
    await interaction.channel.setLocked(true).catch(() => {});
    return true;
  }

  return {
    accept,
    closeTicket,
    getCooldownSecondsLeft,
    moveToReview,
    reject,
    sendApplyPanel,
    submitApplication
  };
}

export default createApplicationsService;
