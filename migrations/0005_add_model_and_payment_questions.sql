-- 新增模型偏好与付费意愿题目（第 04–09 题）。
ALTER TABLE survey_responses ADD COLUMN favorite_models_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE survey_responses ADD COLUMN jailbreak TEXT NOT NULL DEFAULT '';
ALTER TABLE survey_responses ADD COLUMN min_top_up TEXT NOT NULL DEFAULT '';
ALTER TABLE survey_responses ADD COLUMN re_top_up TEXT NOT NULL DEFAULT '';
ALTER TABLE survey_responses ADD COLUMN pay_models_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE survey_responses ADD COLUMN model_prices_json TEXT NOT NULL DEFAULT '{}';