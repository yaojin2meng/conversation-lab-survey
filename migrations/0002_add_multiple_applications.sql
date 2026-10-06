-- Store every selected chat application while preserving the legacy single-choice column.
ALTER TABLE survey_responses
  ADD COLUMN applications_json TEXT NOT NULL DEFAULT '[]';