import '../config/env.mjs';
import { CARD_FIELDS, FIELD_LABELS, fallbackAnalyzeTask, validateAIResult } from './ai.js';

const model = process.env.OPENAI_MODEL;
const apiKey = process.env.OPENAI_API_KEY;
const reasoningEffort = process.env.OPENAI_REASONING_EFFORT || 'medium';
const timeoutMs = Number(process.env.OPENAI_TIMEOUT_MS || 30000);
const endpoint = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1/responses';

const schema = {
  type: 'object', additionalProperties: false, required: ['missingFields', 'questions', 'suggestedCard'],
  properties: {
    missingFields: { type: 'array', items: { type: 'string', enum: CARD_FIELDS } },
    questions: { type: 'array', maxItems: 6, items: { type: 'object', additionalProperties: false, required: ['field', 'text'], properties: { field: { type: 'string', enum: CARD_FIELDS }, text: { type: 'string' } } } },
    suggestedCard: { type: 'object', additionalProperties: false, required: CARD_FIELDS, properties: Object.fromEntries(CARD_FIELDS.map((field) => [field, { type: 'string' }])) },
  },
};

function inputFor(payload) {
  return JSON.stringify({
    originalDescription: payload.description || '',
    currentCard: payload.currentCard || {},
    previousQuestions: payload.previousQuestions || [],
    userAnswers: payload.answers || {},
    requiredFields: CARD_FIELDS.map((field) => ({ field, meaning: FIELD_LABELS[field] })),
  }, null, 2);
}

function instructions() {
  return `Ты AI-конструктор бизнес-задач. Анализируй только факты из входных данных. Не выдумывай бюджет, сроки, технологии, данные, контакты, пользователей, критерии успеха, ограничения или другие факты. Если факта нет, верни пустую строку и добавь поле в missingFields. Считай поле заполненным только если пользователь сообщил достаточно конкретную информацию. Если есть пропуски, сгенерируй минимум 3 вопроса только по реально отсутствующим или недостаточно конкретным полям. Если все обязательные поля уже заполнены достаточно, верни пустые missingFields и questions. В suggestedCard переноси только подтверждённые пользователем факты, сохраняя уже заполненные поля, если они не противоречат новым ответам. Каждый вопрос должен иметь field из requiredFields и быть уместным именно для этого пропуска.`;
}

function outputText(body) {
  if (typeof body?.output_text === 'string') return body.output_text;
  if (!Array.isArray(body?.output)) return '';
  return body.output.flatMap((item) => Array.isArray(item?.content) ? item.content : [])
    .filter((content) => content?.type === 'output_text' && typeof content.text === 'string')
    .map((content) => content.text)
    .join('');
}

async function callOpenAI(payload) {
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(endpoint, { method: 'POST', signal: controller.signal, headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model, reasoning: { effort: reasoningEffort }, store: false, input: [{ role: 'system', content: [{ type: 'input_text', text: instructions() }] }, { role: 'user', content: [{ type: 'input_text', text: inputFor(payload) }] }], text: { format: { type: 'json_schema', name: 'task_analysis', strict: true, schema } } }) });
    if (!response.ok) throw new Error(`OpenAI API ${response.status}`);
    const body = await response.json(); const raw = outputText(body);
    if (!raw) throw new Error('OpenAI returned an empty response');
    return validateAIResult({ ...JSON.parse(raw), source: 'openai' });
  } finally { clearTimeout(timer); }
}

export async function analyzeTask(payload) {
  if (!apiKey || !model) return { ...fallbackAnalyzeTask(payload), warning: 'OpenAI API не настроен. Укажите OPENAI_API_KEY и OPENAI_MODEL на backend.' };
  try { return await callOpenAI(payload); } catch (error) { console.warn(`AI service fallback: ${error.message}`); return { ...fallbackAnalyzeTask(payload), warning: `OpenAI API недоступен (${error.message}). Использован локальный fallback.` }; }
}

export { model, reasoningEffort };
