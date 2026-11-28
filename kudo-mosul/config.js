/* =========================================================
   إعدادات الموقع
   API_BASE: البوابة على Cloudflare (لا تغيّرها)
   TURNSTILE_SITEKEY: المفتاح العام لـ Turnstile (من Cloudflare ← Turnstile)
   SUPABASE_URL / SUPABASE_KEY: اتصال احتياطي مباشر — ينحذفن بعد قفل Supabase (خطوة 5)
   ========================================================= */
window.APP = {
  API_BASE: "/api",
  TURNSTILE_SITEKEY: "0x4AAAAAAGWb6RAUcGlf6edO",

  SUPABASE_URL: "https://sanvupoolabgftggiati.supabase.co",
  SUPABASE_KEY: "sb_publishable_DzyBNO9y42ZwYkxq5iaUSg_j21cIEiz",   // المفتاح العام

  COMPANY: {
    name: "Open End Technology", // اسم الشركة — يظهر أسفل كل صفحة
    website: "",           // اختياري
  },
};
