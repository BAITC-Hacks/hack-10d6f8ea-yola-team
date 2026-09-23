import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeStoreData } from '../src/store.js';

test('invalid persisted root safely restores complete demo collections', () => {
  const store = normalizeStoreData('broken');
  assert.ok(store.tasks.length >= 5);
  assert.ok(store.teams.length >= 5);
  assert.ok(store.proposals.length >= 5);
  assert.deepEqual(store.profiles, { business: null, student: null });
});

test('persisted tasks are normalized and stale score is recalculated', () => {
  const store = normalizeStoreData({
    tasks: [{ id: 'custom-task', title: 'Задача', need: 'Нужна помощь', confirmed: true, status: 'published', score: 999, readinessLevel: 'Priority' }],
    teams: [{ id: 'custom-team', name: 'Команда' }],
    proposals: [{ id: 'proposal-1', taskId: 'custom-task', teamId: 'custom-team', status: 'unknown' }],
    profiles: { business: 'invalid', student: { name: 'Батыр' } },
    currentRole: 'hacker',
  });
  assert.equal(store.tasks[0].score, 10);
  assert.equal(store.tasks[0].readinessLevel, 'Draft');
  assert.equal(store.proposals[0].status, 'pending');
  assert.equal(store.profiles.business, null);
  assert.equal(store.profiles.student.name, 'Батыр');
  assert.equal(store.currentRole, null);
});

test('orphan proposals and malformed entities are removed without a crash', () => {
  const store = normalizeStoreData({ tasks: [{ nope: true }], teams: [], proposals: [{ id: 'orphan', taskId: 'missing', teamId: 'missing' }] });
  assert.deepEqual(store.tasks, []);
  assert.deepEqual(store.proposals, []);
});

test('valid in-progress workflow survives normalization as an unconfirmed draft', () => {
  const store = normalizeStoreData({
    tasks: [], teams: [], proposals: [],
    workflow: {
      draft: { id: 'draft-current', title: 'Очереди в кофейнях', need: 'Снизить ожидание', confirmed: true, status: 'published' },
      analysis: { questions: [{ field: 'data', text: 'Какие данные есть?' }], suggestedCard: { title: 'Очереди в кофейнях' } },
      lastSavedCard: { id: 'draft-current', title: 'Исходное название', need: 'Снизить ожидание', confirmed: false, status: 'draft' },
    },
  });
  assert.equal(store.workflow.draft.title, 'Очереди в кофейнях');
  assert.equal(store.workflow.draft.confirmed, false);
  assert.equal(store.workflow.draft.status, 'draft');
  assert.equal(store.workflow.analysis.questions.length, 1);
  assert.equal(store.workflow.lastSavedCard.title, 'Исходное название');
});
