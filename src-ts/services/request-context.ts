import { AsyncLocalStorage } from 'node:async_hooks';
export interface RequestContext { userId?: string; channelId?: string; guildId?: string; priority: number }
const context = new AsyncLocalStorage<RequestContext>();
export const requestContext = () => context.getStore() || { priority: 3 };
export function withRequestContext<T>(value: RequestContext, run: () => T): T { return context.run(value, run); }
export function contextFromEvent(value: unknown): RequestContext {
  const event = value as { user?: { id?: string }; author?: { id?: string }; guildId?: string; guild?: { id?: string }; channelId?: string; channel?: { id?: string } } | null;
  const userId = event?.user?.id || event?.author?.id;
  return { userId, guildId: event?.guildId || event?.guild?.id, channelId: event?.channelId || event?.channel?.id, priority: userId ? 0 : 3 };
}
