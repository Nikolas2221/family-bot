import { Telegraf } from 'telegraf';

export function createTelegramBot(token?: string): Telegraf | null {
  const normalized = String(token || '').trim();
  return normalized ? new Telegraf(normalized) : null;
}

const runs = new WeakMap<Telegraf, { stopped: boolean; timer?: ReturnType<typeof setTimeout>; pending: Promise<boolean> }>();
const health = new WeakMap<Telegraf, string>();
export function telegramHealth(bot: Telegraf | null): string {
  return bot ? health.get(bot) || 'Не запущен' : 'Не настроен';
}

export async function startTelegramBot(bot: Telegraf | null): Promise<boolean> {
  if (!bot) return false;
  const existing = runs.get(bot);
  if (existing && !existing.stopped) return existing.pending;
  const state = { stopped: false, timer: undefined as ReturnType<typeof setTimeout> | undefined, pending: Promise.resolve(false) };
  runs.set(bot, state);
  let failures = 0;
  async function launch(): Promise<boolean> {
    if (state.stopped) return false;
    try {
      health.set(bot!, 'Подключение');
      await bot!.launch({ dropPendingUpdates: false }, () => { failures = 0; health.set(bot!, 'Подключён'); });
      return true;
    } catch (error) {
      if (state.stopped) return false;
      const code = Number((error as { response?: { error_code?: number } })?.response?.error_code);
      health.set(bot!, `Ошибка ${code || 'сети'}${code === 401 || code === 409 ? ': проверь токен или второй экземпляр' : ': повторное подключение'}`);
      console.error(`Telegram polling failed (code=${code || 'network'}).`);
      if (code === 401 || code === 409) return false;
      const delay = Math.min(300000, 5000 * 2 ** Math.min(failures++, 6));
      state.timer = setTimeout(() => { state.pending = launch(); }, delay);
      state.timer.unref?.();
      return false;
    }
  }
  state.pending = launch();
  return state.pending;
}

export function stopTelegramBot(bot: Telegraf | null, signal = 'shutdown'): void {
  if (!bot) return;
  health.set(bot, 'Остановлен');
  const state = runs.get(bot);
  if (state) {
    state.stopped = true;
    if (state.timer) clearTimeout(state.timer);
  }
  try {
    bot.stop(signal);
  } catch (error) {
    console.warn('Failed to stop Telegram bot cleanly:', error);
  }
}
