import assert from 'node:assert/strict';
import test from 'node:test';
import { getReadinessLevel, previewTaskScore, scoreTask } from '../src/services/scoring.js';

const fullCard = {
  context: 'Компания описала текущий процесс.',
  need: 'Нужно устранить конкретную проблему.',
  users: 'Операторы и руководители.',
  data: 'Доступны таблицы продаж и журнал операций.',
  constraints: 'Только обезличенные данные.',
  expectedResult: 'Рабочий прототип для пилота.',
  successCriteria: 'Сократить время обработки на 20%.',
  businessContact: 'Айдана, aidana@example.test',
  interactionFormat: 'Еженедельная онлайн-встреча.',
};

test('empty and placeholder values get no false points', () => {
  const result = scoreTask({ confirmed: true, context: '', data: 'Требуется уточнение', users: null });
  assert.equal(result.score, 0);
  assert.equal(result.readinessLevel, 'Draft');
  assert.ok(result.missing.length > 0);
});

test('partial confirmed card scores only matching categories', () => {
  const result = scoreTask({ confirmed: true, context: 'Есть процесс.', need: 'Нужно его ускорить.', users: 'Операторы.' });
  assert.equal(result.score, 30);
  assert.equal(result.breakdown.find((item) => item.key === 'contextNeed').points, 20);
  assert.equal(result.breakdown.find((item) => item.key === 'users').points, 10);
  assert.ok(result.recommendations.some((item) => item.includes('данных')));
});

test('adding confirmed data grows score and removes its recommendation', () => {
  const before = scoreTask({ confirmed: true, context: 'Контекст.', need: 'Потребность.', users: 'Пользователи.' });
  const after = scoreTask({ confirmed: true, context: 'Контекст.', need: 'Потребность.', users: 'Пользователи.', data: 'История операций.' });
  assert.ok(after.score > before.score);
  assert.equal(after.breakdown.find((item) => item.key === 'data').points, 20);
  assert.equal(after.recommendations.some((item) => item.includes('источники данных')), false);
});

test('readiness boundaries are exact', () => {
  for (const [score, level] of [[39, 'Draft'], [40, 'Working'], [69, 'Working'], [70, 'Ready'], [89, 'Ready'], [90, 'Priority'], [100, 'Priority']]) {
    assert.equal(getReadinessLevel(score), level);
  }
});

test('complete confirmed card is capped at 100', () => {
  const result = scoreTask({ ...fullCard, confirmed: true });
  assert.equal(result.score, 100);
  assert.ok(result.score <= 100);
  assert.equal(result.recommendations.length, 0);
});

test('AI suggested fields do not score until confirmed', () => {
  assert.equal(scoreTask({ ...fullCard, confirmed: false }).score, 0);
  assert.equal(scoreTask({ ...fullCard, confirmedFields: ['data'] }).score, 20);
  assert.equal(previewTaskScore({ ...fullCard, confirmed: false }).score, 100);
});

test('confirmed edit recalculates score and recommendations', () => {
  const withoutCriteria = scoreTask({ ...fullCard, successCriteria: '', confirmed: true });
  const withCriteria = scoreTask({ ...fullCard, confirmed: true });
  assert.equal(withCriteria.score - withoutCriteria.score, 15);
  assert.ok(withoutCriteria.recommendations.some((item) => item.includes('критерии успеха')));
  assert.equal(withCriteria.recommendations.some((item) => item.includes('критерии успеха')), false);
});

test('a low-score task remains compatible with published catalog state', () => {
  const task = { title: 'Слабая карточка', need: 'Нужна помощь.', confirmed: true, status: 'published' };
  const result = scoreTask(task);
  assert.equal(result.score, 10);
  assert.equal(task.status, 'published');
});
