import type { LawSearchResult } from './law';

interface DeepSeekOptions {
  apiKey: string;
  baseUrl?: string;
  model?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  referer?: string; // for OpenRouter
}

function cleanBaseUrl(value: string): string {
  return value.replace(/\/+$/u, '');
}

function buildSources(sources: LawSearchResult[]): string {
  return sources.map((source, index) => [
    `[${index + 1}] ${source.document} — ${source.heading}`,
    source.excerpt,
    `Ссылка: ${source.url}`
  ].join('\n')).join('\n\n');
}

export function createDeepSeekService(options: DeepSeekOptions) {
  const apiKey = String(options.apiKey || '').trim();
  // Use OpenRouter as the default provider
  const baseUrl = cleanBaseUrl(options.baseUrl || 'https://openrouter.ai/api/v1');
  const model = options.model || 'openai/gpt-4o-mini';
  const timeoutMs = options.timeoutMs || 10_000;
  const fetchImpl = options.fetchImpl || fetch;
  const referer = options.referer || 'https://github.com/your-repo';

  async function answerLawQuestion(question: string, sources: LawSearchResult[]): Promise<string | null> {
    if (!apiKey || !sources.length) return null;

    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const request = fetchImpl(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': referer // optional but recommended by OpenRouter
        },
        body: JSON.stringify({
          model,
          temperature: 0.15,
          max_tokens: 800,
          messages: [
            {
              role: 'system',
              content: [
                'Ты юридический ассистент игрового сервера Majestic RP.',
                'Отвечай только по переданным выдержкам. Не придумывай статьи, наказания и полномочия.',
                'Пиши по-русски, подробно и понятно: короткий вывод, условия, возможное нарушение и практический совет.',
                'Ссылайся на источники обозначениями [1], [2], [3]. Если данных недостаточно, прямо скажи об этом.'
              ].join(' ')
            },
            {
              role: 'user',
              content: `Вопрос: ${question}\n\nИсточники:\n${buildSources(sources)}`
            }
          ]
        }),
        signal: controller.signal
      });
      const hardTimeout = new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => {
          controller.abort();
          reject(new Error(`OpenRouter timeout after ${timeoutMs}ms`));
        }, timeoutMs);
      });
      const response = await Promise.race([request, hardTimeout]);

      if (!response.ok) {
        throw new Error(`OpenRouter HTTP ${response.status}`);
      }

      const payload = await response.json() as any;
      const content = String(payload?.choices?.[0]?.message?.content || '').trim();
      return content || null;
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  return { enabled: Boolean(apiKey), model, answerLawQuestion };
}

// New generic OpenRouter chat completion
export function createOpenRouterChatCompletion(options: DeepSeekOptions) {
  const apiKey = String(options.apiKey || '').trim();
  const baseUrl = cleanBaseUrl(options.baseUrl || 'https://openrouter.ai/api/v1');
  const model = options.model || 'openai/gpt-4o-mini';
  const timeoutMs = options.timeoutMs || 10_000;
  const fetchImpl = options.fetchImpl || fetch;
  const referer = options.referer || 'https://github.com/your-repo';

  async function chat(messages: Array<{ role: string; content: string }>): Promise<string | null> {
    if (!apiKey) return null;

    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const request = fetchImpl(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': referer
        },
        body: JSON.stringify({
          model,
          temperature: 0.7,
          max_tokens: 1024,
          messages
        }),
        signal: controller.signal
      });
      const hardTimeout = new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => {
          controller.abort();
          reject(new Error(`OpenRouter timeout after ${timeoutMs}ms`));
        }, timeoutMs);
      });
      const response = await Promise.race([request, hardTimeout]);

      if (!response.ok) {
        throw new Error(`OpenRouter HTTP ${response.status}`);
      }

      const payload = await response.json() as any;
      const content = String(payload?.choices?.[0]?.message?.content || '').trim();
      return content || null;
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  return { chat };
}
