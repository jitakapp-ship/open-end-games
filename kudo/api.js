/* اتصال بسيط بدوال Supabase — ما تحتاج تعدّل هنا */
(function(){
  const APP = window.APP || {};
  window.apiReady = function(){
    return !!APP.SUPABASE_URL && !/xxxx/.test(APP.SUPABASE_URL) && !!APP.SUPABASE_KEY && !/ضع هنا/.test(APP.SUPABASE_KEY);
  };
  window.api = async function(fn, body, tries){
    tries = tries || 3;
    const headers = { "Content-Type": "application/json", "apikey": APP.SUPABASE_KEY };
    if (/^eyJ/.test(APP.SUPABASE_KEY)) headers.Authorization = "Bearer " + APP.SUPABASE_KEY;
    const url = APP.SUPABASE_URL.replace(/\/+$/, "") + "/rest/v1/rpc/" + fn;
    let last;
    for (let i = 0; i < tries; i++) {
      try {
        const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body || {}) });
        const txt = await res.text();
        if (!res.ok) { const e = new Error("HTTP " + res.status + " " + txt); e.status = res.status; throw e; }
        return txt ? JSON.parse(txt) : null;
      } catch (e) {
        last = e;
        if (e.status && e.status < 500 && e.status !== 429) break;   // خطأ بالإعداد — ما نعيد
        if (i < tries - 1) await new Promise(r => setTimeout(r, 700 * (i + 1)));
      }
    }
    throw last;
  };
})();
