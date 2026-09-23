import { api, exportLegacyBrowserData, newIdempotencyKey } from './api.js';
import { CARD_FIELD_LABELS, formatCardChangeTime } from './services/card-change.js';
import { selectCatalogTasks, validateProposalInput } from './services/marketplace.js';
import { levelLabel, previewTaskScore } from './services/scoring.js';

const blankCard = () => ({
  title: '', description: '', context: '', need: '', users: '', data: '', constraints: '',
  expectedResult: '', successCriteria: '', businessContact: '', interactionFormat: '',
  company: '', industry: '', topic: 'Другое',
});

let auth = { status: 'loading', user: null };
let serverData = { catalog: [], myTasks: [], proposals: [] };
let dataState = 'loading';
let dataError = '';
let authError = '';
let flashMessage = '';
let activeTask = null;
let workflow = null;
let draft = blankCard();
let analysis = null;
let workflowLoadingId = '';
let aiState = 'idle';
let aiError = '';
let saveState = 'idle';
let saveError = '';
let saveTimer = null;
let saveChain = Promise.resolve();
let localRevision = 0;
let sessionGeneration = 0;
const actionKeys = new Map();

const app = document.querySelector('#app');
const route = () => window.location.hash.replace(/^#\/?/, '') || 'home';
const routePath = () => route().split('?')[0];
const routeQuery = () => new URLSearchParams(route().split('?')[1] || '');
const navigate = (path) => { window.location.hash = `#/${path}`; };
const esc = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
const scoreClass = (score) => score >= 90 ? 'priority' : score >= 70 ? 'ready' : score >= 40 ? 'working' : 'draft';
const userRole = () => auth.user?.role || null;
const userProfile = () => auth.user?.profile || null;
const currentDraftCard = () => ({ ...draft });
const taskById = (id) => [...serverData.myTasks, ...serverData.catalog].find((task) => task.id === id);
const keyFor = (operation) => { if (!actionKeys.has(operation)) actionKeys.set(operation, newIdempotencyKey()); return actionKeys.get(operation); };
const clearKey = (operation) => actionKeys.delete(operation);

function clearPrivateState() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
  saveChain = Promise.resolve();
  activeTask = null;
  workflow = null;
  draft = blankCard();
  analysis = null;
  workflowLoadingId = '';
  aiState = 'idle';
  aiError = '';
  saveState = 'idle';
  saveError = '';
  localRevision = 0;
  serverData.myTasks = [];
  serverData.proposals = [];
}

function setAuthUser(user) {
  const previousId = auth.user?.id;
  if (previousId !== user?.id) {
    sessionGeneration += 1;
    clearPrivateState();
  }
  auth = { status: 'ready', user: user || null };
}

function hydrateActive(value, { preserveDraft = false } = {}) {
  activeTask = value.task;
  workflow = value.workflow;
  if (!preserveDraft) {
    draft = { ...blankCard(), ...workflow.draft, description: workflow.description || workflow.draft?.description || '' };
    analysis = workflow.questions.length || workflow.missingFields.length || Object.keys(workflow.suggestedCard || {}).length
      ? { questions: workflow.questions, missingFields: workflow.missingFields, suggestedCard: workflow.suggestedCard, answers: workflow.answers, source: workflow.source }
      : null;
    localRevision = 0;
  } else {
    workflow = { ...workflow, draft: { ...draft }, answers: analysis?.answers || workflow.answers };
  }
}

async function refreshServerData({ renderAfter = true } = {}) {
  const generation = sessionGeneration;
  dataState = 'loading';
  dataError = '';
  if (renderAfter) render();
  try {
    const requests = [api.catalog()];
    if (auth.user?.role === 'business') requests.push(api.myTasks(), api.myProposals());
    else if (auth.user?.role === 'student') requests.push(Promise.resolve({ tasks: [] }), api.myProposals());
    else requests.push(Promise.resolve({ tasks: [] }), Promise.resolve({ proposals: [] }));
    const [catalog, mine, proposals] = await Promise.all(requests);
    if (generation !== sessionGeneration) return;
    serverData = { catalog: catalog.tasks || [], myTasks: mine.tasks || [], proposals: proposals.proposals || [] };
    dataState = 'ready';
  } catch (error) {
    if (generation !== sessionGeneration) return;
    dataState = 'error';
    dataError = error.message;
  }
  if (renderAfter) render();
}

async function loadAuth() {
  try { setAuthUser((await api.auth()).user); }
  catch (error) { auth = { status: 'ready', user: null }; authError = error.message; }
  await refreshServerData({ renderAfter: false });
  render();
}

async function openWorkflow(taskId, destination = 'business/intake') {
  if (!taskId || workflowLoadingId === taskId) return;
  const generation = sessionGeneration;
  workflowLoadingId = taskId;
  render();
  try {
    const value = await api.workflow(taskId);
    if (generation !== sessionGeneration) return;
    hydrateActive(value);
    workflowLoadingId = '';
    navigate(`${destination}?id=${encodeURIComponent(taskId)}`);
    render();
  } catch (error) {
    if (generation !== sessionGeneration) return;
    workflowLoadingId = '';
    dataError = error.message;
    render();
  }
}

function workflowPayload(step = workflow?.step || 'description') {
  return {
    version: workflow.version,
    description: draft.description || '',
    step,
    questions: analysis?.questions || [],
    answers: analysis?.answers || {},
    missingFields: analysis?.missingFields || [],
    suggestedCard: analysis?.suggestedCard || {},
    draft: currentDraftCard(),
    source: analysis?.source || workflow.source || 'manual',
  };
}

function updateSaveStatus() {
  const element = document.querySelector('[data-save-status]');
  if (!element) return;
  element.className = `save-status ${saveState}`;
  element.textContent = saveState === 'saving' ? 'Сохраняется…' : saveState === 'saved' ? 'Сохранено на сервере' : saveState === 'error' ? `Ошибка: ${saveError}` : '';
}

function persistWorkflowNow(step) {
  if (!activeTask || !workflow) return Promise.resolve(null);
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
  const generation = sessionGeneration;
  const taskId = activeTask.id;
  saveChain = saveChain.catch(() => null).then(async () => {
    if (generation !== sessionGeneration || activeTask?.id !== taskId) return null;
    saveState = 'saving';
    saveError = '';
    updateSaveStatus();
    try {
      const value = await api.saveWorkflow(taskId, workflowPayload(step));
      if (generation !== sessionGeneration || activeTask?.id !== taskId) return null;
      hydrateActive(value, { preserveDraft: true });
      saveState = 'saved';
      updateSaveStatus();
      return value;
    } catch (error) {
      if (generation !== sessionGeneration) return null;
      saveState = 'error';
      saveError = error.message;
      updateSaveStatus();
      throw error;
    }
  });
  return saveChain;
}

function scheduleAutosave(step) {
  localRevision += 1;
  saveState = 'saving';
  updateSaveStatus();
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { persistWorkflowNow(step).catch(() => {}); }, 550);
}

function header() {
  const current = routePath();
  const role = userRole();
  const pending = serverData.proposals.filter((proposal) => proposal.status === 'pending').length;
  const roleLinks = role === 'business'
    ? `<a class="${current === 'business/dashboard' ? 'active' : ''}" href="#/business/dashboard">Дашборд</a><a class="${current === 'business/intake' || current === 'business/card' ? 'active' : ''}" href="#/business/intake">Создать задачу</a><a class="${current === 'business/proposals' ? 'active' : ''}" href="#/business/proposals">Предложения <span class="nav-count">${pending}</span></a>`
    : `<a class="${current === 'catalog' || current.startsWith('task/') ? 'active' : ''}" href="#/catalog">Каталог задач</a>`;
  const account = auth.user
    ? `<a class="account-link ${current === 'profile' ? 'active' : ''}" href="#/profile">${esc(auth.user.profile?.name || 'Профиль')}</a>`
    : `<div class="auth-actions"><a class="secondary compact" href="#/register">Регистрация</a><a class="primary compact" href="#/login">Вход</a></div>`;
  return `<header class="topbar"><a class="brand" href="#/home"><span class="brand-mark">S</span><span>Sana <em>Hub</em></span></a><nav><a class="${current === 'home' ? 'active' : ''}" href="#/home">Главная</a>${roleLinks}</nav>${account}</header>`;
}

function page(title, subtitle, content) {
  return `${header()}<main class="page"><div class="page-heading"><p class="eyebrow">AI SANA CHALLENGE HUB</p><h1>${esc(title)}</h1><p class="muted">${esc(subtitle)}</p></div>${content}</main>`;
}

function scoreBadge(task) {
  return `<span class="score-badge ${scoreClass(task.score)}"><strong>${task.score}</strong>/100 · ${esc(levelLabel[task.readinessLevel] || task.readinessLevel)}</span>`;
}

function renderHome() {
  const businessHref = auth.user ? (userRole() === 'business' ? '#/business/dashboard' : '#/catalog') : '#/register?role=business';
  const studentHref = auth.user ? (userRole() === 'student' ? '#/catalog' : '#/business/dashboard') : '#/register?role=student';
  return `${header()}<main class="landing"><section class="landing-hero"><p class="eyebrow">AI SANA CHALLENGE HUB</p><h1>От бизнес-задачи<br><span>к реальному решению</span></h1><p class="landing-copy">Бизнес формулирует задачу. AI помогает уточнить её. Студенты находят реальные задачи и предлагают решения.</p><div class="landing-actions"><a class="primary" href="${businessHref}">Я представитель бизнеса →</a><a class="secondary" href="${studentHref}">Я студент / фрилансер</a></div></section><section class="flow-strip">${['Опишите задачу', 'Уточните её с AI', 'Получите рейтинг', 'Опубликуйте', 'Получите предложения'].map((item, index) => `<div><span>${index + 1}</span><strong>${item}</strong></div>`).join('')}</section></main>`;
}

function renderRegister() {
  const selectedRole = routeQuery().get('role') === 'student' ? 'student' : 'business';
  return page('Создать аккаунт', 'Аккаунт, роль, профиль и сессия хранятся на сервере.', `<div class="auth-layout"><form id="register-form" class="panel auth-form"><label class="field"><span>Email</span><input name="email" type="email" autocomplete="email" required /></label><label class="field"><span>Пароль</span><input name="password" type="password" minlength="8" required /></label><label class="field"><span>Подтверждение пароля</span><input name="confirmPassword" type="password" minlength="8" required /></label><fieldset class="role-choice"><legend>Роль</legend><label><input type="radio" name="role" value="business" ${selectedRole === 'business' ? 'checked' : ''}/> Business</label><label><input type="radio" name="role" value="student" ${selectedRole === 'student' ? 'checked' : ''}/> Student</label></fieldset><div id="auth-error" class="error-box" ${authError ? '' : 'hidden'}>${esc(authError)}</div><button class="primary full" type="submit">Зарегистрироваться →</button><p class="auth-foot">Уже есть аккаунт? <a href="#/login">Войти</a></p></form></div>`);
}

function renderLogin() {
  return page('Вход в Sana Hub', 'Используйте email и пароль, указанные при регистрации.', `<div class="auth-layout"><form id="login-form" class="panel auth-form"><label class="field"><span>Email</span><input name="email" type="email" required /></label><label class="field"><span>Пароль</span><input name="password" type="password" required /></label><div id="auth-error" class="error-box" ${authError ? '' : 'hidden'}>${esc(authError)}</div><button class="primary full" type="submit">Войти →</button><p class="auth-foot">Нет аккаунта? <a href="#/register">Зарегистрироваться</a></p></form></div>`);
}

function renderOnboarding(type) {
  const isBusiness = type === 'business';
  const profile = userProfile() || {};
  const fields = isBusiness
    ? [['name', 'Имя', true], ['company', 'Название компании', true], ['industry', 'Отрасль', true], ['contact', 'Контакт / email', true], ['interactionFormat', 'Формат взаимодействия', true]]
    : [['name', 'Имя', true], ['team', 'Название команды', false], ['skills', 'Навыки', true], ['technologies', 'Технологии', true], ['interests', 'Интересы', true], ['portfolio', 'GitHub или портфолио', false]];
  return page(isBusiness ? 'Профиль представителя бизнеса' : 'Профиль студента / фрилансера', 'Профиль хранится в SQLite и связан с текущим аккаунтом.', `<div class="onboarding-layout"><form id="onboarding-form" class="panel onboarding-form"><div class="profile-form-grid">${fields.map(([name, label, required]) => `<label class="field"><span>${label}${required ? ' *' : ''}</span>${['interactionFormat', 'skills', 'technologies', 'interests'].includes(name) ? `<textarea name="${name}" rows="3" ${required ? 'required' : ''}>${esc(profile[name] || '')}</textarea>` : `<input name="${name}" value="${esc(profile[name] || '')}" ${required ? 'required' : ''} ${name === 'contact' ? 'type="email"' : name === 'portfolio' ? 'type="url"' : ''}/>`}</label>`).join('')}</div><div id="onboarding-error" class="error-box" hidden></div><button class="primary full" type="submit">Сохранить профиль →</button></form></div>`);
}

function ownTaskCard(task) {
  const published = task.status === 'published';
  return `<article class="task-card"><div class="task-top"><span class="topic">${published ? 'Опубликована' : 'Приватный черновик'}</span>${published ? scoreBadge(task) : '<span class="level-pill draft">Черновик</span>'}</div><h3>${esc(task.title || 'Новая бизнес-задача')}</h3><p>${esc(task.need || task.description || 'Описание ещё не заполнено')}</p><div class="task-meta"><span>Версия ${task.version}</span><span>${task.proposalCount || 0} предложений</span></div>${published ? `<a class="primary task-cta" href="#/task/${encodeURIComponent(task.id)}">Открыть →</a>` : `<button class="primary task-cta" data-action="resume-task" data-task-id="${esc(task.id)}">Продолжить →</button>`}</article>`;
}

function renderBusinessDashboard() {
  const profile = userProfile();
  if (!profile) return renderOnboarding('business');
  const published = serverData.myTasks.filter((task) => task.status === 'published');
  const pending = serverData.proposals.filter((proposal) => proposal.status === 'pending');
  return page(`Здравствуйте, ${profile.name}`, `${profile.company} · ${profile.industry}`, `<section class="metric-grid"><article class="panel metric-card"><span>Опубликовано задач</span><strong>${published.length}</strong></article><article class="panel metric-card"><span>Всего предложений</span><strong>${serverData.proposals.length}</strong></article><article class="panel metric-card"><span>На рассмотрении</span><strong>${pending.length}</strong></article></section><section class="dashboard-head"><div><p class="panel-tag">Ваши данные</p><h2>Задачи и черновики</h2></div><button class="primary" data-action="new-task">Создать новую задачу →</button></section><div class="catalog-grid">${serverData.myTasks.length ? serverData.myTasks.map(ownTaskCard).join('') : '<div class="panel empty-state"><h2>Пока нет задач</h2><p class="muted">Создайте первую задачу и уточните её с AI.</p></div>'}</div>`);
}

function proposalStatus(proposal) {
  return proposal.status === 'accepted' ? 'Принято' : proposal.status === 'rejected' ? 'Отклонено' : 'На рассмотрении';
}

function renderProfile() {
  const role = userRole();
  const profile = userProfile();
  if (!profile) return page('Профиль', 'Завершите настройку аккаунта.', `<section class="panel empty-state"><h2>Профиль ещё не заполнен</h2><a class="primary" href="#/onboarding/${role}">Заполнить профиль →</a><button class="secondary logout-button" data-action="logout">Выйти</button></section>`);
  const entries = role === 'business'
    ? [['Имя', profile.name], ['Компания', profile.company], ['Отрасль', profile.industry], ['Контакт', profile.contact], ['Формат взаимодействия', profile.interactionFormat]]
    : [['Имя', profile.name], ['Команда', profile.team || 'Фрилансер'], ['Навыки', profile.skills], ['Технологии', profile.technologies], ['Интересы', profile.interests], ['Портфолио', profile.portfolio || 'Не указано']];
  const outgoing = role === 'student' ? `<section class="panel profile-proposals"><h2>Мои предложения</h2>${serverData.proposals.length ? serverData.proposals.map((proposal) => `<div class="proposal-mini"><div><strong>${esc(proposal.taskTitle || 'Задача')}</strong><p>${esc(proposal.solutionIdea)}</p></div><span class="status ${proposal.status}">${proposalStatus(proposal)}</span></div>`).join('') : '<p class="muted">Вы ещё не отправляли предложений.</p>'}</section>` : '';
  return page('Профиль', role === 'business' ? 'Данные представителя бизнеса' : 'Данные студента / фрилансера', `<section class="panel profile-card"><div class="profile-avatar">${esc(profile.name?.[0] || '?')}</div><div><h2>${esc(profile.name)}</h2><p class="muted">${esc(auth.user.email)}</p><div class="profile-details">${entries.map(([label, value]) => `<div><span>${label}</span><p>${esc(value)}</p></div>`).join('')}</div><div class="profile-actions"><a class="secondary" href="#/onboarding/${role}">Редактировать</a><button class="secondary" data-action="export-legacy">Экспорт старых browser-данных</button><button class="secondary danger" data-action="logout">Выйти</button></div></div></section>${outgoing}`);
}

function saveStatusMarkup() {
  return `<p class="save-status ${saveState}" data-save-status>${saveState === 'saving' ? 'Сохраняется…' : saveState === 'saved' ? 'Сохранено на сервере' : saveState === 'error' ? `Ошибка: ${esc(saveError)}` : ''}</p>`;
}

function renderIntake() {
  if (!activeTask || !workflow) return page('Новая бизнес-задача', 'Сервер создаст отдельный приватный черновик со стабильным ID.', `<section class="panel empty-state"><div class="spark">✦</div><h2>Начните новый черновик</h2><p class="muted">Он не появится в каталоге до ручного подтверждения.</p><button class="primary" data-action="new-task">Создать приватный черновик →</button></section>`);
  const questions = analysis?.questions || [];
  const scored = previewTaskScore(draft);
  const warning = analysis?.warning ? `<div class="warning-box">${esc(analysis.warning)}</div>` : '';
  const insight = aiState === 'loading' ? `<div class="loading-state"><div class="loading-orb">✦</div><h2>AI анализирует задачу…</h2></div>` : analysis
    ? `<div class="panel-tag mint">AI-разбор · ${esc(analysis.source || 'fallback')}</div>${warning}<h2>Нужно уточнить ${analysis.missingFields?.length || 0} полей</h2><div class="question-list">${questions.map((question, index) => `<label class="question question-field"><span>${String(index + 1).padStart(2, '0')}</span><textarea data-question="${esc(question.field)}" rows="2">${esc(analysis.answers?.[question.field] || '')}</textarea><small><b>${esc(question.field)}</b> · ${esc(question.text)}</small></label>`).join('')}</div><button class="secondary full" data-action="form-card">Сформировать карточку задачи →</button>`
    : `<div class="empty-insight"><div class="spark">✦</div><h2>Здесь появится AI-разбор</h2><p class="muted">AI найдёт реальные пробелы и задаст релевантные вопросы.</p></div>`;
  return page('Превратите идею в понятную задачу', `Приватный серверный черновик ${activeTask.id}`, `<section class="stepper"><span class="done">01 Описание</span><i></i><span class="${analysis ? 'done' : ''}">02 AI-анализ</span><i></i><span class="${analysis ? 'done' : ''}">03 Вопросы</span><i></i><span>04 Карточка</span></section><div class="grid two-col"><section class="panel hero-panel"><div class="panel-tag">Черновик · версия ${workflow.version}</div><h2>Что нужно решить?</h2>${aiError ? `<div class="error-box">${esc(aiError)}</div>` : ''}<textarea id="draft-input" rows="6" placeholder="Опишите проблему в 1–3 предложениях">${esc(draft.description)}</textarea>${saveStatusMarkup()}<button class="primary full" data-action="analyze" ${aiState === 'loading' ? 'disabled' : ''}>${aiState === 'loading' ? 'AI анализирует задачу…' : 'Проанализировать с AI →'}</button></section><section class="panel insight-panel">${insight}</section></div>${analysis ? `<section class="panel next-card"><div><h2>Прогноз готовности</h2><p class="muted">До подтверждения карточка остаётся приватной.</p></div><div class="score-ring ${scoreClass(scored.score)}"><strong>${scored.score}</strong><span>/100</span></div></section>` : ''}`);
}

const fieldMeta = [['title', 'Название задачи'], ['context', 'Контекст'], ['need', 'Потребность / проблема'], ['users', 'Целевые пользователи'], ['data', 'Данные и материалы'], ['constraints', 'Ограничения'], ['expectedResult', 'Ожидаемый результат'], ['successCriteria', 'Критерии успеха'], ['businessContact', 'Контакт бизнеса'], ['interactionFormat', 'Формат взаимодействия']];

function renderLastCardChange(change) {
  if (!change?.fields?.length) return '';
  const delta = Number(change.scoreDelta || 0);
  const deltaText = delta > 0 ? `+${delta}` : delta < 0 ? `−${Math.abs(delta)}` : 'без изменений';
  return `<section class="last-card-change"><h3>Последнее подтверждённое изменение</h3><time>${esc(formatCardChangeTime(change.changedAt))}</time><p>Обновлено: <strong>${esc(change.fields.map((field) => CARD_FIELD_LABELS[field] || field).join(', '))}</strong></p><div class="change-score ${delta > 0 ? 'positive' : delta < 0 ? 'negative' : 'neutral'}"><span>Готовность</span><strong>${change.scoreBefore} → ${change.scoreAfter} · ${deltaText}</strong></div></section>`;
}

function scorePanelContent(scored, lastChange) {
  return `<p class="panel-tag">Прогноз готовности</p><div class="big-score ${scoreClass(scored.score)}"><strong>${scored.score}</strong><span>/100</span></div><span class="level-pill ${scoreClass(scored.score)}">${esc(levelLabel[scored.readinessLevel])}</span>${renderLastCardChange(lastChange)}<div class="breakdown">${scored.breakdown.map((item) => `<div class="breakdown-row"><span>${esc(item.label)}</span><b>${item.points}/${item.max}</b><div class="bar"><i style="width:${(item.points / item.max) * 100}%"></i></div></div>`).join('')}</div><div class="recommendations"><b>Как улучшить рейтинг</b>${scored.recommendations.length ? `<ul>${scored.recommendations.map((item) => `<li>${esc(item)}</li>`).join('')}</ul>` : '<p>Достигнут максимум 100/100.</p>'}</div>`;
}

function renderCard() {
  if (!activeTask || !workflow) return renderIntake();
  const scored = previewTaskScore(draft);
  return page('Соберите карточку задачи', 'Правки автоматически сохраняются в приватную редакцию. Публичная карточка изменится только после подтверждения.', `<div class="grid card-layout"><section class="panel card-form"><div class="panel-head"><div><p class="panel-tag">Приватная редакция · версия ${workflow.version}</p><h2>${esc(draft.title || 'Новая задача')}</h2></div><span class="ai-chip">✦ editable</span></div>${saveStatusMarkup()}${aiError ? `<div class="error-box">${esc(aiError)}</div>` : ''}<div class="form-grid">${fieldMeta.map(([key, label]) => `<label class="field"><span>${label}</span><textarea data-field="${key}" rows="${key === 'title' ? 2 : 3}" placeholder="Требуется уточнение">${esc(draft[key])}</textarea></label>`).join('')}</div><div class="form-actions"><button class="secondary" data-action="back-intake">← К вопросам</button><button class="secondary" data-action="save-card">Сохранить сейчас</button></div></section><aside class="panel score-panel"><div data-score-content>${scorePanelContent(scored, activeTask.lastChange)}</div><button class="primary full" data-action="publish">Подтвердить и опубликовать</button></aside></div>`);
}

function taskCard(task) {
  return `<article class="task-card"><div class="task-top"><span class="topic">${esc(task.topic)}</span>${scoreBadge(task)}</div><p class="company-line">${esc(task.company || 'Компания не указана')}${task.industry ? ` · ${esc(task.industry)}` : ''}</p><h3>${esc(task.title)}</h3><p>${esc(task.need || task.context || task.description)}</p><div class="task-meta"><span>${task.expectedResult ? 'Результат описан' : 'Нужны детали'}</span><span>${task.proposalCount || 0} предложений</span></div><a class="primary task-cta" href="#/task/${encodeURIComponent(task.id)}">Открыть задачу →</a></article>`;
}

function catalogResults(tasks) {
  return tasks.length ? tasks.map(taskCard).join('') : '<div class="panel empty-state catalog-empty"><h2>Задачи не найдены</h2><p class="muted">Измените поиск или фильтры.</p></div>';
}

function renderCatalog() {
  const tasks = selectCatalogTasks(serverData.catalog);
  const topics = [...new Set(tasks.map((task) => task.topic))];
  return page('Каталог реальных задач', 'Все подтверждённые задачи видны независимо от рейтинга.', `<section class="catalog-controls panel"><label class="catalog-search"><span>Поиск</span><input id="catalog-search" type="search" /></label><div class="filters"><label><span>Тема</span><select id="topic-filter"><option value="all">Все темы</option>${topics.map((topic) => `<option>${esc(topic)}</option>`).join('')}</select></label><label><span>Готовность</span><select id="level-filter"><option value="all">Все уровни</option>${Object.entries(levelLabel).map(([key, label]) => `<option value="${key}">${label}</option>`).join('')}</select></label></div></section><div class="catalog-toolbar"><strong id="catalog-count">${tasks.length} задач</strong></div><div id="catalog-grid" class="catalog-grid">${catalogResults(tasks)}</div>`);
}

function renderProposalForm(task) {
  if (!auth.user) return `<section class="panel proposal-panel"><h2>Войдите как студент</h2><a class="primary" href="#/login">Войти</a></section>`;
  if (userRole() !== 'student') return `<section class="panel proposal-panel"><h2>Предложения отправляют студенты</h2><p class="muted">Выбор команды выполняет бизнес вручную.</p></section>`;
  if (!userProfile()) return `<section class="panel proposal-panel"><h2>Сначала заполните профиль</h2><a class="primary" href="#/onboarding/student">Заполнить профиль →</a></section>`;
  const profile = userProfile();
  return `<section class="panel proposal-panel"><h2>Предложить решение</h2><div class="proposal-profile"><div class="profile-avatar">${esc(profile.name?.[0] || '?')}</div><div><strong>${esc(profile.team || profile.name)}</strong><span>${esc(profile.skills)}</span></div></div><form id="proposal-form" data-task-id="${esc(task.id)}" novalidate><label class="field"><span>Идея решения</span><textarea name="solutionIdea" required rows="3"></textarea></label><label class="field"><span>План реализации</span><textarea name="plan" required rows="3"></textarea></label><label class="field"><span>Ожидаемый срок</span><input name="duration" required /></label><label class="field"><span>Ссылка на прототип</span><input name="prototypeUrl" type="url" required /></label><div id="proposal-error" class="error-box" hidden></div><button class="primary" type="submit">Отправить предложение →</button></form></section>`;
}

function renderTask(id) {
  const task = taskById(id);
  if (!task) return page('Задача не найдена', '', '<div class="panel empty-state"><a href="#/catalog">Вернуться в каталог →</a></div>');
  const sideAction = task.canEdit
    ? `<button class="secondary full" data-action="edit-task" data-task-id="${esc(task.id)}">Редактировать карточку</button>`
    : userRole() === 'student' ? '<button class="primary full" data-action="focus-proposal">Предложить решение</button>' : !auth.user ? '<a class="primary full" href="#/login">Войти, чтобы предложить</a>' : '';
  return page(task.title, `${task.company || 'Компания не указана'}${task.industry ? ` · ${task.industry}` : ''} · ${task.topic}`, `<div class="task-detail-layout"><section><a class="back-link" href="#/catalog">← Назад</a><div class="panel detail-panel"><div class="task-top"><span class="topic">${esc(task.topic)}</span>${scoreBadge(task)}</div><p class="lead">${esc(task.need || 'Требуется уточнение')}</p><div class="detail-fields">${[['context','Контекст'], ['need','Потребность'], ['users','Для кого'], ['data','Данные'], ['constraints','Ограничения'], ['expectedResult','Ожидаемый результат'], ['successCriteria','Критерии успеха'], ['businessContact','Контакт'], ['interactionFormat','Формат взаимодействия']].map(([key, label]) => `<div><span>${label}</span><p>${esc(task[key] || 'Требуется уточнение')}</p></div>`).join('')}</div></div>${renderProposalForm(task)}</section><aside class="panel side-summary"><div class="big-score ${scoreClass(task.score)}"><strong>${task.score}</strong><span>/100</span></div><span class="level-pill ${scoreClass(task.score)}">${esc(levelLabel[task.readinessLevel])}</span><div class="proposal-count"><strong>${task.proposalCount || 0}</strong><span>предложений</span></div>${renderLastCardChange(task.lastChange)}${sideAction}</aside></div>`);
}

function renderProposals() {
  const rows = serverData.proposals.map((proposal) => `<article class="panel proposal-row"><div class="proposal-head"><div><span class="topic">${esc(proposal.team?.name || 'Команда')}</span><h2>${esc(proposal.taskTitle || 'Задача')}</h2><p>${esc(proposal.team?.skills || '')}</p></div><span class="status ${proposal.status}">${proposalStatus(proposal)}</span></div><div class="proposal-content"><div><span>Идея</span><p>${esc(proposal.solutionIdea)}</p></div><div><span>План</span><p>${esc(proposal.plan)}</p></div><div><span>Срок и прототип</span><p>${esc(proposal.duration)} · <a href="${esc(proposal.prototypeUrl)}" target="_blank" rel="noreferrer">открыть ↗</a></p></div></div>${proposal.status === 'pending' ? `<div class="proposal-actions"><button class="secondary danger" data-action="reject" data-proposal-id="${esc(proposal.id)}">Отклонить</button><button class="primary" data-action="accept" data-proposal-id="${esc(proposal.id)}">Принять</button></div>` : ''}</article>`).join('');
  return page('Предложения команд', 'Здесь видны только предложения по вашим задачам. Решение всегда принимается вручную.', `<div class="proposal-list">${rows || '<div class="panel empty-state"><h2>Предложений пока нет</h2></div>'}</div>`);
}

function renderLoading(message = 'Загружаем данные с сервера…') {
  app.innerHTML = `<main class="auth-loading"><div class="loading-orb">✦</div><h1>Sana Hub</h1><p class="muted">${esc(message)}</p></main>`;
}

function redirectTo(path) {
  renderLoading('Перенаправляем…');
  queueMicrotask(() => navigate(path));
}

function render() {
  if (auth.status === 'loading') { renderLoading('Проверяем защищённую сессию…'); return; }
  const current = routePath();
  const protectedRoute = current === 'profile' || current.startsWith('onboarding/') || current.startsWith('business/');
  if (!auth.user && protectedRoute) { redirectTo('login'); return; }
  if (auth.user && ['login', 'register'].includes(current)) { redirectTo(userRole() === 'business' ? 'business/dashboard' : 'catalog'); return; }
  if (current.startsWith('business/') && userRole() !== 'business') { redirectTo('catalog'); return; }
  if (current.startsWith('onboarding/') && current !== `onboarding/${userRole()}`) { redirectTo(`onboarding/${userRole()}`); return; }
  if (dataState === 'loading' && !['home', 'login', 'register'].includes(current)) { renderLoading(); return; }

  if (['business/intake', 'business/card'].includes(current)) {
    const id = routeQuery().get('id');
    if (id && activeTask?.id !== id) {
      renderLoading('Восстанавливаем приватный черновик…');
      queueMicrotask(() => openWorkflow(id, current));
      return;
    }
  }

  if (current === 'home') app.innerHTML = renderHome();
  else if (current === 'register') app.innerHTML = renderRegister();
  else if (current === 'login') app.innerHTML = renderLogin();
  else if (current.startsWith('onboarding/')) app.innerHTML = renderOnboarding(userRole());
  else if (current === 'business/dashboard') app.innerHTML = renderBusinessDashboard();
  else if (current === 'profile') app.innerHTML = renderProfile();
  else if (current === 'catalog') app.innerHTML = renderCatalog();
  else if (current.startsWith('task/')) app.innerHTML = renderTask(decodeURIComponent(current.slice(5)));
  else if (current === 'business/intake') app.innerHTML = renderIntake();
  else if (current === 'business/card') app.innerHTML = renderCard();
  else if (current === 'business/proposals') app.innerHTML = renderProposals();
  else app.innerHTML = renderHome();

  const main = app.querySelector('main');
  if (dataError) main?.insertAdjacentHTML('afterbegin', `<div class="error-box global-error">${esc(dataError)} <button class="secondary compact" data-action="retry-data">Повторить</button></div>`);
  if (flashMessage) { main?.insertAdjacentHTML('afterbegin', `<div class="success-box">✓ ${esc(flashMessage)}</div>`); flashMessage = ''; }
  bindEvents();
}

function showFormError(selector, message) {
  const box = document.querySelector(selector);
  if (box) { box.textContent = message; box.hidden = false; }
}

async function beginNewTask() {
  const operation = 'new-task';
  dataError = '';
  renderLoading('Создаём приватный черновик…');
  try {
    const value = await api.createTask({}, keyFor(operation));
    clearKey(operation);
    hydrateActive(value);
    serverData.myTasks = [value.task, ...serverData.myTasks.filter((task) => task.id !== value.task.id)];
    navigate(`business/intake?id=${encodeURIComponent(value.task.id)}`);
    render();
  } catch (error) {
    dataError = error.message;
    navigate('business/dashboard');
    render();
  }
}

async function runAI(nextRoute = false) {
  if (aiState === 'loading') return;
  if (!draft.description?.trim()) { aiError = 'Сначала опишите задачу.'; render(); return; }
  aiState = 'loading';
  aiError = '';
  render();
  try {
    await persistWorkflowNow(analysis ? 'questions' : 'description');
    const value = await api.analyze(activeTask.id, workflow.version);
    hydrateActive(value);
    analysis = { ...value.analysis, answers: value.workflow.answers };
    aiState = 'idle';
    if (nextRoute) navigate(`business/card?id=${encodeURIComponent(activeTask.id)}`);
    render();
  } catch (error) {
    aiState = 'idle';
    aiError = error.message;
    render();
  }
}

function bindEvents() {
  document.querySelector('[data-action="retry-data"]')?.addEventListener('click', () => refreshServerData());
  document.querySelector('[data-action="export-legacy"]')?.addEventListener('click', exportLegacyBrowserData);
  document.querySelectorAll('[data-action="new-task"]').forEach((button) => button.addEventListener('click', beginNewTask));
  document.querySelectorAll('[data-action="resume-task"]').forEach((button) => button.addEventListener('click', () => openWorkflow(button.dataset.taskId)));

  document.querySelector('#register-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const password = String(values.get('password') || '');
    if (!form.checkValidity()) { form.reportValidity(); return; }
    if (password !== String(values.get('confirmPassword') || '')) { showFormError('#auth-error', 'Пароли не совпадают.'); return; }
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      const body = await api.register({ email: values.get('email'), password, role: values.get('role') });
      setAuthUser(body.user);
      await refreshServerData({ renderAfter: false });
      navigate(`onboarding/${body.user.role}`);
    } catch (error) { showFormError('#auth-error', error.message); button.disabled = false; }
  });

  document.querySelector('#login-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.checkValidity()) { form.reportValidity(); return; }
    const values = new FormData(form);
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      const body = await api.login({ email: values.get('email'), password: values.get('password') });
      setAuthUser(body.user);
      await refreshServerData({ renderAfter: false });
      navigate(body.user.role === 'business' ? 'business/dashboard' : 'catalog');
    } catch (error) { showFormError('#auth-error', error.message); button.disabled = false; }
  });

  document.querySelectorAll('[data-action="logout"]').forEach((button) => button.addEventListener('click', async () => {
    button.disabled = true;
    try {
      await api.logout();
      setAuthUser(null);
      await refreshServerData({ renderAfter: false });
      navigate('home');
    } catch (error) {
      if (error.status === 401) { setAuthUser(null); navigate('home'); }
      else { dataError = `Выход не подтверждён сервером: ${error.message}`; button.disabled = false; render(); }
    }
  }));

  document.querySelector('#onboarding-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.checkValidity()) { form.reportValidity(); return; }
    const profile = Object.fromEntries([...new FormData(form).entries()].map(([key, value]) => [key, String(value).trim()]));
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      const body = await api.saveProfile(profile);
      setAuthUser(body.user);
      await refreshServerData({ renderAfter: false });
      flashMessage = 'Профиль сохранён на сервере.';
      navigate(userRole() === 'business' ? 'business/dashboard' : 'catalog');
    } catch (error) { showFormError('#onboarding-error', error.message); button.disabled = false; }
  });

  document.querySelector('#draft-input')?.addEventListener('input', (event) => { draft.description = event.currentTarget.value; scheduleAutosave('description'); });
  document.querySelector('[data-action="analyze"]')?.addEventListener('click', () => runAI(false));
  document.querySelectorAll('[data-question]').forEach((input) => input.addEventListener('input', () => {
    analysis.answers ||= {};
    analysis.answers[input.dataset.question] = input.value;
    scheduleAutosave('questions');
  }));
  document.querySelector('[data-action="form-card"]')?.addEventListener('click', () => runAI(true));
  document.querySelector('[data-action="back-intake"]')?.addEventListener('click', () => navigate(`business/intake?id=${encodeURIComponent(activeTask.id)}`));
  document.querySelectorAll('[data-field]').forEach((input) => input.addEventListener('input', () => {
    draft[input.dataset.field] = input.value;
    if (analysis) analysis.suggestedCard = { ...(analysis.suggestedCard || {}), [input.dataset.field]: input.value };
    scheduleAutosave('card');
    renderCardLive();
  }));
  document.querySelector('[data-action="save-card"]')?.addEventListener('click', async (event) => {
    event.currentTarget.disabled = true;
    try { await persistWorkflowNow('card'); flashMessage = 'Приватная редакция сохранена на сервере.'; render(); }
    catch { event.currentTarget.disabled = false; }
  });
  document.querySelector('[data-action="publish"]')?.addEventListener('click', async (event) => {
    if (!draft.title?.trim() || !draft.need?.trim()) { aiError = 'Заполните название и потребность.'; render(); return; }
    const button = event.currentTarget;
    button.disabled = true;
    const operation = `publish:${activeTask.id}`;
    try {
      await persistWorkflowNow('card');
      const value = await api.publish(activeTask.id, { version: activeTask.version, workflowVersion: workflow.version }, keyFor(operation));
      clearKey(operation);
      flashMessage = 'Карточка подтверждена и опубликована.';
      await refreshServerData({ renderAfter: false });
      navigate(`task/${encodeURIComponent(value.task.id)}`);
    } catch (error) { aiError = error.message; button.disabled = false; render(); }
  });
  document.querySelector('[data-action="edit-task"]')?.addEventListener('click', (event) => openWorkflow(event.currentTarget.dataset.taskId, 'business/card'));
  document.querySelector('[data-action="focus-proposal"]')?.addEventListener('click', () => document.querySelector('#proposal-form')?.scrollIntoView({ behavior: 'smooth' }));

  document.querySelector('#proposal-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    if (form.dataset.submitting === 'true') return;
    const values = Object.fromEntries(new FormData(form));
    const errors = validateProposalInput({ ...values, taskId: form.dataset.taskId, teamId: 'server-team' });
    if (Object.keys(errors).length) { showFormError('#proposal-error', Object.values(errors).join(' · ')); return; }
    form.dataset.submitting = 'true';
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    const operation = `proposal:${form.dataset.taskId}:${JSON.stringify(values)}`;
    try {
      await api.createProposal(form.dataset.taskId, values, keyFor(operation));
      clearKey(operation);
      flashMessage = 'Предложение сохранено на сервере и отправлено бизнесу.';
      await refreshServerData({ renderAfter: false });
      render();
    } catch (error) {
      showFormError('#proposal-error', error.message);
      form.dataset.submitting = 'false';
      button.disabled = false;
    }
  });

  document.querySelectorAll('[data-action="accept"], [data-action="reject"]').forEach((button) => button.addEventListener('click', async () => {
    const proposal = serverData.proposals.find((item) => item.id === button.dataset.proposalId);
    if (!proposal) return;
    button.disabled = true;
    try {
      await api.decideProposal(proposal.id, { decision: button.dataset.action === 'accept' ? 'accepted' : 'rejected', version: proposal.version });
      flashMessage = button.dataset.action === 'accept' ? 'Предложение принято вручную.' : 'Предложение отклонено вручную.';
      await refreshServerData({ renderAfter: false });
      render();
    } catch (error) { dataError = error.message; render(); }
  }));

  document.querySelector('#catalog-search')?.addEventListener('input', filterCatalog);
  document.querySelector('#topic-filter')?.addEventListener('change', filterCatalog);
  document.querySelector('#level-filter')?.addEventListener('change', filterCatalog);
}

function renderCardLive() {
  const existing = document.querySelector('[data-score-content]');
  if (existing) existing.innerHTML = scorePanelContent(previewTaskScore(draft), activeTask?.lastChange);
}

function filterCatalog() {
  const tasks = selectCatalogTasks(serverData.catalog, {
    topic: document.querySelector('#topic-filter')?.value || 'all',
    level: document.querySelector('#level-filter')?.value || 'all',
    query: document.querySelector('#catalog-search')?.value || '',
  });
  const grid = document.querySelector('#catalog-grid');
  const count = document.querySelector('#catalog-count');
  if (grid) grid.innerHTML = catalogResults(tasks);
  if (count) count.textContent = `${tasks.length} задач`;
}

window.addEventListener('hashchange', () => {
  render();
  if (['catalog', 'business/dashboard', 'business/proposals', 'profile'].includes(routePath())) refreshServerData().catch(() => {});
});
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && ['catalog', 'business/proposals'].includes(routePath())) refreshServerData().catch(() => {}); });
window.exportSanaLegacyData = exportLegacyBrowserData;
render();
void loadAuth();
