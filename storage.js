const fs = require('fs');

function defaultStore() {
  return {
    members: {},
    applications: [],
    cooldowns: {},
    warns: [],
    commends: [],
    panelMessageId: ''
  };
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

  function ensureMember(id) {
    if (!store.members[id]) {
      store.members[id] = {
        messageCount: 0,
        lastSeenAt: Date.now(),
        warns: 0,
        commends: 0
      };
    }
    return store.members[id];
  }

  function activityScore(id) {
    const member = ensureMember(id);
    return (member.messageCount || 0) + (member.commends || 0) * 5 - (member.warns || 0) * 3;
  }

  function trimText(value, maxLength) {
    return String(value || '').trim().slice(0, maxLength);
  }

  function sanitizeApplicationInput(fields) {
    const nickname = trimText(fields.nickname, 64);
    const age = trimText(fields.age, 32);
    const text = trimText(fields.text, 1000);

    if (!nickname || !age || !text) {
      return { error: 'Все поля заявки должны быть заполнены.' };
    }

    if (text.length < 10) {
      return { error: 'Текст заявки слишком короткий. Напиши хотя бы 10 символов.' };
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

  function trackMessage(memberId) {
    const member = ensureMember(memberId);
    member.messageCount += 1;
    member.lastSeenAt = Date.now();
    save();
  }

  function trackPresence(memberId) {
    const member = ensureMember(memberId);
    member.lastSeenAt = Date.now();
    save();
  }

  function addWarn({ userId, moderatorId, reason }) {
    const member = ensureMember(userId);
    member.warns = (member.warns || 0) + 1;
    store.warns.unshift({ userId, moderatorId, reason, createdAt: new Date().toISOString() });
    store.warns = store.warns.slice(0, 200);
    save();
  }

  function addCommend({ userId, moderatorId, reason }) {
    const member = ensureMember(userId);
    member.commends = (member.commends || 0) + 1;
    store.commends.unshift({ userId, moderatorId, reason, createdAt: new Date().toISOString() });
    store.commends = store.commends.slice(0, 200);
    save();
  }

  function getCooldown(userId) {
    return store.cooldowns[userId] || 0;
  }

  function setCooldown(userId, value = Date.now()) {
    store.cooldowns[userId] = value;
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

  function findApplication(applicationId) {
    return store.applications.find(item => item.id === applicationId) || null;
  }

  function listRecentApplications(limit = 10) {
    return store.applications.slice(0, limit);
  }

  return {
    getStore,
    save,
    flush,
    ensureMember,
    activityScore,
    sanitizeApplicationInput,
    setApplicationStatus,
    setPanelMessageId,
    getPanelMessageId,
    trackMessage,
    trackPresence,
    addWarn,
    addCommend,
    getCooldown,
    setCooldown,
    createApplication,
    findApplication,
    listRecentApplications
  };
}

module.exports = {
  createStorage,
  defaultStore
};
