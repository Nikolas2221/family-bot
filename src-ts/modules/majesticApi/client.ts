import { RateLimiter } from './rateLimiter';

export interface MajesticApiClientOptions {
  apiKey: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
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
    super(`Majestic API HTTP ${status}`);
    this.name = 'MajesticApiError';
  }
}

export class MajesticApiClient {
  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly baseUrl: string;
  private readonly authHeaderName: string;
  private readonly authScheme: string;
  private readonly limiter: RateLimiter;

  constructor(options: MajesticApiClientOptions) {
    if (!options.apiKey) {
      throw new Error('MAJESTIC_API_KEY не задан.');
    }

    this.apiKey = options.apiKey;
    this.timeoutMs = Math.max(1, options.timeoutMs || 15000);
    this.fetchImpl = options.fetchImpl || fetch;
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
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const operation = async () => {
      const response = await this.fetchImpl(url.toString(), {
        method: 'GET', signal: controller.signal,
        headers: { [this.authHeaderName]: authValue, Accept: 'application/json' }
      });
      if (!response.ok) {
        // Raw provider content may contain private data; do not propagate it to logs/users.
        await response.body?.cancel().catch(() => undefined);
        throw new MajesticApiError(response.status, response.statusText, '');
      }
      return await response.json() as T;
    };
    try {
      return await Promise.race([operation(), new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(new Error('Majestic API timeout')); }, this.timeoutMs);
      })]);
    } finally { if (timer) clearTimeout(timer); }

  }
}
