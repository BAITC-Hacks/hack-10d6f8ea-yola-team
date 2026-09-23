CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  owner_user_id INTEGER NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  context TEXT NOT NULL DEFAULT '',
  need TEXT NOT NULL DEFAULT '',
  users TEXT NOT NULL DEFAULT '',
  data TEXT NOT NULL DEFAULT '',
  constraints_text TEXT NOT NULL DEFAULT '',
  expected_result TEXT NOT NULL DEFAULT '',
  success_criteria TEXT NOT NULL DEFAULT '',
  business_contact TEXT NOT NULL DEFAULT '',
  interaction_format TEXT NOT NULL DEFAULT '',
  company TEXT NOT NULL DEFAULT '',
  industry TEXT NOT NULL DEFAULT '',
  topic TEXT NOT NULL DEFAULT 'Другое',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  confirmed INTEGER NOT NULL DEFAULT 0 CHECK (confirmed IN (0, 1)),
  score INTEGER NOT NULL DEFAULT 0 CHECK (score BETWEEN 0 AND 100),
  readiness_level TEXT NOT NULL DEFAULT 'Draft' CHECK (readiness_level IN ('Draft', 'Working', 'Ready', 'Priority')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS task_workflows (
  task_id TEXT PRIMARY KEY,
  description TEXT NOT NULL DEFAULT '',
  step TEXT NOT NULL DEFAULT 'description' CHECK (step IN ('description', 'questions', 'card')),
  questions_json TEXT NOT NULL DEFAULT '[]',
  answers_json TEXT NOT NULL DEFAULT '{}',
  missing_fields_json TEXT NOT NULL DEFAULT '[]',
  suggested_card_json TEXT NOT NULL DEFAULT '{}',
  draft_json TEXT NOT NULL DEFAULT '{}',
  source TEXT NOT NULL DEFAULT 'manual',
  published_source_version INTEGER,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS teams (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL UNIQUE,
  name TEXT NOT NULL,
  interests TEXT NOT NULL DEFAULT '',
  skills TEXT NOT NULL DEFAULT '',
  technologies TEXT NOT NULL DEFAULT '',
  portfolio TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS proposals (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  team_id TEXT NOT NULL,
  author_user_id INTEGER NOT NULL,
  solution_idea TEXT NOT NULL,
  plan TEXT NOT NULL,
  duration TEXT NOT NULL,
  prototype_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  decided_by_user_id INTEGER,
  decided_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE RESTRICT,
  FOREIGN KEY (author_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (decided_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS task_changes (
  task_id TEXT PRIMARY KEY,
  author_user_id INTEGER NOT NULL,
  changed_at TEXT NOT NULL,
  fields_json TEXT NOT NULL,
  score_before INTEGER NOT NULL,
  score_after INTEGER NOT NULL,
  score_delta INTEGER NOT NULL,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (author_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS idempotency_keys (
  user_id INTEGER NOT NULL,
  operation TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  response_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, operation, idempotency_key),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS tasks_owner_idx ON tasks(owner_user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS tasks_catalog_idx ON tasks(status, score DESC, updated_at DESC);
CREATE INDEX IF NOT EXISTS tasks_topic_idx ON tasks(status, topic);
CREATE INDEX IF NOT EXISTS proposals_task_idx ON proposals(task_id, created_at DESC);
CREATE INDEX IF NOT EXISTS proposals_author_idx ON proposals(author_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS proposals_status_idx ON proposals(status);
