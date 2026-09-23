# AGENTS.md

## Project purpose

Official HackAlem / AI Sana track:

**AI Sana Challenge Hub: от бизнес-задачи к решению**

Task owner: **МНВО — AI Sana**

Official problem framing:

> Бизнес описывает задачу слишком коротко, и студентам трудно понять, за что браться.
> MVP дополняет черновик вопросами, считает рейтинг готовности и публикует карточку
> в каталоге, где команды сами откликаются, а бизнес выбирает, с кем работать.

This repository must implement that exact product idea as a working 5-hour MVP.

The product turns a short/weak business task description into a structured,
human-confirmed task card, calculates a transparent readiness score, publishes the
task to an open catalog, lets student teams submit proposals themselves, and lets
the business manually decide which team(s) to work with.

## Source of truth

The hackathon case requirements are the source of truth.
When implementation choices conflict with the case, follow the case.

Do not invent product requirements that are not needed for the required demo.
Prefer a complete working end-to-end scenario over extra features.

## Required end-to-end flow

The MVP must support this complete flow:

1. A business user enters a short free-form problem or need.
2. The system analyzes what information is missing.
3. The system asks at least 3 relevant clarification questions.
4. Answers are transformed into an editable structured task card.
5. The business user reviews and manually confirms the card.
6. The system calculates a readiness score from 0 to 100.
7. The system explains awarded points and missing information.
8. Editing confirmed fields recalculates the score.
9. The confirmed task is published to the shared catalog.
10. Student teams can browse all published tasks.
11. Teams can submit a proposal with solution idea, plan, expected duration, and prototype link.
12. The business manually accepts or rejects proposals.
13. The system must never auto-assign a team.

Do not consider the feature complete unless the whole flow works.

## Required task-card fields

A task card must support:

- title
- context
- need / problem
- target users
- available data and materials
- constraints
- expected result
- success criteria
- business contact
- interaction / feedback format

Missing information must remain explicitly missing.
Do not silently fabricate values.

## Readiness scoring

The score is deterministic application logic, not an AI opinion.

Use this 100-point model:

- Context and need: 20
- Data and materials: 20
- Expected result: 15
- Success criteria: 15
- Constraints: 10
- Users: 10
- Business communication: 10

Readiness levels:

- 0-39: Draft
- 40-69: Working
- 70-89: Ready
- 90-100: Priority

Rules:

- A low score must not hide a task from the catalog.
- Recalculate after every confirmed edit.
- Show the score breakdown.
- Show actionable missing-information suggestions.
- Higher readiness may affect catalog ordering.
- Do not score company fame, brand, or unrelated participant characteristics.

## AI behavior

At least one meaningful AI feature is required.

Preferred AI responsibilities:

- analyze completeness of a business description
- identify missing fields
- generate at least 3 relevant clarification questions
- structure user-provided answers into the task-card schema

AI safety/product rules:

- Never add facts the user did not provide.
- Mark unknown values as missing or requiring clarification.
- Generated content must remain editable.
- Human confirmation is required before publication.
- AI may recommend tasks to students by interests/skills.
- AI must not restrict access to the common catalog.
- AI must not choose or assign a team for the business.
- Do not use personal or sensitive participant attributes.

If the external AI API is unavailable, a local/mock implementation is acceptable,
but preserve a clear input/output format and error handling.

## Catalog requirements

The catalog must:

- show all published tasks
- support sorting by readiness score
- support filtering by topic
- support filtering by readiness level
- allow any student team to open a task and submit a proposal

Do not block proposals only because a task has a low readiness score.

## Proposal requirements

A proposal must support:

- team
- solution idea
- plan
- expected duration
- prototype URL

Proposal count is not limited.

The business must be able to:

- see proposals
- accept a proposal
- reject a proposal

No automatic selection.

## Minimum demo data

If organizers do not provide JSON/CSV, create synthetic data with at least:

- 5 task drafts
- 5 task cards
- 5 team profiles
- 5 proposals

Keep demo data realistic but clearly synthetic.

## Out of scope for the 5-hour MVP

Do not spend hackathon time on:

- full authentication
- password recovery
- complex role/permission systems
- real-time chat
- notifications
- calendar
- file storage
- training a custom ML model
- vector databases
- full mobile adaptation
- production infrastructure
- full project-management tracker

Only add an out-of-scope feature if all required end-to-end behavior is already stable.

## Implementation principles

- Inspect the existing repository before choosing or changing the stack.
- Reuse the current stack and conventions when practical.
- Avoid unnecessary rewrites or framework migrations.
- Keep modules small and names explicit.
- Prefer deterministic business logic for scoring and status transitions.
- Validate user input.
- Handle malformed AI output gracefully.
- Keep AI integration replaceable behind a small service/module boundary.
- Keep seeded demo data easy to reset.
- Do not hard-code secrets or API keys.
- Use environment variables for external API credentials.
- Preserve existing working code unless a change is necessary.

## Suggested domain model

Use the repository's existing patterns, but the core domain should map cleanly to:

Task:
- id
- title
- description
- context
- need
- users
- data
- constraints
- expectedResult
- successCriteria
- businessContact
- interactionFormat
- score
- readinessLevel
- status

Team:
- id
- name
- interests
- skills
- technologies

Proposal:
- id
- taskId
- teamId
- solutionIdea
- plan
- duration
- prototypeUrl
- status: pending | accepted | rejected

Do not force these exact property names if the codebase already has equivalent names.

## Testing priorities

Prioritize tests/checks for:

1. score calculation and level boundaries
2. score recalculation after edits
3. missing-field detection
4. AI output validation / fallback behavior
5. task publication
6. catalog visibility and sorting
7. proposal submission
8. manual accept/reject behavior
9. prevention of automatic team assignment
10. the complete demo path

Before declaring work complete, run the repository's relevant tests, linting,
type checks, and build commands when they exist.

## Demo-critical scenario

The final build must be able to demonstrate, in under 5 minutes:

1. Enter a weak business description.
2. Show AI-generated clarification questions.
3. Add missing information.
4. Show the task card.
5. Show the score increasing.
6. Publish the task.
7. Open the catalog as a student team.
8. Submit a proposal.
9. Return as the business.
10. Manually accept or reject the proposal.

All of these transitions must work in the MVP, not only in slides.

## Delivery requirements

Keep the repository ready to submit with:

- working MVP
- clear startup instructions
- README
- architecture overview
- readiness-score formula
- catalog rules
- test/demo scenarios

When asked to implement a feature, optimize first for hackathon scoring and the
required end-to-end scenario.
