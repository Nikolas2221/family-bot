import { ChannelType } from 'discord.js';

type RefreshResult = {
  scannedChannels: number;
  scannedMessages: number;
  updatedMessages: number;
};

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value || null));
}

export function replaceLegacyBrandText(value: string): string {
  return String(value || '')
    .replace(/\bBRHD\s*[•/-]\s*Phoenix\b/giu, 'KLAIZ')
    .replace(/\bBRHD\/PHOENIX\b/giu, 'KLAIZ')
    .replace(/\bBRHD\/Phoenix\b/giu, 'KLAIZ')
    .replace(/\bBRHD\s*[•/-]\s*PHOENIX\b/giu, 'KLAIZ')
    .replace(/([•/-]\s*)Phoenix\b/giu, '$1KLAIZ')
    .replace(/\bPhoenix Intake\b/giu, 'KLAIZ Intake');
}

function replaceLegacyBrandDeep(value: unknown): { value: unknown; changed: boolean } {
  if (typeof value === 'string') {
    const next = replaceLegacyBrandText(value);
    return { value: next, changed: next !== value };
  }

  if (Array.isArray(value)) {
    let changed = false;
    const next = value.map(item => {
      const result = replaceLegacyBrandDeep(item);
      changed = changed || result.changed;
      return result.value;
    });
    return { value: next, changed };
  }

  if (value && typeof value === 'object') {
    let changed = false;
    const next: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      const result = replaceLegacyBrandDeep(nested);
      changed = changed || result.changed;
      next[key] = result.value;
    }
    return { value: next, changed };
  }

  return { value, changed: false };
}

function isScannableTextChannel(channel: any): boolean {
  return [
    ChannelType.GuildText,
    ChannelType.GuildAnnouncement
  ].includes(channel?.type) && typeof channel?.messages?.fetch === 'function';
}

export async function refreshLegacyBrandMessages(guild: any, {
  limitPerChannel = 100,
  logger = console
}: {
  limitPerChannel?: number;
  logger?: Pick<Console, 'warn' | 'log'>;
} = {}): Promise<RefreshResult> {
  const botUserId = guild?.client?.user?.id;
  const result: RefreshResult = {
    scannedChannels: 0,
    scannedMessages: 0,
    updatedMessages: 0
  };

  if (!guild || !botUserId) return result;

  const fetched = await guild.channels.fetch?.().catch(() => null);
  const channels: any[] = fetched?.values
    ? Array.from(fetched.values()) as any[]
    : Array.from(guild.channels?.cache?.values?.() || []) as any[];

  for (const channel of channels) {
    if (!isScannableTextChannel(channel)) continue;
    result.scannedChannels += 1;

    const messages = await channel.messages.fetch({ limit: Math.max(1, Math.min(100, limitPerChannel)) }).catch((error: unknown) => {
      logger.warn?.(`Legacy brand refresh skipped channel ${channel.id}: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    });
    if (!messages?.values) continue;

    for (const message of messages.values()) {
      if (message.author?.id !== botUserId || !message.embeds?.length || typeof message.edit !== 'function') continue;
      result.scannedMessages += 1;

      const nextEmbeds: Array<{ value: unknown; changed: boolean }> = message.embeds.map((embed: any) => {
        const raw = typeof embed.toJSON === 'function' ? embed.toJSON() : cloneJson(embed);
        return replaceLegacyBrandDeep(raw);
      });
      if (!nextEmbeds.some((item: { changed: boolean }) => item.changed)) continue;

      await message.edit({ embeds: nextEmbeds.map((item: { value: unknown }) => item.value) }).then(() => {
        result.updatedMessages += 1;
      }).catch((error: unknown) => {
        logger.warn?.(`Legacy brand refresh failed message ${message.id}: ${error instanceof Error ? error.message : String(error)}`);
      });
    }
  }

  if (result.updatedMessages) {
    logger.log?.(`[brand-refresh] updated ${result.updatedMessages} legacy embed message(s) in guild ${guild.id}`);
  }

  return result;
}
