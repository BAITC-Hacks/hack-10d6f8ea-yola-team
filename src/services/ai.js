import { emptyTask } from '../models.js';
const fieldQuestions = [
  ['users', 'Кто конкретно будет пользоваться результатом и для кого он создаётся?'],
  ['data', 'Какие данные, материалы или доступы уже есть у бизнеса?'],
  ['expectedResult', 'Какой результат должен получить бизнес: прототип, сервис, отчёт или другое?'],
  ['successCriteria', 'По каким измеримым признакам вы поймёте, что решение получилось?'],
  ['constraints', 'Есть ли ограничения по срокам, бюджету, технологиям или безопасности?'],
  ['businessContact', 'Кто со стороны бизнеса отвечает за обратную связь?'],
];
export function analyzeDraft(description) {
  const text = description.trim(); const lower = text.toLowerCase(); const suggested = emptyTask(); suggested.description = text; suggested.need = text; suggested.title = text.split(/[.!?]/)[0].slice(0, 70);
  const known = { users: /клиент|пользовател|студент|сотрудник|жител|для [а-яё]+/i.test(lower), data: /данн|таблиц|api|материал|каталог|база/i.test(lower), expectedResult: /прототип|сервис|приложен|отч[её]т|решени|дашборд/i.test(lower), successCriteria: /метрик|процент|срок|результат|успеш/i.test(lower), constraints: /огранич|бюджет|срок|нельзя|безопасн/i.test(lower), businessContact: /контакт|почт|телефон|куратор|менеджер/i.test(lower) };
  const missingFields = fieldQuestions.filter(([field]) => !known[field]).map(([field]) => field); const questions = fieldQuestions.filter(([field]) => missingFields.includes(field)).slice(0, 4).map(([, question]) => question); while (questions.length < 3) questions.push(fieldQuestions[questions.length][1]);
  return { missingFields, questions, suggestedCard: suggested, source: 'local-fallback' };
}
