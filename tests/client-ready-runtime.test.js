const assert = require('node:assert/strict');

const { registerClientReadyRuntime } = require('../dist-ts/client-ready-runtime');

async function main() {
  const listeners = new Map();
  const commandSets = [];
  const maintenanceUpdates = [];
  const warmCalls = [];
  const member = { voice: { channelId: 'voice-1' } };
  const guild = {
    id: 'guild-new',
    name: 'New Guild',
    ownerId: 'owner-1',
    commands: {
      set: async (commands) => {
        commandSets.push(commands);
        return commands;
      }
    },
    roles: {
      fetch: async () => true
    },
    members: {
      fetch: async () => true,
      cache: {
        values: function* values() {
          yield member;
        }
      }
    }
  };

  const options = {
    client: {
      user: { tag: 'FamilyBot#0001' },
      guilds: {
        fetch: async () => ({
          values: function* values() {}
        }),
        cache: {
          values: function* values() {}
        }
      },
      removeAllListeners: (eventName) => {
        listeners.delete(eventName);
      },
      on: (eventName, listener) => {
        listeners.set(eventName, listener);
      }
    },
    database: {
      ensureGuild: (guildId, data) => {
        assert.equal(guildId, guild.id);
        assert.deepEqual(data, { guildName: guild.name, ownerId: guild.ownerId });
        return { maintenance: {} };
      },
      updateGuildMaintenance: (guildId, patch) => {
        maintenanceUpdates.push({ guildId, patch });
      }
    },
    updateIntervalMs: 60000,
    autoRanks: { enabled: false, intervalMs: 60000 },
    afkWarningCheckIntervalMs: 60000,
    reportScheduleCheckIntervalMs: 60000,
    syncAutoRanks: async (guildId, reason) => warmCalls.push(['syncAutoRanks', guildId, reason]),
    syncAutoRanksAll: async () => true,
    doPanelUpdate: async (guildId, force) => warmCalls.push(['doPanelUpdate', guildId, force]),
    doPanelUpdateAll: async () => true,
    refreshLegacyBrandMessages: async (targetGuild) => warmCalls.push(['refreshLegacyBrandMessages', targetGuild.id]),
    announceBuildUpdate: async (targetGuild) => warmCalls.push(['announceBuildUpdate', targetGuild.id]),
    runRolelessCleanupDetailed: async (guildId, reason) => warmCalls.push(['runRolelessCleanupDetailed', guildId, reason]),
    runAfkWarnings: async (guildId) => warmCalls.push(['runAfkWarnings', guildId]),
    runScheduledReports: async (guildId) => warmCalls.push(['runScheduledReports', guildId]),
    startVoiceSession: (targetMember) => warmCalls.push(['startVoiceSession', targetMember.voice.channelId])
  };

  registerClientReadyRuntime(options);
  assert.equal(typeof listeners.get('guildCreate'), 'function');

  await listeners.get('guildCreate')(guild);

  assert.equal(commandSets.length, 1);
  assert.ok(commandSets[0].some(command => command.name === 'setup'));
  assert.equal(maintenanceUpdates.length, 1);
  assert.equal(maintenanceUpdates[0].guildId, guild.id);
  assert.equal(typeof maintenanceUpdates[0].patch.lastCommandSignature, 'string');
  assert.ok(warmCalls.some(call => call[0] === 'startVoiceSession'));
  assert.ok(warmCalls.some(call => call[0] === 'doPanelUpdate'));
  assert.ok(warmCalls.some(call => call[0] === 'refreshLegacyBrandMessages'));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { main };
