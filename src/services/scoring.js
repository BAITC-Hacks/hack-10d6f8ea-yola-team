export const SCORE_RULES = [
  { key: 'contextNeed', label: 'Контекст и потребность', fields: ['context', 'need'], max: 20 },
  { key: 'data', label: 'Данные и материалы', fields: ['data'], max: 20 },
  { key: 'expectedResult', label: 'Ожидаемый результат', fields: ['expectedResult'], max: 15 },
  { key: 'successCriteria', label: 'Критерии успеха', fields: ['successCriteria'], max: 15 },
  { key: 'constraints', label: 'Ограничения', fields: ['constraints'], max: 10 },
  { key: 'users', label: 'Пользователи', fields: ['users'], max: 10 },
  { key: 'communication', label: 'Связь с бизнесом', fields: ['businessContact', 'interactionFormat'], max: 10 },
];
const hasValue = (value) => typeof value === 'string' && value.trim().length > 0;
export function scoreTask(task) {
  const breakdown = SCORE_RULES.map((rule) => { const filled = rule.fields.filter((field) => hasValue(task[field])).length; const points = Math.round((filled / rule.fields.length) * rule.max); return { ...rule, points, complete: points === rule.max }; });
  const score = breakdown.reduce((total, item) => total + item.points, 0);
  return { score, readinessLevel: getReadinessLevel(score), breakdown, missing: breakdown.filter((item) => !item.complete) };
}
export function getReadinessLevel(score) { if (score >= 90) return 'Priority'; if (score >= 70) return 'Ready'; if (score >= 40) return 'Working'; return 'Draft'; }
export const levelLabel = { Draft: 'Черновик', Working: 'В работе', Ready: 'Готово', Priority: 'Приоритет' };
