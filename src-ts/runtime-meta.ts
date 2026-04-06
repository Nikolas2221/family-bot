import packageMeta from '../package.json';
import { getReleaseNotes, normalizeReleaseGroups } from './release-notes';
import type { ReleaseNoteGroups } from './types';

export const PRODUCT_VERSION_SEMVER = packageMeta.version || '1.0.11';

function resolveProductVersionLabel(version: string): string {
  if (/beta/i.test(version)) return 'BRHD/PHOENIX 0.1 BETA';
  if (/\brc\b/i.test(version)) return 'BRHD/PHOENIX 1.0 RC';
  return 'BRHD/PHOENIX 1.0 RELEASE';
}

export const PRODUCT_VERSION_LABEL = resolveProductVersionLabel(PRODUCT_VERSION_SEMVER);

const FALLBACK_ADDED_PREFIXES = ['add', 'create', 'introduce', 'implement', 'new'];
const FALLBACK_UPDATED_PREFIXES = ['update', 'improve', 'refactor', 'optimize', 'polish', 'migrate'];
const FALLBACK_FIXED_PREFIXES = ['fix', 'repair', 'correct', 'stabilize', 'harden'];

function splitCommitMessage(commitMessage?: string | null): string[] {
  return String(commitMessage || '')
    .split(/\r?\n|;|,(?=\s*[\p{L}\p{N}])/u)
    .map((line) => line.trim())
    .filter(Boolean);
}

function stripKnownPrefix(line: string, prefixes: string[]): string {
  const lower = line.toLowerCase();
  const matched = prefixes.find((prefix) => lower.startsWith(`${prefix} `));
  if (!matched) return line.trim();
  return line.slice(matched.length).trim();
}

function classifyCommitLine(line: string): keyof ReleaseNoteGroups {
  const lower = line.toLowerCase();
  if (FALLBACK_FIXED_PREFIXES.some((prefix) => lower.startsWith(`${prefix} `))) {
    return 'fixed';
  }

  if (FALLBACK_ADDED_PREFIXES.some((prefix) => lower.startsWith(`${prefix} `))) {
    return 'added';
  }

  return 'updated';
}

function humanizeFallbackLine(line: string, bucket: keyof ReleaseNoteGroups): string {
  const prefixes =
    bucket === 'added'
      ? FALLBACK_ADDED_PREFIXES
      : bucket === 'fixed'
        ? FALLBACK_FIXED_PREFIXES
        : FALLBACK_UPDATED_PREFIXES;

  return stripKnownPrefix(line, prefixes);
}

export function getCurrentReleaseChangeGroups(commitMessage?: string | null): ReleaseNoteGroups {
  const releaseGroups = getReleaseNotes(PRODUCT_VERSION_SEMVER);
  if (releaseGroups) {
    return releaseGroups;
  }

  const buckets: ReleaseNoteGroups = { added: [], updated: [], fixed: [] };
  for (const line of splitCommitMessage(commitMessage)) {
    const bucket = classifyCommitLine(line);
    buckets[bucket].push(humanizeFallbackLine(line, bucket));
  }

  return normalizeReleaseGroups(buckets);
}

export function buildCurrentBuildSignature(buildId?: string | null): string {
  const safeBuildId = String(buildId || PRODUCT_VERSION_SEMVER).trim() || PRODUCT_VERSION_SEMVER;
  return `${PRODUCT_VERSION_SEMVER}:${safeBuildId}`;
}
