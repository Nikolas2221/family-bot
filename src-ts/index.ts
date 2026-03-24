export * from './types';
export * from './config';
export * from './roles';
export * from './release-notes';
export * from './database';
export * from './storage';
export * from './copy';
export * from './automod';
export * from './security';
export * from './ai';
export * from './commands';
export * from './embeds';
export * from './applications';
export * from './ranks';
export * from './runtime-meta';
export * from './interaction-helpers';
export * from './guild-runtime';
export * from './access';
export * from './client-ready-runtime';
export * from './event-runtime';
export * from './interaction-runtime';

export function startLegacyRuntime(): void {
  require('../index');
}

if (require.main === module) {
  startLegacyRuntime();
}
