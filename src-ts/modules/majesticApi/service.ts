import { EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { MajesticApiClient } from './client';
import type { MajesticApiResponse, MarketplaceCategory, MarketplaceStatsResult, MarketplaceStatEntry } from './types';

export interface MajesticApiServiceConfig {
  enabled: boolean;
  apiKey: string;
  baseUrl: string;
  authHeaderName: string;
  authScheme: string;
  serverId: string;
  allowedRoleIds: string[];
}

const CATEGORY_LABELS: Record<MarketplaceCategory, string> = {
  vehicles: 'Транспорт',
  items: 'Предметы',
  houses: 'Дома',
  apartments: 'Квартиры',
  warehouses: 'Склады',
  offices: 'Офисы',
  clothes: 'Одежда'
};

const RESULT_KEYS: Record<MarketplaceCategory, keyof MarketplaceStatsResult> = {
  vehicles: 'vehicleStatistics',
  items: 'itemStatistics',
  houses: 'houseStatistics',
  apartments: 'apartmentStatistics',
  warehouses: 'warehouseStatistics',
  offices: 'officeStatistics',
  clothes: 'clothesStatistics'
};

function formatNumber(value: unknown): string {
  const number = Number(value);
  return Number.isFinite(number) ? number.toLocaleString('ru-RU') : '0';
}

function getEntryName(entry: MarketplaceStatEntry): string {
  return String(entry.modelName || entry.name || entry.model || 'Без названия');
}

export class MajesticApiService {
  private readonly config: MajesticApiServiceConfig;
  private readonly client: MajesticApiClient | null;

  constructor(config: MajesticApiServiceConfig) {
    this.config = config;
    this.client = config.enabled && config.apiKey
      ? new MajesticApiClient({
          apiKey: config.apiKey,
          baseUrl: config.baseUrl,
          authHeaderName: config.authHeaderName,
          authScheme: config.authScheme,
          maxRequests: 5,
          windowMs: 60000
        })
      : null;
  }

  isEnabled(): boolean {
    return Boolean(this.config.enabled && this.client);
  }

  status(): string {
    if (!this.config.enabled) return 'Majestic API выключен: MAJESTIC_API_ENABLED не true.';
    if (!this.config.apiKey) return 'Majestic API не настроен: добавь MAJESTIC_API_KEY в Railway.';
    return `Majestic API включён. Сервер по умолчанию: ${this.config.serverId}.`;
  }

  canUse(member: any, permissions: any): boolean {
    if (permissions?.has?.(PermissionFlagsBits.Administrator)) return true;
    if (!this.config.allowedRoleIds.length) return Boolean(permissions?.has?.(8n));
    return this.config.allowedRoleIds.some(roleId => member?.roles?.cache?.has?.(roleId));
  }

  async marketplace(category: MarketplaceCategory, serverId?: string): Promise<{ embed: EmbedBuilder }> {
    if (!this.client) {
      throw new Error(this.status());
    }

    const server = String(serverId || this.config.serverId || 'RU14').trim();
    const response = await this.client.get<MajesticApiResponse<MarketplaceStatsResult>>(`/v1/ext/marketplace/${category}/${server}`);
    const result = response.result;
    const entries = ((result?.[RESULT_KEYS[category]] || []) as MarketplaceStatEntry[]).slice(0, 10);

    const description = entries.length
      ? entries.map((entry, index) => [
          `**${index + 1}. ${getEntryName(entry)}**`,
          `Всего: ${formatNumber(entry.totalCount)} • Продано: ${formatNumber(entry.soldCount)}`,
          `Цена: мин. ${formatNumber(entry.minPrice)} • сред. ${formatNumber(entry.averagePrice)} • макс. ${formatNumber(entry.maxPrice)}`
        ].join('\n')).join('\n\n')
      : 'API вернул пустой список по этой категории.';

    const embed = new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle(`📊 Marketplace • ${CATEGORY_LABELS[category]} • ${server}`)
      .setDescription(description.slice(0, 3900))
      .setFooter({ text: `Majestic API • найдено: ${((result?.[RESULT_KEYS[category]] || []) as unknown[]).length}` })
      .setTimestamp();

    return { embed };
  }
}

export function createMajesticApiService(config: MajesticApiServiceConfig): MajesticApiService {
  return new MajesticApiService(config);
}

export { CATEGORY_LABELS };
