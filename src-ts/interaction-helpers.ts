import { MessageFlags } from 'discord.js';
import type { Interaction } from 'discord.js';

export async function finishInteractionError(interaction: Interaction, content: string): Promise<void> {
  if (!interaction.isRepliable()) return;
  if (interaction.deferred) await interaction.editReply({ content, embeds: [], components: [] });
  else if (interaction.replied) await interaction.followUp({ content, flags: MessageFlags.Ephemeral });
  else await interaction.reply({ content, flags: MessageFlags.Ephemeral });
}

interface WebhookLike {
  deleteMessage(messageId: string): Promise<unknown>;
}

export interface CleanupInteractionLike {
  reply(payload: Record<string, unknown>): Promise<unknown>;
  editReply(payload: Record<string, unknown>): Promise<unknown>;
  deleteReply(): Promise<unknown>;
  webhook?: WebhookLike | null;
}

export function ephemeral<T extends object = Record<string, unknown>>(payload: T = {} as T): T & { flags: MessageFlags.Ephemeral } {
  return { ...payload, flags: MessageFlags.Ephemeral };
}

export function scheduleDeleteReply(interaction: CleanupInteractionLike, delayMs = 5000): void {
  setTimeout(async () => {
    try {
      await interaction.deleteReply();
      return;
    } catch (_) {
      // Fall through to webhook cleanup.
    }

    try {
      await interaction.webhook?.deleteMessage('@original');
    } catch (_) {
      // Ignore cleanup failures for temporary moderation replies.
    }
  }, delayMs);
}

export async function replyAndAutoDelete(
  interaction: CleanupInteractionLike,
  payload: Record<string, unknown>,
  delayMs = 5000
): Promise<unknown> {
  const response = await interaction.reply(ephemeral(payload));
  scheduleDeleteReply(interaction, delayMs);
  return response;
}

export async function editReplyAndAutoDelete(
  interaction: CleanupInteractionLike,
  payload: Record<string, unknown>,
  delayMs = 5000
): Promise<unknown> {
  const response = await interaction.editReply(payload);
  scheduleDeleteReply(interaction, delayMs);
  return response;
}
