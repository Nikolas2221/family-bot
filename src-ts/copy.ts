import type { CopyCatalog } from './types';

const copyJs = require('./copy-source') as CopyCatalog;

const mojibakeMarkers = [
  'Р ',
  'РЎ',
  'РІР‚',
  'СЂСџ',
  'Р Р†Р вЂљ',
  'РЎР‚РЎСџ'
];

function hasReadableCyrillic(value: string): boolean {
  return /[\u0400-\u04FF]/u.test(value);
}

function hasSuspiciousMojibake(value: string): boolean {
  if (mojibakeMarkers.some((marker) => value.includes(marker))) {
    return true;
  }

  if (value.includes('вЂ')) {
    return true;
  }

  const suspiciousPairs = value.match(/[РС][^ \n\r\t]/gu) || [];
  return suspiciousPairs.length >= 3;
}

function scoreRepairCandidate(input: string): number {
  const markerPenalty = mojibakeMarkers.reduce((sum, marker) => sum + (input.split(marker).length - 1) * 4, 0);
  const controlPenalty = Array.from(input).reduce((sum, char) => {
    const code = char.charCodeAt(0);
    return sum + ((code < 32 && char !== '\n' && char !== '\r' && char !== '\t') ? 6 : 0);
  }, 0);
  const replacementPenalty = (input.match(/\uFFFD/g) || []).length * 8;
  const cyrillicBonus = (input.match(/[\u0400-\u04FF]/g) || []).length;
  return markerPenalty + controlPenalty + replacementPenalty - cyrillicBonus;
}

function repairTextSafe(value: string): string {
  if (!value) return value;

  if (hasReadableCyrillic(value) && !hasSuspiciousMojibake(value)) {
    return value;
  }

  if (!hasSuspiciousMojibake(value)) {
    return value;
  }

  let best = value;
  let bestScore = scoreRepairCandidate(value);
  let next = value;

  for (let index = 0; index < 2; index += 1) {
    try {
      const repaired = Buffer.from(next, 'latin1').toString('utf8');
      if (!repaired || repaired === next) break;

      const repairedScore = scoreRepairCandidate(repaired);
      if (repairedScore < bestScore) {
        best = repaired;
        bestScore = repairedScore;
      }

      next = repaired;
    } catch {
      break;
    }
  }

  return best;
}

function repairCopyValue<T>(value: T, seen = new WeakMap<object, unknown>()): T {
  if (typeof value === 'string') {
    return repairTextSafe(value) as T;
  }

  if (typeof value === 'function') {
    return (function repairedFunction(this: unknown, ...args: unknown[]) {
      const result = (value as unknown as (...innerArgs: unknown[]) => unknown).apply(this, args);
      return repairCopyValue(result, seen);
    }) as T;
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  if (seen.has(value as object)) {
    return seen.get(value as object) as T;
  }

  if (Array.isArray(value)) {
    const output: unknown[] = [];
    seen.set(value, output);
    for (const item of value) {
      output.push(repairCopyValue(item, seen));
    }
    return output as T;
  }

  const output: Record<string, unknown> = {};
  seen.set(value as object, output);
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    output[key] = repairCopyValue(nested, seen);
  }

  return output as T;
}

const repairedCopy = repairCopyValue(copyJs);

function stableHoursFormatter(value: unknown): string {
  return `${Number(value || 0).toFixed(1)} ч`;
}

if (repairedCopy.stats && typeof repairedCopy.stats === 'object') {
  repairedCopy.stats.hours = stableHoursFormatter;
  repairedCopy.stats.leaderboardLine = function leaderboardLine(index: number, member: { id: string }, roleName: string, points: number, voiceHours: number) {
    return `${index + 1}. ${roleName} • <@${member.id}> • ${points}/100 • ${stableHoursFormatter(voiceHours)}`;
  };
  repairedCopy.stats.voiceLine = function voiceLine(index: number, member: { id: string }, hours: number, points: number) {
    return `${index + 1}. <@${member.id}> • ${stableHoursFormatter(hours)} • ${points}/100`;
  };
}

if (repairedCopy.family && typeof repairedCopy.family === 'object') {
  repairedCopy.family.adminBlacklistButton = 'ЧС';
  repairedCopy.family.refreshButton = 'Обновить';
  repairedCopy.family.profileButton = 'Профиль';
  repairedCopy.family.leaderboardButton = 'Топ';
  repairedCopy.family.voiceButton = 'Голос';
  repairedCopy.family.applyButton = 'Подать заявку';
  repairedCopy.family.adminApplicationsButton = 'Заявки';
  repairedCopy.family.adminAiAdvisorButton = 'AI-совет';
  repairedCopy.family.adminPanelButton = 'Админка';
  repairedCopy.family.adminReportButton = 'Отчёт';
  repairedCopy.family.legend = '🟢 Онлайн • 🟡 Отошёл • ⛔ Не беспокоить • ⚫ Оффлайн';
}

if (repairedCopy.profile && typeof repairedCopy.profile === 'object') {
  repairedCopy.profile.fieldStatusRank = 'Статус и ранг';
  repairedCopy.profile.fieldVoice = 'Голосовые каналы';
}

export const copy = repairedCopy;
export default repairedCopy;
export { repairCopyValue, repairTextSafe as repairText };
export type { CopyCatalog };
