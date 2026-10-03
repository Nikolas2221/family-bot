import type { CardAppearance, GuildVisuals } from './types';

export const CARD_CATEGORIES = ['updates', 'applications', 'family', 'welcome', 'reports', 'moderation'] as const;

export function cardCategory(method: string): string | null {
  if (/UpdateAnnouncement/u.test(method)) return 'updates';
  if (/Application|AcceptLog|RejectLog/u.test(method)) return 'applications';
  if (/Welcome/u.test(method)) return 'welcome';
  if (/Report/u.test(method)) return 'reports';
  if (/Warn|Commend|Discipline|Security|Ban|Mute/u.test(method)) return 'moderation';
  if (/Family|Profile|Leaderboard|Top/u.test(method)) return 'family';
  return null;
}

export function applyCardStyle(embed: any, style: CardAppearance = {}): any {
  if (!embed || typeof embed.setColor !== 'function') return embed;
  if (style.title) embed.setTitle(style.title.slice(0, 256));
  if (/^#[0-9a-f]{6}$/iu.test(style.color || '')) embed.setColor(parseInt(style.color!.slice(1), 16));
  if (style.imageUrl && /^https:\/\//iu.test(style.imageUrl)) embed.setImage(style.imageUrl);
  if (style.thumbnailUrl && /^https:\/\//iu.test(style.thumbnailUrl)) embed.setThumbnail(style.thumbnailUrl);
  if (style.footer) embed.setFooter({ text: style.footer.slice(0, 500) });
  return embed;
}

export function createStyledEmbeds(base: Record<string, any>, getVisuals: () => GuildVisuals): Record<string, any> {
  const styled = { ...base };
  for (const [method, factory] of Object.entries(base)) {
    const category = cardCategory(method);
    if (!category || typeof factory !== 'function' || !/Embeds?$/u.test(method)) continue;
    styled[method] = (...args: any[]) => {
      const apply = (value: any) => Array.isArray(value)
        ? value.map(embed => applyCardStyle(embed, getVisuals().cards?.[category]?.discord))
        : applyCardStyle(value, getVisuals().cards?.[category]?.discord);
      const value = factory(...args);
      return value?.then ? value.then(apply) : apply(value);
    };
  }
  return styled;
}
