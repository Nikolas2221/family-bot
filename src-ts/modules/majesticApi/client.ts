import { RateLimiter } from './rateLimiter';

export interface MajesticApiClientOptions {
  apiKey: string;
  baseUrl?: string;
  authHeaderName?: string;
  authScheme?: string | null;
  maxRequests?: number;
  windowMs?: number;
}

export class MajesticApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly statusText: string,
    public readonly body: string
  ) {
    super(`Majestic API ${status} ${statusText}: ${body.slice(0, 300)}`);
    this.name = 'MajesticApiError';
  }
}

export class MajesticApiClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly authHeaderName: string;
  private readonly authScheme: string;
  private readonly limiter: RateLimiter;

  constructor(options: MajesticApiClientOptions) {
    if (!options.apiKey) {
      throw new Error('MAJESTIC_API_KEY не задан.');
    }

    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl || 'https://api.majestic-files.net').replace(/\/+$/u, '');
    this.authHeaderName = options.authHeaderName || 'X-API-KEY';
    this.authScheme = options.authScheme === undefined ? '' : String(options.authScheme || '');
    this.limiter = new RateLimiter({
      maxRequests: options.maxRequests || 5,
      windowMs: options.windowMs || 60000
    });
  }

  async get<T>(path: string, searchParams?: Record<string, string | number>): Promise<T> {
    await this.limiter.acquire();

    const url = new URL(`${this.baseUrl}${path}`);
    for (const [key, value] of Object.entries(searchParams || {})) {
      url.searchParams.set(key, String(value));
    }

    const authValue = this.authScheme ? `${this.authScheme} ${this.apiKey}` : this.apiKey;
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        [this.authHeaderName]: authValue,
        Accept: 'application/json'
      }
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new MajesticApiError(response.status, response.statusText, body);
    }

    return await response.json() as T;
  }
}
