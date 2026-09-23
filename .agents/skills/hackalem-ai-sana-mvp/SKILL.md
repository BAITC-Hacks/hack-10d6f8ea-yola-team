---
name: hackalem-ai-sana-mvp
description: Build, debug, review, or finish the HackAlem AI Sana 5-hour MVP for gamifying business task readiness. Use for work on task intake, AI clarification questions, structured task cards, 0-100 readiness scoring, catalog, student proposals, business accept/reject flow, demo preparation, and submission readiness.
---

# HackAlem AI Sana MVP Skill

Official track: **AI Sana Challenge Hub: от бизнес-задачи к решению**  
Task owner: **МНВО — AI Sana**

Official framing: business users often describe tasks too briefly for students to understand what to work on. The MVP must enrich the draft with clarification questions, calculate a readiness rating, publish the task to a catalog, allow teams to submit proposals themselves, and leave the final choice to the business.


Use this workflow whenever the task concerns the HackAlem / AI Sana case in this repository.

## Goal

Produce the smallest reliable implementation that satisfies the required
end-to-end scenario:

business draft -> clarification -> editable task card -> readiness score ->
publication -> catalog -> team proposal -> business manual decision.

Favor a complete working flow over extra polish or unrelated features.

## Step 1: Inspect before changing

Inspect only the repository areas relevant to the requested task.

Identify:

- current frontend/backend stack
- existing routes/pages
- current data/storage approach
- existing AI integration, if any
- existing tests and run commands

Do not migrate frameworks or redesign the whole repository unless the current
implementation cannot support the required flow.

## Step 2: Map the requested work to a hackathon requirement

Classify the task into one or more of these areas:

1. business draft intake
2. clarification-question generation
3. structured task-card generation/editing
4. readiness scoring
5. publication/catalog
6. team proposal
7. business accept/reject
8. demo data
9. validation/error handling
10. README/demo/submission

If requested work does not help the required flow, keep it secondary.

## Step 3: Preserve the task-card contract

The card must be able to represent:

- title
- context
- need / problem
- users
- data/materials
- constraints
- expected result
- success criteria
- business contact
- interaction format

Do not invent missing values.

Unknown information should be represented as empty, null, or an explicit
"needs clarification" state according to the existing code style.

## Step 4: Implement AI as structured assistance

When implementing AI behavior:

- provide the model only user-supplied task information and confirmed context
- ask for at least 3 relevant clarification questions when information is incomplete
- request structured output when possible
- validate parsed output
- reject or repair malformed output safely
- never treat AI-generated facts as confirmed facts
- keep all generated task-card content editable
- require human confirmation before publication

A useful logical AI response shape is:

- missingFields
- questions
- suggestedCard

Adapt this to the existing repository instead of forcing a new architecture.

If external AI is unavailable, implement a deterministic mock/fallback that
keeps the same interface so the demo still works.

## Step 5: Keep scoring deterministic

Do not ask the AI model to decide the readiness score.

Calculate it in application code with these maximum weights:

- context + need: 20
- data + materials: 20
- expected result: 15
- success criteria: 15
- constraints: 10
- users: 10
- business communication: 10

Map totals to:

- 0-39 Draft
- 40-69 Working
- 70-89 Ready
- 90-100 Priority

Show:

- total score
- per-category score/breakdown
- missing information
- what can raise the score

Recalculate after confirmed edits.

## Step 6: Protect catalog rules

The shared catalog must keep all published tasks visible.

Support, when relevant to the requested work:

- sorting by readiness score
- filtering by topic
- filtering by readiness level

A low readiness score is information, not an access restriction.

AI recommendations may exist, but they must not replace or hide the common catalog.

## Step 7: Protect manual business choice

Student teams may submit:

- solution idea
- plan
- expected duration
- prototype link

The business manually accepts or rejects proposals.

Never implement automatic team assignment.
Never let AI make the final selection for the business.

## Step 8: Use hackathon-sized data and scope

If demo data is needed, ensure at least:

- 5 drafts
- 5 task cards
- 5 team profiles
- 5 proposals

Do not build the following unless required to fix an existing dependency:

- full auth
- password recovery
- complex permissions
- chat
- notifications
- calendar
- file storage
- custom ML training
- vector database
- full mobile adaptation
- production infrastructure
- full project tracker

## Step 9: Verify the change

After implementation, verify the smallest relevant set of checks available
in the repository:

- tests
- lint
- type check
- build
- manual happy-path check

For scoring changes, explicitly test boundary values around:

- 39/40
- 69/70
- 89/90
- 100

For AI changes, test:

- incomplete input
- complete input
- malformed AI output
- unavailable API/fallback
- no fabricated data reaching confirmed fields

For proposal changes, test:

- submit
- view
- accept
- reject
- no auto-assignment

## Step 10: Verify the full demo path when touching core flow

For core changes, confirm this scenario still works:

1. Business enters a weak description.
2. System asks at least 3 useful questions.
3. Business answers.
4. Editable task card is produced.
5. Readiness score and breakdown are shown.
6. Business adds information and score increases.
7. Business confirms and publishes.
8. Student team sees the task in the catalog.
9. Team submits a proposal.
10. Business manually accepts or rejects it.

Do not claim the MVP is complete if this path is broken.

## Step 11: Keep submission materials aligned

When editing README or demo instructions, include:

- how to start the app
- architecture summary
- AI behavior and fallback
- readiness-score formula
- readiness levels
- catalog behavior
- proposal/manual-selection behavior
- demo/test scenario

Keep the demo focused enough to run in under 5 minutes.

## Completion rule

A change is complete when it works in the existing project, preserves the
hackathon rules above, passes relevant checks, and does not break the required
end-to-end scenario.
