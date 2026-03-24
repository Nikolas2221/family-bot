import { buildCommands, getCommandsSignature, registerCommands } from './commands';
import type { AutoRanksConfig, DatabaseApi } from './types';

interface ClientUserLike {
  tag: string;
}

interface MemberVoiceStateLike {
  channelId?: string | null;
}

interface MemberLike {
  voice?: MemberVoiceStateLike | null;
}

interface GuildLike {
  id: string;
  name: string;
  ownerId?: string | null;
  commands: {
    set(commands: unknown[]): Promise<unknown>;
  };
  roles: {
    fetch(): Promise<unknown>;
  };
  members: {
    fetch(): Promise<unknown>;
    cache: {
      values(): IterableIterator<MemberLike>;
    };
  };
}

interface GuildFetchEntryLike {
  id: string;
  fetch(): Promise<GuildLike>;
}

interface ClientLike {
  user?: ClientUserLike | null;
  guilds: {
    fetch(): Promise<{
      values(): IterableIterator<GuildFetchEntryLike>;
    }>;
    cache: {
      values(): IterableIterator<GuildLike>;
    };
  };
  removeAllListeners(event: 'clientReady'): unknown;
  on(event: 'clientReady', listener: () => Promise<void> | void): unknown;
}

interface ClientReadyRuntimeOptions {
  client: ClientLike;
  database: DatabaseApi;
  updateIntervalMs: number;
  autoRanks: AutoRanksConfig;
  afkWarningCheckIntervalMs: number;
  reportScheduleCheckIntervalMs: number;
  syncAutoRanks(guildId: string, reason: string): Promise<unknown>;
  syncAutoRanksAll(reason: string): Promise<unknown>;
  doPanelUpdate(guildId: string, force: boolean): Promise<unknown>;
  doPanelUpdateAll(force: boolean): Promise<unknown>;
  announceBuildUpdate(guild: GuildLike): Promise<unknown>;
  runRolelessCleanupDetailed(guildId: string, reason: string): Promise<unknown>;
  runAfkWarnings(guildId: string): Promise<unknown>;
  runScheduledReports(guildId: string, now?: Date): Promise<unknown>;
  startVoiceSession(member: MemberLike): void;
}

async function syncGuildCommandsOnReady(options: Pick<ClientReadyRuntimeOptions, 'client' | 'database'>): Promise<void> {
  const { client, database } = options;
  const commandsPayload = buildCommands();
  const commandsSignature = getCommandsSignature(commandsPayload);
  const guilds = await client.guilds.fetch();

  for (const guildData of guilds.values()) {
    try {
      const guild = await guildData.fetch();
      const guildRecord = database.ensureGuild(guild.id, {
        guildName: guild.name,
        ownerId: guild.ownerId || ''
      });

      if (guildRecord.maintenance?.lastCommandSignature !== commandsSignature) {
        await registerCommands(guild, commandsPayload);
        database.updateGuildMaintenance(guild.id, {
          lastCommandSignature: commandsSignature
        });
      }
    } catch (error) {
      console.error(`Ошибка инициализации guild ${guildData.id}:`, error);
    }
  }
}

async function warmGuildState(
  guild: GuildLike,
  options: Pick<
    ClientReadyRuntimeOptions,
    | 'startVoiceSession'
    | 'syncAutoRanks'
    | 'doPanelUpdate'
    | 'announceBuildUpdate'
    | 'runRolelessCleanupDetailed'
    | 'runAfkWarnings'
    | 'runScheduledReports'
  >
): Promise<void> {
  await guild.roles.fetch().catch(error => {
    console.error(`Не удалось получить роли guild ${guild.id}:`, error);
  });

  await guild.members.fetch().catch(error => {
    console.error(`Не удалось получить участников guild ${guild.id}:`, error);
  });

  for (const member of guild.members.cache.values()) {
    if (member.voice?.channelId) {
      options.startVoiceSession(member);
    }
  }

  await options.syncAutoRanks(guild.id, 'startup').catch(error => {
    console.error(`Ошибка стартовой синхронизации авто-рангов ${guild.id}:`, error);
  });

  await options.doPanelUpdate(guild.id, true).catch(error => {
    console.error(`Ошибка стартового обновления панели ${guild.id}:`, error);
  });

  await options.announceBuildUpdate(guild).catch(error => {
    console.error(`Ошибка анонса обновления ${guild.id}:`, error);
  });

  await options.runRolelessCleanupDetailed(guild.id, 'startup').catch(error => {
    console.error(`Ошибка стартовой чистки ${guild.id}:`, error);
  });

  await options.runAfkWarnings(guild.id).catch(error => {
    console.error(`Ошибка AFK-проверки ${guild.id}:`, error);
  });

  await options.runScheduledReports(guild.id).catch(error => {
    console.error(`Ошибка startup отчёта ${guild.id}:`, error);
  });
}

function scheduleBackgroundTasks(options: ClientReadyRuntimeOptions): void {
  setInterval(() => {
    options.doPanelUpdateAll(false).catch(error => {
      console.error('Ошибка interval обновления панели:', error);
    });
  }, options.updateIntervalMs);

  if (options.autoRanks.enabled) {
    setInterval(() => {
      options.syncAutoRanksAll('interval').catch(error => {
        console.error('Ошибка interval авто-рангов:', error);
      });
    }, options.autoRanks.intervalMs);
  }

  setInterval(() => {
    for (const guild of options.client.guilds.cache.values()) {
      options.runRolelessCleanupDetailed(guild.id, 'interval').catch(error => {
        console.error(`Ошибка interval очистки ${guild.id}:`, error);
      });
      options.runAfkWarnings(guild.id).catch(error => {
        console.error(`Ошибка interval AFK-проверки ${guild.id}:`, error);
      });
    }
  }, options.afkWarningCheckIntervalMs);

  setInterval(() => {
    const now = new Date();
    for (const guild of options.client.guilds.cache.values()) {
      options.runScheduledReports(guild.id, now).catch(error => {
        console.error(`Ошибка interval отчёта ${guild.id}:`, error);
      });
    }
  }, options.reportScheduleCheckIntervalMs);
}

export function registerClientReadyRuntime(options: ClientReadyRuntimeOptions): void {
  const { client, database } = options;

  client.removeAllListeners('clientReady');
  client.on('clientReady', async () => {
    try {
      if (client.user?.tag) {
        console.log(`Бот запущен как ${client.user.tag}`);
      }

      await syncGuildCommandsOnReady({ client, database });

      setImmediate(() => {
        void (async () => {
          for (const guild of client.guilds.cache.values()) {
            await warmGuildState(guild, options);
          }
        })().catch(error => {
          console.error('Startup guild warmup failed:', error);
        });
      });

      scheduleBackgroundTasks(options);
    } catch (error) {
      console.error('Критическая ошибка clientReady:', error);
    }
  });
}
