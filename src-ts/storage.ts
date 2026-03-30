import fs from 'node:fs';
import path from 'node:path';

import type {
  ApplicationFieldsInput,
  ApplicationRecord,
  BlacklistEntry,
  GuildPeriodAnalytics,
  MemberRecord,
  SanitizedApplicationInput,
  StorageApi,
  StoreState,
  WarnEntry
} from './types';
import copy from './copy';

function defaultStore(): StoreState {
  return {
    members: {},
    analytics: {
      daily: {},
      reports: {}
    },
    applications: [],
    cooldowns: {},
    warns: [],
    commends: [],
    blacklist: [],
    panelMessageId: '',
    panelMessageIds: {}
  };
}

function clampPoints(value: unknown): number {
  return Math.max(0, Math.min(100, Number(value) || 0));
}

function trimText(value: unknown, maxLength: number): string {
  return String(value || '').trim().slice(0, maxLength);
}

function looksLikeApplicationNoise(value: unknown): boolean {
  const text = String(value || '').trim().toLowerCase();
  if (!text) return false;

  const compact = text.replace(/\s+/g, '');
  if (compact.length < 4) return false;

  if (/(.)\1{4,}/u.test(compact)) return true;
  if (/^(.{1,3})\1{3,}$/u.test(compact)) return true;

  const lettersOnly = compact.replace(/[^\p{L}\p{N}]/gu, '');
  if (lettersOnly.length < 6) return false;

  const uniqueCount = new Set(lettersOnly).size;
  if (uniqueCount <= 2) return true;

  const counts: Record<string, number> = {};
  for (const char of lettersOnly) {
    counts[char] = (counts[char] || 0) + 1;
  }

  const maxCount = Math.max(...Object.values(counts));
  return maxCount / lettersOnly.length >= 0.65;
}

function memberKey(guildId: string, memberId: string): string {
  return `${guildId}:${memberId}`;
}

function cooldownKey(guildId: string, userId: string): string {
  return `${guildId}:${userId}`;
}

function analyticsDayKey(date: Date = new Date()): string {
  const value = new Date(date);
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function analyticsKey(guildId: string, dayKey: string): string {
  return `${guildId}:${dayKey}`;
}

function createEmptyMemberRecord(guildId: string, memberId: string): MemberRecord {
  return {
    guildId,
    userId: memberId,
    messageCount: 0,
    lastSeenAt: Date.now(),
    warns: 0,
    commends: 0,
    points: 0,
    voiceMinutes: 0,
    afkWarningSentAt: ''
  };
}

function createStorage(options: { dataFile: string; saveDelayMs?: number }): StorageApi {
  const { dataFile, saveDelayMs = 500 } = options;

  let store: StoreState = loadStore();
  let saveTimer: NodeJS.Timeout | null = null;

  function readJsonFile(filePath: string): StoreState | null {
    try {
      if (!fs.existsSync(filePath)) return null;
      return JSON.parse(fs.readFileSync(filePath, 'utf8')) as StoreState;
    } catch {
      return null;
    }
  }

  function hasMeaningfulStoreData(value: StoreState | null): boolean {
    if (!value || typeof value !== 'object') return false;
    return Boolean(
      Object.keys(value.members || {}).length
      || Object.keys(value.analytics?.daily || {}).length
      || (value.applications || []).length
      || Object.keys(value.cooldowns || {}).length
      || (value.warns || []).length
      || (value.commends || []).length
      || (value.blacklist || []).length
      || Object.keys(value.panelMessageIds || {}).length
      || value.panelMessageId
    );
  }

  function loadStore(): StoreState {
    const primary = readJsonFile(dataFile);
    const backup = readJsonFile(`${dataFile}.bak`);

    if (hasMeaningfulStoreData(primary)) {
      return { ...defaultStore(), ...primary };
    }

    if (hasMeaningfulStoreData(backup)) {
      return { ...defaultStore(), ...backup };
    }

    if (primary) return { ...defaultStore(), ...primary };
    if (backup) return { ...defaultStore(), ...backup };
    return defaultStore();
  }

  function getStore(): StoreState {
    return store;
  }

  function flush(): void {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }

    const backupFile = `${dataFile}.bak`;
    const tempFile = `${dataFile}.tmp`;
    const payload = JSON.stringify(store, null, 2);

    fs.mkdirSync(path.dirname(dataFile), { recursive: true });
    fs.writeFileSync(tempFile, payload, 'utf8');
    fs.renameSync(tempFile, dataFile);
    fs.writeFileSync(backupFile, payload, 'utf8');
  }

  function save(): void {
    if (saveTimer) return;
    saveTimer = setTimeout(() => {
      flush();
    }, saveDelayMs);
  }

  function ensureAnalyticsStore(): StoreState['analytics'] {
    if (!store.analytics || typeof store.analytics !== 'object') {
      store.analytics = { daily: {}, reports: {} };
    }

    store.analytics.daily = store.analytics.daily || {};
    store.analytics.reports = store.analytics.reports || {};
    return store.analytics;
  }

  function pruneGuildAnalytics(guildId: string, keepDays = 120): void {
    const analytics = ensureAnalyticsStore();
    const keys = Object.keys(analytics.daily)
      .filter(key => key.startsWith(`${guildId}:`))
      .sort();

    if (keys.length <= keepDays) return;
    for (const key of keys.slice(0, keys.length - keepDays)) {
      delete analytics.daily[key];
    }
  }

  function ensureGuildAnalyticsDay(guildId: string, date: Date = new Date()) {
    const analytics = ensureAnalyticsStore();
    const dayKey = analyticsDayKey(date);
    const key = analyticsKey(guildId, dayKey);

    if (!analytics.daily[key]) {
      analytics.daily[key] = {
        guildId,
        dayKey,
        joins: 0,
        leaves: 0,
        messagesTotal: 0,
        reactionsTotal: 0,
        voiceMinutesTotal: 0,
        channels: {},
        voiceChannels: {},
        members: {}
      };
    }

    pruneGuildAnalytics(guildId, 120);
    return analytics.daily[key];
  }

  function ensureDayMember(dayRecord: StoreState['analytics']['daily'][string], memberId: string) {
    if (!dayRecord.members[memberId]) {
      dayRecord.members[memberId] = {
        messages: 0,
        reactions: 0,
        voiceMinutes: 0
      };
    }

    return dayRecord.members[memberId];
  }

  function incrementChannelCounter(record: Record<string, number>, channelId: string, amount = 1): void {
    if (!channelId) return;
    record[channelId] = (record[channelId] || 0) + amount;
  }

  function recordGuildMessageAnalytics(guildId: string, memberId: string, channelId = ''): void {
    const day = ensureGuildAnalyticsDay(guildId);
    ensureDayMember(day, memberId).messages += 1;
    day.messagesTotal += 1;
    incrementChannelCounter(day.channels, channelId, 1);
  }

  function migrateLegacyMemberIfNeeded(guildId: string, memberId: string, existingMember: MemberRecord | null = null): MemberRecord | null {
    const legacyMember = store.members[memberId];
    if (!legacyMember) return null;

    const migrated: MemberRecord = {
      guildId,
      userId: memberId,
      messageCount: Math.max(Number(existingMember?.messageCount) || 0, Number(legacyMember.messageCount) || 0),
      lastSeenAt: Math.max(Number(existingMember?.lastSeenAt) || 0, Number(legacyMember.lastSeenAt) || 0, Date.now()),
      warns: Math.max(Number(existingMember?.warns) || 0, Number(legacyMember.warns) || 0),
      commends: Math.max(Number(existingMember?.commends) || 0, Number(legacyMember.commends) || 0),
      points: clampPoints(Math.max(Number(existingMember?.points) || 0, Number(legacyMember.points) || 0)),
      voiceMinutes: Math.max(Number(existingMember?.voiceMinutes) || 0, Number(legacyMember.voiceMinutes) || 0),
      afkWarningSentAt: existingMember?.afkWarningSentAt || legacyMember.afkWarningSentAt || ''
    };

    store.members[memberKey(guildId, memberId)] = migrated;
    delete store.members[memberId];
    save();
    return migrated;
  }

  function ensureGuildMember(guildId: string, memberId: string): MemberRecord {
    const key = memberKey(guildId, memberId);
    if (!store.members[key]) {
      store.members[key] = createEmptyMemberRecord(guildId, memberId);
    }

    store.members[key] = migrateLegacyMemberIfNeeded(guildId, memberId, store.members[key]) || store.members[key];
    store.members[key].points = clampPoints(store.members[key].points);
    store.members[key].voiceMinutes = Math.max(0, Number(store.members[key].voiceMinutes) || 0);
    store.members[key].afkWarningSentAt = store.members[key].afkWarningSentAt || '';
    return store.members[key];
  }

  function clearAfkWarning(member: MemberRecord): void {
    if (member.afkWarningSentAt) {
      member.afkWarningSentAt = '';
    }
  }

  function guildActivityScore(guildId: string, memberId: string): number {
    const member = ensureGuildMember(guildId, memberId);
    return (member.messageCount || 0) + (member.commends || 0) * 5 - (member.warns || 0) * 3;
  }

  function guildPointsScore(guildId: string, memberId: string): number {
    return ensureGuildMember(guildId, memberId).points || 0;
  }

  function guildVoiceMinutes(guildId: string, memberId: string): number {
    return ensureGuildMember(guildId, memberId).voiceMinutes || 0;
  }

  function sanitizeApplicationInput(fields: ApplicationFieldsInput): SanitizedApplicationInput {
    const nickname = trimText(fields.nickname, 64);
    const level = trimText(fields.level || fields.age, 32);
    const inviter = trimText(fields.inviter, 128);
    const discovery = trimText(fields.discovery, 128);
    const about = trimText(fields.about || fields.text, 1000);

    if (!nickname || !level || !inviter || !discovery || !about) {
      return { error: copy.applications.invalidEmpty };
    }

    if (about.length < 10) {
      return { error: copy.applications.invalidShort };
    }

    if (
      looksLikeApplicationNoise(nickname)
      || looksLikeApplicationNoise(inviter)
      || looksLikeApplicationNoise(discovery)
      || looksLikeApplicationNoise(about)
    ) {
      return { error: copy.applications.invalidNonsense };
    }

    return {
      nickname,
      level,
      inviter,
      discovery,
      about,
      age: level,
      text: about
    };
  }

  function setApplicationStatus(app: ApplicationRecord, status: string, reviewerId: string): void {
    app.status = status;
    app.reviewedBy = reviewerId;
    app.reviewedAt = new Date().toISOString();
    save();
  }

  function setGuildPanelMessageId(guildId: string, messageId: string, fixedMessageId = ''): void {
    if (store.panelMessageIds[guildId] !== (messageId || '')) {
      store.panelMessageIds[guildId] = messageId || '';
      save();
    }
  }

  function getGuildPanelMessageId(guildId: string, fixedMessageId = ''): string {
    return store.panelMessageIds[guildId] || fixedMessageId || '';
  }

  function trackGuildMessage(guildId: string, memberId: string, _channelId = ''): void {
    const member = ensureGuildMember(guildId, memberId);
    member.messageCount += 1;
    member.lastSeenAt = Date.now();
    clearAfkWarning(member);
    save();
  }

  function trackGuildAnalyticsMessage(guildId: string, memberId: string, channelId = ''): void {
    recordGuildMessageAnalytics(guildId, memberId, channelId);
    save();
  }

  function trackGuildPresence(guildId: string, memberId: string): void {
    const member = ensureGuildMember(guildId, memberId);
    member.lastSeenAt = Date.now();
    clearAfkWarning(member);
    save();
  }

  function addGuildWarn(payload: { guildId: string; userId: string; moderatorId: string; reason: string }): void {
    const { guildId, userId, moderatorId, reason } = payload;
    const member = ensureGuildMember(guildId, userId);
    member.warns = (member.warns || 0) + 1;
    member.points = clampPoints((member.points || 0) - 1);
    store.warns.unshift({ guildId, userId, moderatorId, reason, createdAt: new Date().toISOString() });
    store.warns = store.warns.slice(0, 500);
    save();
  }

  function listGuildWarnsForUser(guildId: string, userId: string, limit = 10): WarnEntry[] {
    return store.warns
      .filter(item => item.userId === userId && (item.guildId || guildId) === guildId)
      .slice(0, limit);
  }

  function clearGuildWarnsForUser(guildId: string, userId: string): number {
    const entries = store.warns.filter(item => item.userId === userId && (item.guildId || guildId) === guildId);
    if (!entries.length) {
      return 0;
    }

    store.warns = store.warns.filter(item => !(item.userId === userId && (item.guildId || guildId) === guildId));
    const member = ensureGuildMember(guildId, userId);
    member.warns = Math.max(0, (member.warns || 0) - entries.length);
    member.points = clampPoints((member.points || 0) + entries.length);
    save();
    return entries.length;
  }

  function addGuildCommend(payload: { guildId: string; userId: string; moderatorId: string; reason: string }): void {
    const { guildId, userId, moderatorId, reason } = payload;
    const member = ensureGuildMember(guildId, userId);
    member.commends = (member.commends || 0) + 1;
    member.points = clampPoints((member.points || 0) + 1);
    store.commends.unshift({ guildId, userId, moderatorId, reason, createdAt: new Date().toISOString() });
    store.commends = store.commends.slice(0, 500);
    save();
  }

  function addGuildVoiceMinutes(guildId: string, memberId: string, minutes: number, channelId = ''): number {
    const safeMinutes = Math.max(0, Math.floor(Number(minutes) || 0));
    if (!safeMinutes) return 0;

    const member = ensureGuildMember(guildId, memberId);
    member.voiceMinutes = (member.voiceMinutes || 0) + safeMinutes;
    member.lastSeenAt = Date.now();
    clearAfkWarning(member);

    const day = ensureGuildAnalyticsDay(guildId);
    ensureDayMember(day, memberId).voiceMinutes += safeMinutes;
    day.voiceMinutesTotal += safeMinutes;
    incrementChannelCounter(day.voiceChannels, channelId, safeMinutes);
    save();
    return safeMinutes;
  }

  function addGuildReaction(guildId: string, memberId: string): void {
    const day = ensureGuildAnalyticsDay(guildId);
    ensureDayMember(day, memberId).reactions += 1;
    day.reactionsTotal += 1;
    save();
  }

  function trackGuildJoin(guildId: string): number {
    const day = ensureGuildAnalyticsDay(guildId);
    day.joins += 1;
    save();
    return day.joins;
  }

  function trackGuildLeave(guildId: string): number {
    const day = ensureGuildAnalyticsDay(guildId);
    day.leaves += 1;
    save();
    return day.leaves;
  }

  function getGuildPeriodAnalytics(guildId: string, days = 7, now: Date = new Date()): GuildPeriodAnalytics {
    const analytics = ensureAnalyticsStore();
    const totalDays = Math.max(1, Math.min(366, Number(days) || 7));
    const end = new Date(now);
    end.setHours(0, 0, 0, 0);

    const result: GuildPeriodAnalytics = {
      guildId,
      dayCount: totalDays,
      fromDayKey: analyticsDayKey(new Date(end.getTime() - (totalDays - 1) * 24 * 60 * 60 * 1000)),
      toDayKey: analyticsDayKey(end),
      joins: 0,
      leaves: 0,
      messagesTotal: 0,
      reactionsTotal: 0,
      voiceMinutesTotal: 0,
      members: {},
      channels: {},
      voiceChannels: {}
    };

    for (let index = 0; index < totalDays; index += 1) {
      const day = new Date(end.getTime() - index * 24 * 60 * 60 * 1000);
      const dayRecord = analytics.daily[analyticsKey(guildId, analyticsDayKey(day))];
      if (!dayRecord) continue;

      result.joins += Number(dayRecord.joins) || 0;
      result.leaves += Number(dayRecord.leaves) || 0;
      result.messagesTotal += Number(dayRecord.messagesTotal) || 0;
      result.reactionsTotal += Number(dayRecord.reactionsTotal) || 0;
      result.voiceMinutesTotal += Number(dayRecord.voiceMinutesTotal) || 0;

      for (const [channelId, count] of Object.entries(dayRecord.channels || {})) {
        result.channels[channelId] = (result.channels[channelId] || 0) + (Number(count) || 0);
      }

      for (const [channelId, count] of Object.entries(dayRecord.voiceChannels || {})) {
        result.voiceChannels[channelId] = (result.voiceChannels[channelId] || 0) + (Number(count) || 0);
      }

      for (const [memberId, stats] of Object.entries(dayRecord.members || {})) {
        if (!result.members[memberId]) {
          result.members[memberId] = { messages: 0, reactions: 0, voiceMinutes: 0 };
        }

        result.members[memberId].messages += Number(stats.messages) || 0;
        result.members[memberId].reactions += Number(stats.reactions) || 0;
        result.members[memberId].voiceMinutes += Number(stats.voiceMinutes) || 0;
      }
    }

    return result;
  }

  function getGuildReportMarker(guildId: string, markerKey: string): string {
    return ensureAnalyticsStore().reports[`${guildId}:${markerKey}`] || '';
  }

  function setGuildReportMarker(guildId: string, markerKey: string, value: string): void {
    ensureAnalyticsStore().reports[`${guildId}:${markerKey}`] = String(value || '');
    save();
  }

  function markGuildAfkWarningSent(guildId: string, memberId: string, value = new Date().toISOString()): string {
    const member = ensureGuildMember(guildId, memberId);
    member.afkWarningSentAt = value;
    save();
    return member.afkWarningSentAt;
  }

  function clearGuildAfkWarningSent(guildId: string, memberId: string): boolean {
    const member = ensureGuildMember(guildId, memberId);
    if (!member.afkWarningSentAt) {
      return false;
    }

    member.afkWarningSentAt = '';
    save();
    return true;
  }

  function migrateLegacyCooldownIfNeeded(guildId: string, userId: string): number {
    const key = cooldownKey(guildId, userId);
    if (Object.prototype.hasOwnProperty.call(store.cooldowns, key)) {
      return store.cooldowns[key] || 0;
    }

    if (!Object.prototype.hasOwnProperty.call(store.cooldowns, userId)) {
      return 0;
    }

    const legacyValue = store.cooldowns[userId] || 0;
    store.cooldowns[key] = legacyValue;
    delete store.cooldowns[userId];
    save();
    return legacyValue;
  }

  function getGuildCooldown(guildId: string, userId: string): number {
    return migrateLegacyCooldownIfNeeded(guildId, userId);
  }

  function setGuildCooldown(guildId: string, userId: string, value = Date.now()): void {
    store.cooldowns[cooldownKey(guildId, userId)] = value;
    save();
  }

  function createGuildApplication(payload: {
    guildId: string;
    userId: string;
    nickname: string;
    level?: string;
    inviter?: string;
    discovery?: string;
    about?: string;
    age?: string;
    text?: string;
  }): string {
    const {
      guildId,
      userId,
      nickname,
      level = '',
      inviter = '',
      discovery = '',
      about = '',
      age = '',
      text = ''
    } = payload;

    const applicationId = `${Date.now()}_${userId}`;
    store.applications.unshift({
      id: applicationId,
      guildId,
      discordId: userId,
      nickname,
      level: level || age,
      inviter,
      discovery,
      about: about || text,
      age: age || level,
      text: text || about,
      ticketThreadId: '',
      ticketMessageId: '',
      ticketStarterMessageId: '',
      status: 'pending',
      createdAt: new Date().toISOString()
    });
    store.applications = store.applications.slice(0, 500);
    save();
    return applicationId;
  }

  function findGuildApplication(guildId: string, applicationId: string): ApplicationRecord | null {
    return store.applications.find(item => item.id === applicationId && (item.guildId || guildId) === guildId) || null;
  }

  function setApplicationTicketInfo(
    app: ApplicationRecord | null,
    ticketInfo: Partial<Pick<ApplicationRecord, 'ticketThreadId' | 'ticketMessageId' | 'ticketStarterMessageId'>> = {}
  ): ApplicationRecord | null {
    if (!app) return null;

    app.ticketThreadId = Object.prototype.hasOwnProperty.call(ticketInfo, 'ticketThreadId')
      ? String(ticketInfo.ticketThreadId || '')
      : String(app.ticketThreadId || '');

    app.ticketMessageId = Object.prototype.hasOwnProperty.call(ticketInfo, 'ticketMessageId')
      ? String(ticketInfo.ticketMessageId || '')
      : String(app.ticketMessageId || '');

    app.ticketStarterMessageId = Object.prototype.hasOwnProperty.call(ticketInfo, 'ticketStarterMessageId')
      ? String(ticketInfo.ticketStarterMessageId || '')
      : String(app.ticketStarterMessageId || '');

    save();
    return app;
  }

  function listGuildRecentApplications(guildId: string, limit = 10): ApplicationRecord[] {
    return store.applications.filter(item => (item.guildId || guildId) === guildId).slice(0, limit);
  }

  function listGuildBlacklist(guildId: string): BlacklistEntry[] {
    return store.blacklist.filter(item => (item.guildId || guildId) === guildId);
  }

  function getGuildBlacklistEntry(guildId: string, userId: string): BlacklistEntry | null {
    return store.blacklist.find(item => item.userId === userId && (item.guildId || guildId) === guildId) || null;
  }

  function isGuildBlacklisted(guildId: string, userId: string): boolean {
    return Boolean(getGuildBlacklistEntry(guildId, userId));
  }

  function addGuildBlacklistEntry(payload: { guildId: string; userId: string; moderatorId: string; reason: string }): BlacklistEntry {
    const { guildId, userId, moderatorId, reason } = payload;
    const sanitizedReason = trimText(reason, 300) || copy.security.defaultBlacklistReason;
    const existing = getGuildBlacklistEntry(guildId, userId);

    if (existing) {
      existing.moderatorId = moderatorId;
      existing.reason = sanitizedReason;
      existing.updatedAt = new Date().toISOString();
      save();
      return existing;
    }

    const entry: BlacklistEntry = {
      guildId,
      userId,
      moderatorId,
      reason: sanitizedReason,
      createdAt: new Date().toISOString()
    };

    store.blacklist.unshift(entry);
    store.blacklist = store.blacklist.slice(0, 500);
    save();
    return entry;
  }

  function removeGuildBlacklistEntry(guildId: string, userId: string): boolean {
    const before = store.blacklist.length;
    store.blacklist = store.blacklist.filter(item => !(item.userId === userId && (item.guildId || guildId) === guildId));
    if (store.blacklist.length !== before) {
      save();
      return true;
    }
    return false;
  }

  return {
    getStore,
    save,
    flush,
    ensureGuildMember,
    guildActivityScore,
    guildPointsScore,
    guildVoiceMinutes,
    sanitizeApplicationInput,
    setApplicationStatus,
    setGuildPanelMessageId,
    getGuildPanelMessageId,
    trackGuildMessage,
    trackGuildAnalyticsMessage,
    trackGuildPresence,
    addGuildWarn,
    listGuildWarnsForUser,
    clearGuildWarnsForUser,
    addGuildCommend,
    addGuildVoiceMinutes,
    addGuildReaction,
    markGuildAfkWarningSent,
    clearGuildAfkWarningSent,
    trackGuildJoin,
    trackGuildLeave,
    getGuildPeriodAnalytics,
    getGuildReportMarker,
    setGuildReportMarker,
    getGuildCooldown,
    setGuildCooldown,
    createGuildApplication,
    findGuildApplication,
    setApplicationTicketInfo,
    listGuildRecentApplications,
    listGuildBlacklist,
    getGuildBlacklistEntry,
    isGuildBlacklisted,
    addGuildBlacklistEntry,
    removeGuildBlacklistEntry
  };
}

export {
  clampPoints,
  createStorage,
  defaultStore,
  looksLikeApplicationNoise
};

export type {
  ApplicationFieldsInput,
  ApplicationRecord,
  BlacklistEntry,
  GuildPeriodAnalytics,
  MemberRecord,
  SanitizedApplicationInput,
  StorageApi,
  StoreState,
  WarnEntry
};
