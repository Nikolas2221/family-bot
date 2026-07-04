import { MessageFlags } from 'discord.js';

import copy from './copy';
import { formatUnsafeRoleMessage, getUnsafeAssignableRoleReasonAsync } from './role-safety';
import type { ApplicationsService, EmbedsApi, RoleDefinition } from './types';
import type { TelegramNotificationService } from './telegram';
import type { TicketService } from './services/tickets';

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
  familyTitle?: string;
  familyRoles?: RoleDefinition[];
  applicationAccessRoleIds?: string[];
  client: any;
  embeds: EmbedsApi;
  sendAcceptLog: (...args: any[]) => Promise<unknown>;
  sendAcceptanceDm?: (...args: any[]) => Promise<unknown>;
  sendRejectionDm?: (...args: any[]) => Promise<unknown>;
  telegramNotifications?: TelegramNotificationService;
  ticketService?: Pick<TicketService, 'registerTicket' | 'markDecision' | 'markClosed'>;
  ticketDeleteDelayMs?: number;
}

export function createApplicationsService({
  storage,
  fetchTextChannel,
  applicationsChannelId,
  applicationDefaultRole,
  logChannelId,
  applicationsBanner,
  familyTitle = 'Семья',
  familyRoles = [],
  applicationAccessRoleIds = [],
  client,
  embeds,
  sendAcceptLog,
  sendAcceptanceDm = async () => {},
  sendRejectionDm = async () => {},
  telegramNotifications,
  ticketService,
  ticketDeleteDelayMs = 5000
}: ApplicationsOptions): ApplicationsService {
  const closingTickets = new Set<string>();
  async function notifyTelegram(task?: Promise<boolean>): Promise<void> {
    if (!task) return;
    await task.catch(error => {
      console.warn('Telegram application notification failed:', error);
    });
  }

  async function notifyDiscordDm(task?: Promise<unknown>): Promise<boolean> {
    if (!task) return false;
    return task.then(sent => {
      if (sent === false) {
        console.warn('Discord application DM was not delivered.');
      }
      return sent !== false;
    }).catch(error => {
      console.warn('Discord application DM failed:', error);
      return false;
    });
  }

  async function notifyAcceptanceDm(interaction: any, member: any, userId: string, reason: string, rankName: string): Promise<void> {
    const sent = await notifyDiscordDm(sendAcceptanceDm({
      guild: interaction.guild,
      member,
      moderatorUser: interaction.user,
      reason,
      rankName
    }));

    if (sent) return;

    const user = await client.users?.fetch?.(userId).catch(() => null);
    if (!user) return;

    await notifyDiscordDm(sendAcceptanceDm({
      guild: interaction.guild,
      member: { ...member, user },
      moderatorUser: interaction.user,
      reason,
      rankName
    }));
  }

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

  async function createApplicationReviewCard(channel: any, application: any, user: any) {
    const managerMentions = buildApplicationManagerMentions();
    const reviewMessage = await channel.send({
      content: managerMentions,
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
          applicationId: application.id,
          familyTitle
        })
      ],
      components: embeds.buildApplicationButtons(application.id, user.id),
      allowedMentions: {
        parse: [],
        roles: applicationAccessRoleIds,
        users: []
      }
    });

    storage.setApplicationTicketInfo(application, {
      ticketThreadId: '',
      ticketMessageId: reviewMessage?.id || '',
      ticketStarterMessageId: ''
    });

    return reviewMessage;
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
      ['1ранг', 'newbie'],
      ['ранг1', 'newbie'],
      ['2', 'member'],
      ['2ранг', 'member'],
      ['ранг2', 'member'],
      ['3', 'elder'],
      ['3ранг', 'elder'],
      ['ранг3', 'elder'],
      ['4', 'deputy'],
      ['4ранг', 'deputy'],
      ['ранг4', 'deputy'],
      ['5', 'leader'],
      ['5ранг', 'leader'],
      ['ранг5', 'leader'],
      ['6', 'rank6'],
      ['6ранг', 'rank6'],
      ['ранг6', 'rank6'],
      ['7', 'rank7'],
      ['7ранг', 'rank7'],
      ['ранг7', 'rank7'],
      ['8', 'rank8'],
      ['8ранг', 'rank8'],
      ['ранг8', 'rank8'],
      ['9', 'rank9'],
      ['9ранг', 'rank9'],
      ['ранг9', 'rank9'],
      ['10', 'rank10'],
      ['10ранг', 'rank10'],
      ['ранг10', 'rank10'],
      ['11', 'rank11'],
      ['11ранг', 'rank11'],
      ['ранг11', 'rank11'],
      ['12', 'rank12'],
      ['12ранг', 'rank12'],
      ['ранг12', 'rank12'],
      ['13', 'rank13'],
      ['13ранг', 'rank13'],
      ['ранг13', 'rank13'],
      ['14', 'rank14'],
      ['14ранг', 'rank14'],
      ['ранг14', 'rank14'],
      ['15', 'rank15'],
      ['15ранг', 'rank15'],
      ['ранг15', 'rank15']
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
      embeds: [embeds.buildApplicationsPanelEmbed({ imageUrl: applicationsBanner, familyTitle })],
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
      discordUsername: interaction.user.globalName || interaction.user.username || interaction.user.tag || '',
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

    await createApplicationReviewCard(channel, application, interaction.user);

    await notifyTelegram(telegramNotifications?.notifyApplicationCreated({
      application,
      familyTitle,
      guild: interaction.guild,
      candidate: interaction.user,
      ticketChannel: channel
    }));

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
      const role = interaction.guild.roles.cache.get(acceptedRoleId)
        || await interaction.guild.roles.fetch(acceptedRoleId).catch(() => null);
      if (role) {
        const unsafeReason = await getUnsafeAssignableRoleReasonAsync(role, { guild: interaction.guild });
        if (unsafeReason) {
          return interaction.reply({
            content: formatUnsafeRoleMessage(unsafeReason),
            flags: MessageFlags.Ephemeral
          });
        }

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
    ticketService?.markDecision(application, 'approved', interaction.user.username || interaction.user.id);

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
      source: copy.applications.source,
      familyTitle
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

    await targetMessage.edit({ embeds: [accepted], components: [] });
    await sendAcceptLog(interaction.guild, member, interaction.user, reason, rankName);
    await notifyAcceptanceDm(interaction, member, userId, reason, rankName);
    await interaction.reply(ephemeral({ content: copy.applications.acceptedReply(userId) }));
    await notifyTelegram(telegramNotifications?.notifyApplicationAccepted({
      application,
      guild: interaction.guild,
      candidate: member.user || { id: userId, username: member.displayName },
      moderator: interaction.user,
      ticketChannel: interaction.channel || (application.ticketThreadId ? { id: application.ticketThreadId } : null),
      reason,
      status: 'approved'
    }));
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
      source: copy.applications.source,
      familyTitle
    });

    review
      .setColor(0x64748b)
      .setDescription(copy.applications.description(copy.applications.source, userId, copy.applications.statusLabel('review')))
      .setFooter({ text: copy.applications.reviewFooter(interaction.user.username) });

    await interaction.message.edit({ embeds: [review], components: interaction.message.components });
    return interaction.reply(ephemeral({ content: copy.applications.reviewReply }));
  }

  async function reject(interaction: any, applicationId: string, userId: string, details: { reason?: string; messageId?: string } = {}) {
    const application = storage.findApplication(applicationId);
    if (!application) {
      return interaction.reply(ephemeral({ content: copy.applications.notFound }));
    }

    if (isTerminalApplicationStatus(application.status)) {
      return interaction.reply(ephemeral({ content: copy.applications.closed(formatStatus(application.status)) }));
    }

    const reason = String(details.reason || '').trim().slice(0, 500);
    if (reason.length < 3) {
      return interaction.reply(ephemeral({ content: '❌ Укажи причину отказа.' }));
    }

    storage.setApplicationStatus(application, 'rejected', interaction.user.id);
    ticketService?.markDecision(application, 'rejected', interaction.user.username || interaction.user.id);

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
      source: copy.applications.source,
      familyTitle
    });

    rejected
      .setColor(0xef4444)
      .setDescription(copy.applications.description(copy.applications.source, userId, copy.applications.statusLabel('rejected')))
      .setFooter({ text: copy.applications.rejectedFooter(interaction.user.username) });

    const targetMessage = interaction.message || await interaction.channel?.messages?.fetch?.(details.messageId).catch(() => null);

    if (!targetMessage) {
      return interaction.reply(ephemeral({ content: copy.common.unknownError }));
    }

    await targetMessage.edit({ embeds: [rejected], components: [] });

    const user = await client.users?.fetch?.(userId).catch(() => null);
    if (user && logChannelId) {
      const channel = await fetchTextChannel(interaction.guild, logChannelId);
      if (channel) {
        await channel.send({
          embeds: [
            embeds.buildRejectLogEmbed({
              user,
              moderatorUser: interaction.user,
              reason
            })
          ]
        });
      }
    }

    await notifyDiscordDm(sendRejectionDm({
      guild: interaction.guild,
      user: user || { id: userId },
      moderatorUser: interaction.user,
      reason
    }));
    await interaction.reply(ephemeral({ content: copy.applications.rejectedReply(userId) }));
    await notifyTelegram(telegramNotifications?.notifyApplicationRejected({
      application,
      guild: interaction.guild,
      candidate: user || { id: userId },
      moderator: interaction.user,
      ticketChannel: interaction.channel || (application.ticketThreadId ? { id: application.ticketThreadId } : null),
      reason,
      status: 'rejected'
    }));
    return true;
  }

  async function closeTicket(interaction: any, applicationId: string, details: { reason?: string } = {}) {
    const application = storage.findApplication(applicationId);
    if (!application) {
      return interaction.reply(ephemeral({ content: copy.applications.notFound }));
    }

    if (!interaction.channel?.isThread?.()) {
      return interaction.reply(ephemeral({ content: copy.applications.ticketOnlyInThread }));
    }

    if (application.ticketStatus === 'closed' || closingTickets.has(applicationId)) {
      return interaction.reply(ephemeral({ content: '🔒 Этот тикет уже закрыт или удаляется.' }));
    }

    closingTickets.add(applicationId);
    try {
    const channel = interaction.channel;
    const delaySeconds = Math.max(0, Math.ceil(ticketDeleteDelayMs / 1000));
    await interaction.reply(ephemeral({ content: `🔒 Тикет будет полностью удалён через ${delaySeconds} сек.` }));
    const closeReason = String(details.reason || '').trim() || copy.applications.ticketReason(application.discordId || 'user');
    application.ticketStatus = 'closed';
    application.handledBy = interaction.user.username || interaction.user.id;
    application.closeReason = closeReason;
    application.closedAt = new Date().toISOString();
    ticketService?.markClosed(application, {
      handledBy: interaction.user.username || interaction.user.id,
      reason: closeReason
    });
    await notifyTelegram(telegramNotifications?.notifyTicketClosed({
      application,
      guild: interaction.guild,
      candidate: { id: application.discordId },
      moderator: interaction.user,
      ticketChannel: interaction.channel,
      reason: closeReason,
      status: application.ticketStatus || 'closed'
    }));
    await channel.setLocked?.(true).catch(() => {});
    if (ticketDeleteDelayMs > 0) {
      await new Promise(resolve => setTimeout(resolve, ticketDeleteDelayMs));
    }
    const deleted = await channel.delete?.(closeReason).then(() => true).catch(() => false);
    if (!deleted) {
      console.warn(`Application ticket ${channel.id} could not be deleted; archiving it instead.`);
      await channel.setArchived?.(true, closeReason).catch(() => {});
      await channel.setLocked?.(true).catch(() => {});
    } else {
      storage.setApplicationTicketInfo(application, {
        ticketThreadId: '',
        ticketMessageId: '',
        ticketStarterMessageId: ''
      });
    }
    return true;
    } finally {
      closingTickets.delete(applicationId);
    }
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
