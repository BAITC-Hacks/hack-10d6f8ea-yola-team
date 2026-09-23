import { emptyTask } from '../models.js';

export const CARD_FIELDS = ['title', 'context', 'need', 'users', 'data', 'constraints', 'expectedResult', 'successCriteria', 'businessContact', 'interactionFormat'];
export const FIELD_LABELS = {
  title: 'название задачи', context: 'контекст', need: 'потребность или проблему', users: 'целевых пользователей', data: 'доступные данные и материалы', constraints: 'ограничения', expectedResult: 'ожидаемый результат', successCriteria: 'критерии успеха', businessContact: 'контакт бизнеса', interactionFormat: 'формат взаимодействия и обратной связи',
};

const questionTemplates = {
  title: 'Как коротко назвать эту бизнес-задачу?',
  context: 'Что происходит сейчас и в каком бизнес-контексте возникла проблема?',
  need: 'Что именно нужно изменить или улучшить?',
  users: 'Кто будет основным пользователем будущего решения?',
  data: 'Какие данные, материалы или доступы уже есть для решения задачи?',
  constraints: 'Есть ли ограничения по срокам, бюджету, технологиям или безопасности?',
  expectedResult: 'Какой конкретный результат должен получить бизнес?',
  successCriteria: 'По каким измеримым показателям вы поймёте, что решение успешно?',
  businessContact: 'Кто со стороны бизнеса будет отвечать на вопросы команды?',
  interactionFormat: 'Как команда будет получать обратную связь от бизнеса?',
};

const contains = (text, patterns) => patterns.some((pattern) => pattern.test(text));

export function fallbackAnalyzeTask({ description = '', currentCard = {}, answers = {} } = {}) {
  const text = `${description} ${Object.values(currentCard).join(' ')} ${Object.values(answers).join(' ')}`.trim();
  const card = { ...emptyTask(), ...Object.fromEntries(CARD_FIELDS.map((field) => [field, ''])) };
  card.description = description.trim();
  card.need = description.trim();
  card.title = description.trim().split(/[.!?]/)[0].slice(0, 70);
  for (const field of CARD_FIELDS) if (typeof currentCard[field] === 'string' && currentCard[field].trim()) card[field] = currentCard[field].trim();
  for (const field of CARD_FIELDS) if (typeof answers[field] === 'string' && answers[field].trim()) card[field] = answers[field].trim();

  const knownByText = {
    context: contains(text, [/сеть/i, /магазин/i, /кофейн/i, /кампани/i, /бизнес/i, /сейчас/i]),
    users: contains(text, [/пользовател/i, /управляющ/i, /клиент/i, /сотрудник/i, /студент/i, /команд/i]),
    data: contains(text, [/данн/i, /таблиц/i, /api/i, /материал/i, /каталог/i, /база/i, /истори/i]),
    constraints: contains(text, [/огранич/i, /бюджет/i, /срок/i, /безопасн/i, /нельзя/i, /только/i]),
    expectedResult: contains(text, [/прототип/i, /сервис/i, /приложен/i, /отч[её]т/i, /дашборд/i, /прогноз/i, /решени/i]),
    successCriteria: contains(text, [/метрик/i, /процент/i, /снизить/i, /увеличить/i, /измерим/i, /успеш/i]),
    businessContact: contains(text, [/контакт/i, /почт/i, /телефон/i, /куратор/i, /менеджер/i, /отвечать/i]),
    interactionFormat: contains(text, [/созвон/i, /встреч/i, /чат/i, /обратн[а-яё]* связ/i, /еженедель/i]),
  };
  const usersMention = description.match(/пользовател(?:и|ей|ями)?\s*(?:будущей системы)?\s*[—:-]\s*([^.!?]+)/i)?.[1]?.trim();
  if (!card.users && usersMention) card.users = usersMention;
  if (!card.context && knownByText.context && description.trim()) card.context = description.trim();
  const missingFields = CARD_FIELDS.filter((field) => !card[field]);
  const questionFields = [...new Set(missingFields)].slice(0, 4);
  while (questionFields.length < 3) { const next = CARD_FIELDS.find((field) => !questionFields.includes(field)); if (!next) break; questionFields.push(next); }
  return { missingFields, questions: questionFields.map((field) => ({ field, text: questionTemplates[field] })), suggestedCard: card, source: 'fallback', warning: 'OpenAI API недоступен или ключ не настроен. Использован локальный fallback.' };
}

export function validateAIResult(value) {
  if (!value || typeof value !== 'object' || !Array.isArray(value.missingFields) || !Array.isArray(value.questions) || !value.suggestedCard || typeof value.suggestedCard !== 'object') throw new Error('AI returned an invalid task analysis shape');
  const suggestedCard = { ...emptyTask(), ...Object.fromEntries(CARD_FIELDS.map((field) => [field, ''])) };
  for (const field of CARD_FIELDS) { if (value.suggestedCard[field] !== undefined && value.suggestedCard[field] !== null && typeof value.suggestedCard[field] !== 'string') throw new Error(`AI field ${field} must be a string`); suggestedCard[field] = typeof value.suggestedCard[field] === 'string' ? value.suggestedCard[field].trim() : ''; }
  const questions = value.questions.filter((question) => question && typeof question.field === 'string' && CARD_FIELDS.includes(question.field) && typeof question.text === 'string' && question.text.trim()).slice(0, 6).map((question) => ({ field: question.field, text: question.text.trim() }));
  if (questions.length < 3) throw new Error('AI must return at least 3 clarification questions');
  const missingFields = [...new Set(value.missingFields.filter((field) => CARD_FIELDS.includes(field)))];
  return { missingFields, questions, suggestedCard, source: value.source || 'openai' };
}
