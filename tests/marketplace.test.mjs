import assert from 'node:assert/strict';
import test from 'node:test';
import { createProposal, decideProposal, selectCatalogTasks, validateProposalInput } from '../src/services/marketplace.js';

const tasks = [
  { id: '31', title: 'Слабая задача магазина', topic: 'Retail', readinessLevel: 'Draft', score: 31, status: 'published' },
  { id: '94', title: 'Приоритетный AI', topic: 'AI', readinessLevel: 'Priority', score: 94, status: 'published' },
  { id: '82', title: 'Готовая аналитика', topic: 'AI', readinessLevel: 'Ready', score: 82, status: 'published' },
  { id: '61', title: 'Рабочая задача', topic: 'Retail', readinessLevel: 'Working', score: 61, status: 'published' },
  { id: 'draft', title: 'Не опубликована', topic: 'AI', readinessLevel: 'Ready', score: 80, status: 'draft' },
];

test('catalog includes low-score published tasks and sorts descending', () => {
  const result = selectCatalogTasks(tasks);
  assert.deepEqual(result.map((task) => task.score), [94, 82, 61, 31]);
  assert.ok(result.some((task) => task.id === '31'));
});

test('catalog filters by readiness and searches keywords', () => {
  assert.deepEqual(selectCatalogTasks(tasks, { level: 'Ready' }).map((task) => task.score), [82]);
  assert.deepEqual(selectCatalogTasks(tasks, { query: 'магазина' }).map((task) => task.id), ['31']);
  assert.deepEqual(selectCatalogTasks(tasks, { topic: 'Retail' }).map((task) => task.score), [61, 31]);
});

test('proposal validation rejects invalid URL', () => {
  const errors = validateProposalInput({ teamId: 'team-1', solutionIdea: 'Идея', plan: 'План', duration: '2 недели', prototypeUrl: 'abc' });
  assert.match(errors.taskId, /недоступна/);
  assert.match(errors.prototypeUrl, /корректную ссылку/);
});

test('proposal is saved pending and only changes by manual decision', () => {
  const input = { taskId: 'task-1', teamId: 'profile-student', solutionIdea: 'AI-система прогнозирования нагрузки', plan: 'Анализ данных → модель → API → dashboard', duration: '2 недели', prototypeUrl: 'https://example.com/demo' };
  const { proposal, errors } = createProposal(input, 'proposal-test');
  assert.deepEqual(errors, {});
  assert.equal(proposal.status, 'pending');
  assert.equal(proposal.teamId, 'profile-student');
  assert.equal(decideProposal(proposal, 'accepted'), true);
  assert.equal(proposal.status, 'accepted');
  assert.equal(decideProposal(proposal, 'rejected'), true);
  assert.equal(proposal.status, 'rejected');
});

test('invalid automatic decision is refused', () => {
  const proposal = { status: 'pending' };
  assert.equal(decideProposal(proposal, 'auto-assigned'), false);
  assert.equal(proposal.status, 'pending');
});
