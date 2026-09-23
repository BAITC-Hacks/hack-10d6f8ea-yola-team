import { emptyTask, TASK_STATUS } from './models.js';
import { fallbackAnalyzeTask } from './services/ai.js';
import { CARD_FIELD_LABELS, createLastCardChange, formatCardChangeTime } from './services/card-change.js';
import { createProposal, decideProposal, selectCatalogTasks } from './services/marketplace.js';
import { levelLabel, previewTaskScore, scoreTask } from './services/scoring.js';
import { loadStore, resetStore, saveStore } from './store.js';

let store = loadStore();
let draft = store.workflow?.draft ? { ...store.workflow.draft } : emptyTask('draft-current');
let analysis = store.workflow?.analysis ? structuredClone(store.workflow.analysis) : null;
let auth = { status: 'loading', user: null };
let authError = '';
let aiState = 'idle';
let aiError = '';
let flashMessage = '';
let lastSavedCard = store.workflow?.lastSavedCard ? { ...store.workflow.lastSavedCard } : store.workflow?.draft ? { ...store.workflow.draft } : null;
let persistenceError = '';

const app = document.querySelector('#app');
const route = () => window.location.hash.replace(/^#\/?/, '') || 'home';
const routePath = () => route().split('?')[0];
const routeQuery = () => new URLSearchParams(route().split('?')[1] || '');
const navigate = (path) => { window.location.hash = `#/${path}`; };
const esc = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
const scoreClass = (score) => score >= 90 ? 'priority' : score >= 70 ? 'ready' : score >= 40 ? 'working' : 'draft';
const taskById = (id) => store.tasks.find((task) => task.id === id);
const teamById = (id) => store.teams.find((team) => team.id === id);
const userRole = () => auth.user?.role || null;
const userProfile = () => auth.user?.profile || null;
const activeStudentTeam = () => auth.user?.role === 'student' ? store.teams.find((team) => team.id === `user-${auth.user.id}`) || null : null;
const currentDraftCard = () => ({ ...draft, ...(analysis?.suggestedCard || {}) });
function persistStore() {
  const saved = saveStore(store);
  persistenceError = saved ? '' : 'Не удалось сохранить данные в браузере. Освободите место и повторите действие.';
  return saved;
}
function persistWorkflow() {
  store.workflow = { draft: currentDraftCard(), analysis, lastSavedCard };
  return persistStore();
}
function clearWorkflow() {
  store.workflow = null;
}
function saveCardChange(card) {
  const change = lastSavedCard ? createLastCardChange(lastSavedCard, card) : null;
  const savedCard = change ? { ...card, lastChange: change } : card;
  draft = savedCard;
  if (analysis) analysis = { ...analysis, suggestedCard: savedCard };
  lastSavedCard = { ...savedCard };
  return savedCard;
}
async function requestAI(payload) { const response = await fetch('/api/ai/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); if (!response.ok) throw new Error(`AI endpoint ${response.status}`); return response.json(); }

async function requestJson(path, options = {}) {
  const response = await fetch(path, { credentials: 'same-origin', ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) { const error = new Error(body.error || 'Запрос не выполнен.'); error.status = response.status; throw error; }
  return body;
}

function syncDerivedStudentTeam(user) {
  if (user?.role !== 'student' || !user.profile?.name) return;
  const team = { id: `user-${user.id}`, name: user.profile.team || user.profile.name, interests: user.profile.interests, skills: user.profile.skills, technologies: user.profile.technologies, portfolio: user.profile.portfolio };
  const teams = [team, ...store.teams.filter((item) => item.id !== team.id && item.id !== 'profile-student')];
  if (JSON.stringify(teams) !== JSON.stringify(store.teams)) { store.teams = teams; persistStore(); }
}

function setAuthUser(user) {
  auth = { status: 'ready', user: user || null };
  if (user) syncDerivedStudentTeam(user);
}

async function loadAuth() {
  try { setAuthUser((await requestJson('/api/auth/me')).user); }
  catch { auth = { status: 'ready', user: null }; authError = 'Не удалось проверить сессию. Попробуйте обновить страницу.'; }
  render();
}

function header() {
  const current = routePath();
  const role = userRole();
  const roleLinks = role === 'business'
    ? `<a class="${current === 'business/dashboard' ? 'active' : ''}" href="#/business/dashboard">Дашборд</a><a class="${current === 'business/intake' || current === 'business/card' ? 'active' : ''}" href="#/business/intake">Создать задачу</a><a class="${current === 'business/proposals' ? 'active' : ''}" href="#/business/proposals">Предложения <span class="nav-count">${store.proposals.filter((p) => p.status === 'pending').length}</span></a>`
    : `<a class="${current === 'catalog' || current.startsWith('task/') ? 'active' : ''}" href="#/catalog">Каталог задач</a>`;
  const account = auth.user
    ? `<a class="account-link ${current === 'profile' ? 'active' : ''}" href="#/profile">${esc(auth.user.profile?.name || 'Профиль')}</a>`
    : `<div class="auth-actions"><a class="secondary compact" href="#/register">Регистрация</a><a class="primary compact" href="#/login">Вход</a></div>`;
  return `<header class="topbar"><a class="brand" href="#/home"><span class="brand-mark">S</span><span>Sana <em>Hub</em></span></a><nav><a class="${current === 'home' ? 'active' : ''}" href="#/home">Главная</a>${roleLinks}</nav>${account}</header>`;
}
function page(title, subtitle, content) { return `${header()}<main class="page"><div class="page-heading"><p class="eyebrow">AI SANA CHALLENGE HUB</p><h1>${title}</h1><p class="muted">${subtitle}</p></div>${content}</main>`; }
function scoreBadge(task) { return `<span class="score-badge ${scoreClass(task.score)}"><strong>${task.score}</strong>/100 · ${levelLabel[task.readinessLevel]}</span>`; }

function renderHome() {
  const businessHref = auth.user ? (userRole() === 'business' ? '#/business/dashboard' : '#/catalog') : '#/register?role=business';
  const studentHref = auth.user ? (userRole() === 'student' ? '#/catalog' : '#/business/dashboard') : '#/register?role=student';
  return `${header()}<main class="landing"><section class="landing-hero"><p class="eyebrow">AI SANA CHALLENGE HUB</p><h1>От бизнес-задачи<br><span>к реальному решению</span></h1><p class="landing-copy">Бизнес формулирует задачу. AI помогает уточнить её. Студенты и фрилансеры находят реальные задачи и предлагают решения.</p><div class="landing-actions"><a class="primary" href="${businessHref}">Я представитель бизнеса →</a><a class="secondary" href="${studentHref}">Я студент / фрилансер</a></div></section><section class="flow-strip">${['Опишите задачу', 'Уточните её с AI', 'Получите рейтинг', 'Опубликуйте', 'Получите предложения'].map((text, index) => `<div><span>${index + 1}</span><strong>${text}</strong></div>`).join('')}</section></main>`;
}

function renderRegister() {
  const selectedRole = routeQuery().get('role') === 'student' ? 'student' : 'business';
  return page('Создать аккаунт', 'Регистрация хранит аккаунт, роль, профиль и сессию только на сервере.', `<div class="auth-layout"><form id="register-form" class="panel auth-form"><label class="field"><span>Email</span><input name="email" type="email" autocomplete="email" required placeholder="you@example.com" /></label><label class="field"><span>Пароль</span><input name="password" type="password" autocomplete="new-password" minlength="8" required placeholder="Минимум 8 символов" /></label><label class="field"><span>Подтверждение пароля</span><input name="confirmPassword" type="password" autocomplete="new-password" minlength="8" required /></label><fieldset class="role-choice"><legend>Роль</legend><label><input type="radio" name="role" value="business" ${selectedRole === 'business' ? 'checked' : ''} /> Business</label><label><input type="radio" name="role" value="student" ${selectedRole === 'student' ? 'checked' : ''} /> Student</label></fieldset><div id="auth-error" class="error-box" ${authError ? '' : 'hidden'}>${esc(authError)}</div><button class="primary full" type="submit">Зарегистрироваться →</button><p class="auth-foot">Уже есть аккаунт? <a href="#/login">Войти</a></p></form></div>`);
}

function renderLogin() {
  return page('Вход в Sana Hub', 'Используйте email и пароль, указанные при регистрации.', `<div class="auth-layout"><form id="login-form" class="panel auth-form"><label class="field"><span>Email</span><input name="email" type="email" autocomplete="email" required placeholder="you@example.com" /></label><label class="field"><span>Пароль</span><input name="password" type="password" autocomplete="current-password" required /></label><div id="auth-error" class="error-box" ${authError ? '' : 'hidden'}>${esc(authError)}</div><button class="primary full" type="submit">Войти →</button><p class="auth-foot">Нет аккаунта? <a href="#/register">Зарегистрироваться</a></p></form></div>`);
}

function renderOnboarding(type) {
  const isBusiness = type === 'business';
  const profile = userProfile() || {};
  const fields = isBusiness ? [['name', 'Имя', 'Айдар', true], ['company', 'Название компании', 'Astana Coffee', true], ['industry', 'Отрасль', 'HoReCa', true], ['contact', 'Контакт / email', 'aidar@example.com', true], ['interactionFormat', 'Формат взаимодействия', 'Онлайн-встречи и Telegram', true]] : [['name', 'Имя', 'Батыр', true], ['team', 'Название команды', 'YOLO Team', false], ['skills', 'Навыки', 'Python, Web, AI', true], ['technologies', 'Технологии', 'React, FastAPI, Python', true], ['interests', 'Интересы / направления', 'AI, аналитика, автоматизация', true], ['portfolio', 'GitHub или портфолио', 'https://github.com/example', false]];
  return page(isBusiness ? 'Профиль представителя бизнеса' : 'Профиль студента / фрилансера', isBusiness ? 'Расскажите о компании — эти данные помогут студентам понимать контекст и связываться с вами.' : 'Можно работать самостоятельно или указать команду. Профиль будет доступен при отправке предложений.', `<div class="onboarding-layout"><form id="onboarding-form" data-profile-type="${type}" class="panel onboarding-form"><div class="panel-tag">Защищённый серверный профиль</div><div class="profile-form-grid">${fields.map(([name, label, placeholder, required]) => `<label class="field"><span>${label}${required ? ' *' : ''}</span>${name === 'interactionFormat' || name === 'skills' || name === 'technologies' || name === 'interests' ? `<textarea name="${name}" rows="3" ${required ? 'required' : ''} placeholder="${placeholder}">${esc(profile[name] || '')}</textarea>` : `<input name="${name}" value="${esc(profile[name] || '')}" ${required ? 'required' : ''} placeholder="${placeholder}" ${name === 'contact' ? 'type="email"' : name === 'portfolio' ? 'type="url"' : ''} />`}</label>`).join('')}</div><div id="onboarding-error" class="error-box" hidden></div><button class="primary full" type="submit">Сохранить профиль и продолжить →</button></form><aside class="panel onboarding-note"><div class="spark">✦</div><h2>Профиль на сервере</h2><p class="muted">Данные профиля сохраняются в SQLite и привязаны к текущей защищённой сессии. Пароль никогда не отправляется обратно в браузер.</p><a class="text-link" href="#/profile">← Вернуться в профиль</a></aside></div>`);
}

function renderBusinessDashboard() {
  const profile = userProfile();
  if (!profile) return renderOnboarding('business');
  const tasks = store.tasks.filter((task) => task.status === TASK_STATUS.PUBLISHED);
  const recent = tasks.slice(0, 3);
  return page(`Здравствуйте, ${esc(profile.name)}`, `${esc(profile.company)} · ${esc(profile.industry)}`, `<section class="metric-grid"><article class="panel metric-card"><span>Опубликовано задач</span><strong>${tasks.length}</strong></article><article class="panel metric-card"><span>Всего предложений</span><strong>${store.proposals.length}</strong></article><article class="panel metric-card"><span>На рассмотрении</span><strong>${store.proposals.filter((proposal) => proposal.status === 'pending').length}</strong></article></section><section class="dashboard-head"><div><p class="panel-tag">Последние задачи</p><h2>Ваши бизнес-задачи</h2></div><a class="primary" href="#/business/intake">Создать новую задачу →</a></section><div class="catalog-grid">${recent.length ? recent.map(taskCard).join('') : '<div class="panel empty-state"><h2>Пока нет задач</h2><p class="muted">Создайте первую задачу и уточните её с AI.</p></div>'}</div>`);
}

function renderProfile() {
  const role = userRole();
  const profile = userProfile();
  if (!profile) return page('Профиль', 'Завершите настройку аккаунта.', `<section class="panel empty-state"><h2>Профиль ещё не заполнен</h2><p class="muted">Добавьте данные, необходимые для работы в Sana Hub.</p><a class="primary" href="#/onboarding/${role}">Заполнить профиль →</a><button class="secondary logout-button" data-action="logout">Выйти</button></section>`);
  const entries = role === 'business' ? [['Имя', profile.name], ['Компания', profile.company], ['Отрасль', profile.industry], ['Контакт', profile.contact], ['Формат взаимодействия', profile.interactionFormat]] : [['Имя', profile.name], ['Команда', profile.team || 'Фрилансер'], ['Навыки', profile.skills], ['Технологии', profile.technologies], ['Интересы', profile.interests], ['GitHub / портфолио', profile.portfolio || 'Не указано']];
  return page('Профиль', role === 'business' ? 'Данные представителя бизнеса' : 'Данные студента / фрилансера', `<section class="panel profile-card"><div class="profile-avatar">${esc(profile.name?.[0] || '?')}</div><div><p class="panel-tag">${role === 'business' ? 'Business profile' : 'Student profile'}</p><h2>${esc(profile.name)}</h2><p class="muted">${esc(auth.user.email)}</p><div class="profile-details">${entries.map(([label, value]) => `<div><span>${label}</span><p>${esc(value)}</p></div>`).join('')}</div><div class="profile-actions"><a class="secondary" href="#/onboarding/${role}">Редактировать профиль</a><button class="secondary danger" data-action="logout">Выйти</button></div></div></section>`);
}

function renderIntake() {
  const questions = analysis?.questions || [];
  const card = currentDraftCard();
  const scored = previewTaskScore(card);
  const error = aiError ? `<div class="error-box">${esc(aiError)}</div>` : '';
  const buttonLabel = aiState === 'loading' ? 'AI анализирует задачу…' : 'Проанализировать с AI <span>→</span>';
  const warning = analysis?.warning ? `<div class="warning-box"><strong>Fallback mode</strong><span>${esc(analysis.warning)}</span><button class="secondary compact" data-action="retry-ai">Повторить AI-запрос</button></div>` : '';
  const insight = aiState === 'loading' ? `<div class="loading-state"><div class="loading-orb">✦</div><h2>${analysis ? 'AI формирует карточку задачи…' : 'AI анализирует заполненность задачи…'}</h2><p class="muted">Проверяем известные данные и ищем реальные пробелы.</p></div>` : analysis ? `<div class="panel-tag mint">AI-разбор · ${analysis.source === 'openai' ? 'OpenAI API' : 'fallback'}</div>${warning}<h2>Нужно уточнить ${analysis.missingFields.length} полей</h2><p class="muted">Ответьте на вопросы прямо в форме — они попадут в редактируемый черновик.</p><div class="question-list">${questions.map((question, index) => `<label class="question question-field"><span>${String(index + 1).padStart(2, '0')}</span><textarea data-question="${esc(question.field)}" rows="2" placeholder="Введите ответ или оставьте пустым">${esc(analysis.answers?.[question.field] || '')}</textarea><small><b>${esc(question.field)}</b> · ${esc(question.text)}</small></label>`).join('')}</div><button class="secondary full" data-action="form-card">Сформировать карточку задачи <span>→</span></button>` : `<div class="empty-insight"><div class="spark">✦</div><h2>Здесь появится AI-разбор</h2><p class="muted">Sana найдёт пробелы в описании, предложит вопросы и подготовит редактируемый черновик карточки.</p><div class="mini-metrics"><span><b>3+</b> вопроса</span><span><b>0–100</b> рейтинг</span><span><b>100%</b> контроль бизнеса</span></div></div>`;
  return page('Превратите идею в понятную задачу', 'Сначала коротко опишите потребность бизнеса. Sana задаст вопросы и поможет собрать карточку, но финальное решение остаётся за вами.', `<section class="stepper"><span class="done">01 Описание</span><i></i><span class="${aiState === 'loading' || analysis ? 'done' : ''}">02 AI-анализ</span><i></i><span class="${analysis ? 'done' : ''}">03 Вопросы</span><i></i><span>04 Карточка</span></section><div class="grid two-col"><section class="panel hero-panel"><div class="panel-tag">Шаг 1 · Черновик</div><h2>Что нужно решить?</h2><p class="muted">Опишите проблему в 1–3 предложениях. Не нужно сразу знать все детали.</p>${error}<textarea id="draft-input" rows="6" placeholder="Например: хотим сократить списания продуктов в наших кофейнях...">${esc(draft.description)}</textarea><button class="primary full" data-action="analyze" ${aiState === 'loading' ? 'disabled' : ''}>${buttonLabel}</button><p class="tiny">Запрос идёт через backend: OpenAI API используется при настройке, а fallback — только при отсутствии конфигурации или ошибке. Неподтверждённые данные не публикуются.</p></section><section class="panel insight-panel">${insight}</section></div>${analysis ? `<section class="panel next-card"><div><p class="panel-tag">Следующий шаг</p><h2>Соберите карточку и поднимите рейтинг</h2><p class="muted">Сейчас ${scored.score}/100. Добавьте ответы, чтобы score вырос.</p></div><div class="score-ring ${scoreClass(scored.score)}"><strong>${scored.score}</strong><span>/100</span></div></section>` : ''}</section>`);
}

const fieldMeta = [['title', 'Название задачи', 'Короткий заголовок'], ['context', 'Контекст', 'Что происходит сейчас?'], ['need', 'Потребность / проблема', 'Что нужно изменить?'], ['users', 'Целевые пользователи', 'Кто будет пользоваться результатом?'], ['data', 'Данные и материалы', 'Что уже доступно команде?'], ['constraints', 'Ограничения', 'Сроки, бюджет, технологии, безопасность'], ['expectedResult', 'Ожидаемый результат', 'Что должна получить компания?'], ['successCriteria', 'Критерии успеха', 'Как измерим результат?'], ['businessContact', 'Контакт бизнеса', 'К кому обращаться по задаче?'], ['interactionFormat', 'Формат взаимодействия', 'Как команда получает обратную связь?']];
function renderLastCardChange(change) {
  if (!change || !Array.isArray(change.fields) || !change.fields.length) return '';
  const scoreBefore = Number(change.scoreBefore) || 0;
  const scoreAfter = Number(change.scoreAfter) || 0;
  const scoreDelta = scoreAfter - scoreBefore;
  const scoreText = scoreDelta > 0 ? `+${scoreDelta}` : scoreDelta < 0 ? `−${Math.abs(scoreDelta)}` : 'без изменений';
  const state = scoreDelta > 0 ? 'positive' : scoreDelta < 0 ? 'negative' : 'neutral';
  const fields = change.fields.map((field) => CARD_FIELD_LABELS[field] || field).join(', ');
  const changedAt = formatCardChangeTime(change.changedAt);
  return `<section class="last-card-change"><h3>Последнее изменение</h3><time datetime="${esc(change.changedAt || '')}">${esc(changedAt)}</time><p>Обновлено: <strong>${esc(fields)}</strong></p><div class="change-score ${state}"><span>Готовность задачи</span><strong>${scoreBefore} → ${scoreAfter} · ${scoreText}</strong></div></section>`;
}

function scorePanelContent(scored, lastChange) {
  return `<p class="panel-tag">Прогноз готовности</p><div class="readiness-visual" style="--score:${scored.score}"><div class="big-score ${scoreClass(scored.score)}"><strong>${scored.score}</strong><span>/100</span></div></div><span class="level-pill ${scoreClass(scored.score)}">${levelLabel[scored.readinessLevel]}</span>${renderLastCardChange(lastChange)}<p class="tiny score-note">До подтверждения показан прозрачный прогноз. Официальный рейтинг начисляется только подтверждённым данным.</p><div class="breakdown">${scored.breakdown.map((item) => `<div class="breakdown-row"><span>${item.label}</span><b>${item.points}/${item.max}</b><div class="bar"><i style="width:${(item.points / item.max) * 100}%"></i></div></div>`).join('')}</div><div class="recommendations"><b>Как улучшить рейтинг</b>${scored.recommendations.length ? `<ul>${scored.recommendations.map((item) => `<li>${esc(item)}</li>`).join('')}</ul><p class="recommendation-total">Потенциальный прирост: <strong>+${scored.potentialGain}</strong></p>` : '<p>Карточка содержит все сведения — достигнут максимум 100/100.</p>'}</div>`;
}
function renderCard() {
  const card = currentDraftCard();
  const scored = previewTaskScore(card);
  return page('Соберите карточку задачи', 'Редактируйте поля — прогноз рейтинга, детализация и рекомендации обновятся сразу. Баллы фиксируются после подтверждения.', `<section class="stepper"><span class="done">01 Описание</span><i></i><span class="done">02 AI-анализ</span><i></i><span class="done">03 Вопросы</span><i></i><span class="done">04 Карточка</span></section><div class="grid card-layout"><section class="panel card-form"><div class="panel-head"><div><p class="panel-tag">Редактируемый черновик · не подтверждён</p><h2>${esc(card.title || 'Новая задача')}</h2></div><span class="ai-chip">✦ AI draft</span></div><div class="form-grid">${fieldMeta.map(([key, label, placeholder]) => `<label class="field"><span>${label}</span><textarea data-field="${key}" rows="${key === 'title' ? 2 : 3}" placeholder="${card[key] ? placeholder : 'Требуется уточнение'}">${esc(card[key])}</textarea></label>`).join('')}</div><div class="form-actions"><button class="secondary" data-action="back-intake">← Вернуться к вопросам</button><button class="primary" data-action="save-card">Сохранить изменения</button></div></section><aside class="panel score-panel"><div data-score-content>${scorePanelContent(scored, card.lastChange)}</div><button class="primary full" data-action="publish">Подтвердить карточку</button></aside></div>`);
}
function taskCard(task) {
  const company = task.company || 'Компания не указана';
  return `<article class="task-card"><div class="task-top"><span class="topic">${esc(task.topic)}</span>${scoreBadge(task)}</div><p class="company-line">${esc(company)}${task.industry ? ` · ${esc(task.industry)}` : ''}</p><h3>${esc(task.title)}</h3><p>${esc(task.need || task.context || task.description)}</p><div class="task-meta"><span>◷ ${task.expectedResult ? 'Результат описан' : 'Нужны детали'}</span><span>◉ ${store.proposals.filter((p) => p.taskId === task.id).length} предложений</span></div><a class="primary task-cta" href="#/task/${task.id}">Открыть задачу →</a></article>`;
}

function catalogResults(tasks) {
  return tasks.length ? tasks.map(taskCard).join('') : '<div class="panel empty-state catalog-empty"><div class="spark">⌕</div><h2>Задачи не найдены</h2><p class="muted">Измените поиск или фильтры. Опубликованные задачи с низким рейтингом тоже доступны в общем каталоге.</p></div>';
}

function renderCatalog() {
  const tasks = selectCatalogTasks(store.tasks);
  const topics = [...new Set(tasks.map((task) => task.topic))];
  return page('Каталог реальных задач', 'Выберите бизнес-задачу, изучите контекст и предложите своё решение. Каталог открыт для всех команд независимо от рейтинга задачи.', `<section class="catalog-controls panel"><label class="catalog-search"><span>Поиск по задачам</span><input id="catalog-search" type="search" placeholder="Название, компания или ключевое слово" /></label><div class="filters"><label><span>Тема</span><select id="topic-filter"><option value="all">Все темы</option>${topics.map((topic) => `<option>${esc(topic)}</option>`).join('')}</select></label><label><span>Готовность</span><select id="level-filter"><option value="all">Все уровни</option>${Object.entries(levelLabel).map(([key, label]) => `<option value="${key}">${label}</option>`).join('')}</select></label></div></section><div class="catalog-toolbar"><div><strong id="catalog-count">${tasks.length} задач</strong><span class="muted"> · по рейтингу: сначала готовые</span></div></div><div id="catalog-grid" class="catalog-grid">${catalogResults(tasks)}</div>`);
}

function renderProposalForm(task) {
  const role = userRole();
  if (!auth.user) return `<section class="panel proposal-panel business-proposal-note"><p class="panel-tag">Отклик команды</p><h2>Войдите как студент или фрилансер</h2><p class="muted">Для отправки предложения требуется серверный аккаунт с ролью Student.</p><div class="inline-actions"><a class="primary" href="#/login">Войти</a><a class="secondary" href="#/register?role=student">Регистрация</a></div></section>`;
  if (role !== 'student') return `<section class="panel proposal-panel business-proposal-note"><p class="panel-tag">Отклик команды</p><h2>Предложения отправляют студенты и фрилансеры</h2><p class="muted">Текущий аккаунт зарегистрирован как Business. Выбор команды бизнес выполняет вручную.</p></section>`;
  const team = activeStudentTeam();
  if (!team) return `<section class="panel proposal-panel empty-state"><h2>Сначала заполните профиль</h2><p class="muted">Профиль автоматически подставляется в предложение.</p><a class="primary" href="#/onboarding/student">Заполнить профиль →</a></section>`;
  return `<section class="panel proposal-panel"><p class="panel-tag">Отклик команды</p><h2>Предложить решение</h2><div class="proposal-profile"><div class="profile-avatar">${esc(team.name?.[0] || '?')}</div><div><strong>${esc(team.name)}</strong><span>${esc(team.skills || 'Навыки не указаны')}</span><small>${esc(team.technologies || 'Технологии не указаны')}</small></div><span class="profile-prefill">Профиль подставлен</span></div><form id="proposal-form" data-task-id="${task.id}" novalidate><input type="hidden" name="teamId" value="${esc(team.id)}" /><label class="field"><span>Идея решения</span><textarea name="solutionIdea" required rows="3" placeholder="Какой подход предлагаете?"></textarea></label><label class="field"><span>План реализации</span><textarea name="plan" required rows="3" placeholder="Опишите основные этапы"></textarea></label><div class="form-grid three"><label class="field"><span>Ожидаемый срок</span><input name="duration" required placeholder="2 недели" /></label><label class="field wide"><span>Ссылка на прототип</span><input name="prototypeUrl" type="url" required placeholder="https://example.com/demo" /></label></div><div id="proposal-error" class="error-box" hidden></div><button class="primary" type="submit">Отправить предложение →</button></form></section>`;
}

function renderTask(id) {
  const task = taskById(id);
  if (!task) return page('Задача не найдена', '', `<div class="panel empty-state"><h2>Такой задачи нет</h2><a class="text-link" href="#/catalog">Вернуться в каталог →</a></div>`);
  const proposals = store.proposals.filter((proposal) => proposal.taskId === id);
  const company = task.company || 'Компания не указана';
  const sideAction = userRole() === 'business'
    ? `<button class="secondary full" data-action="edit-task" data-task-id="${task.id}">Редактировать и пересчитать</button>`
    : auth.user ? '<button class="primary full" data-action="focus-proposal">Предложить решение</button>' : '<a class="primary full" href="#/login">Войти, чтобы предложить</a>';
  return page(task.title, `${esc(company)}${task.industry ? ` · ${esc(task.industry)}` : ''} · ${esc(task.topic)}`, `<div class="task-detail-layout"><section><a class="back-link" href="#/catalog">← Назад в каталог</a><div class="panel detail-panel"><div class="task-top"><span class="topic">${esc(task.topic)}</span>${scoreBadge(task)}</div><div class="company-heading"><span>Заказчик</span><strong>${esc(company)}</strong></div><p class="lead">${esc(task.need || 'Требуется уточнение')}</p><div class="detail-fields">${[['context','Контекст'], ['need','Потребность'], ['users','Для кого'], ['data','Данные и материалы'], ['constraints','Ограничения'], ['expectedResult','Ожидаемый результат'], ['successCriteria','Критерии успеха'], ['businessContact','Контакт бизнеса'], ['interactionFormat','Формат взаимодействия']].map(([key, label]) => `<div><span>${label}</span><p>${esc(task[key] || 'Требуется уточнение')}</p></div>`).join('')}</div></div>${renderProposalForm(task)}</section><aside class="panel side-summary"><p class="panel-tag">Готовность задачи</p><div class="big-score ${scoreClass(task.score)}"><strong>${task.score}</strong><span>/100</span></div><span class="level-pill ${scoreClass(task.score)}">${levelLabel[task.readinessLevel]}</span><div class="proposal-count"><strong>${proposals.length}</strong><span>предложений уже отправлено</span></div>${renderLastCardChange(task.lastChange)}<p class="tiny">Рейтинг не ограничивает доступ. Решение о выборе одной, нескольких или ни одной команды всегда принимает бизнес.</p>${sideAction}</aside></div>`);
}

function renderProposals() {
  const rows = store.proposals.map((proposal) => {
    const task = taskById(proposal.taskId);
    const team = teamById(proposal.teamId);
    return `<article class="panel proposal-row"><div class="proposal-head"><div><span class="topic">${esc(team?.name || 'Команда')}</span><h2>${esc(task?.title || 'Задача')}</h2><p class="team-stack">${esc(team?.skills || 'Навыки не указаны')} · ${esc(team?.technologies || 'Технологии не указаны')}</p></div><span class="status ${proposal.status}">${proposal.status === 'accepted' ? 'Принято' : proposal.status === 'rejected' ? 'Отклонено' : 'На рассмотрении'}</span></div><div class="proposal-content"><div><span>Идея</span><p>${esc(proposal.solutionIdea)}</p></div><div><span>План</span><p>${esc(proposal.plan)}</p></div><div><span>Срок и прототип</span><p>${esc(proposal.duration)} · <a href="${esc(proposal.prototypeUrl)}" target="_blank" rel="noreferrer">открыть ↗</a></p></div></div>${proposal.status === 'pending' ? `<div class="proposal-actions"><button class="secondary danger" data-action="reject" data-proposal-id="${proposal.id}">Отклонить</button><button class="primary" data-action="accept" data-proposal-id="${proposal.id}">Принять</button></div>` : ''}</article>`;
  }).join('');
  return page('Предложения команд', 'Сравните идеи и примите решение вручную. Sana не назначает команды автоматически.', `<div class="proposal-list">${rows || '<div class="panel empty-state"><div class="spark">✦</div><h2>Предложений пока нет</h2><p class="muted">Когда студенты или фрилансеры откликнутся на опубликованную задачу, предложения появятся здесь.</p><a class="text-link" href="#/catalog">Открыть каталог →</a></div>'}</div>`);
}

function renderLoading(message = 'Проверяем защищённую сессию…') {
  app.innerHTML = `<main class="auth-loading"><div class="loading-orb">✦</div><h1>Sana Hub</h1><p class="muted">${esc(message)}</p></main>`;
}

function redirectTo(path) {
  renderLoading('Перенаправляем…');
  queueMicrotask(() => navigate(path));
}

function render() {
  if (auth.status === 'loading') { renderLoading(); return; }
  const current = routePath();
  const protectedRoute = current === 'profile' || current.startsWith('onboarding/') || current.startsWith('business/');
  if (!auth.user && protectedRoute) {
    const selectedRole = current.startsWith('onboarding/student') ? '?role=student' : current.startsWith('onboarding/business') ? '?role=business' : '';
    redirectTo(selectedRole ? `register${selectedRole}` : 'login');
    return;
  }
  if (auth.user && (current === 'login' || current === 'register')) {
    redirectTo(userRole() === 'business' ? 'business/dashboard' : 'catalog');
    return;
  }
  if (current.startsWith('business/') && userRole() !== 'business') { redirectTo('catalog'); return; }
  if (current.startsWith('onboarding/') && current !== `onboarding/${userRole()}`) { redirectTo(`onboarding/${userRole()}`); return; }

  if (current === 'home') app.innerHTML = renderHome();
  else if (current === 'register') app.innerHTML = renderRegister();
  else if (current === 'login') app.innerHTML = renderLogin();
  else if (current.startsWith('onboarding/')) app.innerHTML = renderOnboarding(userRole());
  else if (current === 'business/dashboard') app.innerHTML = renderBusinessDashboard();
  else if (current === 'profile') app.innerHTML = renderProfile();
  else if (current === 'catalog') app.innerHTML = renderCatalog();
  else if (current.startsWith('task/')) app.innerHTML = renderTask(current.split('/')[1]);
  else if (current === 'business/intake') app.innerHTML = renderIntake();
  else if (current === 'business/card') app.innerHTML = renderCard();
  else if (current === 'business/proposals') app.innerHTML = renderProposals();
  else app.innerHTML = renderHome();
  if (persistenceError) app.querySelector('main')?.insertAdjacentHTML('afterbegin', `<div class="error-box global-error">${esc(persistenceError)}</div>`);
  if (flashMessage) { app.querySelector('main')?.insertAdjacentHTML('afterbegin', `<div class="success-box">✓ ${esc(flashMessage)}</div>`); flashMessage = ''; }
  bindEvents();
}
function bindEvents() {
  document.querySelector('#register-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const errorBox = document.querySelector('#auth-error');
    const password = String(values.get('password') || '');
    if (!form.checkValidity()) { form.reportValidity(); return; }
    if (password !== String(values.get('confirmPassword') || '')) { errorBox.textContent = 'Пароли не совпадают.'; errorBox.hidden = false; return; }
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      const body = await requestJson('/api/auth/register', { method: 'POST', body: JSON.stringify({ email: values.get('email'), password, role: values.get('role') }) });
      authError = '';
      setAuthUser(body.user);
      navigate(`onboarding/${body.user.role}`);
    } catch (error) {
      errorBox.textContent = error.message;
      errorBox.hidden = false;
      button.disabled = false;
    }
  });
  document.querySelector('#login-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.checkValidity()) { form.reportValidity(); return; }
    const values = new FormData(form);
    const errorBox = document.querySelector('#auth-error');
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      const body = await requestJson('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: values.get('email'), password: values.get('password') }) });
      authError = '';
      setAuthUser(body.user);
      navigate(body.user.role === 'business' ? 'business/dashboard' : 'catalog');
    } catch (error) {
      errorBox.textContent = error.message;
      errorBox.hidden = false;
      button.disabled = false;
    }
  });
  document.querySelectorAll('[data-action="logout"]').forEach((button) => button.addEventListener('click', async () => {
    button.disabled = true;
    try { await requestJson('/api/auth/logout', { method: 'POST', body: '{}' }); } catch { /* Expired sessions are cleared client-side too. */ }
    setAuthUser(null);
    navigate('home');
  }));
  document.querySelectorAll('a[href="#/business/intake"]').forEach((link) => link.addEventListener('click', () => {
    if (routePath() !== 'business/dashboard') return;
    const profile = userProfile();
    draft = emptyTask('draft-current');
    if (profile) {
      draft.businessContact = `${profile.name}, ${profile.contact}`;
      draft.interactionFormat = profile.interactionFormat;
      draft.company = profile.company;
      draft.industry = profile.industry;
    }
    analysis = null;
    aiError = '';
    aiState = 'idle';
    lastSavedCard = null;
    persistWorkflow();
  }));
  document.querySelector('#onboarding-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const type = userRole();
    const profile = Object.fromEntries([...form.entries()].map(([key, value]) => [key, String(value).trim()]));
    const errorBox = document.querySelector('#onboarding-error');
    if (!formElement.checkValidity()) { formElement.reportValidity(); return; }
    const button = formElement.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      const body = await requestJson('/api/auth/profile', { method: 'PUT', body: JSON.stringify(profile) });
      setAuthUser(body.user);
      if (type === 'business') {
        draft.businessContact ||= `${profile.name}, ${profile.contact}`;
        draft.interactionFormat ||= profile.interactionFormat;
        draft.company ||= profile.company;
        draft.industry ||= profile.industry;
      }
      flashMessage = 'Профиль сохранён на сервере.';
      navigate(type === 'business' ? 'business/dashboard' : 'catalog');
    } catch (error) {
      errorBox.textContent = error.message;
      errorBox.hidden = false;
      button.disabled = false;
    }
  });
  document.querySelector('[data-action="analyze"]')?.addEventListener('click', async () => {
    if (aiState === 'loading') return;
    const value = document.querySelector('#draft-input').value.trim();
    if (!value) { aiError = 'Сначала опишите задачу.'; render(); return; }
    aiError = '';
    lastSavedCard = null;
    draft = { ...draft, description: value };
    aiState = 'loading';
    persistWorkflow();
    render();
    try {
      analysis = await requestAI({ description: value, currentCard: draft });
      analysis.answers = {};
      draft = { ...draft, ...analysis.suggestedCard };
    } catch {
      aiError = 'AI-сервис недоступен. Использован локальный fallback; данные можно продолжить редактировать.';
      analysis = fallbackAnalyzeTask({ description: value, currentCard: draft });
      analysis.answers = {};
      draft = { ...draft, ...analysis.suggestedCard };
    } finally {
      aiState = 'idle';
      persistWorkflow();
      render();
    }
  });
  document.querySelector('[data-action="retry-ai"]')?.addEventListener('click', () => document.querySelector('[data-action="analyze"]')?.click());
  document.querySelector('[data-action="form-card"]')?.addEventListener('click', async () => {
    if (aiState === 'loading') return;
    const answers = {};
    document.querySelectorAll('[data-question]').forEach((input) => { answers[input.dataset.question] = input.value.trim(); });
    analysis.answers = answers;
    aiState = 'loading';
    persistWorkflow();
    render();
    try {
      const result = await requestAI({ description: draft.description, currentCard: analysis.suggestedCard, previousQuestions: analysis.questions, answers });
      analysis = { ...result, answers };
      draft = { ...draft, ...result.suggestedCard };
    } catch {
      analysis = { ...fallbackAnalyzeTask({ description: draft.description, currentCard: analysis.suggestedCard, answers }), answers };
      draft = { ...draft, ...analysis.suggestedCard };
      aiError = 'OpenAI API недоступен, поэтому применён локальный fallback.';
    } finally {
      lastSavedCard = { ...currentDraftCard() };
      aiState = 'idle';
      persistWorkflow();
      navigate('business/card');
    }
  });
  document.querySelector('[data-action="back-intake"]')?.addEventListener('click', () => navigate('business/intake'));
  document.querySelectorAll('[data-field]').forEach((input) => input.addEventListener('input', () => { if (analysis) analysis.suggestedCard[input.dataset.field] = input.value; else draft[input.dataset.field] = input.value; persistWorkflow(); renderCardLive(); }));
  document.querySelector('[data-action="save-card"]')?.addEventListener('click', () => { saveCardChange(currentDraftCard()); persistWorkflow(); flashMessage = 'Изменения сохранены. Рейтинг и история обновлены.'; render(); });
  document.querySelector('[data-action="publish"]')?.addEventListener('click', () => {
    const candidate = currentDraftCard();
    if (!candidate.title?.trim() || !candidate.need?.trim()) { aiError = 'Заполните название и потребность.'; render(); return; }
    const savedCard = saveCardChange(candidate);
    const card = { ...savedCard, confirmed: true };
    const scored = scoreTask(card);
    const published = { ...card, ...scored, status: TASK_STATUS.PUBLISHED, topic: card.topic || 'Другое' };
    store.tasks = [published, ...store.tasks.filter((task) => task.id !== published.id)];
    clearWorkflow();
    if (!persistStore()) { render(); return; }
    flashMessage = 'Карточка подтверждена, рейтинг пересчитан и задача опубликована.';
    navigate('catalog');
  });
  document.querySelector('[data-action="edit-task"]')?.addEventListener('click', (event) => {
    const task = taskById(event.currentTarget.dataset.taskId);
    if (!task) return;
    draft = { ...task, confirmed: false };
    analysis = { suggestedCard: draft, questions: [], missingFields: [], answers: {}, source: 'manual' };
    lastSavedCard = { ...task };
    persistWorkflow();
    navigate('business/card');
  });
  document.querySelector('[data-action="focus-proposal"]')?.addEventListener('click', () => document.querySelector('#proposal-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  document.querySelector('#proposal-form')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const proposalForm = event.currentTarget;
    if (proposalForm.dataset.submitting === 'true') return;
    proposalForm.dataset.submitting = 'true';
    const submitButton = proposalForm.querySelector('button[type="submit"]');
    if (submitButton) { submitButton.disabled = true; submitButton.textContent = 'Отправляем…'; }
    const form = new FormData(proposalForm);
    const taskId = proposalForm.dataset.taskId;
    const teamId = String(form.get('teamId') || '');
    const errorBox = document.querySelector('#proposal-error');
    const release = () => { proposalForm.dataset.submitting = 'false'; if (submitButton) { submitButton.disabled = false; submitButton.textContent = 'Отправить предложение →'; } };
    if (!taskById(taskId) || !teamById(teamId)) { errorBox.textContent = 'Задача или профиль команды больше недоступны. Обновите страницу.'; errorBox.hidden = false; release(); return; }
    const result = createProposal({ taskId, teamId, solutionIdea: form.get('solutionIdea'), plan: form.get('plan'), duration: form.get('duration'), prototypeUrl: form.get('prototypeUrl') });
    if (!result.proposal) { errorBox.textContent = Object.values(result.errors).join(' · '); errorBox.hidden = false; release(); return; }
    store.proposals.unshift(result.proposal);
    if (!persistStore()) { store.proposals.shift(); errorBox.textContent = persistenceError; errorBox.hidden = false; release(); return; }
    flashMessage = 'Предложение отправлено бизнесу и сохранено.';
    render();
  });
  document.querySelectorAll('[data-action="accept"], [data-action="reject"]').forEach((button) => button.addEventListener('click', () => {
    const proposal = store.proposals.find((item) => item.id === button.dataset.proposalId);
    const decision = button.dataset.action === 'accept' ? 'accepted' : 'rejected';
    const previous = proposal?.status;
    if (!decideProposal(proposal, decision)) return;
    if (!persistStore()) { proposal.status = previous; render(); return; }
    flashMessage = decision === 'accepted' ? 'Предложение принято вручную.' : 'Предложение отклонено вручную.';
    render();
  }));
  document.querySelector('#catalog-search')?.addEventListener('input', filterCatalog); document.querySelector('#topic-filter')?.addEventListener('change', filterCatalog); document.querySelector('#level-filter')?.addEventListener('change', filterCatalog);
}
function renderCardLive() { const existing = document.querySelector('[data-score-content]'); if (!existing) return; const card = currentDraftCard(); const scored = previewTaskScore(card); existing.innerHTML = scorePanelContent(scored, card.lastChange); }
function filterCatalog() { const topic = document.querySelector('#topic-filter')?.value || 'all'; const level = document.querySelector('#level-filter')?.value || 'all'; const query = document.querySelector('#catalog-search')?.value || ''; const tasks = selectCatalogTasks(store.tasks, { topic, level, query }); document.querySelector('#catalog-grid').innerHTML = catalogResults(tasks); const count = document.querySelector('#catalog-count'); if (count) count.textContent = `${tasks.length} задач`; }

window.addEventListener('hashchange', render);
window.addEventListener('storage', () => { store = loadStore(); draft = store.workflow?.draft ? { ...store.workflow.draft } : draft; analysis = store.workflow?.analysis ? structuredClone(store.workflow.analysis) : analysis; lastSavedCard = store.workflow?.lastSavedCard ? { ...store.workflow.lastSavedCard } : lastSavedCard; if (auth.user) syncDerivedStudentTeam(auth.user); render(); });
window.resetSanaDemo = () => { store = resetStore(); analysis = null; draft = emptyTask('draft-current'); lastSavedCard = null; persistenceError = ''; render(); };
render();
void loadAuth();
