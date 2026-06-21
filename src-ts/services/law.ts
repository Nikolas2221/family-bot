import lawIndex from '../data/majestic-law.json';

interface LawChunk {
  id: string;
  document: string;
  heading: string;
  text: string;
  url: string;
}

export interface LawSearchResult extends LawChunk {
  score: number;
  excerpt: string;
}

const STOP_WORDS = new Set([
  'а', 'без', 'бы', 'в', 'во', 'для', 'до', 'его', 'ее', 'если', 'же', 'за', 'и', 'из', 'или',
  'их', 'к', 'как', 'кто', 'ли', 'мне', 'может', 'на', 'над', 'не', 'но', 'о', 'об', 'от', 'по',
  'при', 'с', 'со', 'так', 'то', 'у', 'что', 'это'
]);

const SYNONYMS: Record<string, string[]> = {
  авто: ['автомобил', 'транспорт', 'машин'],
  машина: ['автомобил', 'транспорт'],
  полицейский: ['сотрудник', 'правоохранител', 'полици'],
  полиция: ['правоохранител', 'полицейск'],
  остановить: ['остановк', 'останов'],
  обыск: ['досмотр', 'обыск'],
  задержать: ['задержан', 'задерж'],
  адвокат: ['защитник', 'адвокат'],
  штраф: ['административ', 'штраф'],
  госник: ['государственн', 'сотрудник', 'должностн', 'правоохранител'],
  предъявить: ['требован', 'нарушен', 'основан', 'обязан'],
  пулемет: ['оруж', 'вооружен', 'спецоруж', 'служебн'],
  мк2: ['оруж', 'служебн', 'спецоруж'],
  mk2: ['оруж', 'служебн', 'спецоруж']
};

function normalize(value: string): string {
  return value.toLowerCase()
    .replace(/ё/gu, 'е')
    .replace(/[^a-zа-я0-9.\s-]/giu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

function stem(token: string): string {
  if (/^\d+(?:\.\d+)*$/u.test(token)) return token;
  if (token.length <= 4) return token;
  return token.replace(/(?:иями|ями|ами|ого|ему|ому|ыми|ими|иях|ах|ях|ия|ья|ий|ый|ой|ая|яя|ое|ее|ые|ие|ов|ев|ам|ям|ом|ем|ы|и|а|я|у|ю|е|о)$/u, '');
}

function tokenize(value: string): string[] {
  const normalized = normalize(value);
  const base = normalized.split(' ').filter(token => token.length > 1 && !STOP_WORDS.has(token));
  const intentTerms: string[] = [];
  if (/(распив|алкогол|спирт)/u.test(normalized)) intentTerms.push('алкогольн', 'спиртн', 'употреблен', 'общественн');
  if (/(территор).*(вид|тип|классиф)|(?:вид|тип|классиф).*(территор)/u.test(normalized)) intentTerms.push('статус', 'охраняем', 'особо', 'публичн');
  if (/(охраняем|проник|доступ|закрыт).*(территор|объект)|(?:территор|объект).*(охраняем|проник|доступ|закрыт)/u.test(normalized)) intentTerms.push('охраняем', 'доступ', 'проникновен', 'объект');
  if (/(оруж|пулемет|автомат|мк\s*2|mk\s*2)/u.test(normalized)) intentTerms.push('служебн', 'оруж', 'ношен', 'исполнен', 'силов');
  const expanded = [...base.flatMap(token => [token, ...(SYNONYMS[token] || [])]), ...intentTerms];
  return [...new Set(expanded.map(stem).filter(token => token.length > 1))];
}

function intentBoost(question: string, chunk: LawChunk): number {
  const query = normalize(question);
  const document = normalize(chunk.document);
  const body = normalize(`${chunk.heading} ${chunk.text}`);
  let score = 0;

  if (/(оруж|пулемет|автомат|мк\s*2|mk\s*2)/u.test(query) && /оборот.*оруж/u.test(document)) score += 24;
  if (/(территор).*(вид|тип|классиф)|(?:вид|тип|классиф).*(территор)/u.test(query) && /статус.*территор/u.test(document)) score += 24;
  if (/(территор).*(вид|тип|классиф)|(?:вид|тип|классиф).*(территор)/u.test(query) && /общие положен/u.test(normalize(chunk.heading))) score += 14;
  if (/(охраняем|проник|доступ).*(территор|объект)|(?:территор|объект).*(охраняем|проник|доступ)/u.test(query) && /статус.*территор/u.test(document)) score += 20;
  if (/(распив|алкогол|спирт)/u.test(query) && /(употреблен.*спирт|общественн.*алкогол|алкогол.*опьянен)/u.test(body)) score += 22;
  if (/(распив|алкогол|спирт)/u.test(query) && /административн.*кодекс/u.test(document)) score += 12;
  if (/(распив|алкогол|спирт)/u.test(query) && /уголовн.*кодекс/u.test(document) && !/(преступ|напад|убий|ограб)/u.test(query)) score -= 12;
  return score;
}

function buildExcerpt(text: string, terms: string[]): string {
  const normalized = normalize(text);
  let position = 0;
  for (const term of terms) {
    const found = normalized.indexOf(term);
    if (found >= 0 && (position === 0 || found < position)) position = found;
  }
  const start = Math.max(0, position - 120);
  const excerpt = text.slice(start, start + 650).trim();
  return `${start > 0 ? '…' : ''}${excerpt}${start + 650 < text.length ? '…' : ''}`;
}

export function searchLaw(question: string, limit = 3): LawSearchResult[] {
  const terms = tokenize(question);
  if (!terms.length) return [];

  return (lawIndex.chunks as LawChunk[])
    .map(chunk => {
      const title = normalize(`${chunk.document} ${chunk.heading}`);
      const body = normalize(chunk.text);
      const matched = terms.filter(term => title.includes(term) || body.includes(term));
      const phraseBonus = body.includes(normalize(question)) ? 12 : 0;
      const articleBonus = terms.some(term => /^\d+(?:\.\d+)*$/u.test(term) && title.includes(term)) ? 8 : 0;
      const titleHits = matched.filter(term => title.includes(term)).length;
      const coverage = matched.length / terms.length;
      const score = matched.length * 2 + titleHits * 3 + coverage * 8 + phraseBonus + articleBonus + intentBoost(question, chunk);
      return { ...chunk, score, excerpt: buildExcerpt(chunk.text, matched) };
    })
    .filter(result => result.score >= 6)
    .sort((a, b) => b.score - a.score)
    .filter((result, index, all) => all.findIndex(candidate => candidate.document === result.document && candidate.heading === result.heading) === index)
    .filter((result, _index, all) => result.score >= all[0].score * 0.65)
    .slice(0, Math.max(1, limit));
}

export function buildLawAnswer(question: string): { found: boolean; title: string; description: string; sources: LawSearchResult[] } {
  const sources = searchLaw(question, 3);
  if (!sources.length) {
    return {
      found: false,
      title: 'Точная норма не найдена',
      description: 'Переформулируй вопрос или укажи кодекс и номер статьи. Я не буду придумывать ответ без подходящего источника.',
      sources: []
    };
  }

  const primary = sources[0];
  const normalizedQuestion = normalize(question);
  let conclusion = 'По вопросу применимы несколько норм. Сначала уточни фактические обстоятельства, затем сопоставь их с условиями каждой статьи ниже.';
  if (/(оруж|пулемет|мк2|mk2|автомат)/u.test(normalizedQuestion)) {
    conclusion = 'Сам по себе факт наличия оружия ещё не доказывает нарушение. Нужно проверить право сотрудника на этот вид оружия, нахождение при исполнении, порядок ношения и основания для применения.';
  } else if (/(территор).*(вид|тип|классиф)|(?:вид|тип|классиф).*(территор)/u.test(normalizedQuestion)) {
    conclusion = 'Закон выделяет четыре статуса: закрытая, охраняемая, особо охраняемая территория и территория с особым статусом. У каждого статуса свой режим доступа.';
  } else if (/(охраняем|проник|доступ).*(территор|объект)|(?:территор|объект).*(охраняем|проник|доступ)/u.test(normalizedQuestion)) {
    conclusion = 'На охраняемую территорию допускают при правомерной цели. При нарушении порядка или отсутствии такой цели уполномоченный сотрудник может потребовать покинуть территорию; дальнейшая ответственность зависит от конкретного нарушения.';
  } else if (/(распив|алкогол|спирт)/u.test(normalizedQuestion)) {
    conclusion = 'В общественном месте распивать алкоголь нельзя. Административный кодекс относит это к неприемлемому виду и предусматривает штраф; для частной территории нужно отдельно смотреть её правила и статус.';
  } else if (/(останов|транспорт|машин|авто)/u.test(normalizedQuestion)) {
    conclusion = 'Требование остановить транспорт законно не во всех случаях: значение имеют полномочия органа, нахождение сотрудника при исполнении и предусмотренное законом основание.';
  } else if (/(обыск|досмотр|задерж)/u.test(normalizedQuestion)) {
    conclusion = 'Законность процедуры зависит от основания, полномочий сотрудника и соблюдения процессуального порядка. Проверь каждый из этих пунктов по нормам ниже.';
  }

  const findings = sources.map((source, index) => {
    const link = source.url ? `[${source.heading}](${source.url})` : `**${source.heading}**`;
    return `**${index + 1}. ${source.document}**\n${source.excerpt}\n${link}`;
  }).join('\n\n');

  return {
    found: true,
    title: 'Ответ ассистента',
    description: [
      `**Короткий вывод**\n${conclusion}`,
      '**Что говорит законодательная база**',
      findings,
      `**Основная норма:** ${primary.document}, ${primary.heading}`,
      '*Ответ основан на сохранённой базе Majestic RP. Для наказания или жалобы сверяй факты с полной редакцией нормы по ссылке.*'
    ].join('\n\n').slice(0, 4000),
    sources
  };
}

export function getLawIndexStats() {
  return { documents: lawIndex.documentCount, chunks: lawIndex.chunkCount, generatedAt: lawIndex.generatedAt };
}

interface LawAiService {
  answerLawQuestion(question: string, sources: LawSearchResult[]): Promise<string | null>;
}

export function createLawService(ai?: LawAiService | null) {
  async function answer(question: string) {
    const local = buildLawAnswer(question);
    if (!local.found || !ai) return local;

    try {
      const generated = await ai.answerLawQuestion(question, local.sources);
      if (!generated) return local;
      const sourceLinks = local.sources.map((source, index) =>
        source.url
          ? `[${index + 1}] [${source.document}, ${source.heading}](${source.url})`
          : `[${index + 1}] ${source.document}, ${source.heading}`
      ).join('\n');
      const suffix = `\n\n**Источники**\n${sourceLinks}\n\n*Ответ сформирован по сохранённой базе Majestic RP.*`;
      const maxGeneratedLength = Math.max(500, 4000 - suffix.length);
      return {
        ...local,
        title: 'Ответ ассистента DeepSeek',
        description: `${generated.slice(0, maxGeneratedLength)}${suffix}`
      };
    } catch (error: any) {
      console.error(`[deepseek] Law answer failed: ${error?.message || 'unknown error'}`);
      return local;
    }
  }

  return { search: searchLaw, answer, stats: getLawIndexStats };
}
