const fs = require('fs');
const copy = require('./copy');

function defaultStore() {
  return {
    members: {},
    applications: [],
    cooldowns: {},
    warns: [],
    commends: [],
    blacklist: [],
    panelMessageId: '',
    panelMessageIds: {}
  };
}

function clampPoints(value) {
  return Math.max(0, Math.min(100, Number(value) || 0));
}

function createStorage({ dataFile, saveDelayMs = 500 }) {
  let store = loadStore();
  let saveTimer = null;

  function loadStore() {
    try {
      if (!fs.existsSync(dataFile)) return defaultStore();
      return { ...defaultStore(), ...JSON.parse(fs.readFileSync(dataFile, 'utf8')) };
    } catch {
      return defaultStore();
    }
  }

  function getStore() {
    return store;
  }

  function flush() {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    fs.writeFileSync(dataFile, JSON.stringify(store, null, 2), 'utf8');
  }

  function save() {
    if (saveTimer) return;
    saveTimer = setTimeout(() => {
      flush();
    }, saveDelayMs);
  }

  function trimText(value, maxLength) {
    return String(value || '').trim().slice(0, maxLength);
  }

  function memberKey(guildId, memberId) {
    return `${guildId}:${memberId}`;
  }

  function cooldownKey(guildId, userId) {
    return `${guildId}:${userId}`;
  }

  function migrateLegacyMemberIfNeeded(guildId, memberId, existingMember = null) {
    const legacyMember = store.members[memberId];
    if (!legacyMember) return null;

    const migrated = {
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

  function ensureGuildMember(guildId, memberId) {
    const key = memberKey(guildId, memberId);
    if (!store.members[key]) {
      store.members[key] = {
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
    store.members[key] = migrateLegacyMemberIfNeeded(guildId, memberId, store.members[key]) || store.members[key];

    store.members[key].points = clampPoints(store.members[key].points);
    store.members[key].voiceMinutes = Math.max(0, Number(store.members[key].voiceMinutes) || 0);
    store.members[key].afkWarningSentAt = store.members[key].afkWarningSentAt || '';
    return store.members[key];
  }

  function ensureMember(memberId) {
    if (!store.members[memberId]) {
      store.members[memberId] = {
        messageCount: 0,
        lastSeenAt: Date.now(),
        warns: 0,
        commends: 0,
        points: 0,
        voiceMinutes: 0,
        afkWarningSentAt: ''
      };
    }

    store.members[memberId].points = clampPoints(store.members[memberId].points);
    store.members[memberId].voiceMinutes = Math.max(0, Number(store.members[memberId].voiceMinutes) || 0);
    store.members[memberId].afkWarningSentAt = store.members[memberId].afkWarningSentAt || '';
    return store.members[memberId];
  }

  function clearAfkWarning(member) {
    if (member.afkWarningSentAt) {
      member.afkWarningSentAt = '';
    }
  }

  function guildActivityScore(guildId, memberId) {
    const member = ensureGuildMember(guildId, memberId);
    return (member.messageCount || 0) + (member.commends || 0) * 5 - (member.warns || 0) * 3;
  }

  function activityScore(memberId) {
    const member = ensureMember(memberId);
    return (member.messageCount || 0) + (member.commends || 0) * 5 - (member.warns || 0) * 3;
  }

  function pointsScore(memberId) {
    return ensureMember(memberId).points || 0;
  }

  function guildPointsScore(guildId, memberId) {
    return ensureGuildMember(guildId, memberId).points || 0;
  }

  function voiceMinutes(memberId) {
    return ensureMember(memberId).voiceMinutes || 0;
  }

  function guildVoiceMinutes(guildId, memberId) {
    return ensureGuildMember(guildId, memberId).voiceMinutes || 0;
  }

  function sanitizeApplicationInput(fields) {
    const nickname = trimText(fields.nickname, 64);
    const age = trimText(fields.age, 32);
    const text = trimText(fields.text, 1000);

    if (!nickname || !age || !text) {
      return { error: copy.applications.invalidEmpty };
    }

    if (text.length < 10) {
      return { error: copy.applications.invalidShort };
    }

    return { nickname, age, text };
  }

  function setApplicationStatus(app, status, reviewerId) {
    app.status = status;
    app.reviewedBy = reviewerId;
    app.reviewedAt = new Date().toISOString();
    save();
  }

  function setPanelMessageId(messageId, fixedMessageId = '') {
    if (!fixedMessageId && messageId && store.panelMessageId !== messageId) {
      store.panelMessageId = messageId;
      save();
    }
  }

  function getPanelMessageId(fixedMessageId = '') {
    return fixedMessageId || store.panelMessageId || '';
  }

  function setGuildPanelMessageId(guildId, messageId, fixedMessageId = '') {
    if (messageId && store.panelMessageIds[guildId] !== messageId) {
      store.panelMessageIds[guildId] = messageId;
      save();
    }
  }

  function getGuildPanelMessageId(guildId, fixedMessageId = '') {
    return store.panelMessageIds[guildId] || fixedMessageId || '';
  }

  function trackMessage(memberId) {
    const member = ensureMember(memberId);
    member.messageCount += 1;
    member.lastSeenAt = Date.now();
    clearAfkWarning(member);
    save();
  }

  function trackGuildMessage(guildId, memberId) {
    const member = ensureGuildMember(guildId, memberId);
    member.messageCount += 1;
    member.lastSeenAt = Date.now();
    clearAfkWarning(member);
    save();
  }

  function trackPresence(memberId) {
    const member = ensureMember(memberId);
    member.lastSeenAt = Date.now();
    clearAfkWarning(member);
    save();
  }

  function trackGuildPresence(guildId, memberId) {
    const member = ensureGuildMember(guildId, memberId);
    member.lastSeenAt = Date.now();
    clearAfkWarning(member);
    save();
  }

  function addWarn({ userId, moderatorId, reason }) {
    const member = ensureMember(userId);
    member.warns = (member.warns || 0) + 1;
    member.points = clampPoints((member.points || 0) - 1);
    store.warns.unshift({ userId, moderatorId, reason, createdAt: new Date().toISOString() });
    store.warns = store.warns.slice(0, 200);
    save();
  }

  function addGuildWarn({ guildId, userId, moderatorId, reason }) {
    const member = ensureGuildMember(guildId, userId);
    member.warns = (member.warns || 0) + 1;
    member.points = clampPoints((member.points || 0) - 1);
    store.warns.unshift({ guildId, userId, moderatorId, reason, createdAt: new Date().toISOString() });
    store.warns = store.warns.slice(0, 500);
    save();
  }

  function addCommend({ userId, moderatorId, reason }) {
    const member = ensureMember(userId);
    member.commends = (member.commends || 0) + 1;
    member.points = clampPoints((member.points || 0) + 1);
    store.commends.unshift({ userId, moderatorId, reason, createdAt: new Date().toISOString() });
    store.commends = store.commends.slice(0, 200);
    save();
  }

  function addGuildCommend({ guildId, userId, moderatorId, reason }) {
    const member = ensureGuildMember(guildId, userId);
    member.commends = (member.commends || 0) + 1;
    member.points = clampPoints((member.points || 0) + 1);
    store.commends.unshift({ guildId, userId, moderatorId, reason, createdAt: new Date().toISOString() });
    store.commends = store.commends.slice(0, 500);
    save();
  }

  function addVoiceMinutes(memberId, minutes) {
    const safeMinutes = Math.max(0, Math.floor(Number(minutes) || 0));
    if (!safeMinutes) return 0;

    const member = ensureMember(memberId);
    member.voiceMinutes = (member.voiceMinutes || 0) + safeMinutes;
    member.lastSeenAt = Date.now();
    clearAfkWarning(member);
    save();
    return safeMinutes;
  }

  function addGuildVoiceMinutes(guildId, memberId, minutes) {
    const safeMinutes = Math.max(0, Math.floor(Number(minutes) || 0));
    if (!safeMinutes) return 0;

    const member = ensureGuildMember(guildId, memberId);
    member.voiceMinutes = (member.voiceMinutes || 0) + safeMinutes;
    member.lastSeenAt = Date.now();
    clearAfkWarning(member);
    save();
    return safeMinutes;
  }

  function markGuildAfkWarningSent(guildId, memberId, value = new Date().toISOString()) {
    const member = ensureGuildMember(guildId, memberId);
    member.afkWarningSentAt = value;
    save();
    return member.afkWarningSentAt;
  }

  function clearGuildAfkWarningSent(guildId, memberId) {
    const member = ensureGuildMember(guildId, memberId);
    if (!member.afkWarningSentAt) {
      return false;
    }

    member.afkWarningSentAt = '';
    save();
    return true;
  }

  function getCooldown(userId) {
    return store.cooldowns[userId] || 0;
  }

  function setCooldown(userId, value = Date.now()) {
    store.cooldowns[userId] = value;
    save();
  }

  function getGuildCooldown(guildId, userId) {
    return store.cooldowns[cooldownKey(guildId, userId)] || 0;
  }

  function setGuildCooldown(guildId, userId, value = Date.now()) {
    store.cooldowns[cooldownKey(guildId, userId)] = value;
    save();
  }

  function createApplication({ userId, nickname, age, text }) {
    const applicationId = `${Date.now()}_${userId}`;
    store.applications.unshift({
      id: applicationId,
      discordId: userId,
      nickname,
      age,
      text,
      status: 'pending',
      createdAt: new Date().toISOString()
    });
    store.applications = store.applications.slice(0, 100);
    save();
    return applicationId;
  }

  function createGuildApplication({ guildId, userId, nickname, age, text }) {
    const applicationId = `${Date.now()}_${userId}`;
    store.applications.unshift({
      id: applicationId,
      guildId,
      discordId: userId,
      nickname,
      age,
      text,
      status: 'pending',
      createdAt: new Date().toISOString()
    });
    store.applications = store.applications.slice(0, 500);
    save();
    return applicationId;
  }

  function findApplication(applicationId) {
    return store.applications.find(item => item.id === applicationId) || null;
  }

  function findGuildApplication(guildId, applicationId) {
    return store.applications.find(item => item.id === applicationId && (item.guildId || guildId) === guildId) || null;
  }

  function listRecentApplications(limit = 10) {
    return store.applications.slice(0, limit);
  }

  function listGuildRecentApplications(guildId, limit = 10) {
    return store.applications.filter(item => (item.guildId || guildId) === guildId).slice(0, limit);
  }

  function listBlacklist() {
    return [...store.blacklist];
  }

  function listGuildBlacklist(guildId) {
    return store.blacklist.filter(item => (item.guildId || guildId) === guildId);
  }

  function getBlacklistEntry(userId) {
    return store.blacklist.find(item => item.userId === userId) || null;
  }

  function getGuildBlacklistEntry(guildId, userId) {
    return store.blacklist.find(item => item.userId === userId && (item.guildId || guildId) === guildId) || null;
  }

  function isBlacklisted(userId) {
    return Boolean(getBlacklistEntry(userId));
  }

  function isGuildBlacklisted(guildId, userId) {
    return Boolean(getGuildBlacklistEntry(guildId, userId));
  }

  function addBlacklistEntry({ userId, moderatorId, reason }) {
    const sanitizedReason = trimText(reason, 300) || copy.security.defaultBlacklistReason;
    const existing = getBlacklistEntry(userId);

    if (existing) {
      existing.moderatorId = moderatorId;
      existing.reason = sanitizedReason;
      existing.updatedAt = new Date().toISOString();
      save();
      return existing;
    }

    const entry = {
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

  function addGuildBlacklistEntry({ guildId, userId, moderatorId, reason }) {
    const sanitizedReason = trimText(reason, 300) || copy.security.defaultBlacklistReason;
    const existing = getGuildBlacklistEntry(guildId, userId);

    if (existing) {
      existing.moderatorId = moderatorId;
      existing.reason = sanitizedReason;
      existing.updatedAt = new Date().toISOString();
      save();
      return existing;
    }

    const entry = {
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

  function removeBlacklistEntry(userId) {
    const before = store.blacklist.length;
    store.blacklist = store.blacklist.filter(item => item.userId !== userId);
    if (store.blacklist.length !== before) {
      save();
      return true;
    }
    return false;
  }

  function removeGuildBlacklistEntry(guildId, userId) {
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
    ensureMember,
    ensureGuildMember,
    activityScore,
    guildActivityScore,
    pointsScore,
    guildPointsScore,
    voiceMinutes,
    guildVoiceMinutes,
    sanitizeApplicationInput,
    setApplicationStatus,
    setPanelMessageId,
    getPanelMessageId,
    setGuildPanelMessageId,
    getGuildPanelMessageId,
    trackMessage,
    trackGuildMessage,
    trackPresence,
    trackGuildPresence,
    addWarn,
    addGuildWarn,
    addCommend,
    addGuildCommend,
    addVoiceMinutes,
    addGuildVoiceMinutes,
    markGuildAfkWarningSent,
    clearGuildAfkWarningSent,
    getCooldown,
    getGuildCooldown,
    setCooldown,
    setGuildCooldown,
    createApplication,
    createGuildApplication,
    findApplication,
    findGuildApplication,
    listRecentApplications,
    listGuildRecentApplications,
    listBlacklist,
    listGuildBlacklist,
    getBlacklistEntry,
    getGuildBlacklistEntry,
    isBlacklisted,
    isGuildBlacklisted,
    addBlacklistEntry,
    addGuildBlacklistEntry,
    removeBlacklistEntry,
    removeGuildBlacklistEntry
  };
}

module.exports = {
  createStorage,
  defaultStore
};
