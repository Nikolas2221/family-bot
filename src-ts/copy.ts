import type { CopyCatalog } from './types';

const copyJs = require('../copy') as CopyCatalog;

function repairText(value: string): string {
  if (!value) return value;
  if (!/[РЁёЎўЂЃџ]/u.test(value) && !value.includes('вЂ') && !value.includes('рџ')) {
    return value;
  }

  let next = value;
  for (let index = 0; index < 2; index += 1) {
    try {
      const repaired = Buffer.from(next, 'latin1').toString('utf8');
      if (!repaired || repaired === next || repaired.includes('\uFFFD')) break;
      next = repaired;
    } catch {
      break;
    }
  }

  return next;
}

function repairCopyValue<T>(value: T, seen = new WeakMap<object, unknown>()): T {
  if (typeof value === 'string') {
    return repairTextSafe(value) as T;
  }

  if (typeof value === 'function') {
    return ((...args: unknown[]) => {
      const result = value(...args);
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

function repairTextSafe(value: string): string {
  if (!value) return value;

  const score = (input: string): number => {
    const markers = ['Р', 'С', 'вЂ', 'рџ', '\uFFFD'];
    const markerPenalty = markers.reduce((sum, marker) => sum + (input.split(marker).length - 1) * 4, 0);
    const controlPenalty = Array.from(input).reduce((sum, char) => {
      const code = char.charCodeAt(0);
      return sum + ((code < 32 && char !== '\n' && char !== '\r' && char !== '\t') ? 6 : 0);
    }, 0);
    const cyrillicBonus = (input.match(/[А-Яа-яЁё]/g) || []).length;
    return markerPenalty + controlPenalty - cyrillicBonus;
  };

  let best = value;
  let bestScore = score(value);
  let next = value;

  for (let index = 0; index < 2; index += 1) {
    try {
      const repaired = Buffer.from(next, 'latin1').toString('utf8');
      if (!repaired || repaired === next) break;
      const repairedScore = score(repaired);
      if (repaired.includes('\uFFFD') && repairedScore >= bestScore) break;
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

export { repairCopyValue, repairTextSafe as repairText };
export type { CopyCatalog };
