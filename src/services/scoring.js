export const SCORE_RULES = [
  { key: 'contextNeed', label: 'Контекст и потребность', fields: ['context', 'need'], max: 20 },
  { key: 'data', label: 'Данные и материалы', fields: ['data'], max: 20 },
  { key: 'expectedResult', label: 'Ожидаемый результат', fields: ['expectedResult'], max: 15 },
  { key: 'successCriteria', label: 'Критерии успеха', fields: ['successCriteria'], max: 15 },
  { key: 'constraints', label: 'Ограничения', fields: ['constraints'], max: 10 },
  { key: 'users', label: 'Пользователи', fields: ['users'], max: 10 },
  { key: 'communication', label: 'Связь с бизнесом', fields: ['businessContact', 'interactionFormat'], max: 10 },
];

const UNKNOWN_VALUES = new Set([
  'требуется уточнение',
  'не указано',
  'неизвестно',
  'null',
  'n/a',
  '-',
]);

const RECOMMENDATIONS = {
  contextNeed: 'Опишите контекст и конкретную бизнес-потребность',
  data: 'Добавьте доступные источники данных и материалы',
  expectedResult: 'Укажите, какой результат должна получить компания',
  successCriteria: 'Добавьте измеримые критерии успеха',
  constraints: 'Укажите ограничения по срокам, технологиям или доступам',
  users: 'Опишите основных пользователей решения',
  communication: 'Добавьте контакт бизнеса и формат обратной связи',
};

export function hasScorableValue(value) {
  if (typeof value !== 'string') return false;
  const normalized = value.trim().toLocaleLowerCase('ru-RU');
  return normalized.length > 0 && !UNKNOWN_VALUES.has(normalized);
}

function isFieldConfirmed(task, field) {
  if (task.confirmed === true) return true;
  return Array.isArray(task.confirmedFields) && task.confirmedFields.includes(field);
}

export function scoreTask(task = {}) {
  const breakdown = SCORE_RULES.map((rule) => {
    const earnedFields = rule.fields.filter((field) => isFieldConfirmed(task, field) && hasScorableValue(task[field]));
    const points = Math.round((earnedFields.length / rule.fields.length) * rule.max);
    const potentialGain = rule.max - points;
    return {
      ...rule,
      points,
      potentialGain,
      complete: potentialGain === 0,
      missingFields: rule.fields.filter((field) => !earnedFields.includes(field)),
      recommendation: potentialGain > 0 ? `${RECOMMENDATIONS[rule.key]} — до +${potentialGain} баллов` : '',
    };
  });
  const score = Math.min(100, breakdown.reduce((total, item) => total + item.points, 0));
  const missing = breakdown.filter((item) => !item.complete);
  return {
    score,
    readinessLevel: getReadinessLevel(score),
    breakdown,
    missing,
    recommendations: missing.map((item) => item.recommendation),
    potentialGain: 100 - score,
  };
}

export function previewTaskScore(task = {}) {
  return scoreTask({ ...task, confirmed: true });
}

export function getReadinessLevel(score) {
  const normalized = Math.max(0, Math.min(100, Number(score) || 0));
  if (normalized >= 90) return 'Priority';
  if (normalized >= 70) return 'Ready';
  if (normalized >= 40) return 'Working';
  return 'Draft';
}

export const levelLabel = {
  Draft: 'Черновик',
  Working: 'Рабочая',
  Ready: 'Готовая',
  Priority: 'Приоритетная',
};
