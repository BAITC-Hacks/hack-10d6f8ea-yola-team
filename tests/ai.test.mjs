import assert from 'node:assert/strict';
import test from 'node:test';
import { CARD_FIELDS, fallbackAnalyzeTask, validateAIResult } from '../src/services/ai.js';

test('weak description gets dynamic questions and missing fields', () => {
  const result = fallbackAnalyzeTask({ description: 'Нужен AI для магазина.', currentCard: { title: '', need: '' } });
  assert.equal(result.suggestedCard.title, 'Нужен AI для магазина');
  assert.equal(result.suggestedCard.need, 'Нужен AI для магазина.');
  assert.ok(result.missingFields.includes('users'));
  assert.ok(result.questions.length >= 3);
  assert.ok(result.questions.some((question) => question.field === 'users'));
});

test('known users are not asked again', () => {
  const result = fallbackAnalyzeTask({ description: 'Мы сеть кофеен. В часы пик очереди.', currentCard: { users: 'Управляющие кофеен.' } });
  assert.equal(result.questions.some((question) => question.field === 'users'), false);
  assert.ok(result.questions.some((question) => question.field === 'data'));
});

test('answers enrich the card without inventing unspecified facts', () => {
  const result = fallbackAnalyzeTask({ description: 'Есть очереди в кофейнях.', answers: { data: 'История заказов за 12 месяцев.', expectedResult: 'Система прогнозирования загруженности кофеен.', successCriteria: 'Снизить среднее время ожидания минимум на 20%.' } });
  assert.equal(result.suggestedCard.data, 'История заказов за 12 месяцев.');
  assert.equal(result.suggestedCard.expectedResult, 'Система прогнозирования загруженности кофеен.');
  assert.equal(result.suggestedCard.businessContact, '');
  assert.equal(result.suggestedCard.constraints, '');
  assert.deepEqual(Object.keys(result.suggestedCard).filter((field) => CARD_FIELDS.includes(field)).sort(), [...CARD_FIELDS].sort());
});

test('AI validation rejects malformed output and accepts the expected contract', () => {
  assert.throws(() => validateAIResult({ missingFields: [], questions: [], suggestedCard: {} }));
  const valid = validateAIResult({ missingFields: ['users'], questions: [{ field: 'users', text: 'Кто пользователь?' }, { field: 'data', text: 'Какие данные есть?' }, { field: 'successCriteria', text: 'Как измерить успех?' }], suggestedCard: { title: 'Задача', context: '', need: 'Нужно решить', users: '', data: '', constraints: '', expectedResult: '', successCriteria: '', businessContact: '', interactionFormat: '' } });
  assert.equal(valid.questions.length, 3);
  assert.equal(valid.suggestedCard.title, 'Задача');
});
