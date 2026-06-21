import type { LawSearchResult } from './law';

interface DeepSeekOptions {
  apiKey: string;
  baseUrl?: string;
  model?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
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
  const baseUrl = cleanBaseUrl(options.baseUrl || 'https://api.deepseek.com');
  const model = options.model || 'deepseek-chat';
  const timeoutMs = options.timeoutMs || 20_000;
  const fetchImpl = options.fetchImpl || fetch;

  async function answerLawQuestion(question: string, sources: LawSearchResult[]): Promise<string | null> {
    if (!apiKey || !sources.length) return null;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model,
          temperature: 0.15,
          max_tokens: 1000,
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

      if (!response.ok) {
        throw new Error(`DeepSeek HTTP ${response.status}`);
      }

      const payload = await response.json() as any;
      const content = String(payload?.choices?.[0]?.message?.content || '').trim();
      return content || null;
    } finally {
      clearTimeout(timeout);
    }
  }

  return { enabled: Boolean(apiKey), model, answerLawQuestion };
}
