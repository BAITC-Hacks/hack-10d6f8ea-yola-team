import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';

const validResult = {
  missingFields: ['data', 'constraints', 'successCriteria'],
  questions: [
    { field: 'data', text: 'Какие данные доступны?' },
    { field: 'constraints', text: 'Какие есть ограничения?' },
    { field: 'successCriteria', text: 'Как измерить успех?' },
  ],
  suggestedCard: { title: 'AI для магазина', context: 'Магазин', need: 'Нужен AI', users: '', data: '', constraints: '', expectedResult: '', successCriteria: '', businessContact: '', interactionFormat: '' },
};

test('AI service validates success and falls back for API failures', async (t) => {
  const mock = createServer(async (request, response) => {
    let raw = ''; for await (const chunk of request) raw += chunk;
    const model = JSON.parse(raw).model;
    if (model === 'test-timeout') { await new Promise((resolve) => setTimeout(resolve, 120)); }
    if (model === 'test-401') { response.writeHead(401); response.end('{}'); return; }
    if (model === 'test-429') { response.writeHead(429); response.end('{}'); return; }
    if (model === 'test-500') { response.writeHead(500); response.end('{}'); return; }
    response.writeHead(200, { 'Content-Type': 'application/json' });
    if (model === 'test-empty') response.end(JSON.stringify({ output_text: '' }));
    else if (model === 'test-malformed') response.end(JSON.stringify({ output_text: '{broken-json' }));
    else if (model === 'test-invalid-schema') response.end(JSON.stringify({ output_text: JSON.stringify({ missingFields: [], questions: [], suggestedCard: {} }) }));
    else response.end(JSON.stringify({ output_text: JSON.stringify(validResult) }));
  });
  await new Promise((resolve) => mock.listen(0, '127.0.0.1', resolve));
  t.after(() => mock.close());
  const port = mock.address().port;
  const previous = { key: process.env.OPENAI_API_KEY, model: process.env.OPENAI_MODEL, url: process.env.OPENAI_BASE_URL, timeout: process.env.OPENAI_TIMEOUT_MS };
  t.after(() => { process.env.OPENAI_API_KEY = previous.key; process.env.OPENAI_MODEL = previous.model; process.env.OPENAI_BASE_URL = previous.url; process.env.OPENAI_TIMEOUT_MS = previous.timeout; });
  process.env.OPENAI_API_KEY = 'test-key'; process.env.OPENAI_BASE_URL = `http://127.0.0.1:${port}/v1/responses`;

  for (const model of ['test-success', 'test-401', 'test-429', 'test-500', 'test-malformed', 'test-empty', 'test-invalid-schema', 'test-timeout']) {
    process.env.OPENAI_MODEL = model; process.env.OPENAI_TIMEOUT_MS = model === 'test-timeout' ? '20' : '1000';
    const service = await import(`../src/services/ai-server.mjs?case=${model}`);
    const result = await service.analyzeTask({ description: 'Нужен AI для магазина.', currentCard: {} });
    if (model === 'test-success') { assert.equal(result.source, 'openai'); assert.equal(result.questions.length, 3); }
    else { assert.equal(result.source, 'fallback'); assert.ok(result.questions.length >= 3); assert.match(result.warning, /fallback/i); }
  }
});
