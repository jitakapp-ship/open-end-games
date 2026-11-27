/* اتصال الألعاب بالسيرفر — ما تحتاج تعدّل هنا
   - إذا الموقع على Cloudflare: كل الطلبات تمر من البوابة  /api  (المفتاح السري هناك)
   - إذا البوابة مو موجودة (مثلاً GitHub Pages): يرجع للاتصال المباشر بـ Supabase
   - Turnstile: فحص إنسان/بوت قبل بداية كل لعبة (إذا انحط TURNSTILE_SITEKEY بـ config.js) */
(function(){
  const APP = window.APP || {};
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const hasDirect = () => !!APP.SUPABASE_URL && !/xxxx/.test(APP.SUPABASE_URL) && !!APP.SUPABASE_KEY && !/ضع هنا/.test(APP.SUPABASE_KEY);
  let mode = APP.API_BASE ? "gw" : "direct";          // gw = البوابة

  window.apiReady = function(){ return !!APP.API_BASE || hasDirect(); };

  /* ---------- Turnstile ---------- */
  const SITEKEY = APP.TURNSTILE_SITEKEY || "";
  let tsPending = null, tsAt = 0, tsWidget = null;
  function tsLoad(){
    if (!SITEKEY || window.turnstile || document.getElementById("tsScript")) return;
    const s = document.createElement("script");
    s.id = "tsScript"; s.async = true;
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    document.head.appendChild(s);
  }
  function tsFresh(){
    return new Promise(async (resolve, reject) => {
      tsLoad();
      for (let i = 0; i < 150 && !window.turnstile; i++) await sleep(100);
      if (!window.turnstile) return reject(new Error("bot_check_unavailable"));
      const box = document.getElementById("tsBox") || document.body;
      if (tsWidget !== null) { try { window.turnstile.remove(tsWidget); } catch (e) {} tsWidget = null; }
      const t = setTimeout(() => reject(new Error("bot_check_timeout")), 90000);
      tsWidget = window.turnstile.render(box, {
        sitekey: SITEKEY, appearance: "interaction-only", language: "ar",
        callback: tok => { clearTimeout(t); resolve(tok); },
        "error-callback": () => { clearTimeout(t); reject(new Error("bot_check_failed")); },
      });
    });
  }
  // نجهّز الفحص مسبقاً (لما الزبون يفتح قائمة الألعاب) حتى ما ينتظر
  window.tsPrefetch = function(){
    if (!SITEKEY || mode !== "gw") return;
    if (tsPending && Date.now() - tsAt < 240000) return;
    tsAt = Date.now(); tsPending = tsFresh(); tsPending.catch(() => { tsPending = null; });
  };
  async function tsTake(){
    if (!SITEKEY || mode !== "gw") return null;
    if (!tsPending || Date.now() - tsAt > 240000) { tsAt = Date.now(); tsPending = tsFresh(); }
    const p = tsPending; tsPending = null;           // التوكن يُستعمل مرة وحدة
    try { return await p; }
    finally { setTimeout(() => window.tsPrefetch(), 1500); }
  }

  /* ---------- الطلبات ---------- */
  async function send(path, fn, body){
    let url, headers = { "Content-Type": "application/json" };
    if (mode === "gw") {
      url = APP.API_BASE.replace(/\/+$/, "") + path;
    } else {
      if (!fn) throw Object.assign(new Error("no_direct_route"), { status: 400 });
      url = APP.SUPABASE_URL.replace(/\/+$/, "") + "/rest/v1/rpc/" + fn;
      headers.apikey = APP.SUPABASE_KEY;
      if (/^eyJ/.test(APP.SUPABASE_KEY)) headers.Authorization = "Bearer " + APP.SUPABASE_KEY;
      if (body && "_ts" in body) { body = Object.assign({}, body); delete body._ts; }
    }
    const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body || {}), credentials: "omit" });
    // البوابة مو موجودة على هذا الاستضافة → اتصال مباشر
    if (mode === "gw" && (res.status === 404 || res.status === 405) && !res.headers.get("x-gw") && hasDirect()) {
      mode = "direct";
      return send(path, fn, body);
    }
    const txt = await res.text();
    if (!res.ok) { const e = new Error("HTTP " + res.status + " " + txt.slice(0, 300)); e.status = res.status; throw e; }
    return txt ? JSON.parse(txt) : null;
  }

  async function withRetry(job, tries){
    tries = tries || 3;
    let last;
    for (let i = 0; i < tries; i++) {
      try { return await job(); }
      catch (e) {
        last = e;
        if (e.status && e.status < 500 && e.status !== 429) break;   // خطأ بالإعداد — ما نعيد
        if (i < tries - 1) await sleep(700 * (i + 1));
      }
    }
    throw last;
  }

  window.api = function(fn, body, tries){
    if (fn === "game_start") {
      // فحص بوت جديد لكل محاولة
      return withRetry(async () => {
        const b = Object.assign({}, body || {});
        const tok = await tsTake();
        if (tok) b._ts = tok;
        return send("/rpc/" + fn, fn, b);
      }, tries);
    }
    return withRetry(() => send("/rpc/" + fn, fn, body), tries);
  };

  // بيانات المطعم + حالة الجهاز (طلب واحد عبر البوابة، أو طلبين مباشر)
  window.apiBoot = async function(slug, device, fp){
    if (mode === "gw") {
      try {
        return await withRetry(() => send("/boot", null, { p_slug: slug, p_device: device, p_fp: fp }));
      } catch (e) {
        if (mode !== "direct") throw e;               // تحوّل للمباشر أثناء المحاولة
      }
    }
    const rest = await window.api("game_get_restaurant", { p_slug: slug });
    const check = rest ? await window.api("game_check", { p_slug: slug, p_device: device, p_fp: fp }) : null;
    return { rest, check };
  };
})();
