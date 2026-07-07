const assert = require('node:assert/strict');

const { createServerBackupService } = require('../dist-ts/services/server-backups');

function buildGuild(id) {
  return {
    id,
    name: `Guild ${id}`,
    ownerId: 'owner-1',
    roles: {
      cache: new Map(),
      fetch: async () => null
    },
    channels: {
      cache: new Map(),
      fetch: async () => null
    }
  };
}

function buildService() {
  return createServerBackupService({
    client: {
      guilds: {
        cache: new Map()
      }
    },
    config: {
      enabled: true,
      intervalHours: 48,
      githubToken: 'token',
      githubOwner: 'owner',
      githubRepo: 'repo',
      githubBranch: 'main',
      githubBasePath: 'backups/server'
    }
  });
}

async function main() {
  const originalFetch = global.fetch;
  let putCalls = 0;

  global.fetch = async (_url, options = {}) => {
    if (options.method === 'PUT') {
      putCalls += 1;
      await new Promise(resolve => setTimeout(resolve, 5));
      return {
        ok: true,
        json: async () => ({ content: { html_url: `https://github.test/backup-${putCalls}` } }),
        text: async () => ''
      };
    }

    return {
      ok: false,
      json: async () => ({}),
      text: async () => ''
    };
  };

  try {
    const service = buildService();
    const firstGuild = buildGuild('guild-1');
    const secondGuild = buildGuild('guild-2');

    const firstBackup = service.createBackup(firstGuild, 'manual');
    const duplicateBackup = await service.createBackup(firstGuild, 'manual');

    assert.equal(duplicateBackup.ok, false);
    assert.equal(duplicateBackup.skipped, true);
    assert.match(duplicateBackup.error || '', /already running/i);

    assert.equal((await firstBackup).ok, true);

    const [left, right] = await Promise.all([
      service.createBackup(firstGuild, 'auto'),
      service.createBackup(secondGuild, 'auto')
    ]);

    assert.equal(left.ok, true);
    assert.equal(right.ok, true);
  } finally {
    global.fetch = originalFetch;
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { main };
