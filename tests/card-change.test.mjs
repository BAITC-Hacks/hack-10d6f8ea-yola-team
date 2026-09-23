import assert from 'node:assert/strict';
import test from 'node:test';
import { createLastCardChange, getChangedCardFields } from '../src/services/card-change.js';

const confirmedCard = {
  confirmed: true,
  title: 'Прогноз спроса',
  context: 'Очереди в кофейнях в часы пик.',
  need: 'Нужно снизить время ожидания.',
  users: 'Управляющие кофеен.',
  data: '',
  constraints: '',
  expectedResult: '',
  successCriteria: '',
  businessContact: '',
  interactionFormat: '',
};

test('records the changed field, timestamp and score delta on explicit card change', () => {
  const after = { ...confirmedCard, data: 'История заказов за 12 месяцев.' };
  const change = createLastCardChange(confirmedCard, after, () => new Date('2026-09-23T11:24:00.000Z'));

  assert.deepEqual(change, {
    changedAt: '2026-09-23T11:24:00.000Z',
    fields: ['data'],
    scoreBefore: 30,
    scoreAfter: 50,
    scoreDelta: 20,
  });
});

test('records a text-only change even when the score stays the same', () => {
  const after = { ...confirmedCard, title: 'Прогнозирование спроса для кофеен' };
  const change = createLastCardChange(confirmedCard, after, () => new Date('2026-09-23T11:25:00.000Z'));

  assert.deepEqual(change.fields, ['title']);
  assert.equal(change.scoreDelta, 0);
});

test('records every changed editable field and ignores service fields', () => {
  const after = {
    ...confirmedCard,
    context: 'Обновлённый контекст.',
    successCriteria: 'Снизить ожидание на 20%.',
    score: 100,
    status: 'published',
  };

  assert.deepEqual(getChangedCardFields(confirmedCard, after), ['context', 'successCriteria']);
});

test('does not create an event for whitespace-only or absent changes', () => {
  assert.equal(createLastCardChange(confirmedCard, { ...confirmedCard, context: '  Очереди в кофейнях в часы пик.  ' }), null);
  assert.equal(createLastCardChange(confirmedCard, confirmedCard), null);
});
