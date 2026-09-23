import { previewTaskScore } from './scoring.js';

export const EDITABLE_CARD_FIELDS = [
  'title',
  'context',
  'need',
  'users',
  'data',
  'constraints',
  'expectedResult',
  'successCriteria',
  'businessContact',
  'interactionFormat',
];

export const CARD_FIELD_LABELS = {
  title: 'Название задачи',
  context: 'Контекст',
  need: 'Потребность / проблема',
  users: 'Целевые пользователи',
  data: 'Данные и материалы',
  constraints: 'Ограничения',
  expectedResult: 'Ожидаемый результат',
  successCriteria: 'Критерии успеха',
  businessContact: 'Контакт бизнеса',
  interactionFormat: 'Формат взаимодействия',
};

const normalize = (value) => typeof value === 'string' ? value.trim() : '';

export function getChangedCardFields(before = {}, after = {}) {
  return EDITABLE_CARD_FIELDS.filter((field) => normalize(before[field]) !== normalize(after[field]));
}

export function createLastCardChange(before = {}, after = {}, now = () => new Date()) {
  const fields = getChangedCardFields(before, after);
  if (!fields.length) return null;

  const scoreBefore = previewTaskScore(before).score;
  const scoreAfter = previewTaskScore(after).score;

  return {
    changedAt: now().toISOString(),
    fields,
    scoreBefore,
    scoreAfter,
    scoreDelta: scoreAfter - scoreBefore,
  };
}

export function formatCardChangeTime(changedAt) {
  const date = new Date(changedAt);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('ru-RU', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}
