const assert = require('node:assert/strict');
const { buildAnswerQualityInstructions } = require('../dist-ts/services/answer-quality');
const { createAIService } = require('../dist-ts/ai');
const { getReleaseNotes } = require('../dist-ts/release-notes');

async function main() {
  const prompts = [];
  const ai = createAIService({ enabled: true, chatCompletion: {
    enabled: true, model: 'test', chat: async messages => { prompts.push(messages); return 'Answer'; }
  } });
  for (const question of ['Что такое массив?', 'В JavaScript массив только из чисел?',
    'Нумерация массивов всегда с нуля?', 'Какие сейчас цены?', 'Составь объявление']) {
    await ai.aiText('Keep requested format', question);
  }
  for (const messages of prompts) {
    const system = messages[0].content;
    assert.match(system, /Не превращай частный случай/);
    assert.match(system, /Не выбирай их молча/);
    assert.match(system, /Кратко по умолчанию/);
    assert.match(system, /Сохраняй явно запрошенный формат/);
  }
  assert.match(prompts[0][0].content, /JavaScript допускает/);
  assert.match(prompts[2][0].content, /Lua\/MATLAB/);
  assert.doesNotMatch(buildAnswerQualityInstructions('Составь объявление'), /Lua\/MATLAB/);
  const notes = getReleaseNotes('1.4.0');
  assert.ok(notes && notes.added.length && notes.updated.length && notes.fixed.length);
  assert.match(notes.updated.join(' '), /инструкции ИИ/);
  console.log('PASS answer quality instructions reach model, cover array exceptions and preserve requested format; release 1.4.0 filled');
}
module.exports = { main };
