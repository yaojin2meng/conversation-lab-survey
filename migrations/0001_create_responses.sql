CREATE TABLE IF NOT EXISTS survey_responses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  application TEXT NOT NULL CHECK (application IN ('tavern', 'xiaoshouji', 'open_source', 'chatbox', 'other')),
  application_other TEXT NOT NULL DEFAULT '',
  features_json TEXT NOT NULL,
  feature_other TEXT NOT NULL DEFAULT '',
  wishlist TEXT NOT NULL DEFAULT '',
  submitted_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_survey_responses_submitted_at
  ON survey_responses(submitted_at);