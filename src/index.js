const ALLOWED_APPLICATIONS = new Set([
  "tavern",
  "xiaoshouji",
  "open_source",
  "chatbox",
  "other",
]);

const ALLOWED_FEATURES = new Set([
  "chat",
  "cross_chat_memory",
  "life_services",
  "other",
]);

const MAX_BODY_BYTES = 16 * 1024;
const MAX_WISHLIST_LENGTH = 500;
const MAX_APP_OTHER_LENGTH = 80;
const MAX_FEATURE_OTHER_LENGTH = 300;

const SESSION_COOKIE = "cl_session";
const OAUTH_COOKIE = "cl_oauth";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
const OAUTH_STATE_TTL_SECONDS = 10 * 60;
const OAUTH_TIMEOUT_MS = 10 * 1000;

const ADMIN_COOKIE = "cl_admin";
const ADMIN_SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
const MAX_ADMIN_BATCH = 200;
const MAX_PRICE_LENGTH = 12;
const CODE_PATTERN = /^(?=.*[A-Za-z0-9])[A-Za-z0-9_-]{3,64}$/;
const PRICE_PATTERN = /^\d+(\.\d{1,2})?$/;
const MAX_FAVORITE_MODELS = 3;

const ALLOWED_MODELS = new Set([
  "gemini",
  "claude",
  "deepseek",
  "grok",
  "kimi",
  "gpt",
  "qwen",
  "mimo",
  "minimax",
  "doubao",
]);

const JAILBREAK_VALUES = new Set(["must", "often", "sometimes", "never"]);
const TOPUP_VALUES = new Set(["1", "3", "5", "10"]);
const RETOPUP_VALUES = new Set(["same", "half", "double"]);

function json(data, status = 200, extraHeaders) {
  const headers = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  if (extraHeaders) {
    for (const [name, value] of extraHeaders) {
      headers.append(name, value);
    }
  }
  return new Response(JSON.stringify(data), { status, headers });
}

function cleanText(value, maxLength) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

async function readBody(request) {
  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (declaredLength > MAX_BODY_BYTES) return null;

  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function isPlaceholder(value) {
  if (typeof value !== "string") return true;
  const trimmed = value.trim();
  return !trimmed || trimmed.includes("替换") || trimmed.includes("在此");
}

function bytesToBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value) {
  const normalized = String(value).replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function stringToBase64Url(value) {
  return bytesToBase64Url(new TextEncoder().encode(value));
}

function base64UrlToString(value) {
  return new TextDecoder().decode(base64UrlToBytes(value));
}

function randomToken(byteLength = 32) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

async function hmacKey(secret) {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

async function signToken(secret, payload) {
  const body = stringToBase64Url(JSON.stringify(payload));
  const signature = await crypto.subtle.sign("HMAC", await hmacKey(secret), new TextEncoder().encode(body));
  return `${body}.${bytesToBase64Url(new Uint8Array(signature))}`;
}

async function verifyToken(secret, token) {
  if (typeof token !== "string" || !token.includes(".")) return null;
  const separator = token.lastIndexOf(".");
  const body = token.slice(0, separator);
  const signature = token.slice(separator + 1);
  try {
    const valid = await crypto.subtle.verify("HMAC", await hmacKey(secret), base64UrlToBytes(signature), new TextEncoder().encode(body));
    if (!valid) return null;
    return JSON.parse(base64UrlToString(body));
  } catch {
    return null;
  }
}

async function sha256Base64Url(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return bytesToBase64Url(new Uint8Array(digest));
}

function parseCookies(request) {
  const cookies = new Map();
  const header = request.headers.get("cookie") || "";
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index === -1) continue;
    const name = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (name) cookies.set(name, value);
  }
  return cookies;
}

function buildCookie(name, value, options = {}) {
  const parts = [`${name}=${value}`, "Path=/", "HttpOnly", "SameSite=Lax", "Secure"];
  if (options.maxAge !== undefined) parts.push(`Max-Age=${options.maxAge}`);
  return parts.join("; ");
}

function clearCookie(name) {
  return buildCookie(name, "", { maxAge: 0 });
}

function getOauthConfig(env) {
  const issuerRaw = typeof env.OAUTH_ISSUER === "string" && env.OAUTH_ISSUER.trim() ? env.OAUTH_ISSUER.trim() : "https://nailao.biz";
  let issuer = null;
  try {
    const parsed = new URL(issuerRaw);
    if (parsed.protocol === "https:" || parsed.hostname === "localhost") issuer = parsed.origin;
  } catch {}
  const clientId = isPlaceholder(env.OAUTH_CLIENT_ID) ? "" : env.OAUTH_CLIENT_ID.trim();
  const clientSecret = isPlaceholder(env.OAUTH_CLIENT_SECRET) ? "" : env.OAUTH_CLIENT_SECRET.trim();
  const sessionSecret = isPlaceholder(env.SESSION_SECRET) ? "" : env.SESSION_SECRET.trim();
  const missing = [];
  if (!issuer) missing.push("OAUTH_ISSUER");
  if (!clientId) missing.push("OAUTH_CLIENT_ID");
  if (!sessionSecret) missing.push("SESSION_SECRET");
  return { issuer, clientId, clientSecret, sessionSecret, ready: missing.length === 0, missing };
}

async function getSessionUser(request, env) {
  const config = getOauthConfig(env);
  if (!config.ready) return null;
  const token = parseCookies(request).get(SESSION_COOKIE);
  if (!token) return null;
  const payload = await verifyToken(config.sessionSecret, token);
  if (!payload || typeof payload.sub !== "string" || !payload.sub) return null;
  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== "number" || payload.exp < now) return null;
  const name = typeof payload.name === "string" && payload.name ? payload.name : "已登录用户";
  return { sub: payload.sub, name };
}

function redirectTo(location, headersInit) {
  const headers = new Headers(headersInit || {});
  headers.set("Location", location);
  headers.set("Cache-Control", "no-store");
  return new Response(null, { status: 302, headers });
}

function decodeJwtPayload(token) {
  if (typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length < 2) return null;
  try {
    return JSON.parse(base64UrlToString(parts[1]));
  } catch {
    return null;
  }
}

async function fetchWithTimeout(url, options = {}) {
  const init = { ...options };
  if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
    init.signal = AbortSignal.timeout(OAUTH_TIMEOUT_MS);
  }
  return fetch(url, init);
}

function safeJsonArray(value) {
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function safeJsonObject(value) {
  if (typeof value !== "string") return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function timingSafeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const aBytes = new TextEncoder().encode(a);
  const bBytes = new TextEncoder().encode(b);
  if (aBytes.length !== bBytes.length) return false;
  let difference = 0;
  for (let index = 0; index < aBytes.length; index += 1) {
    difference |= aBytes[index] ^ bBytes[index];
  }
  return difference === 0;
}

function parseModelList(value, maxCount) {
  if (value === undefined || value === null) return { ok: true, models: [] };
  if (!Array.isArray(value)) return { ok: false, error: "模型选项格式无效。" };
  const cleaned = value.map((item) => (typeof item === "string" ? item.trim() : ""));
  if (cleaned.some((item) => !item)) return { ok: false, error: "模型选项格式无效。" };
  const models = [...new Set(cleaned)];
  if (models.length !== cleaned.length) return { ok: false, error: "模型选项不能重复提交。" };
  if (models.length > maxCount) return { ok: false, error: `最多选择 ${maxCount} 个模型。` };
  if (models.some((model) => !ALLOWED_MODELS.has(model))) return { ok: false, error: "包含无效的模型选项。" };
  return { ok: true, models };
}

function parseModelPrices(value) {
  const prices = {};
  if (value === undefined || value === null) return { ok: true, prices };
  if (typeof value !== "object" || Array.isArray(value)) return { ok: false, error: "模型价格格式无效。" };
  for (const [model, raw] of Object.entries(value)) {
    if (!ALLOWED_MODELS.has(model)) return { ok: false, error: "模型价格包含未知模型。" };
    if (raw === undefined || raw === null) continue;
    if (typeof raw !== "number" && typeof raw !== "string") return { ok: false, error: "模型价格格式无效。" };
    const text = typeof raw === "number" ? String(raw) : raw.trim();
    if (text === "") continue;
    if (text.length > MAX_PRICE_LENGTH || !PRICE_PATTERN.test(text)) {
      return { ok: false, error: "模型价格请填写数字（元/次，最多两位小数）。" };
    }
    const amount = Number(text);
    if (!Number.isFinite(amount) || amount < 0 || amount > 99999) {
      return { ok: false, error: "模型价格超出允许范围。" };
    }
    prices[model] = text;
  }
  return { ok: true, prices };
}

function normalizeCodeList(input) {
  let source = [];
  if (Array.isArray(input)) source = input;
  else if (typeof input === "string") source = [input];
  else return { ok: false, error: "请提供要添加的兑换码。" };
  const valid = [];
  const invalid = [];
  const seen = new Set();
  for (const entry of source) {
    if (typeof entry !== "string") {
      if (invalid.length < 20) invalid.push("[非文本内容]");
      continue;
    }
    for (const piece of entry.split(/[\n\r,，;；]+/)) {
      const code = piece.trim();
      if (!code) continue;
      if (!CODE_PATTERN.test(code)) {
        if (invalid.length < 20) invalid.push(code.slice(0, 80));
        continue;
      }
      if (seen.has(code)) continue;
      seen.add(code);
      valid.push(code);
    }
  }
  if (valid.length === 0 && invalid.length === 0) return { ok: false, error: "没有可添加的兑换码。" };
  if (valid.length > MAX_ADMIN_BATCH) return { ok: false, error: `一次最多添加 ${MAX_ADMIN_BATCH} 个兑换码。` };
  return { ok: true, valid, invalid };
}

function methodNotAllowed(allow) {
  const response = json({ ok: false, error: "请求方法不被支持。" }, 405);
  response.headers.set("Allow", allow);
  return response;
}

function addSecurityHeaders(response) {
  const headers = new Headers();
  let setCookies = [];
  if (typeof response.headers.getSetCookie === "function") {
    setCookies = response.headers.getSetCookie();
  } else {
    const single = response.headers.get("set-cookie");
    if (single) setCookies = [single];
  }
  for (const [name, value] of response.headers) {
    if (name.toLowerCase() === "set-cookie") continue;
    headers.set(name, value);
  }
  for (const cookie of setCookies) headers.append("Set-Cookie", cookie);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  headers.set("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function assignRewardCode(env, user) {
  const existing = await env.DB.prepare("SELECT code, assigned_at FROM reward_codes WHERE assigned_to_sub = ? LIMIT 1")
    .bind(user.sub)
    .first();
  if (existing) {
    return { code: existing.code, assignedAt: existing.assigned_at || null };
  }
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const candidate = await env.DB.prepare("SELECT code FROM reward_codes WHERE assigned_to_sub IS NULL ORDER BY code LIMIT 1")
      .first();
    if (!candidate) {
      return { code: null, poolEmpty: true };
    }
    const assignedAt = new Date().toISOString();
    const update = await env.DB.prepare("UPDATE reward_codes SET assigned_to_sub = ?, assigned_to_name = ?, assigned_at = ? WHERE code = ? AND assigned_to_sub IS NULL")
      .bind(user.sub, user.name, assignedAt, candidate.code)
      .run();
    if (update.meta && update.meta.changes === 1) {
      return { code: candidate.code, assignedAt };
    }
  }
  return { code: null, poolEmpty: false };
}

async function handleCreateResponse(request, env, user) {
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    return json({ ok: false, error: "请以 JSON 格式提交答卷。" }, 415);
  }

  const body = await readBody(request);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return json({ ok: false, error: "提交内容格式无效或超过大小限制。" }, 400);
  }

  // 新版表单支持多选；保留旧版 application 字段以兼容旧前端。
  const applicationsInput = Array.isArray(body.applications)
    ? body.applications
    : (typeof body.application === "string" ? [body.application] : []);
  if (applicationsInput.length < 1 || applicationsInput.length > ALLOWED_APPLICATIONS.size) {
    return json({ ok: false, error: "请至少选择一项有效的对话应用。" }, 400);
  }
  const applications = [...new Set(applicationsInput)];
  if (applications.length !== applicationsInput.length) {
    return json({ ok: false, error: "应用选项不能重复提交。" }, 400);
  }
  if (applications.some((application) => typeof application !== "string" || !ALLOWED_APPLICATIONS.has(application))) {
    return json({ ok: false, error: "包含无效的对话应用选项。" }, 400);
  }

  const applicationOther = cleanText(body.applicationOther, MAX_APP_OTHER_LENGTH);
  if (applications.includes("other") && !applicationOther) {
    return json({ ok: false, error: "请填写其他应用的名称。" }, 400);
  }
  // 保留旧列；新版完整选择保存在 applications_json。
  const application = applications[0];

  if (!Array.isArray(body.features) || body.features.length < 1 || body.features.length > ALLOWED_FEATURES.size) {
    return json({ ok: false, error: "请至少选择一项有效的功能。" }, 400);
  }
  const features = [...new Set(body.features)];
  if (features.length !== body.features.length) {
    return json({ ok: false, error: "功能选项不能重复提交。" }, 400);
  }
  if (features.some((feature) => typeof feature !== "string" || !ALLOWED_FEATURES.has(feature))) {
    return json({ ok: false, error: "包含无效的功能选项。" }, 400);
  }

  const featureOther = features.includes("other")
    ? cleanText(body.featureOther, MAX_FEATURE_OTHER_LENGTH)
    : "";
  const wishlist = cleanText(body.wishlist, MAX_WISHLIST_LENGTH);

  const favoriteResult = parseModelList(body.favoriteModels, MAX_FAVORITE_MODELS);
  if (!favoriteResult.ok) {
    return json({ ok: false, error: favoriteResult.error }, 400);
  }
  const jailbreak = cleanText(body.jailbreak, 20);
  if (!JAILBREAK_VALUES.has(jailbreak)) {
    return json({ ok: false, error: "请选择你在聊天过程中的破甲情况。" }, 400);
  }
  const minTopUp = cleanText(body.minTopUp, 10);
  if (!TOPUP_VALUES.has(minTopUp)) {
    return json({ ok: false, error: "请选择你认为的最低起充额度。" }, 400);
  }
  const reTopUp = cleanText(body.reTopUp, 20);
  if (!RETOPUP_VALUES.has(reTopUp)) {
    return json({ ok: false, error: "请选择你第二次愿意充值的额度。" }, 400);
  }
  const payModelsResult = parseModelList(body.payModels, ALLOWED_MODELS.size);
  if (!payModelsResult.ok) {
    return json({ ok: false, error: payModelsResult.error }, 400);
  }
  const pricesResult = parseModelPrices(body.modelPrices);
  if (!pricesResult.ok) {
    return json({ ok: false, error: pricesResult.error }, 400);
  }
  // 服务端时间为准，忽略客户端传入的 submittedAt，避免接受伪造时间。
  const submittedAt = new Date().toISOString();

  try {
    const existing = await env.DB.prepare("SELECT id FROM survey_responses WHERE user_sub = ? LIMIT 1")
      .bind(user.sub)
      .first();
    if (existing) {
      return json({ ok: false, error: "你已经提交过答卷，每个账号仅限一份。", code: "ALREADY_SUBMITTED" }, 409);
    }

    const result = await env.DB.prepare(
      `INSERT INTO survey_responses
       (application, application_other, features_json, feature_other, wishlist, submitted_at, applications_json, user_sub, user_name,
        favorite_models_json, jailbreak, min_top_up, re_top_up, pay_models_json, model_prices_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        application, applicationOther, JSON.stringify(features), featureOther, wishlist, submittedAt, JSON.stringify(applications),
        user.sub, user.name, JSON.stringify(favoriteResult.models), jailbreak, minTopUp, reTopUp,
        JSON.stringify(payModelsResult.models), JSON.stringify(pricesResult.prices),
      )
      .run();

    // 填完请求成功后才下发兑换码：池里有码则在同一请求内直接分配。
    let reward = null;
    try {
      reward = await assignRewardCode(env, user);
    } catch (error) {
      console.error("Unable to assign reward code", error);
    }

    return json({
      ok: true,
      id: result.meta?.last_row_id ?? null,
      submittedAt,
      applications,
      rewardCode: reward && reward.code ? reward.code : null,
    }, 201);
  } catch (error) {
    if (String((error && error.message) || error).includes("UNIQUE")) {
      return json({ ok: false, error: "你已经提交过答卷，每个账号仅限一份。", code: "ALREADY_SUBMITTED" }, 409);
    }
    console.error("Unable to store survey response", error);
    return json({ ok: false, error: "暂时无法保存答卷，请稍后重试。" }, 500);
  }
}

async function handleAuthLogin(request, env) {
  const config = getOauthConfig(env);
  if (!config.ready) {
    return redirectTo("/?login=error&reason=unconfigured");
  }
  const state = randomToken(16);
  const nonce = randomToken(16);
  const verifier = randomToken(32);
  const challenge = await sha256Base64Url(verifier);
  const redirectUri = new URL("/api/auth/callback", request.url).toString();
  const stateToken = await signToken(config.sessionSecret, {
    state,
    nonce,
    verifier,
    exp: Math.floor(Date.now() / 1000) + OAUTH_STATE_TTL_SECONDS,
  });
  const authorize = new URL("/oauth2/authorize", config.issuer);
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set("client_id", config.clientId);
  authorize.searchParams.set("redirect_uri", redirectUri);
  authorize.searchParams.set("scope", "openid profile email");
  authorize.searchParams.set("state", state);
  authorize.searchParams.set("nonce", nonce);
  authorize.searchParams.set("code_challenge", challenge);
  authorize.searchParams.set("code_challenge_method", "S256");
  return redirectTo(authorize.toString(), {
    "Set-Cookie": buildCookie(OAUTH_COOKIE, stateToken, { maxAge: OAUTH_STATE_TTL_SECONDS }),
  });
}

async function handleAuthCallback(request, env) {
  const config = getOauthConfig(env);
  if (!config.ready) {
    return redirectTo("/?login=error&reason=unconfigured");
  }
  const requestUrl = new URL(request.url);
  const failure = (reason) => redirectTo(`/?login=error&reason=${encodeURIComponent(reason)}`, {
    "Set-Cookie": clearCookie(OAUTH_COOKIE),
  });
  if (requestUrl.searchParams.get("error")) {
    return failure("denied");
  }
  const code = requestUrl.searchParams.get("code");
  const state = requestUrl.searchParams.get("state");
  const stateToken = await verifyToken(config.sessionSecret, parseCookies(request).get(OAUTH_COOKIE) || "");
  const now = Math.floor(Date.now() / 1000);
  if (!code || !state || !stateToken || stateToken.state !== state || typeof stateToken.exp !== "number" || stateToken.exp < now) {
    return failure("state");
  }

  const redirectUri = new URL("/api/auth/callback", request.url).toString();
  const tokenForm = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: config.clientId,
    code,
    redirect_uri: redirectUri,
    code_verifier: stateToken.verifier,
  });
  if (config.clientSecret) tokenForm.set("client_secret", config.clientSecret);

  let tokenResponse;
  try {
    tokenResponse = await fetchWithTimeout(new URL("/oauth2/token", config.issuer).toString(), {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: tokenForm.toString(),
    });
  } catch {
    return failure("token");
  }
  if (!tokenResponse.ok) {
    return failure("token");
  }
  let tokens = null;
  try {
    tokens = await tokenResponse.json();
  } catch {
    tokens = null;
  }
  if (!tokens || typeof tokens.access_token !== "string" || !tokens.access_token) {
    return failure("token");
  }

  const idPayload = decodeJwtPayload(tokens.id_token);
  if (idPayload && idPayload.nonce && idPayload.nonce !== stateToken.nonce) {
    return failure("nonce");
  }

  let profileResponse;
  try {
    profileResponse = await fetchWithTimeout(new URL("/oauth2/userinfo", config.issuer).toString(), {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
  } catch {
    return failure("userinfo");
  }
  if (!profileResponse.ok) {
    return failure("userinfo");
  }
  let profile = null;
  try {
    profile = await profileResponse.json();
  } catch {
    profile = null;
  }
  const sub = profile && typeof profile.sub === "string" ? profile.sub.trim() : "";
  if (!sub) {
    return failure("profile");
  }
  const rawName = profile && typeof profile.preferred_username === "string" && profile.preferred_username
    ? profile.preferred_username
    : (profile && typeof profile.name === "string" ? profile.name : "");
  const name = cleanText(rawName, 60) || "已登录用户";

  const sessionToken = await signToken(config.sessionSecret, {
    sub,
    name,
    iat: now,
    exp: now + SESSION_TTL_SECONDS,
  });
  const headers = new Headers();
  headers.append("Set-Cookie", buildCookie(SESSION_COOKIE, sessionToken, { maxAge: SESSION_TTL_SECONDS }));
  headers.append("Set-Cookie", clearCookie(OAUTH_COOKIE));
  headers.set("Cache-Control", "no-store");
  headers.set("Location", "/?login=ok");
  return new Response(null, { status: 302, headers });
}

async function handleAuthMe(request, env) {
  const config = getOauthConfig(env);
  const user = await getSessionUser(request, env);
  let submission = null;
  if (user && env.DB) {
    try {
      const row = await env.DB.prepare(
        "SELECT applications_json, application_other, features_json, feature_other, wishlist, submitted_at, favorite_models_json, jailbreak, min_top_up, re_top_up, pay_models_json, model_prices_json FROM survey_responses WHERE user_sub = ? ORDER BY id DESC LIMIT 1",
      )
        .bind(user.sub)
        .first();
      if (row) {
        submission = {
          submittedAt: row.submitted_at,
          applications: safeJsonArray(row.applications_json),
          applicationOther: typeof row.application_other === "string" ? row.application_other : "",
          features: safeJsonArray(row.features_json),
          featureOther: typeof row.feature_other === "string" ? row.feature_other : "",
          wishlist: typeof row.wishlist === "string" ? row.wishlist : "",
          favoriteModels: safeJsonArray(row.favorite_models_json),
          jailbreak: typeof row.jailbreak === "string" ? row.jailbreak : "",
          minTopUp: typeof row.min_top_up === "string" ? row.min_top_up : "",
          reTopUp: typeof row.re_top_up === "string" ? row.re_top_up : "",
          payModels: safeJsonArray(row.pay_models_json),
          modelPrices: safeJsonObject(row.model_prices_json),
        };
      }
    } catch (error) {
      console.error("Unable to load submission", error);
    }
  }
  return json({
    ok: true,
    configured: config.ready,
    missing: config.ready ? [] : config.missing,
    authenticated: Boolean(user),
    user: user ? { name: user.name } : null,
    submission,
  });
}

async function handleAuthLogout() {
  return json({ ok: true }, 200, [
    ["Set-Cookie", clearCookie(SESSION_COOKIE)],
    ["Set-Cookie", clearCookie(OAUTH_COOKIE)],
  ]);
}

async function handleReward(request, env) {
  const user = await getSessionUser(request, env);
  if (!user) {
    return json({ ok: false, error: "请先登录。", code: "UNAUTHORIZED" }, 401);
  }
  if (!env.DB) {
    return json({ ok: false, error: "调研数据库尚未配置。" }, 503);
  }
  try {
    const submission = await env.DB.prepare("SELECT id FROM survey_responses WHERE user_sub = ? LIMIT 1")
      .bind(user.sub)
      .first();
    if (!submission) {
      return json({ ok: false, error: "请先完成问卷，完成后即可领取兑换码。", code: "NO_SUBMISSION" }, 403);
    }
    const result = await assignRewardCode(env, user);
    return json({ ok: true, code: result.code || null, assignedAt: result.assignedAt || null, available: !result.poolEmpty });
  } catch (error) {
    console.error("Unable to assign reward code", error);
    return json({ ok: false, error: "暂时无法查询兑换码，请稍后重试。" }, 500);
  }
}

async function getAdminSession(request, env) {
  const config = getOauthConfig(env);
  if (!config.sessionSecret) return null;
  const token = parseCookies(request).get(ADMIN_COOKIE);
  if (!token) return null;
  const payload = await verifyToken(config.sessionSecret, token);
  if (!payload || payload.role !== "admin") return null;
  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== "number" || payload.exp < now) return null;
  return { role: "admin" };
}

async function handleAdminLogin(request, env) {
  if (isPlaceholder(env.ADMIN_TOKEN)) {
    return json({ ok: false, error: "后台尚未配置 ADMIN_TOKEN。" }, 503);
  }
  const config = getOauthConfig(env);
  if (!config.sessionSecret) {
    return json({ ok: false, error: "会话密钥尚未配置。" }, 503);
  }
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    return json({ ok: false, error: "请以 JSON 格式提交。" }, 415);
  }
  const body = await readBody(request);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return json({ ok: false, error: "请求格式无效。" }, 400);
  }
  const token = typeof body.token === "string" ? body.token.trim() : "";
  if (!timingSafeEqual(token, env.ADMIN_TOKEN.trim())) {
    return json({ ok: false, error: "管理口令不正确。" }, 401);
  }
  const now = Math.floor(Date.now() / 1000);
  const adminToken = await signToken(config.sessionSecret, {
    role: "admin",
    iat: now,
    exp: now + ADMIN_SESSION_TTL_SECONDS,
  });
  return json({ ok: true }, 200, [
    ["Set-Cookie", buildCookie(ADMIN_COOKIE, adminToken, { maxAge: ADMIN_SESSION_TTL_SECONDS })],
  ]);
}

async function handleAdminLogout() {
  return json({ ok: true }, 200, [["Set-Cookie", clearCookie(ADMIN_COOKIE)]]);
}

async function handleAdminStats(request, env) {
  const admin = await getAdminSession(request, env);
  if (!admin) {
    return json({ ok: false, error: "请先登录后台。", code: "UNAUTHORIZED" }, 401);
  }
  if (!env.DB) {
    return json({ ok: false, error: "调研数据库尚未配置。" }, 503);
  }
  try {
    const counters = await env.DB.prepare(
      "SELECT (SELECT COUNT(*) FROM reward_codes) AS total, (SELECT COUNT(*) FROM reward_codes WHERE assigned_to_sub IS NOT NULL) AS assigned, (SELECT COUNT(*) FROM survey_responses) AS submissions",
    ).first();
    const total = Number(counters?.total || 0);
    const assigned = Number(counters?.assigned || 0);
    const recent = await env.DB.prepare(
      "SELECT code, assigned_to_sub, assigned_to_name, assigned_at FROM reward_codes ORDER BY rowid DESC LIMIT 50",
    ).all();
    return json({
      ok: true,
      total,
      assigned,
      remaining: Math.max(0, total - assigned),
      submissions: Number(counters?.submissions || 0),
      recent: (recent.results || []).map((row) => ({
        code: row.code,
        assigned: Boolean(row.assigned_to_sub),
        assignedToName: typeof row.assigned_to_name === "string" ? row.assigned_to_name : "",
        assignedAt: row.assigned_at || null,
      })),
    });
  } catch (error) {
    console.error("Unable to load admin stats", error);
    return json({ ok: false, error: "后台数据加载失败，请稍后重试。" }, 500);
  }
}

async function handleAdminCodesAdd(request, env) {
  const admin = await getAdminSession(request, env);
  if (!admin) {
    return json({ ok: false, error: "请先登录后台。", code: "UNAUTHORIZED" }, 401);
  }
  if (!env.DB) {
    return json({ ok: false, error: "调研数据库尚未配置。" }, 503);
  }
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    return json({ ok: false, error: "请以 JSON 格式提交。" }, 415);
  }
  const body = await readBody(request);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return json({ ok: false, error: "请求格式无效或超过大小限制。" }, 400);
  }
  const normalized = normalizeCodeList(body.codes);
  if (!normalized.ok) {
    return json({ ok: false, error: normalized.error }, 400);
  }
  try {
    let added = 0;
    const codes = normalized.valid;
    for (let start = 0; start < codes.length; start += 50) {
      const chunk = codes.slice(start, start + 50);
      // 占位符由数量生成，取值全部通过 bind 参数化传入，避免 SQL 注入。
      const placeholders = chunk.map(() => "(?)").join(", ");
      const result = await env.DB.prepare(`INSERT OR IGNORE INTO reward_codes (code) VALUES ${placeholders}`)
        .bind(...chunk)
        .run();
      added += Number(result.meta?.changes ?? 0);
    }
    return json({
      ok: true,
      added,
      duplicates: Math.max(0, codes.length - added),
      invalid: normalized.invalid,
    });
  } catch (error) {
    console.error("Unable to store reward codes", error);
    return json({ ok: false, error: "兑换码保存失败，请稍后重试。" }, 500);
  }
}

async function handleAdminCodesDelete(request, env) {
  const admin = await getAdminSession(request, env);
  if (!admin) {
    return json({ ok: false, error: "请先登录后台。", code: "UNAUTHORIZED" }, 401);
  }
  if (!env.DB) {
    return json({ ok: false, error: "调研数据库尚未配置。" }, 503);
  }
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    return json({ ok: false, error: "请以 JSON 格式提交。" }, 415);
  }
  const body = await readBody(request);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return json({ ok: false, error: "请求格式无效。" }, 400);
  }
  const code = typeof body.code === "string" ? body.code.trim() : "";
  if (!CODE_PATTERN.test(code)) {
    return json({ ok: false, error: "兑换码格式无效。" }, 400);
  }
  try {
    const existing = await env.DB.prepare("SELECT assigned_to_sub FROM reward_codes WHERE code = ? LIMIT 1")
      .bind(code)
      .first();
    if (!existing) {
      return json({ ok: false, error: "兑换码不存在。" }, 404);
    }
    if (existing.assigned_to_sub) {
      return json({ ok: false, error: "该兑换码已发放，不能删除。" }, 409);
    }
    const result = await env.DB.prepare("DELETE FROM reward_codes WHERE code = ? AND assigned_to_sub IS NULL")
      .bind(code)
      .run();
    return json({ ok: true, removed: Number(result.meta?.changes ?? 0) });
  } catch (error) {
    console.error("Unable to delete reward code", error);
    return json({ ok: false, error: "删除失败，请稍后重试。" }, 500);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    let response;

    if (url.pathname === "/api/auth/login") {
      response = request.method === "GET" ? await handleAuthLogin(request, env) : methodNotAllowed("GET");
    } else if (url.pathname === "/api/auth/callback") {
      response = request.method === "GET" ? await handleAuthCallback(request, env) : methodNotAllowed("GET");
    } else if (url.pathname === "/api/auth/logout") {
      response = request.method === "POST" ? await handleAuthLogout() : methodNotAllowed("POST");
    } else if (url.pathname === "/api/auth/me") {
      response = request.method === "GET" ? await handleAuthMe(request, env) : methodNotAllowed("GET");
    } else if (url.pathname === "/api/reward") {
      response = request.method === "GET" ? await handleReward(request, env) : methodNotAllowed("GET");
    } else if (url.pathname === "/api/responses") {
      if (request.method === "POST") {
        if (!env.DB) {
          response = json({ ok: false, error: "调研数据库尚未配置。" }, 503);
        } else {
          const user = await getSessionUser(request, env);
          if (!user) {
            response = json({ ok: false, error: "请先登录后再提交答卷。", code: "UNAUTHORIZED" }, 401);
          } else {
            response = await handleCreateResponse(request, env, user);
          }
        }
      } else if (request.method === "OPTIONS") {
        response = new Response(null, {
          status: 204,
          headers: { Allow: "POST, OPTIONS", "Cache-Control": "no-store" },
        });
      } else {
        response = methodNotAllowed("POST, OPTIONS");
      }
    } else if (url.pathname === "/api/admin/login") {
      response = request.method === "POST" ? await handleAdminLogin(request, env) : methodNotAllowed("POST");
    } else if (url.pathname === "/api/admin/logout") {
      response = request.method === "POST" ? await handleAdminLogout() : methodNotAllowed("POST");
    } else if (url.pathname === "/api/admin/stats") {
      response = request.method === "GET" ? await handleAdminStats(request, env) : methodNotAllowed("GET");
    } else if (url.pathname === "/api/admin/codes") {
      response = request.method === "POST" ? await handleAdminCodesAdd(request, env) : methodNotAllowed("POST");
    } else if (url.pathname === "/api/admin/codes/delete") {
      response = request.method === "POST" ? await handleAdminCodesDelete(request, env) : methodNotAllowed("POST");
    } else if (url.pathname.startsWith("/api/")) {
      response = json({ ok: false, error: "接口不存在。" }, 404);
    } else if (url.pathname === "/admin" || url.pathname === "/admin/") {
      if (request.method !== "GET") {
        response = methodNotAllowed("GET");
      } else if (env.ASSETS) {
        const adminAsset = await env.ASSETS.fetch(new Request(new URL("/admin.html", request.url).toString(), { headers: request.headers }));
        const headers = new Headers(adminAsset.headers);
        headers.set("X-Robots-Tag", "noindex");
        response = new Response(adminAsset.body, { status: adminAsset.status, headers });
      } else {
        response = new Response("Static assets binding is not configured.", { status: 503 });
      }
    } else if (env.ASSETS) {
      response = await env.ASSETS.fetch(request);
    } else {
      response = new Response("Static assets binding is not configured.", { status: 503 });
    }

    return addSecurityHeaders(response);
  },
};