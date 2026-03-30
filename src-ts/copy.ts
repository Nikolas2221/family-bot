import type { CopyCatalog } from './types';

const copyJs = require('../copy') as CopyCatalog;

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
  return mojibakeMarkers.some((marker) => value.includes(marker));
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

export const copy = repairedCopy;
export default repairedCopy;
export { repairCopyValue, repairTextSafe as repairText };
export type { CopyCatalog };
