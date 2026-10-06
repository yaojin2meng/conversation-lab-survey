-- Backfill the new multi-select column for rows created before migration 0002.
UPDATE survey_responses
SET applications_json = json_array(application)
WHERE applications_json = '[]' OR applications_json IS NULL;
