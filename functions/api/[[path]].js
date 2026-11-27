/* =====================================================================
   بوابة الألعاب — Cloudflare Pages Function
   كل طلبات الألعاب تمر من هنا:  play.jitakapp.com/api/...
   - مفتاح Supabase السري محفوظ بإعدادات Cloudflare (Secret) وما يطلع للمتصفح
   - يسمح بس بأوامر الألعاب المعروفة
   - يفحص Turnstile (إنسان لو بوت) قبل بداية كل لعبة
   - يوصل IP اللاعب الحقيقي لـ Supabase
   الإعدادات (Settings → Variables and Secrets):
     SUPABASE_URL       = https://xxxx.supabase.co
     SUPABASE_SECRET    = sb_secret_...            (Secret)
     TURNSTILE_SECRET   = 0x...                    (Secret) — اختياري لحد ما تفعّله
   ===================================================================== */

const ALLOWED = new Set([
  "game_get_restaurant", "game_check", "game_today_play", "game_start", "game_finish",
  "game_staff_check", "game_staff_redeem", "game_staff_stats",
  "game_owner_get", "game_owner_set", "game_owner_prize_save",
]);
const MAX_BODY = 8000;

function out(status, obj, extra) {
  return new Response(typeof obj === "string" ? obj : JSON.stringify(obj), {
    status,
    headers: Object.assign({
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "x-gw": "1",
    }, extra || {}),
  });
}

function clientIp(req) {
  const ip = (req.headers.get("cf-connecting-ip") || "").trim();
  return /^[0-9a-fA-F:.]{3,45}$/.test(ip) ? ip : "";
}

async function rpc(env, fn, body, ip) {
  const key = env.SUPABASE_SECRET;
  const headers = { "Content-Type": "application/json", "apikey": key };
  if (/^eyJ/.test(key)) headers.Authorization = "Bearer " + key;
  if (ip) headers["x-player-ip"] = ip;
  const url = String(env.SUPABASE_URL).replace(/\/+$/, "") + "/rest/v1/rpc/" + fn;
  const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body || {}) });
  return { status: res.status, text: await res.text() };
}

async function humanOk(env, token, ip, host) {
  if (!env.TURNSTILE_SECRET) return true;                 // ما مفعّل بعد
  if (typeof token !== "string" || token.length < 10 || token.length > 4096) return false;
  const form = new FormData();
  form.append("secret", env.TURNSTILE_SECRET);
  form.append("response", token);
  if (ip) form.append("remoteip", ip);
  try {
    const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form });
    const d = await r.json();
    if (!d || d.success !== true) return false;
    if (d.hostname && host && d.hostname !== host) return false;
    return true;
  } catch (e) {
    return false;
  }
}

function cleanBody(raw) {
  // لازم كائن JSON، والمفاتيح كلها p_ (عدا _ts نشيله)
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const b = {};
  for (const k of Object.keys(raw)) {
    if (k === "_ts") continue;
    if (!/^p_[a-z_]{1,30}$/.test(k)) return null;
    b[k] = raw[k];
  }
  return b;
}

export async function onRequest(ctx) {
  const { request: req, env } = ctx;
  const url = new URL(req.url);

  if (req.method !== "POST") return out(405, { error: "method" });
  if (!env.SUPABASE_URL || !env.SUPABASE_SECRET) return out(500, { error: "gateway_not_configured" });

  // نفس الموقع بس (المتصفحات تبعث Origin مع POST)
  const origin = req.headers.get("origin");
  if (origin && origin !== url.origin) return out(403, { error: "origin" });

  const len = Number(req.headers.get("content-length") || 0);
  if (len > MAX_BODY) return out(413, { error: "too_large" });
  const txt = await req.text();
  if (txt.length > MAX_BODY) return out(413, { error: "too_large" });
  let raw;
  try { raw = txt ? JSON.parse(txt) : {}; } catch (e) { return out(400, { error: "bad_json" }); }

  const parts = Array.isArray(ctx.params && ctx.params.path) ? ctx.params.path : url.pathname.replace(/^\/api\/?/, "").split("/");
  const ip = clientIp(req);

  try {
    // /api/boot  — بيانات المطعم + حالة الجهاز بطلب واحد
    if (parts.length === 1 && parts[0] === "boot") {
      const b = cleanBody(raw);
      if (!b || typeof b.p_slug !== "string") return out(400, { error: "bad_body" });
      const [r1, r2] = await Promise.all([
        rpc(env, "game_get_restaurant", { p_slug: b.p_slug }, ip),
        rpc(env, "game_check", { p_slug: b.p_slug, p_device: b.p_device || null, p_fp: b.p_fp || null }, ip),
      ]);
      if (r1.status >= 300) return out(r1.status >= 500 ? 502 : r1.status, r1.text || { error: "upstream" });
      if (r2.status >= 300) return out(r2.status >= 500 ? 502 : r2.status, r2.text || { error: "upstream" });
      return out(200, '{"rest":' + (r1.text || "null") + ',"check":' + (r2.text || "null") + "}");
    }

    // /api/rpc/<fn>
    if (parts.length === 2 && parts[0] === "rpc") {
      const fn = parts[1];
      if (!ALLOWED.has(fn)) return out(403, { error: "not_allowed" });
      const b = cleanBody(raw);
      if (!b) return out(400, { error: "bad_body" });
      if (fn === "game_start" && !(await humanOk(env, raw._ts, ip, url.hostname))) {
        return out(403, { error: "bot_check" });
      }
      const r = await rpc(env, fn, b, ip);
      return out(r.status >= 500 ? 502 : r.status, r.text || "null");
    }
  } catch (e) {
    return out(502, { error: "upstream_unreachable" });
  }
  return out(404, { error: "not_found" });
}
