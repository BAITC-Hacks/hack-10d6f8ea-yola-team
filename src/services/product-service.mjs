import { createHash, randomUUID } from 'node:crypto';
import { CARD_FIELDS, validateAIResult } from './ai.js';
import { createLastCardChange } from './card-change.js';
import { validateProposalInput } from './marketplace.js';
import { scoreTask } from './scoring.js';

const TASK_STEPS = new Set(['description', 'questions', 'card']);
const DECISIONS = new Set(['accepted', 'rejected']);
const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const parseJson = (value, fallback) => { try { return JSON.parse(value); } catch { return fallback; } };
const timestamp = (now) => new Date(now()).toISOString();

export class ProductError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

function requireRecord(value, label = 'JSON payload') {
  if (!isRecord(value)) throw new ProductError(400, `${label} должен быть объектом.`);
  return value;
}

function text(value, label, { required = false, max = 5000 } = {}) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (required && !normalized) throw new ProductError(400, `${label}: обязательное поле.`);
  if (normalized.length > max) throw new ProductError(400, `${label}: слишком длинное значение.`);
  return normalized;
}

function integer(value, label) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) throw new ProductError(400, `${label}: некорректная версия.`);
  return number;
}

function requireRole(user, role) {
  if (!user) throw new ProductError(401, 'Требуется вход в аккаунт.');
  if (user.role !== role) throw new ProductError(403, `Операция доступна только для роли ${role}.`);
}

function cleanCard(input = {}) {
  const source = isRecord(input) ? input : {};
  const card = Object.fromEntries(CARD_FIELDS.map((field) => [field, text(source[field], field)]));
  return {
    ...card,
    description: text(source.description, 'description'),
    company: text(source.company, 'company', { max: 200 }),
    industry: text(source.industry, 'industry', { max: 200 }),
    topic: text(source.topic, 'topic', { max: 100 }) || 'Другое',
  };
}

function normalizeQuestions(value) {
  if (!Array.isArray(value)) throw new ProductError(400, 'questions должен быть массивом.');
  return value.slice(0, 12).map((question, index) => {
    if (!isRecord(question) || !CARD_FIELDS.includes(question.field)) throw new ProductError(400, `Некорректный вопрос ${index + 1}.`);
    return { field: question.field, text: text(question.text, 'question.text', { required: true, max: 1000 }) };
  });
}

function normalizeAnswers(value) {
  if (!isRecord(value)) throw new ProductError(400, 'answers должен быть объектом.');
  return Object.fromEntries(Object.entries(value).slice(0, 30).map(([key, answer]) => [text(key, 'answer key', { required: true, max: 100 }), text(answer, 'answer', { max: 5000 })]));
}

function taskChange(row) {
  if (!row?.changed_at) return null;
  return {
    changedAt: row.changed_at,
    fields: parseJson(row.fields_json, []),
    scoreBefore: Number(row.score_before),
    scoreAfter: Number(row.score_after),
    scoreDelta: Number(row.score_delta),
  };
}

function taskFromRow(row, user = null) {
  if (!row) return null;
  return {
    id: row.id,
    ownerUserId: Number(row.owner_user_id),
    description: row.description,
    title: row.title,
    context: row.context,
    need: row.need,
    users: row.users,
    data: row.data,
    constraints: row.constraints_text,
    expectedResult: row.expected_result,
    successCriteria: row.success_criteria,
    businessContact: row.business_contact,
    interactionFormat: row.interaction_format,
    company: row.company,
    industry: row.industry,
    topic: row.topic,
    status: row.status,
    confirmed: row.confirmed === 1,
    score: Number(row.score),
    readinessLevel: row.readiness_level,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    version: Number(row.version),
    proposalCount: Number(row.proposal_count || 0),
    canEdit: user?.role === 'business' && Number(user.id) === Number(row.owner_user_id),
    lastChange: taskChange(row),
  };
}

function workflowFromRow(row) {
  if (!row) return null;
  return {
    taskId: row.task_id,
    description: row.description,
    step: row.step,
    questions: parseJson(row.questions_json, []),
    answers: parseJson(row.answers_json, {}),
    missingFields: parseJson(row.missing_fields_json, []),
    suggestedCard: parseJson(row.suggested_card_json, {}),
    draft: parseJson(row.draft_json, {}),
    source: row.source,
    publishedSourceVersion: row.published_source_version ? Number(row.published_source_version) : null,
    updatedAt: row.updated_at,
    version: Number(row.version),
  };
}

function proposalFromRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    taskId: row.task_id,
    teamId: row.team_id,
    authorUserId: Number(row.author_user_id),
    solutionIdea: row.solution_idea,
    plan: row.plan,
    duration: row.duration,
    prototypeUrl: row.prototype_url,
    status: row.status,
    decidedByUserId: row.decided_by_user_id ? Number(row.decided_by_user_id) : null,
    decidedAt: row.decided_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    version: Number(row.version),
    taskTitle: row.task_title || '',
    team: row.team_name ? { id: row.team_id, name: row.team_name, skills: row.team_skills || '', technologies: row.team_technologies || '', portfolio: row.team_portfolio || '' } : null,
  };
}

function payloadHash(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export function createProductService({ db, now = () => Date.now(), createId = () => randomUUID() } = {}) {
  if (!db) throw new Error('Product service requires a database');

  const taskSelect = `
    SELECT tasks.*, task_changes.changed_at, task_changes.fields_json,
      task_changes.score_before, task_changes.score_after, task_changes.score_delta,
      (SELECT COUNT(*) FROM proposals WHERE proposals.task_id = tasks.id) AS proposal_count
    FROM tasks LEFT JOIN task_changes ON task_changes.task_id = tasks.id`;
  const proposalSelect = `
    SELECT proposals.*, tasks.title AS task_title, tasks.owner_user_id AS task_owner_user_id, teams.name AS team_name,
      teams.skills AS team_skills, teams.technologies AS team_technologies, teams.portfolio AS team_portfolio
    FROM proposals JOIN tasks ON tasks.id = proposals.task_id JOIN teams ON teams.id = proposals.team_id`;
  const getTaskRow = db.prepare(`${taskSelect} WHERE tasks.id = ?`);
  const getWorkflowRow = db.prepare('SELECT * FROM task_workflows WHERE task_id = ?');
  const getProfile = db.prepare('SELECT * FROM profiles WHERE user_id = ?');
  const getTeamByUser = db.prepare('SELECT * FROM teams WHERE user_id = ?');
  const getProposalRow = db.prepare(`${proposalSelect} WHERE proposals.id = ?`);
  const findIdempotency = db.prepare('SELECT payload_hash, response_json FROM idempotency_keys WHERE user_id = ? AND operation = ? AND idempotency_key = ?');
  const insertIdempotency = db.prepare('INSERT INTO idempotency_keys (user_id, operation, idempotency_key, payload_hash, response_json, created_at) VALUES (?, ?, ?, ?, ?, ?)');

  function executeIdempotent(user, operation, key, payload, operationFn) {
    const normalizedKey = text(key, 'Idempotency-Key', { required: true, max: 200 });
    const hash = payloadHash(payload);
    const execute = db.transaction(() => {
      const existing = findIdempotency.get(user.id, operation, normalizedKey);
      if (existing) {
        if (existing.payload_hash !== hash) throw new ProductError(409, 'Этот Idempotency-Key уже использован с другим содержимым.');
        return parseJson(existing.response_json, {});
      }
      const result = operationFn();
      insertIdempotency.run(user.id, operation, normalizedKey, hash, JSON.stringify(result), timestamp(now));
      return result;
    });
    return execute();
  }

  function requireOwnedTask(user, taskId) {
    requireRole(user, 'business');
    const row = getTaskRow.get(taskId);
    if (!row || Number(row.owner_user_id) !== Number(user.id)) throw new ProductError(404, 'Задача не найдена.');
    return row;
  }

  function listCatalog(user, filters = {}) {
    let tasks = db.prepare(`${taskSelect} WHERE tasks.status = 'published' ORDER BY tasks.score DESC, tasks.updated_at DESC`).all().map((row) => taskFromRow(row, user));
    const topic = text(filters.topic, 'topic', { max: 100 });
    const readiness = text(filters.readiness, 'readiness', { max: 30 });
    const query = text(filters.query, 'query', { max: 200 }).toLocaleLowerCase('ru-RU');
    if (topic && topic !== 'all') tasks = tasks.filter((task) => task.topic === topic);
    if (readiness && readiness !== 'all') tasks = tasks.filter((task) => task.readinessLevel === readiness);
    if (query) tasks = tasks.filter((task) => [task.title, task.description, task.context, task.need, task.company, task.industry, task.topic].some((value) => String(value || '').toLocaleLowerCase('ru-RU').includes(query)));
    return { tasks, count: tasks.length };
  }

  function getTask(user, taskId) {
    const row = getTaskRow.get(taskId);
    if (!row) throw new ProductError(404, 'Задача не найдена.');
    if (row.status !== 'published' && Number(row.owner_user_id) !== Number(user?.id)) throw new ProductError(404, 'Задача не найдена.');
    return taskFromRow(row, user);
  }

  function listMyTasks(user) {
    requireRole(user, 'business');
    return db.prepare(`${taskSelect} WHERE tasks.owner_user_id = ? ORDER BY tasks.updated_at DESC`).all(user.id).map((row) => taskFromRow(row, user));
  }

  function createTask(user, input = {}, idempotencyKey) {
    requireRole(user, 'business');
    requireRecord(input);
    const profile = getProfile.get(user.id);
    if (!profile) throw new ProductError(409, 'Сначала заполните профиль бизнеса.');
    const description = text(input.description, 'description');
    return executeIdempotent(user, 'create-task', idempotencyKey, { description }, () => {
      const id = createId();
      const createdAt = timestamp(now);
      const draft = cleanCard({
        description,
        businessContact: `${profile.name}, ${profile.contact || ''}`.replace(/,\s*$/, ''),
        interactionFormat: profile.interaction_format || '',
        company: profile.company || '',
        industry: profile.industry || '',
        topic: 'Другое',
      });
      db.prepare(`INSERT INTO tasks (id, owner_user_id, description, company, industry, topic, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(id, user.id, description, draft.company, draft.industry, draft.topic, createdAt, createdAt);
      db.prepare(`INSERT INTO task_workflows (task_id, description, draft_json, suggested_card_json, updated_at)
        VALUES (?, ?, ?, '{}', ?)`).run(id, description, JSON.stringify(draft), createdAt);
      return { task: taskFromRow(getTaskRow.get(id), user), workflow: workflowFromRow(getWorkflowRow.get(id)) };
    });
  }

  function getWorkflow(user, taskId) {
    const task = requireOwnedTask(user, taskId);
    const workflow = getWorkflowRow.get(taskId);
    if (!workflow) throw new ProductError(404, 'Черновик задачи не найден.');
    return { task: taskFromRow(task, user), workflow: workflowFromRow(workflow) };
  }

  function updateWorkflow(user, taskId, input = {}) {
    const task = requireOwnedTask(user, taskId);
    requireRecord(input);
    const existing = getWorkflowRow.get(taskId);
    if (!existing) throw new ProductError(404, 'Черновик задачи не найден.');
    const expectedVersion = integer(input.version, 'version');
    const current = workflowFromRow(existing);
    const draft = cleanCard({ ...current.draft, ...(isRecord(input.draft) ? input.draft : {}), description: input.description ?? current.description });
    const description = text(input.description ?? draft.description, 'description');
    draft.description = description;
    const questions = input.questions === undefined ? current.questions : normalizeQuestions(input.questions);
    const answers = input.answers === undefined ? current.answers : normalizeAnswers(input.answers);
    const missingFields = input.missingFields === undefined ? current.missingFields : [...new Set((Array.isArray(input.missingFields) ? input.missingFields : []).filter((field) => CARD_FIELDS.includes(field)))];
    const suggestedCard = cleanCard(input.suggestedCard === undefined ? current.suggestedCard : input.suggestedCard);
    const step = TASK_STEPS.has(input.step) ? input.step : current.step;
    const source = text(input.source ?? current.source, 'source', { max: 30 }) || 'manual';
    const updatedAt = timestamp(now);
    const result = db.prepare(`UPDATE task_workflows SET description = ?, step = ?, questions_json = ?, answers_json = ?,
      missing_fields_json = ?, suggested_card_json = ?, draft_json = ?, source = ?, updated_at = ?, version = version + 1
      WHERE task_id = ? AND version = ?`).run(description, step, JSON.stringify(questions), JSON.stringify(answers), JSON.stringify(missingFields), JSON.stringify(suggestedCard), JSON.stringify(draft), source, updatedAt, taskId, expectedVersion);
    if (!result.changes) throw new ProductError(409, 'Черновик изменён в другой вкладке. Загрузите актуальную версию.', { current: getWorkflow(user, taskId) });
    db.prepare('UPDATE tasks SET description = ?, updated_at = ? WHERE id = ?').run(description, updatedAt, taskId);
    return { task: taskFromRow(getTaskRow.get(taskId), user), workflow: workflowFromRow(getWorkflowRow.get(taskId)) };
  }

  function saveAnalysis(user, taskId, expectedVersion, value, step = 'questions') {
    requireOwnedTask(user, taskId);
    const existing = getWorkflowRow.get(taskId);
    if (!existing) throw new ProductError(404, 'Черновик задачи не найден.');
    const version = integer(expectedVersion, 'version');
    const result = validateAIResult(value);
    const current = workflowFromRow(existing);
    const aiCard = cleanCard(result.suggestedCard);
    const draft = cleanCard({ ...current.draft, ...Object.fromEntries(CARD_FIELDS.map((field) => [field, aiCard[field] || current.draft[field] || ''])) });
    const updatedAt = timestamp(now);
    const changed = db.prepare(`UPDATE task_workflows SET step = ?, questions_json = ?, missing_fields_json = ?,
      suggested_card_json = ?, draft_json = ?, source = ?, updated_at = ?, version = version + 1
      WHERE task_id = ? AND version = ?`).run(TASK_STEPS.has(step) ? step : 'questions', JSON.stringify(result.questions), JSON.stringify(result.missingFields), JSON.stringify(aiCard), JSON.stringify(draft), result.source || 'openai', updatedAt, taskId, version);
    if (!changed.changes) throw new ProductError(409, 'AI-результат устарел: черновик уже изменён. Повторите анализ.');
    return { analysis: result, task: taskFromRow(getTaskRow.get(taskId), user), workflow: workflowFromRow(getWorkflowRow.get(taskId)) };
  }

  function publishTask(user, taskId, input = {}, idempotencyKey) {
    const taskRow = requireOwnedTask(user, taskId);
    requireRecord(input);
    const taskVersion = integer(input.version, 'version');
    const workflowVersion = integer(input.workflowVersion, 'workflowVersion');
    return executeIdempotent(user, `publish-task:${taskId}`, idempotencyKey, { taskVersion, workflowVersion }, () => {
      const latestTask = getTaskRow.get(taskId);
      const workflowRow = getWorkflowRow.get(taskId);
      if (Number(latestTask.version) !== taskVersion || Number(workflowRow.version) !== workflowVersion) throw new ProductError(409, 'Карточка изменилась в другой вкладке. Обновите данные перед публикацией.');
      const workflow = workflowFromRow(workflowRow);
      const card = cleanCard(workflow.draft);
      text(card.title, 'Название задачи', { required: true, max: 500 });
      text(card.need, 'Потребность', { required: true, max: 5000 });
      const confirmed = { ...card, confirmed: true };
      const scored = scoreTask(confirmed);
      const before = taskFromRow(latestTask, user);
      const lastChange = createLastCardChange(latestTask.status === 'published' ? before : {}, confirmed, () => new Date(now()));
      const changedAt = timestamp(now);
      const update = db.prepare(`UPDATE tasks SET description = ?, title = ?, context = ?, need = ?, users = ?, data = ?,
        constraints_text = ?, expected_result = ?, success_criteria = ?, business_contact = ?, interaction_format = ?,
        company = ?, industry = ?, topic = ?, status = 'published', confirmed = 1, score = ?, readiness_level = ?,
        updated_at = ?, version = version + 1 WHERE id = ? AND version = ?`).run(card.description, card.title, card.context, card.need, card.users, card.data, card.constraints, card.expectedResult, card.successCriteria, card.businessContact, card.interactionFormat, card.company, card.industry, card.topic, scored.score, scored.readinessLevel, changedAt, taskId, taskVersion);
      if (!update.changes) throw new ProductError(409, 'Версия карточки устарела.');
      if (lastChange) db.prepare(`INSERT INTO task_changes (task_id, author_user_id, changed_at, fields_json, score_before, score_after, score_delta)
        VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(task_id) DO UPDATE SET author_user_id = excluded.author_user_id,
        changed_at = excluded.changed_at, fields_json = excluded.fields_json, score_before = excluded.score_before,
        score_after = excluded.score_after, score_delta = excluded.score_delta`).run(taskId, user.id, lastChange.changedAt, JSON.stringify(lastChange.fields), lastChange.scoreBefore, lastChange.scoreAfter, lastChange.scoreDelta);
      db.prepare('UPDATE task_workflows SET published_source_version = ?, updated_at = ? WHERE task_id = ?').run(workflowVersion, changedAt, taskId);
      return { task: taskFromRow(getTaskRow.get(taskId), user) };
    });
  }

  function ensureTeam(user) {
    requireRole(user, 'student');
    const profile = getProfile.get(user.id);
    if (!profile) throw new ProductError(409, 'Сначала заполните профиль студента.');
    const existing = getTeamByUser.get(user.id);
    const id = existing?.id || `team-${user.id}`;
    const nowIso = timestamp(now);
    db.prepare(`INSERT INTO teams (id, user_id, name, interests, skills, technologies, portfolio, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET name = excluded.name,
      interests = excluded.interests, skills = excluded.skills, technologies = excluded.technologies,
      portfolio = excluded.portfolio, updated_at = excluded.updated_at, version = teams.version + 1`).run(id, user.id, profile.team || profile.name, profile.interests || '', profile.skills || '', profile.technologies || '', profile.portfolio || '', existing?.created_at || nowIso, nowIso);
    return getTeamByUser.get(user.id);
  }

  function createProposal(user, taskId, input = {}, idempotencyKey) {
    requireRole(user, 'student');
    requireRecord(input);
    const team = ensureTeam(user);
    const proposalInput = {
      taskId,
      teamId: team.id,
      solutionIdea: text(input.solutionIdea, 'Идея решения', { required: true, max: 5000 }),
      plan: text(input.plan, 'План', { required: true, max: 5000 }),
      duration: text(input.duration, 'Срок', { required: true, max: 200 }),
      prototypeUrl: text(input.prototypeUrl, 'Ссылка на прототип', { required: true, max: 1000 }),
    };
    const errors = validateProposalInput(proposalInput);
    if (Object.keys(errors).length) throw new ProductError(400, Object.values(errors).join(' · '), errors);
    return executeIdempotent(user, `create-proposal:${taskId}`, idempotencyKey, proposalInput, () => {
      const task = getTaskRow.get(taskId);
      if (!task || task.status !== 'published') throw new ProductError(404, 'Опубликованная задача не найдена.');
      const id = createId();
      const createdAt = timestamp(now);
      db.prepare(`INSERT INTO proposals (id, task_id, team_id, author_user_id, solution_idea, plan, duration, prototype_url, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, taskId, team.id, user.id, proposalInput.solutionIdea, proposalInput.plan, proposalInput.duration, proposalInput.prototypeUrl, createdAt, createdAt);
      return { proposal: proposalFromRow(getProposalRow.get(id)) };
    });
  }

  function listMyProposals(user) {
    if (!user) throw new ProductError(401, 'Требуется вход в аккаунт.');
    const rows = user.role === 'student'
      ? db.prepare(`${proposalSelect} WHERE proposals.author_user_id = ? ORDER BY proposals.created_at DESC`).all(user.id)
      : db.prepare(`${proposalSelect} WHERE tasks.owner_user_id = ? ORDER BY proposals.created_at DESC`).all(user.id);
    return rows.map(proposalFromRow);
  }

  function decideProposal(user, proposalId, input = {}) {
    requireRole(user, 'business');
    requireRecord(input);
    const decision = input.decision;
    if (!DECISIONS.has(decision)) throw new ProductError(400, 'Решение должно быть accepted или rejected.');
    const version = integer(input.version, 'version');
    const decide = db.transaction(() => {
      const row = getProposalRow.get(proposalId);
      if (!row || Number(row.task_owner_user_id) !== Number(user.id)) throw new ProductError(404, 'Предложение не найдено.');
      if (row.status === decision) return proposalFromRow(row);
      if (row.status !== 'pending' || Number(row.version) !== version) throw new ProductError(409, 'Предложение уже решено или его версия устарела.');
      const decidedAt = timestamp(now);
      const result = db.prepare(`UPDATE proposals SET status = ?, decided_by_user_id = ?, decided_at = ?, updated_at = ?, version = version + 1
        WHERE id = ? AND status = 'pending' AND version = ?`).run(decision, user.id, decidedAt, decidedAt, proposalId, version);
      if (!result.changes) throw new ProductError(409, 'Решение уже изменено в другой вкладке.');
      return proposalFromRow(getProposalRow.get(proposalId));
    });
    return { proposal: decide() };
  }

  return { listCatalog, getTask, listMyTasks, createTask, getWorkflow, updateWorkflow, saveAnalysis, publishTask, ensureTeam, createProposal, listMyProposals, decideProposal };
}
