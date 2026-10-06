# 对话应用体验调研 Worker

一份可部署到 **Cloudflare Workers** 的中文收集表，使用 **D1** 保存答卷，并支持 **OAuth 登录**、**每人一份** 与 **兑换码发放**。静态前端在 `public/`，Worker API 在 `src/index.js`。

## 功能概览

1. **登录后填写**：访客需通过 OAuth（nailao.biz）登录后才能看到并提交问卷，未登录一律拦截。
2. **每人一份**：同一登录账号仅能提交一次，数据库唯一索引兜底。
3. **提交后发放兑换码**：答卷写入成功后，同一请求内直接从兑换码池分配一枚兑换码并展示；池子为空时提示“还没有开始发放”，可稍后刷新领取。
4. **前端后台**：`/admin` 管理页可在线批量导入兑换码（ADMIN_TOKEN 登录），也可用 D1 Console 的 SQL。
5. **九道题目**：前三题（应用 / 功能 / 建议）+ 六道模型与付费意愿题；必填项有 * 标记与进度统计。

## 表单内容

1. 多选（必填）：酒馆、小手机、Operit 等开源应用、Chatbox 等对话应用、其他。
2. 多选（必填）：单纯对话、跨对话记忆、生活服务、其他功能。
3. 选填文字：小手机的喜爱功能或希望增加的功能。
4. 多选（选填，最多 3 个）：你最喜欢的模型（Gemini / Claude / DeepSeek / Grok / Kimi / GPT / Qwen / MiMo / MiniMax / 豆包）。
5. 单选（必填）：破甲情况（必须破甲 / 经常破甲 / 偶尔破甲 / 不破我玩清水）。
6. 单选（必填）：最低起充额度（1 / 3 / 5 / 10 块）。
7. 单选（必填）：第二次充值意愿（和第一次一样 / 第一次的一半 / 第一次的二倍）。
8. 多选（选填）：愿付费模型。
9. 选填：各模型价格（元/次，任填至少一项）。

## 登录配置（nailao.biz OAuth）

OAuth 的 `OAUTH_ISSUER` / `OAUTH_CLIENT_ID` 写在 `wrangler.toml` 的 `[vars]` 中；`OAUTH_CLIENT_SECRET`、`SESSION_SECRET`、`ADMIN_TOKEN` 属于敏感值，**不写入仓库**，请按下文用加密变量 / `wrangler secret put` 配置。若需更换客户端：

1. 打开 `https://nailao.biz/oauth2-clients`（管理员权限）。
2. 创建客户端：
   - Client Type：`confidential`（有 client_secret；public 客户端可留空 secret，依赖 PKCE）；
   - Redirect URIs：`https://sjb.nailao.biz/api/auth/callback`（必须精确匹配）；
   - Scopes：`openid profile email`。
3. 把 client_id 填入 `[vars]`；client_secret 不要提交到仓库，改用加密变量 / `npx wrangler secret put` 配置。

其它可配置项：

- `SESSION_SECRET`：登录会话与后台会话的签名密钥（可更换；用加密变量配置）；
- `ADMIN_TOKEN`：兑换码后台管理口令（可更换；用加密变量配置）。

## 兑换码管理

### 方式一：线上后台（推荐）

访问 `https://sjb.nailao.biz/admin`，输入 `ADMIN_TOKEN` 登录后：

- 批量粘贴导入兑换码（每行一个，也支持逗号 / 分号分隔；仅限字母、数字、`-`、`_`，3–64 位且至少含一个字母或数字，一次最多 200 个）；
- 查看兑换码总数 / 已发放 / 剩余 / 答卷数，以及最近 50 条发放记录；未发放的码可删除。

### 方式二：D1 Console SQL

```sql
INSERT INTO reward_codes (code) VALUES ('XXXX-XXXX'), ('YYYY-YYYY');
```

### 发放规则

- 参与者在**提交答卷成功的那一刻**自动领取一枚（提交响应内直接返回，无需第二次请求）；
- 每个兑换码只会分配一次、每个账号最多一枚；
- 用户之后回到页面可再次查看 / 复制，不会重复发放。

## 本地预览

```sh
npx wrangler d1 migrations apply sjb --local --env dev
npx wrangler dev --env dev
```

仅打开 `public/index.html` 会显示“无法连接服务器”的登录提示（属预期行为）。

## 部署到 Cloudflare

1. 登录 Cloudflare：`npx wrangler login`
2. 应用全部迁移（0001–0005）：

   ```sh
   npx wrangler d1 migrations apply sjb --remote
   ```

3. 配置 Worker 加密变量（一次性）：在 Cloudflare 面板 → Workers → conversation-lab-survey → Settings → Variables and Secrets，添加 `OAUTH_CLIENT_SECRET`、`SESSION_SECRET`、`ADMIN_TOKEN`（类型选 Encrypted）；或执行 `npx wrangler secret put OAUTH_CLIENT_SECRET` 等命令逐个粘贴。

4. 部署（会按 `wrangler.toml` 绑定自定义域名 `sjb.nailao.biz`）：

   ```sh
   npx wrangler deploy --env=""
   ```

D1 database_id 与 OAuth client_id 已填入 `wrangler.toml`；`OAUTH_CLIENT_SECRET`、`SESSION_SECRET`、`ADMIN_TOKEN` 按上一步以加密变量配置。若 `sjb.nailao.biz` 已有冲突的 DNS 记录，请先在 Cloudflare 面板处理，或删除 `routes` 配置改用面板绑定自定义域名。

## 构建与部署命令（本地 / Cloudflare Workers Builds 通用）

本项目无需额外构建步骤，静态资源与 Worker 代码由 Wrangler 直接打包。如果在 Cloudflare Dashboard 里使用 Git 构建（Workers Builds），填写：

- 构建命令：`npm install`
- 部署命令：`npx wrangler deploy --env=""`

本地常用命令：

```sh
npm install          # 安装依赖（wrangler）
npm run migrate:remote  # 首次部署前应用 D1 迁移（等价于 npx wrangler d1 migrations apply sjb --remote）
npm run deploy          # 部署（等价于 npx wrangler deploy --env=""）
npm run dev             # 本地开发（等价于 npx wrangler dev --env dev）
```

## 数据查询（D1 Console）

```sql
-- 答卷（含登录账号与新题目）
SELECT user_name, applications_json, features_json, favorite_models_json, jailbreak,
       min_top_up, re_top_up, pay_models_json, model_prices_json, wishlist, submitted_at
FROM survey_responses
ORDER BY submitted_at DESC;

-- 兑换码统计
SELECT COUNT(*) AS total,
       SUM(CASE WHEN assigned_to_sub IS NOT NULL THEN 1 ELSE 0 END) AS assigned
FROM reward_codes;
```

## 安全说明

- 敏感值不入库：`OAUTH_CLIENT_SECRET` / `SESSION_SECRET` / `ADMIN_TOKEN` 通过加密变量配置，仓库中仅保留公开标识（client_id、数据库 ID）；
- 所有 SQL 均使用参数化绑定（prepared statements + bind），不做字符串拼接；
- 后台批量导入兑换码另有白名单校验（`A-Za-z0-9_-`、长度 ≤ 64）与批量上限；
- 管理口令使用常量时间比较；登录 / 后台会话均为 HMAC 签名 Cookie；
- 表单不询问姓名、邮箱或手机号；登录仅记录授权账号名称用于发放兑换码。请提醒填写者勿在自由文本中写入个人敏感信息。

## 文件结构

```text
public/index.html                    表单前端（登录门面 + 9 题 + 兑换码）
public/admin.html                    兑换码后台（ADMIN_TOKEN 登录）
public/404.html                      未找到页面
src/index.js                         Worker API：OAuth 登录、校验、答卷与兑换码、后台接口
migrations/0001_create_responses.sql D1 建表迁移
migrations/0002_add_multiple_applications.sql 多选应用字段迁移
migrations/0003_backfill_applications.sql     历史应用字段回填迁移
migrations/0004_add_login_and_rewards.sql     登录账号与兑换码迁移
migrations/0005_add_model_and_payment_questions.sql 模型偏好与付费意愿题迁移
wrangler.toml                        Workers、域名、静态资源、D1 与登录 / 后台变量
```
