function defaultAutomodConfig() {
  return {
    invitesEnabled: false,
    linksEnabled: false,
    capsEnabled: false,
    capsPercent: 75,
    capsMinLength: 12,
    mentionsEnabled: false,
    mentionLimit: 5,
    spamEnabled: false,
    spamCount: 6,
    spamWindowSeconds: 8,
    badWordsEnabled: false,
    badWords: [],
    actionMode: 'soft',
    timeoutMinutes: 10
  };
}

function normalizeBadWords(words) {
  return [...new Set((Array.isArray(words) ? words : [])
    .map(word => String(word || '').trim().toLowerCase())
    .filter(Boolean))];
}

function normalizeAutomodConfig(raw = {}) {
  const defaults = defaultAutomodConfig();
  return {
    invitesEnabled: raw.invitesEnabled ?? defaults.invitesEnabled,
    linksEnabled: raw.linksEnabled ?? defaults.linksEnabled,
    capsEnabled: raw.capsEnabled ?? defaults.capsEnabled,
    capsPercent: clampNumber(raw.capsPercent, 50, 100, defaults.capsPercent),
    capsMinLength: clampNumber(raw.capsMinLength, 4, 200, defaults.capsMinLength),
    mentionsEnabled: raw.mentionsEnabled ?? defaults.mentionsEnabled,
    mentionLimit: clampNumber(raw.mentionLimit, 2, 50, defaults.mentionLimit),
    spamEnabled: raw.spamEnabled ?? defaults.spamEnabled,
    spamCount: clampNumber(raw.spamCount, 3, 20, defaults.spamCount),
    spamWindowSeconds: clampNumber(raw.spamWindowSeconds, 3, 60, defaults.spamWindowSeconds),
    badWordsEnabled: raw.badWordsEnabled ?? defaults.badWordsEnabled,
    badWords: normalizeBadWords(raw.badWords),
    actionMode: raw.actionMode === 'hard' ? 'hard' : defaults.actionMode,
    timeoutMinutes: clampNumber(raw.timeoutMinutes, 1, 1440, defaults.timeoutMinutes)
  };
}

function clampNumber(value, min, max, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, Math.round(numeric)));
}

function containsInvite(text) {
  return /(?:discord\.gg|discord(?:app)?\.com\/invite)\/[a-z0-9-]+/i.test(String(text || ''));
}

function containsUrl(text) {
  return /\b(?:https?:\/\/|www\.)\S+/i.test(String(text || ''));
}

function uppercaseRatio(text) {
  const letters = String(text || '').match(/\p{L}/gu) || [];
  if (!letters.length) return 0;

  const uppercase = letters.filter(char => char === char.toUpperCase() && char !== char.toLowerCase()).length;
  return uppercase / letters.length;
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function matchBadWord(text, words) {
  const value = String(text || '').toLowerCase();
  for (const word of normalizeBadWords(words)) {
    const pattern = new RegExp(`(^|[^\\p{L}\\p{N}_])${escapeRegex(word)}([^\\p{L}\\p{N}_]|$)`, 'iu');
    if (pattern.test(value)) {
      return word;
    }
  }
  return '';
}

function evaluateAutomodMessage({ content, mentionCount = 0, config = defaultAutomodConfig() }) {
  const settings = normalizeAutomodConfig(config);
  const text = String(content || '').trim();
  if (!text) return null;

  if (settings.badWordsEnabled) {
    const word = matchBadWord(text, settings.badWords);
    if (word) {
      return { rule: 'badWords', detail: word };
    }
  }

  if (settings.invitesEnabled && containsInvite(text)) {
    return { rule: 'invites' };
  }

  if (settings.linksEnabled && containsUrl(text) && !containsInvite(text)) {
    return { rule: 'links' };
  }

  if (settings.capsEnabled) {
    const letters = text.match(/\p{L}/gu) || [];
    const ratio = uppercaseRatio(text) * 100;
    if (letters.length >= settings.capsMinLength && ratio >= settings.capsPercent) {
      return { rule: 'caps', detail: `${Math.round(ratio)}%` };
    }
  }

  if (settings.mentionsEnabled && mentionCount >= settings.mentionLimit) {
    return { rule: 'mentions', detail: String(mentionCount) };
  }

  return null;
}

function evaluateSpamActivity(timestamps, now, config = defaultAutomodConfig()) {
  const settings = normalizeAutomodConfig(config);
  const current = Array.isArray(timestamps) ? timestamps : [];
  const cutoff = now - settings.spamWindowSeconds * 1000;
  const recent = current.filter(value => Number(value) >= cutoff);
  recent.push(now);

  return {
    recent,
    triggered: settings.spamEnabled && recent.length >= settings.spamCount
  };
}

module.exports = {
  containsInvite,
  containsUrl,
  defaultAutomodConfig,
  evaluateAutomodMessage,
  evaluateSpamActivity,
  matchBadWord,
  normalizeAutomodConfig,
  normalizeBadWords,
  uppercaseRatio
};
