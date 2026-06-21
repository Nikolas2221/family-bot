const fs = require('node:fs');
const path = require('node:path');
const AdmZip = require('adm-zip');
const cheerio = require('cheerio');

const inputPath = path.resolve(process.argv[2] || 'knowledge/majestic-sources.zip');
const outputPath = path.resolve(process.argv[3] || 'src-ts/data/majestic-law.json');

function cleanText(value) {
  return String(value || '')
    .replace(/\u200b|\u200c|\u200d|\ufeff/g, '')
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function htmlToText(html) {
  const $ = cheerio.load(`<main>${html}</main>`);
  $('script, style, noscript, iframe').remove();
  $('br').replaceWith('\n');
  $('p, div, li, h1, h2, h3, h4, blockquote, tr').each((_, node) => {
    $(node).append('\n');
  });
  return cleanText($('main').text());
}

function splitIntoChunks(text) {
  const lines = text.split('\n').map(cleanText).filter(Boolean);
  const chunks = [];
  let current = [];
  let heading = '';

  function flush() {
    const body = cleanText(current.join('\n'));
    if (body.length >= 40) chunks.push({ heading: heading || 'Общие положения', text: body });
    current = [];
  }

  for (const line of lines) {
    const isHeading = /^(?:статья|глава|раздел|часть|параграф|§)\s*[№#]?\s*[\dIVXLCА-Я]/iu.test(line);
    if (isHeading && current.length) flush();
    if (isHeading) heading = line.slice(0, 180);
    current.push(line);
    if (current.join('\n').length >= 1800) flush();
  }
  flush();
  return chunks;
}

function parseDocument(buffer, fallbackName) {
  const html = buffer.toString('utf8');
  const $ = cheerio.load(html);
  const title = cleanText($('title').first().text()).replace(/\s*\|\s*Majestic Role Play Forum.*$/iu, '');
  const canonical = $('link[rel="canonical"]').attr('href')
    || $('meta[property="og:url"]').attr('content')
    || '';
  const bodies = $('.message-body .bbWrapper').map((_, node) => $.html(node)).get();
  const text = htmlToText(bodies.join('\n'));

  if (!title || text.length < 80) {
    throw new Error(`No legal text found in ${fallbackName}`);
  }

  return {
    title,
    url: canonical.replace(/\?amp=1$/u, ''),
    chunks: splitIntoChunks(text)
  };
}

function readInputs(input) {
  if (/\.zip$/iu.test(input)) {
    return new AdmZip(input).getEntries()
      .filter(entry => !entry.isDirectory && /\.html?$/iu.test(entry.entryName))
      .map(entry => ({ name: entry.entryName, buffer: entry.getData() }));
  }

  return fs.readdirSync(input, { recursive: true, withFileTypes: true })
    .filter(entry => entry.isFile() && /\.html?$/iu.test(entry.name))
    .map(entry => ({
      name: entry.name,
      buffer: fs.readFileSync(path.join(entry.parentPath || entry.path, entry.name))
    }));
}

const documents = readInputs(inputPath).map(entry => parseDocument(entry.buffer, entry.name));
const chunks = documents.flatMap((document, documentIndex) => document.chunks.map((chunk, chunkIndex) => ({
  id: `${documentIndex + 1}-${chunkIndex + 1}`,
  document: document.title,
  heading: chunk.heading,
  text: chunk.text,
  url: document.url
})));

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify({
  generatedAt: new Date().toISOString(),
  source: 'Majestic Role Play Forum',
  documentCount: documents.length,
  chunkCount: chunks.length,
  chunks
}, null, 2)}\n`);

console.log(`Imported ${documents.length} documents and ${chunks.length} chunks into ${outputPath}`);
