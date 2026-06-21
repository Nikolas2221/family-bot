const assert = require('node:assert/strict');
const { buildLawAnswer, getLawIndexStats, searchLaw } = require('../dist-ts/services/law');

async function main() {
  const stats = getLawIndexStats();
  assert.ok(stats.documents >= 20, 'law index should contain the supplied documents');
  assert.ok(stats.chunks >= 100, 'law index should be split into searchable chunks');

  const criminal = searchLaw('уголовная ответственность и преступление', 3);
  assert.ok(criminal.length > 0);
  assert.match(criminal[0].document, /Уголов|кодекс/iu);

  const answer = buildLawAnswer('кто может потребовать остановить транспорт');
  assert.equal(answer.found, true);
  assert.ok(answer.sources.every(source => source.url.startsWith('https://forum.majestic-rp.ru/')));

  const unknown = buildLawAnswer('квантовая телепортация на марсе');
  assert.equal(unknown.found, false);
  console.log('ALL LAW TESTS PASSED');
}

if (require.main === module) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { main };
