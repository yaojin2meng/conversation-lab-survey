-- 登录后填写：记录答卷对应的登录账号（OAuth sub），并限制每个账号一份答卷。
ALTER TABLE survey_responses ADD COLUMN user_sub TEXT;
ALTER TABLE survey_responses ADD COLUMN user_name TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_survey_responses_user_sub ON survey_responses(user_sub);

-- 兑换码池：管理员先插入兑换码，填写完成后按顺序自动发放给完成者。
CREATE TABLE IF NOT EXISTS reward_codes (
  code TEXT PRIMARY KEY,
  assigned_to_sub TEXT,
  assigned_to_name TEXT,
  assigned_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_reward_codes_assigned_to ON reward_codes(assigned_to_sub);
