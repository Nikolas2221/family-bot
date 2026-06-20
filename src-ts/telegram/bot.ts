import { Telegraf } from 'telegraf';

export function createTelegramBot(token?: string): Telegraf | null {
  const normalized = String(token || '').trim();
  return normalized ? new Telegraf(normalized) : null;
}

export async function startTelegramBot(bot: Telegraf | null): Promise<boolean> {
  if (!bot) return false;
  try {
    await bot.launch({ dropPendingUpdates: true });
    console.log('Telegram bot polling started.');
    return true;
  } catch (error) {
    console.error('Failed to start Telegram bot polling:', error);
    return false;
  }
}

export function stopTelegramBot(bot: Telegraf | null, signal = 'shutdown'): void {
  if (!bot) return;
  try {
    bot.stop(signal);
  } catch (error) {
    console.warn('Failed to stop Telegram bot cleanly:', error);
  }
}
