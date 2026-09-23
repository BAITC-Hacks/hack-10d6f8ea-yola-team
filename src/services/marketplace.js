import { PROPOSAL_STATUS } from '../models.js';

export function selectCatalogTasks(tasks = [], filters = {}) {
  const topic = filters.topic || 'all';
  const level = filters.level || 'all';
  const query = String(filters.query || '').trim().toLocaleLowerCase('ru-RU');
  return tasks
    .filter((task) => task.status === 'published')
    .filter((task) => topic === 'all' || task.topic === topic)
    .filter((task) => level === 'all' || task.readinessLevel === level)
    .filter((task) => !query || [task.title, task.description, task.context, task.need, task.company, task.industry, task.topic]
      .some((value) => String(value || '').toLocaleLowerCase('ru-RU').includes(query)))
    .sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0));
}

export function validateProposalInput(input = {}) {
  const errors = {};
  const required = {
    taskId: 'Задача недоступна',
    teamId: 'Профиль команды не найден',
    solutionIdea: 'Опишите идею решения',
    plan: 'Добавьте план реализации',
    duration: 'Укажите ожидаемый срок',
    prototypeUrl: 'Добавьте ссылку на прототип',
  };
  for (const [field, message] of Object.entries(required)) {
    if (!String(input[field] || '').trim()) errors[field] = message;
  }
  if (input.prototypeUrl) {
    try {
      const url = new URL(String(input.prototypeUrl));
      if (!['http:', 'https:'].includes(url.protocol)) errors.prototypeUrl = 'Используйте ссылку http:// или https://';
    } catch {
      errors.prototypeUrl = 'Введите корректную ссылку на прототип';
    }
  }
  return errors;
}

export function createProposal(input = {}, id = `proposal-${Date.now()}`) {
  const normalized = Object.fromEntries(Object.entries(input).map(([key, value]) => [key, typeof value === 'string' ? value.trim() : value]));
  const errors = validateProposalInput(normalized);
  if (Object.keys(errors).length) return { proposal: null, errors };
  return {
    errors: {},
    proposal: {
      id,
      taskId: normalized.taskId,
      teamId: normalized.teamId,
      solutionIdea: normalized.solutionIdea,
      plan: normalized.plan,
      duration: normalized.duration,
      prototypeUrl: normalized.prototypeUrl,
      status: PROPOSAL_STATUS.PENDING,
      createdAt: new Date().toISOString(),
    },
  };
}

export function decideProposal(proposal, decision) {
  if (!proposal || ![PROPOSAL_STATUS.ACCEPTED, PROPOSAL_STATUS.REJECTED].includes(decision)) return false;
  proposal.status = decision;
  return true;
}
