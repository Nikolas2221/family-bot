import type { EmbedsApi } from './types';
import { repairText } from './copy';

const embedsJs = require('./embeds-source') as EmbedsApi;

function sanitizeText(value: string): string {
  if (!value) return value;
  return repairText(value)
    .replace(/вЂў/g, '•')
    .replace(/рџџў/g, '🟢')
    .replace(/рџџЎ/g, '🟡')
    .replace(/в›”/g, '⛔')
    .replace(/вљ«/g, '⚫');
}

function sanitizeBuilderPayload<T>(value: T, seen = new WeakSet<object>()): T {
  if (typeof value === 'string') {
    return sanitizeText(value) as T;
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  if (seen.has(value as object)) {
    return value;
  }

  seen.add(value as object);

  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      value[index] = sanitizeBuilderPayload(value[index], seen) as T[keyof T];
    }
    return value;
  }

  const record = value as Record<string, unknown>;

  if (record.data && typeof record.data === 'object') {
    sanitizeBuilderPayload(record.data, seen);
  }

  if (Array.isArray(record.components)) {
    sanitizeBuilderPayload(record.components, seen);
  }

  if (Array.isArray(record.fields)) {
    sanitizeBuilderPayload(record.fields, seen);
  }

  for (const [key, nested] of Object.entries(record)) {
    if (key === 'data' || key === 'components' || key === 'fields') {
      continue;
    }

    if (typeof nested === 'string') {
      record[key] = sanitizeText(nested);
    } else if (nested && typeof nested === 'object') {
      sanitizeBuilderPayload(nested, seen);
    }
  }

  return value;
}

const embeds: EmbedsApi = Object.fromEntries(
  Object.entries(embedsJs).map(([key, value]) => {
    if (typeof value === 'function') {
      return [key, function wrappedEmbedFactory(this: unknown, ...args: unknown[]) {
        const result = (value as (...innerArgs: unknown[]) => unknown).apply(embedsJs, args);
        return sanitizeBuilderPayload(result);
      }];
    }

    return [key, sanitizeBuilderPayload(value)];
  })
) as EmbedsApi;

export const panelButtons = embeds.panelButtons;
export { embeds };
export default embeds;

export type { EmbedsApi };
