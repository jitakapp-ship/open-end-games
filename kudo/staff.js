if (window.top !== window.self) { try { window.top.location = window.self.location.href; } catch (e) { document.documentElement.innerHTML = ""; } }
const $=id=>document.getElementById(id);
const params=new URLSearchParams(location.search);
const GAME_NAMES={catch:"مطر الكرسبي",delivery:"توصيل كودو السريع (جيتك)",xmas:"كودو البطل"};
function applySkin(skin){}
let S={slug:"kudo-kudo-mosul", pin:""};
let current=null;

$("company").textContent=(window.APP&&APP.COMPANY&&APP.COMPANY.name)||"";
if(S.slug) $("slugBox").classList.add("hidden");
try{ const saved=JSON.parse(sessionStorage.getItem("staff")||"null"); if(saved&&(!S.slug||saved.slug===S.slug)) S=saved; }catch(e){}

function fmt(iso){ if(!iso) return "—"; const d=new Date(iso);
  try{ return d.toLocaleString("ar-IQ",{hour:"2-digit",minute:"2-digit",day:"numeric",month:"numeric"}); }catch(e){ return d.toLocaleString(); } }
function dayName(d){ try{ return new Date(d+"T12:00:00").toLocaleDateString("ar-IQ",{weekday:"short",day:"numeric",month:"numeric"}); }catch(e){ return d; } }

async function login(){
  const slug=(S.slug||$("slug").value).trim().toLowerCase(), pin=$("pin").value.trim();
  if(!window.apiReady()){ $("loginErr").textContent="لازم تحط رابط ومفتاح Supabase بملف config.js"; return; }
  if(!slug||!pin){ $("loginErr").textContent="اكتب المعرّف والرمز"; return; }
  $("loginBtn").disabled=true; $("loginErr").textContent="";
  try{
    const r=await api("game_staff_check",{p_slug:slug,p_pin:pin,p_code:""});
    if(!r||r.error){ $("loginErr").textContent="المعرّف أو الرمز غلط"; return; }
    S={slug,pin}; try{ sessionStorage.setItem("staff",JSON.stringify(S)); }catch(e){}
    openPanel();
  }catch(e){ $("loginErr").textContent="ما كدرنا نتصل — تأكد من الإنترنت"; }
  finally{ $("loginBtn").disabled=false; }
}
function openPanel(){
  $("login").classList.add("hidden"); $("panel").classList.remove("hidden");
  $("code").focus(); loadStats();
}
function logout(){ try{ sessionStorage.removeItem("staff"); }catch(e){} location.reload(); }

async function check(){
  const code=$("code").value.trim().toUpperCase();
  if(!code) return;
  $("checkBtn").disabled=true; $("codeErr").textContent=""; $("res").className="res";
  try{
    const r=await api("game_staff_check",{p_slug:S.slug,p_pin:S.pin,p_code:code});
    if(r&&r.error==="bad_pin") return logout();
    if(!r||r.error){ $("codeErr").textContent="❌ الرمز غير موجود — تأكد منه"; return; }
    current=r.play; render(r.play, r.expired);
  }catch(e){ $("codeErr").textContent="ما كدرنا نتصل — حاول مرة ثانية"; }
  finally{ $("checkBtn").disabled=false; }
}
function render(p, expired){
  const box=$("res");
  let cls="valid", title="✅ كوبون صالح";
  if(p.redeemed){ cls="used"; title="⛔ هذا الكوبون مستخدم سابقاً"; }
  else if(expired){ cls="expired"; title="⚠️ الكوبون منتهي (مو من اليوم)"; }
  box.className="res show "+cls;
  $("resTitle").textContent=title;
  $("resPrize").textContent="🎁 "+(p.prize||"هدية");
  $("resCode").textContent=p.code;
  $("resGame").textContent=GAME_NAMES[p.game]||p.game;
  $("resTime").textContent=fmt(p.finished_at);
  $("resUsed").textContent=fmt(p.redeemed_at);
  $("resUsed").style.display=$("resUsedL").style.display=p.redeemed?"block":"none";
  $("redeemBtn").style.display=(!p.redeemed&&!expired)?"block":"none";
}
async function redeem(){
  if(!current) return;
  $("redeemBtn").disabled=true;
  try{
    const r=await api("game_staff_redeem",{p_slug:S.slug,p_pin:S.pin,p_code:current.code});
    if(r&&r.error==="bad_pin") return logout();
    if(r&&r.play){ current=r.play; render(r.play, r.error==="expired"); }
    if(r&&r.ok){ $("resTitle").textContent="🎉 تم تسليم الهدية"; $("code").value=""; loadStats(); }
    else if(r&&r.error==="already") $("codeErr").textContent="هذا الكوبون انستخدم قبل";
  }catch(e){ $("codeErr").textContent="ما كدرنا نتصل — حاول مرة ثانية"; }
  finally{ $("redeemBtn").disabled=false; }
}
async function loadStats(){
  try{
    const r=await api("game_staff_stats",{p_slug:S.slug,p_pin:S.pin});
    if(!r||r.error) return;
    $("restName").firstChild.textContent=r.name; applySkin(r.skin);
    const t=r.days[0]||{plays:0,won:0,redeemed:0};
    $("sPlays").textContent=t.plays; $("sWon").textContent=t.won; $("sRedeemed").textContent=t.redeemed;
    $("sLeft").textContent=Math.max(0,r.daily_prize_limit-t.won);
    const esc=t=>String(t).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
    const pr=Array.isArray(r.prizes)?r.prizes:[];
    $("prizesBox").classList.toggle("hidden",!pr.length);
    $("prizes").innerHTML=pr.map(x=>`<tr style="${x.today?"":"opacity:.45"}"><td>${esc(x.name)}${x.today?"":" <small>(مو اليوم)</small>"}</td><td>${x.won}</td><td>${x.redeemed}</td><td>${x.daily_limit==null?"—":x.daily_limit}</td></tr>`).join("");
    $("days").innerHTML=r.days.map(d=>`<tr><td>${dayName(d.date)}</td><td>${d.plays}</td><td>${d.passed}</td><td>${d.won}</td><td>${d.redeemed}</td></tr>`).join("");
  }catch(e){}
}


/* ---------- إعدادات صاحب المطعم ---------- */
let OWNER_PIN="";
function wrHint(){
  const v=+$("wr").value; $("wrVal").textContent=v+"%";
  $("wrHint").textContent = v===0 ? "ماكو أحد راح يربح هدية."
    : "من كل 100 زبون ينجح باللعبة، تقريباً "+v+" يربحون هدية. واللي يخسر باللعبة ما يربح أصلاً، فالعدد الحقيقي يطلع أقل.";
  $("ownerOk").textContent="";
}
async function ownerOpen(){
  const pin=$("ownerPin").value.trim(); if(!pin) return;
  $("ownerBtn").disabled=true; $("ownerErr").textContent="";
  try{
    const r=await api("game_owner_get",{p_slug:S.slug,p_pin:pin});
    if(!r||r.error){ $("ownerErr").textContent="رمز المالك غلط"; return; }
    OWNER_PIN=pin; $("ownerPin").value="";
    $("wr").value=Math.round(r.win_percent); $("lim").value=r.daily_prize_limit; $("strict").checked=r.strict_lock!==false; wrHint();
    $("interval").value=r.prize_interval_minutes??60; $("oneWin").checked=r.one_win_per_customer!==false;
    OWNER_GAMES=Array.isArray(r.games)?r.games:[]; applySkin(r.skin);
    renderMeals(r.prizes);
    $("ownerLogin").classList.add("hidden"); $("ownerForm").classList.remove("hidden");
  }catch(e){ $("ownerErr").textContent="ما كدرنا نتصل — حاول مرة ثانية"; }
  finally{ $("ownerBtn").disabled=false; }
}
async function ownerSave(){
  const pct=+$("wr").value, lim=parseInt($("lim").value,10), iv=parseInt($("interval").value||"0",10);
  $("ownerErr2").textContent=""; $("ownerOk").textContent="";
  if(isNaN(lim)||lim<0){ $("ownerErr2").textContent="اكتب رقم صحيح لعدد الهدايا"; return; }
  if(isNaN(iv)||iv<0||iv>1440){ $("ownerErr2").textContent="المدة لازم بين 0 و 1440 دقيقة"; return; }
  $("saveOwner").disabled=true;
  try{
    const r=await api("game_owner_set",{p_slug:S.slug,p_pin:OWNER_PIN,p_win_percent:pct,p_daily_limit:lim,p_strict_lock:$("strict").checked,
      p_one_win:$("oneWin").checked,p_interval_minutes:iv});
    if(!r||r.error){ $("ownerErr2").textContent = r&&r.error==="bad_pin" ? "انتهت الجلسة، افتح الإعدادات من جديد" : "القيم غير صحيحة"; return; }
    $("wr").value=Math.round(r.win_percent); $("lim").value=r.daily_prize_limit; $("strict").checked=r.strict_lock!==false; wrHint();
    $("interval").value=r.prize_interval_minutes??60; $("oneWin").checked=r.one_win_per_customer!==false;
    $("ownerOk").textContent="✅ انحفظت — تشتغل من هسه";
    loadStats();
  }catch(e){ $("ownerErr2").textContent="ما كدرنا نتصل — حاول مرة ثانية"; }
  finally{ $("saveOwner").disabled=false; }
}

/* ---------- الوجبات ---------- */
const DAY_NAMES=["أحد","اثنين","ثلاثاء","أربعاء","خميس","جمعة","سبت"];
let OWNER_GAMES=[];
function el(tag,attrs,kids){ const e=document.createElement(tag); Object.entries(attrs||{}).forEach(([k,v])=>{ if(k==="text") e.textContent=v; else if(k==="cls") e.className=v; else e.setAttribute(k,v); }); (kids||[]).forEach(c=>e.appendChild(c)); return e; }
function renderMeals(list){
  const box=$("meals"); box.innerHTML="";
  (list||[]).forEach(m=>box.appendChild(mealCard(m)));
  $("wrBlock").classList.toggle("hidden", (list||[]).length>0);
}
function mealCard(m){
  m=m||{id:null,name:"",kind:"meal",discount:null,percent:1,daily_limit:null,weekdays:[],active:true};
  let kind=m.kind==="discount"?"discount":"meal";
  const name=el("input",{type:"text",placeholder:"اسم الوجبة",maxlength:"60"}); name.value=kind==="meal"?(m.name||""):"";
  const disc=el("input",{type:"number",min:"1",max:"100",step:"1",inputmode:"numeric",placeholder:"نسبة الخصم %"}); disc.value=m.discount||"";
  const kMeal=el("button",{type:"button",cls:"day",text:"🍽️ وجبة"}), kDisc=el("button",{type:"button",cls:"day",text:"🏷️ خصم %"});
  const syncKind=()=>{ kMeal.classList.toggle("on",kind==="meal"); kDisc.classList.toggle("on",kind==="discount"); name.style.display=kind==="meal"?"":"none"; disc.style.display=kind==="discount"?"":"none"; };
  kMeal.onclick=()=>{ kind="meal"; syncKind(); }; kDisc.onclick=()=>{ kind="discount"; syncKind(); };
  const on=el("input",{type:"checkbox"}); on.checked=m.active!==false;
  const pct=el("input",{type:"number",min:"0",max:"100",step:"0.1",inputmode:"decimal"}); pct.value=m.percent!=null?Number(m.percent):1;
  const lim=el("input",{type:"number",min:"0",step:"1",inputmode:"numeric",placeholder:"بدون حد"}); lim.value=m.daily_limit==null?"":m.daily_limit;
  const days=new Set((m.weekdays||[]).map(Number));
  const gms=new Set((m.games||[]).map(String));
  const gameBtns=OWNER_GAMES.map(gk=>{ const b=el("button",{type:"button",cls:"day"+(gms.has(gk)?" on":""),text:GAME_NAMES[gk]||gk}); b.onclick=()=>{ gms.has(gk)?gms.delete(gk):gms.add(gk); b.classList.toggle("on"); }; return b; });
  const dayBtns=DAY_NAMES.map((d,i)=>{ const b=el("button",{type:"button",cls:"day"+(days.has(i)?" on":""),text:d}); b.onclick=()=>{ days.has(i)?days.delete(i):days.add(i); b.classList.toggle("on"); }; return b; });
  const save=el("button",{type:"button",cls:"btn",text:m.id?"حفظ":"إضافة"});
  const msg=el("span",{cls:"mmsg"});
  const card=el("div",{cls:"meal"+(on.checked?"":" off")},[
    el("div",{cls:"days",style:"margin:0 0 10px"},[kMeal,kDisc]),
    el("div",{cls:"top"},[name, disc, el("label",{cls:"sw"},[on, el("span",{text:"مفعّلة"})])]),
    el("div",{cls:"two"},[ el("div",{},[el("label",{text:"نسبة الفوز %"}),pct]), el("div",{},[el("label",{text:"حد يومي"}),lim]) ]),
    el("label",{text:"الأيام (بدون اختيار = كل يوم)",style:"margin:10px 0 0"}),
    el("div",{cls:"days",style:"margin-top:4px"},dayBtns),
    el("label",{text:"الألعاب اللي تطلع بيها (بدون اختيار = كل الألعاب)",style:"margin:4px 0 0"}),
    el("div",{cls:"days",style:"margin-top:4px"},gameBtns),
    el("div",{cls:"mrow"},[save,msg])
  ]);
  async function doSave(){
    msg.style.color="var(--bad)"; msg.textContent="";
    const p=parseFloat(pct.value), l=lim.value.trim()===""?null:parseInt(lim.value,10);
    const dv=parseInt(disc.value,10);
    if(kind==="meal" && !name.value.trim()){ msg.textContent="اكتب اسم الوجبة"; return; }
    if(kind==="discount" && (isNaN(dv)||dv<1||dv>100)){ msg.textContent="نسبة الخصم لازم بين 1 و 100"; return; }
    if(isNaN(p)||p<0||p>100){ msg.textContent="النسبة لازم بين 0 و 100"; return; }
    if(l!==null&&(isNaN(l)||l<0)){ msg.textContent="الحد اليومي غلط"; return; }
    save.disabled=true; on.disabled=true;
    try{
      const r=await api("game_owner_prize_save",{p_slug:S.slug,p_pin:OWNER_PIN,p_id:m.id,p_name:kind==="meal"?name.value.trim():"خصم",p_kind:kind,p_discount:kind==="discount"?dv:null,
        p_percent:p,p_daily_limit:l,p_weekdays:[...days].sort(),p_active:on.checked,p_games:[...gms]});
      if(!r||r.error){ msg.textContent = r&&r.error==="bad_pin" ? "انتهت الجلسة، افتح الإعدادات من جديد" : "ما انحفظت — تأكد من القيم"; return; }
      renderMeals(r.prizes); loadStats();
      toastMeal(kind==="meal"?name.value.trim():"خصم "+dv+"%");
    }catch(e){ msg.textContent="ما كدرنا نتصل — حاول مرة ثانية"; }
    finally{ save.disabled=false; on.disabled=false; }
  }
  syncKind();
  save.onclick=doSave;
  on.onchange=()=>{ card.classList.toggle("off",!on.checked); if(m.id) doSave(); };
  return card;
}
function toastMeal(n){ $("ownerOk").textContent="✅ انحفظت «"+n+"» — تشتغل من هسه"; }
$("addMeal").onclick=()=>{ const c=mealCard(null); $("meals").appendChild(c); c.querySelector("input").focus(); };

$("ownerBtn").onclick=ownerOpen;
$("ownerPin").addEventListener("keydown",e=>{ if(e.key==="Enter") ownerOpen(); });
$("wr").addEventListener("input",wrHint);
$("saveOwner").onclick=ownerSave;

$("loginBtn").onclick=login;
$("pin").addEventListener("keydown",e=>{ if(e.key==="Enter") login(); });
$("checkBtn").onclick=check;
$("code").addEventListener("keydown",e=>{ if(e.key==="Enter") check(); });
$("code").addEventListener("input",()=>{ $("res").className="res"; $("codeErr").textContent=""; });
$("redeemBtn").onclick=redeem;
$("refresh").onclick=loadStats;
$("logout").onclick=logout;
if(S.pin) openPanel();
