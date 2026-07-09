export interface RateLimiterOptions {
  maxRequests: number;
  windowMs: number;
}

export class RateLimiter {
  private readonly maxRequests: number;
  private readonly windowMs: number;
  private timestamps: number[] = [];
  private queue: Array<() => void> = [];
  private draining = false;

  constructor(options: RateLimiterOptions) {
    this.maxRequests = Math.max(1, Number(options.maxRequests) || 1);
    this.windowMs = Math.max(1000, Number(options.windowMs) || 60000);
  }

  async acquire(): Promise<void> {
    return new Promise(resolve => {
      this.queue.push(resolve);
      this.drain();
    });
  }

  private drain(): void {
    if (this.draining) return;
    this.draining = true;
    this.tick();
  }

  private tick(): void {
    if (!this.queue.length) {
      this.draining = false;
      return;
    }

    const now = Date.now();
    this.timestamps = this.timestamps.filter(timestamp => now - timestamp < this.windowMs);

    if (this.timestamps.length < this.maxRequests) {
      const resolve = this.queue.shift();
      if (resolve) {
        this.timestamps.push(now);
        resolve();
      }
      this.tick();
      return;
    }

    const oldest = this.timestamps[0] || now;
    setTimeout(() => this.tick(), Math.max(25, this.windowMs - (now - oldest) + 25));
  }
}
