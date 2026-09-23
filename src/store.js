import { seedData } from './data.js';
import { emptyTask, PROPOSAL_STATUS, TASK_STATUS } from './models.js';
import { scoreTask } from './services/scoring.js';

const KEY = 'sana-hub-v2';
const LEGACY_KEY = 'sana-hub-v1';
const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const clone = (value) => structuredClone(value);
const proposalStatuses = new Set(Object.values(PROPOSAL_STATUS));

function normalizeTask(value) {
  if (!isRecord(value) || typeof value.id !== 'string' || !value.id.trim()) return null;
  const seeded = seedData.tasks.find((item) => item.id === value.id);
  const task = {
    ...emptyTask(value.id),
    ...(seeded || {}),
    ...value,
    id: value.id.trim(),
    company: value.company || seeded?.company || '',
    industry: value.industry || seeded?.industry || '',
    status: value.status === TASK_STATUS.PUBLISHED ? TASK_STATUS.PUBLISHED : TASK_STATUS.DRAFT,
    confirmed: value.confirmed === true,
    confirmedFields: Array.isArray(value.confirmedFields) ? value.confirmedFields.filter((field) => typeof field === 'string') : [],
    lastChange: isRecord(value.lastChange) ? value.lastChange : null,
  };
  const scored = scoreTask(task);
  task.score = scored.score;
  task.readinessLevel = scored.readinessLevel;
  return task;
}

function normalizeWorkflow(value) {
  if (!isRecord(value) || !isRecord(value.draft)) return null;
  const draft = normalizeTask({ ...value.draft, id: typeof value.draft.id === 'string' ? value.draft.id : 'draft-current' });
  if (!draft) return null;
  draft.status = TASK_STATUS.DRAFT;
  draft.confirmed = false;
  const analysis = isRecord(value.analysis)
    && Array.isArray(value.analysis.questions)
    && isRecord(value.analysis.suggestedCard)
    ? value.analysis
    : null;
  const lastSavedCard = isRecord(value.lastSavedCard) ? normalizeTask(value.lastSavedCard) : null;
  return { draft, analysis, lastSavedCard };
}

export function normalizeStoreData(value) {
  const source = isRecord(value) ? value : {};
  const tasksSource = Array.isArray(source.tasks) ? source.tasks : seedData.tasks;
  const teamsSource = Array.isArray(source.teams) ? source.teams : seedData.teams;
  const tasks = tasksSource.map(normalizeTask).filter(Boolean);
  const taskIds = new Set(tasks.map((task) => task.id));
  const teams = teamsSource
    .filter((team) => isRecord(team) && typeof team.id === 'string' && team.id !== 'profile-student' && typeof team.name === 'string')
    .map((team) => ({ ...team }));
  const teamIds = new Set(teams.map((team) => team.id));
  const proposalsSource = Array.isArray(source.proposals) ? source.proposals : seedData.proposals;
  const proposals = proposalsSource
    .filter((proposal) => isRecord(proposal) && typeof proposal.id === 'string' && taskIds.has(proposal.taskId) && teamIds.has(proposal.teamId))
    .map((proposal) => ({ ...proposal, status: proposalStatuses.has(proposal.status) ? proposal.status : PROPOSAL_STATUS.PENDING }));
  return {
    tasks,
    teams,
    proposals,
    workflow: normalizeWorkflow(source.workflow),
  };
}

export function loadStore() {
  try {
    const raw = localStorage.getItem(KEY) || localStorage.getItem(LEGACY_KEY);
    const data = normalizeStoreData(raw ? JSON.parse(raw) : clone(seedData));
    saveStore(data);
    return data;
  } catch {
    const data = normalizeStoreData(clone(seedData));
    saveStore(data);
    return data;
  }
}

export function saveStore(store) {
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
    return true;
  } catch {
    return false;
  }
}

export function resetStore() {
  localStorage.removeItem(KEY);
  localStorage.removeItem(LEGACY_KEY);
  return loadStore();
}
