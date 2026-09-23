# Sana Hub — AI Sana Challenge Hub

Рабочий MVP для трека HackAlem / AI Sana «от бизнес-задачи к решению».

Бизнес часто описывает задачу слишком коротко, поэтому студенческим командам не хватает контекста, данных и критериев успеха. Sana Hub превращает такое описание в редактируемую карточку: AI находит пробелы и задаёт уточняющие вопросы, приложение прозрачно рассчитывает готовность, а бизнес вручную подтверждает и публикует задачу. Студенты находят её в общем каталоге, отправляют предложения, после чего бизнес самостоятельно принимает или отклоняет каждое из них.

## Что работает

- onboarding бизнеса и студента/фрилансера без полноценной авторизации;
- реальный server-side OpenAI flow с настраиваемой моделью;
- динамические AI-вопросы по отсутствующим сведениям;
- проверяемый fallback с тем же контрактом;
- редактируемая карточка и обязательное подтверждение человеком;
- детерминированный score 0–100, breakdown и рекомендации;
- общий каталог, поиск, фильтры и сортировка по готовности;
- неограниченные proposals с профилем команды;
- ручные статусы `pending | accepted | rejected` без auto-assignment;
- сохранение demo-state и незавершённой карточки после refresh;
- история последнего изменения карточки и score delta.

## Архитектура и стек

Приложение намеренно не использует тяжёлый framework или внешние npm-зависимости.

```text
Browser SPA (HTML/CSS/vanilla JS, ES modules)
        │ POST /api/ai/analyze
        ▼
Node.js HTTP server
        │ server-side OPENAI_API_KEY + OPENAI_MODEL
        ▼
OpenAI Responses API / validated local fallback

Browser state → validated localStorage demo store
Scoring     → deterministic application module
```

- Frontend: HTML5, CSS, vanilla JavaScript, ES modules.
- Backend: Node.js HTTP server без внешних packages.
- AI: OpenAI Responses API, Structured Outputs JSON Schema.
- Persistence: `localStorage` для hackathon demo.
- Tests: встроенный `node:test`.

API-ключ используется только в [server-side AI service](src/services/ai-server.mjs). Браузерный JavaScript его не получает.

## Требования и установка

- Node.js 18+ (рекомендуется Node.js 20+).
- npm опционален: runtime-зависимостей нет, поэтому `npm install` не требуется.

```bash
git clone https://github.com/BAITC-Hacks/hack-10d6f8ea-yola-team.git
cd hack-10d6f8ea-yola-team
```

Настройте backend environment variables. Реальный `.env` не коммитьте; пример находится в `.env.example`.

PowerShell:

```powershell
$env:OPENAI_API_KEY="your-key"
$env:OPENAI_MODEL="your-model-id"
$env:OPENAI_TIMEOUT_MS="30000" # optional
node server.mjs
```

Bash/zsh:

```bash
export OPENAI_API_KEY="your-key"
export OPENAI_MODEL="your-model-id"
export OPENAI_TIMEOUT_MS="30000" # optional
node server.mjs
```

Откройте [http://localhost:4173](http://localhost:4173). Другой порт задаётся через `PORT`.

`OPENAI_MODEL` не зашит в код: модель можно заменить без изменения бизнес-логики. Для OpenAI-compatible proxy можно дополнительно задать `OPENAI_BASE_URL`.

## AI flow и безопасность фактов

1. Browser отправляет краткое описание и текущее состояние карточки на `POST /api/ai/analyze`.
2. Backend передаёт описание, карточку, предыдущие вопросы, ответы и обязательную схему в OpenAI.
3. Ответ запрашивается как Structured Output и валидируется на backend.
4. Browser показывает минимум три релевантных вопроса и редактируемый результат.
5. До ручного подтверждения карточка остаётся черновиком.

AI разрешено использовать только факты пользователя. Запрещено придумывать бюджет, сроки, технологии, данные, контакты, пользователей, ограничения и критерии успеха. Неизвестные поля остаются пустыми или требуют уточнения.

При отсутствии ключа, 401, 429, 5xx, timeout, network error, пустом ответе, неправильном JSON или malformed schema backend возвращает локальный fallback того же формата:

```json
{
  "missingFields": [],
  "questions": [],
  "suggestedCard": {}
}
```

UI остаётся рабочим и явно сообщает о fallback-режиме.

## Модели

`Task`:

- `title`, `description`, `context`, `need`;
- `users`, `data`, `constraints`;
- `expectedResult`, `successCriteria`;
- `businessContact`, `interactionFormat`;
- `company`, `industry`, `topic`;
- `score`, `readinessLevel`, `status`, `confirmed`.

`Team`: `name`, `interests`, `skills`, `technologies`.

`Proposal`: `taskId`, `teamId`, `solutionIdea`, `plan`, `duration`, `prototypeUrl`, `status`.

## Формула готовности

| Категория | Максимум |
| --- | ---: |
| Контекст и потребность | 20 |
| Данные и материалы | 20 |
| Ожидаемый результат | 15 |
| Критерии успеха | 15 |
| Ограничения | 10 |
| Пользователи | 10 |
| Связь с бизнесом | 10 |
| Итого | 100 |

Уровни:

- 0–39 — Черновик;
- 40–69 — Рабочая;
- 70–89 — Готовая;
- 90–100 — Приоритетная.

Пустые, неподтверждённые поля и «Требуется уточнение» не получают баллы. До подтверждения показывается прогноз. После подтверждённого редактирования score, уровень, breakdown и рекомендации пересчитываются.

## Каталог и выбор команды

- Все опубликованные задачи видимы, включая low-score cards.
- По умолчанию задачи сортируются по score по убыванию.
- Есть поиск и фильтры по теме и readiness level.
- Количество proposals не ограничено.
- Профиль студента автоматически подставляется в proposal.
- AI никогда не выбирает и не назначает команду.
- Бизнес может вручную принять одну, несколько или ни одной команды.

## Demo data

В `src/data.js` находятся синтетические данные:

- 5 слабых task drafts;
- 5 подтверждённых опубликованных task cards;
- 5 профилей команд;
- 5 proposals с разными статусами.

Быстрые demo-профили:

- Бизнес: Айдар, Astana Coffee, HoReCa, `aidar@example.com`.
- Студент: Батыр, YOLO Team, навыки `Python, Web, AI`, технологии `React, FastAPI, Python`.

Для возврата к seed data вызовите `resetSanaDemo()` в консоли браузера.

## Demo script — до 5 минут

| Время | Действие |
| --- | --- |
| 0:00–0:20 | Открыть landing и выбрать роль бизнеса. |
| 0:20–0:40 | Сохранить быстрый профиль Айдара / Astana Coffee. |
| 0:40–1:00 | Создать задачу: «В нашей сети кофеен бывают большие очереди. Хотим использовать AI, чтобы решить эту проблему». |
| 1:00–1:25 | Показать AI-анализ и минимум три динамических вопроса. |
| 1:25–2:00 | Указать данные, пользователей, результат, критерий успеха и ограничения. |
| 2:00–2:25 | Показать editable card, breakdown и рост score после заполнения поля. |
| 2:25–2:45 | Подтвердить карточку и показать её в каталоге. |
| 2:45–3:10 | Переключиться на Батыр / YOLO Team и открыть задачу. |
| 3:10–3:40 | Отправить idea, plan, срок и URL прототипа. |
| 3:40–4:00 | Переключиться в бизнес и открыть proposals. |
| 4:00–4:25 | Вручную принять или отклонить предложение и показать финальный статус. |
| 4:25–4:45 | Подчеркнуть отсутствие auto-assignment и сохранение после refresh. |

Резерв — 15 секунд. Если OpenAI недоступен, показать понятный fallback-state и продолжить тот же flow.

## Маршруты

- `#/home` — landing;
- `#/onboarding/business`, `#/onboarding/student` — demo onboarding;
- `#/business/dashboard` — кабинет бизнеса;
- `#/business/intake` — короткое описание и AI-вопросы;
- `#/business/card` — редактор, score и подтверждение;
- `#/catalog` — общий каталог;
- `#/task/:id` — задача и proposal form;
- `#/business/proposals` — ручное решение бизнеса;
- `#/profile` — текущий demo-профиль.

Hash routing позволяет безопасно обновлять эти маршруты без server-side 404.

## Проверки и production bundle

```bash
node --test
npm run lint
npm run typecheck
npm run secret-scan
npm run build
```

`npm run build` создаёт автономную папку `dist/`. Её можно запустить так:

```bash
cd dist
node server.mjs
```

В проекте нет компилируемого TypeScript; `typecheck` выполняет синтаксическую проверку ключевых JS-модулей. `lint` также использует встроенный Node.js parser, поэтому чистая установка не загружает зависимости.

## Структура проекта

```text
.
├── index.html                 # SPA entry
├── server.mjs                 # static server + AI endpoint
├── src/
│   ├── app.js                 # routes, UI and E2E orchestration
│   ├── data.js                # synthetic demo data
│   ├── models.js              # Task, Team, Proposal factories/statuses
│   ├── store.js               # validated local persistence
│   └── services/
│       ├── ai.js              # browser-safe validation/fallback
│       ├── ai-server.mjs      # server-only OpenAI integration
│       ├── scoring.js         # deterministic readiness score
│       ├── marketplace.js     # catalog/proposal rules
│       └── card-change.js     # last change and score delta
├── tests/                     # AI, score, store, server and E2E-domain tests
├── scripts/                   # build and secret scan
├── *.css                      # shared feature styles
└── .env.example              # secret-free configuration template
```

## Out of scope

Нет полноценной авторизации, чата, уведомлений, календаря, файлового хранилища, vector database, собственной ML-модели и production infrastructure. Это сознательно ограниченный, полностью демонстрируемый hackathon MVP.
