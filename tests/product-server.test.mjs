import assert from 'node:assert/strict';
import test from 'node:test';
import { cookieFrom, createTestApp, jsonRequest } from './helpers/auth-fixture.mjs';

async function register(base, email, role) {
  const response = await fetch(`${base}/api/auth/register`, jsonRequest('POST', { email, password: 'Strong-pass-123', role }));
  assert.equal(response.status, 201);
  return cookieFrom(response);
}

async function request(base, path, method, body, cookie, headers = {}) {
  const response = await fetch(`${base}${path}`, {
    ...jsonRequest(method, body, cookie),
    headers: { ...jsonRequest(method, body, cookie).headers, ...headers },
  });
  const value = await response.json();
  return { response, value };
}

test('server persists the complete business-to-student proposal flow with ACL and idempotency', async (t) => {
  const { base, db } = await createTestApp(t);
  const business = await register(base, 'business@example.test', 'business');
  const otherBusiness = await register(base, 'other@example.test', 'business');
  const student = await register(base, 'student@example.test', 'student');

  assert.equal((await request(base, '/api/auth/profile', 'PUT', {
    name: 'Business A', company: 'Coffee Test', industry: 'HoReCa', contact: 'contact@example.test', interactionFormat: 'Еженедельно',
  }, business)).response.status, 200);
  assert.equal((await request(base, '/api/auth/profile', 'PUT', {
    name: 'Business B', company: 'Other', industry: 'Retail', contact: 'other@example.test', interactionFormat: 'Онлайн',
  }, otherBusiness)).response.status, 200);
  assert.equal((await request(base, '/api/auth/profile', 'PUT', {
    name: 'Student S', team: 'Team S', skills: 'AI', technologies: 'Python', interests: 'Forecasting', portfolio: 'https://example.test/team',
  }, student)).response.status, 200);

  const created = await request(base, '/api/tasks', 'POST', {}, business, { 'Idempotency-Key': 'create-t1' });
  assert.equal(created.response.status, 201);
  const taskId = created.value.task.id;
  const draft = {
    ...created.value.workflow.draft,
    title: 'Сокращение очередей',
    context: 'Кофейня с утренними очередями',
    need: 'Сократить время ожидания',
    expectedResult: 'Прототип прогноза очереди',
    constraints: 'Прототип за 3 недели',
    businessContact: 'Менеджер, contact@example.test',
    interactionFormat: 'Еженедельная обратная связь',
  };
  const saved = await request(base, `/api/tasks/${taskId}/workflow`, 'PUT', {
    version: created.value.workflow.version, description: 'Очереди в кофейне', step: 'card', questions: [], answers: {}, missingFields: [], suggestedCard: draft, draft, source: 'manual',
  }, business);
  assert.equal(saved.response.status, 200);

  const published = await request(base, `/api/tasks/${taskId}/publish`, 'POST', {
    version: saved.value.task.version, workflowVersion: saved.value.workflow.version,
  }, business, { 'Idempotency-Key': 'publish-t1' });
  assert.equal(published.response.status, 200);
  assert.equal(published.value.task.score, 55);
  assert.equal(published.value.task.readinessLevel, 'Working');

  const catalog = await fetch(`${base}/api/tasks`).then((response) => response.json());
  assert.equal(catalog.tasks.some((task) => task.id === taskId), true);
  const forbidden = await request(base, `/api/tasks/${taskId}/workflow`, 'GET', undefined, otherBusiness);
  assert.equal(forbidden.response.status, 404);

  const proposalBody = { solutionIdea: 'Прогноз очереди', plan: 'Данные, baseline, прототип', duration: '2 недели', prototypeUrl: 'https://example.test/prototype' };
  const first = await request(base, `/api/tasks/${taskId}/proposals`, 'POST', proposalBody, student, { 'Idempotency-Key': 'proposal-one' });
  const repeated = await request(base, `/api/tasks/${taskId}/proposals`, 'POST', proposalBody, student, { 'Idempotency-Key': 'proposal-one' });
  assert.equal(first.response.status, 201);
  assert.equal(repeated.value.proposal.id, first.value.proposal.id);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM proposals').get().count, 1);

  const incoming = await request(base, '/api/me/proposals', 'GET', undefined, business);
  assert.equal(incoming.value.proposals.length, 1);
  const decided = await request(base, `/api/proposals/${first.value.proposal.id}/decision`, 'PATCH', { decision: 'accepted', version: 1 }, business);
  assert.equal(decided.response.status, 200);
  const outgoing = await request(base, '/api/me/proposals', 'GET', undefined, student);
  assert.equal(outgoing.value.proposals[0].status, 'accepted');
});
