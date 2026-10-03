const TEXT_LIMIT = 4000;

// Keep generated HTML tags and entities intact, including across message boundaries.
export function splitTelegramText(text: string, html = false): string[] {
  if (!text) return [];
  const tokens = html ? text.match(/<[^>]+>|&(?:#\d+|#x[\da-f]+|[a-z]+);|[\s\S]/giu) || [] : Array.from(text);
  const chunks: string[] = [];
  const tags: Array<{ name: string; opening: string }> = [];
  const closingTags = () => tags.slice().reverse().map(tag => `</${tag.name}>`).join('');
  let chunk = '';
  let contentLength = 0;
  for (const token of tokens) {
    const opening = html ? token.match(/^<(b|i|code)>$/iu) : null;
    const closing = html ? token.match(/^<\/(b|i|code)>$/iu) : null;
    const reserve = closingTags().length + (opening ? `</${opening[1]}>`.length : 0);
    if (chunk.length + token.length + reserve > TEXT_LIMIT && contentLength) {
      chunks.push(chunk + closingTags());
      chunk = tags.map(tag => tag.opening).join('');
      contentLength = 0;
    }
    chunk += token;
    if (opening) tags.push({ name: opening[1], opening: token });
    else if (closing) tags.pop();
    else contentLength += token.length;
  }
  if (chunk) chunks.push(chunk + closingTags());
  return chunks;
}
