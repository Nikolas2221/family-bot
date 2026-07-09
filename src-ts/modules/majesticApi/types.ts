export interface MajesticApiResponse<T> {
  code: number;
  status: boolean;
  result: T | null;
}

export interface MarketplaceStatEntry {
  model?: string;
  modelName?: string;
  name?: string;
  totalCount?: number;
  soldCount?: number;
  averagePrice?: number;
  minPrice?: number;
  maxPrice?: number;
  [key: string]: unknown;
}

export interface MarketplaceStatsResult {
  serverId: string;
  serverName: string;
  vehicleStatistics?: MarketplaceStatEntry[];
  itemStatistics?: MarketplaceStatEntry[];
  houseStatistics?: MarketplaceStatEntry[];
  apartmentStatistics?: MarketplaceStatEntry[];
  warehouseStatistics?: MarketplaceStatEntry[];
  officeStatistics?: MarketplaceStatEntry[];
  clothesStatistics?: MarketplaceStatEntry[];
  [key: string]: unknown;
}

export type MarketplaceCategory =
  | 'vehicles'
  | 'items'
  | 'houses'
  | 'apartments'
  | 'warehouses'
  | 'offices'
  | 'clothes';
