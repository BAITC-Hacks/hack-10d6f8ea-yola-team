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

## Как жюри проверить проект из GitHub

Репозиторий полностью самодостаточен для локальной проверки: жюри может клонировать его и запустить без установки npm-пакетов. Простого открытия страницы GitHub недостаточно — GitHub показывает исходный код, но не запускает Node.js backend.

### Быстрый запуск без API-ключа

```bash
git clone https://github.com/BAITC-Hacks/hack-10d6f8ea-yola-team.git
cd hack-10d6f8ea-yola-team
node server.mjs
```

После этого нужно открыть [http://localhost:4173](http://localhost:4173). Весь сквозной сценарий останется доступен, а AI-конструктор будет использовать локальный fallback с тем же контрактом данных.

### Проверка с реальным OpenAI API

Для реального AI жюри должно использовать собственный API-ключ:

PowerShell:

```powershell
Copy-Item .env.example .env
```

Bash/zsh:

```bash
cp .env.example .env
```

Затем в локальном `.env` необходимо указать:

```dotenv
OPENAI_API_KEY=your-key
OPENAI_MODEL=gpt-5.6-luna
OPENAI_REASONING_EFFORT=medium
OPENAI_TIMEOUT_MS=30000
```

После сохранения конфигурации запустите `node server.mjs`. Настоящий ключ намеренно отсутствует в GitHub: `.env` исключён через `.gitignore`, не копируется в production bundle и не передаётся во frontend.

GitHub Pages для этого проекта недостаточно, поскольку он не запускает серверный Node.js endpoint. Для проверки по одной публичной ссылке без клонирования потребуется Node.js-хостинг с `OPENAI_API_KEY` в server-side environment variables.

## Требования и локальная установка

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
$env:OPENAI_MODEL="gpt-5.6-luna"
$env:OPENAI_REASONING_EFFORT="medium"
$env:OPENAI_TIMEOUT_MS="30000" # optional
node server.mjs
```

Bash/zsh:

```bash
export OPENAI_API_KEY="your-key"
export OPENAI_MODEL="gpt-5.6-luna"
export OPENAI_REASONING_EFFORT="medium"
export OPENAI_TIMEOUT_MS="30000" # optional
node server.mjs
```

Откройте [http://localhost:4173](http://localhost:4173). Другой порт задаётся через `PORT`.

Для локального запуска эти же значения можно сохранить в файле `.env` в корне проекта. Файл исключён из Git и загружается только сервером. `OPENAI_MODEL` и `OPENAI_REASONING_EFFORT` не зашиты в бизнес-логику: модель и глубину рассуждения можно заменить без изменения AI-сервиса. Для OpenAI-compatible proxy можно дополнительно задать `OPENAI_BASE_URL`.

## AI flow и безопасность фактов

1. Browser отправляет краткое описание и текущее состояние карточки на `POST /api/ai/analyze`.
2. Backend передаёт описание, карточку, предыдущие вопросы, ответы и обязательную схему в OpenAI.
3. Ответ запрашивается как Structured Output и валидируется на backend.
4. При наличии пробелов Browser показывает минимум три релевантных вопроса и редактируемый результат; для уже полной карточки список вопросов может быть пустым.
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

Последняя финальная проверка: 30 тестов пройдено, production bundle собирается, secret scan не находит ключей в публикуемых файлах. Реальный endpoint проверен с `gpt-5.6-luna` и `medium` reasoning effort; при успешном ответе UI показывает источник `OpenAI API`, а не fallback.

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
│   ├── config/env.mjs         # server-only loading of local .env
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
