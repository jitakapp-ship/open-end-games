/* =========================================================
   منطق الألعاب — ما تحتاج تعدّل هنا.
   الإعدادات: config.js (الاتصال) + جدول game_restaurants (المطاعم)
   ========================================================= */
const $ = id => document.getElementById(id);
const APP = window.APP || {};
const COMPANY = APP.COMPANY || { name: "" };
const params = new URLSearchParams(location.search);
const SLUG = (params.get("r") || "").trim().toLowerCase();
const DEFAULT_FOODS = ["🍔","🍕","🌯","🍟","🥤","🍰"];

let REST = null;       // إعدادات المطعم من السيرفر
let todayPlay = null;  // لعبة اليوم لهذا الجهاز
let curPlay = null;    // اللعبة الجارية
let busy = false;

/* ---------- أدوات ---------- */
function lsGet(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } }
function lsSet(k,v){ try{ localStorage.setItem(k,v); }catch(e){} }
function makeId(){
  try{ if(crypto.randomUUID) return crypto.randomUUID(); }catch(e){}
  return Date.now().toString(36)+Math.random().toString(36).slice(2,14);
}
const DEVICE = lsGet("rg_device") || (()=>{ const d=makeId(); lsSet("rg_device",d); return d; })();
function shuffle(a){ for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }
function buzz(p){ try{ navigator.vibrate && navigator.vibrate(p); }catch(e){} }
function foods(){ const f=REST.foods&&REST.foods.length>=6?REST.foods:DEFAULT_FOODS; return f.slice(0,6); }
function fmtTime(iso){
  const d = iso ? new Date(iso) : new Date();
  try{ return d.toLocaleString("ar-IQ",{hour:"2-digit",minute:"2-digit",day:"numeric",month:"numeric"}); }
  catch(e){ return d.toLocaleString(); }
}
let toastT=null;
function toast(msg){
  const t=$("toast"); t.textContent=msg; t.classList.add("show");
  clearTimeout(toastT); toastT=setTimeout(()=>t.classList.remove("show"),2800);
}

/* ---------- التنقل ---------- */
function show(id){
  document.querySelectorAll(".screen").forEach(s=>s.classList.remove("active"));
  $(id).classList.add("active"); window.scrollTo(0,0);
}
function showLoading(msg, retryFn){
  $("loadMsg").textContent = msg || "لحظة...";
  $("spin").style.display = retryFn ? "none" : "block";
  const b=$("retryBtn"); b.style.display = retryFn ? "inline-block" : "none";
  b.onclick = retryFn || null;
  show("loading");
}
function blocked(){ return !!(REST && REST.one_play_per_day && todayPlay); }
function gameRunning(){ return (cg && !cg.done) || (mem && !mem.done); }
function stopAll(){ stopMemory(); stopCatch(); }
function goHome(){ stopAll(); refreshHome(); show("home"); }
function refreshHome(){
  const b=blocked();
  $("goCatch").disabled=b; $("goMemory").disabled=b;
  $("played").style.display=b?"block":"none";
  $("ruleTxt").style.display=REST.one_play_per_day?"block":"none";
}

// زر الرجوع: أثناء اللعب يحتاج ضغطتين لأن المحاولة تنحسب
let backArmed=0;
document.querySelectorAll("[data-home]").forEach(b=>b.addEventListener("click",()=>{
  if(gameRunning() && Date.now()-backArmed>2500){
    backArmed=Date.now(); toast("إذا طلعت هسه تنحسب عليك المحاولة — اضغط مرة ثانية للخروج"); return;
  }
  goHome();
}));

$("showMine").addEventListener("click", async ()=>{
  showLoading("لحظة...");
  try{ todayPlay = await api("game_today_play",{p_slug:SLUG,p_device:DEVICE}) || todayPlay; }catch(e){}
  if(todayPlay) openRecord(todayPlay); else goHome();
});
$("goCatch").addEventListener("click",()=>startGame("catch"));
$("goMemory").addEventListener("click",()=>startGame("memory"));

/* ---------- بداية ونهاية اللعبة (مع السيرفر) ---------- */
async function startGame(game){
  if(busy) return;
  if(blocked()) return openRecord(todayPlay);
  busy=true;
  const btn=$(game==="catch"?"goCatch":"goMemory"); btn.classList.add("loading");
  try{
    const res = await api("game_start",{p_slug:SLUG,p_device:DEVICE,p_game:game,p_table:null});
    if(!res || res.error) throw new Error(res && res.error);
    todayPlay = res.play;
    if(res.already){ refreshHome(); return openRecord(res.play); }
    curPlay = res.play;
    show(game==="catch"?"catchScreen":"memoryScreen");
    if(game==="catch") startCatch(); else startMemory();
  }catch(e){
    toast("صار خلل بالاتصال، حاول مرة ثانية");
  }finally{
    busy=false; btn.classList.remove("loading");
  }
}

// info = { extra, clientPassed, failMsg }
async function submitResult(score, completed, info){
  const play = curPlay;
  if(!play) return goHome();
  showLoading("لحظة… نتأكد من نتيجتك");
  let r;
  try{
    r = await api("game_finish",{p_play_id:play.play_id,p_score:score,p_completed:completed},4);
  }catch(e){
    return showLoading("ما كدرنا نوصل للسيرفر. تأكد من الإنترنت.", ()=>submitResult(score,completed,info));
  }
  if(!r || r.error){ curPlay=null; toast("صار خطأ"); return goHome(); }
  curPlay=null; todayPlay=r;
  if(r.passed){
    confetti(40);
    if(REST.boxes) return showBoxes(r, info.extra);
    return showResult(r, true, info.extra);
  }
  showResult(r, true, info.extra, info.clientPassed ? "ما انحسبت المحاولة" : info.failMsg);
}

function boxKey(p){ return "rg_box_"+p.play_id; }
function openRecord(p){
  if(!p) return goHome();
  if(p.status==="started") return showResult(p,false,"طلعت قبل ما تخلص اللعبة","المحاولة انحسبت");
  if(p.passed && REST.boxes && !lsGet(boxKey(p))) return showBoxes(p);
  showResult(p,false);
}

/* ---------- صناديق المفاجأة ---------- */
let boxPlay=null, boxExtra="";
function showBoxes(p, extra){
  boxPlay=p; boxExtra=extra||defaultExtra(p);
  const wrap=$("boxes"); wrap.classList.remove("locked");
  wrap.querySelectorAll(".gbox").forEach(b=>{ b.className="gbox"; b.textContent="🎁"; });
  $("boxExtra").textContent=boxExtra;
  show("boxScreen");
}
$("boxes").querySelectorAll(".gbox").forEach(b=>b.addEventListener("click",()=>{
  if(!boxPlay) return;
  const p=boxPlay, extra=boxExtra; boxPlay=null;
  const wrap=$("boxes"); wrap.classList.add("locked");
  wrap.querySelectorAll(".gbox").forEach(o=>{ if(o!==b) o.classList.add("dim"); });
  b.classList.add("open"); buzz(40);
  lsSet(boxKey(p),"1");
  setTimeout(()=>{ b.textContent = p.won?"🎉":"💨"; }, 900);
  setTimeout(()=>showResult(p,true,extra), 1700);
}));

/* =========================================================
   لعبة: اصطاد الأكل
   ========================================================= */
let cg=null;
function stopCatch(){ if(cg){ cg.done=true; cancelAnimationFrame(cg.raf); clearTimeout(cg.cd); } }
function startCatch(){
  stopAll();
  const C=REST.catch, wrap=$("catchWrap"), cv=$("catchCv");
  const dpr=Math.min(window.devicePixelRatio||1,2), W=wrap.clientWidth, H=wrap.clientHeight;
  cv.width=W*dpr; cv.height=H*dpr; cv.style.width=W+"px"; cv.style.height=H+"px";
  const ctx=cv.getContext("2d"); ctx.setTransform(dpr,0,0,dpr,0,0);
  cg={ctx,W,H,C,items:[],pops:[],x:W/2,score:0,started:0,last:0,acc:0,raf:0,cd:0,done:false,running:false,shake:0,
      bw:Math.min(100,W*.26),foods:foods()};
  catchHud(C.seconds); drawCatch();
  countdown(["3","2","1","يلا!"],0);
}
function countdown(seq,i){
  const ov=$("cOverlay");
  if(!cg||cg.done){ ov.classList.remove("show"); return; }
  if(i>=seq.length){ ov.classList.remove("show"); cg.running=true; cg.started=cg.last=performance.now(); cg.raf=requestAnimationFrame(catchLoop); return; }
  ov.innerHTML="<span>"+seq[i]+"</span>"; ov.classList.add("show");
  cg.cd=setTimeout(()=>countdown(seq,i+1), i===seq.length-1?500:750);
}
function catchHud(left){
  const C=cg.C, g=$("cGoal");
  g.textContent="⭐ "+cg.score+" من "+C.target; g.classList.toggle("done",cg.score>=C.target);
  $("cTime").textContent="⏱ "+Math.max(0,Math.ceil(left));
  $("cFill").style.width=Math.max(0,left/C.seconds*100)+"%";
  $("cBar").classList.toggle("low",left<=7);
}
function spawn(p){
  const bad=Math.random()<0.16+0.12*p;
  cg.items.push({ bad, e: bad?"💣":cg.foods[Math.floor(Math.random()*cg.foods.length)],
    x: 26+Math.random()*(cg.W-52), y:-30, v:(160+240*p)*(0.85+Math.random()*0.35),
    r:0, vr:(Math.random()-.5)*3 });
}
function catchLoop(t){
  if(!cg||cg.done) return;
  const dt=Math.min(0.05,(t-cg.last)/1000); cg.last=t;
  const el=(t-cg.started)/1000, C=cg.C, left=C.seconds-el, p=Math.min(1,el/C.seconds);
  cg.acc+=dt*1000;
  if(cg.acc>=650-320*p){ cg.acc=0; spawn(p); }
  const by=cg.H-44;
  cg.items=cg.items.filter(it=>{
    it.y+=it.v*dt; it.r+=it.vr*dt;
    if(it.y>by-24 && it.y<by+12 && Math.abs(it.x-cg.x)<cg.bw/2+6){
      if(it.bad){ cg.score=Math.max(0,cg.score-3); cg.shake=.35; buzz(90); cg.pops.push({x:it.x,y:by-34,t:0,s:"−3",c:"#ff5a4f"}); }
      else{ cg.score++; buzz(8); cg.pops.push({x:it.x,y:by-34,t:0,s:"+1",c:"#8ff5b4"}); }
      return false;
    }
    return it.y<cg.H+40;
  });
  cg.pops=cg.pops.filter(pp=>(pp.t+=dt)<.7);
  if(cg.shake>0) cg.shake-=dt;
  catchHud(left); drawCatch();
  if(left<=0) return finishCatch();
  cg.raf=requestAnimationFrame(catchLoop);
}
function rrect(ctx,x,y,w,h,r){ ctx.beginPath(); ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y); ctx.quadraticCurveTo(x+w,y,x+w,y+r);
  ctx.lineTo(x+w,y+h-r); ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h); ctx.lineTo(x+r,y+h); ctx.quadraticCurveTo(x,y+h,x,y+h-r);
  ctx.lineTo(x,y+r); ctx.quadraticCurveTo(x,y,x+r,y); ctx.closePath(); }
function drawCatch(){
  const {ctx,W,H}=cg; ctx.save(); ctx.clearRect(0,0,W,H);
  if(cg.shake>0) ctx.translate((Math.random()-.5)*10,(Math.random()-.5)*6);
  ctx.textAlign="center"; ctx.textBaseline="middle"; ctx.font="36px system-ui, 'Apple Color Emoji','Segoe UI Emoji',sans-serif";
  cg.items.forEach(it=>{ ctx.save(); ctx.translate(it.x,it.y); ctx.rotate(it.r); ctx.fillText(it.e,0,0); ctx.restore(); });
  const css=getComputedStyle(document.documentElement), by=H-44, bw=cg.bw;
  const g=ctx.createLinearGradient(0,by-8,0,by+18);
  g.addColorStop(0,css.getPropertyValue("--accent").trim()||"#F2A541");
  g.addColorStop(1,css.getPropertyValue("--accent2").trim()||"#E85D3A");
  ctx.fillStyle="rgba(0,0,0,.35)"; rrect(ctx,cg.x-bw/2+4,by+6,bw,18,9); ctx.fill();
  ctx.fillStyle=g; rrect(ctx,cg.x-bw/2,by-6,bw,20,10); ctx.fill();
  ctx.fillStyle="rgba(255,255,255,.35)"; rrect(ctx,cg.x-bw/2+8,by-3,bw-16,4,2); ctx.fill();
  ctx.font="900 22px Cairo, sans-serif";
  cg.pops.forEach(pp=>{ ctx.globalAlpha=1-pp.t/.7; ctx.fillStyle=pp.c; ctx.fillText(pp.s,pp.x,pp.y-pp.t*50); });
  ctx.restore();
}
function finishCatch(){
  const C=cg.C, s=cg.score; stopCatch();
  submitResult(s,false,{ extra:"جمعت "+s+" من "+C.target, clientPassed:s>=C.target, failMsg:"ما وصلت للهدف" });
}
(function bindCatchInput(){
  const wrap=$("catchWrap");
  const move=e=>{ if(!cg||cg.done) return; const r=wrap.getBoundingClientRect();
    cg.x=Math.max(cg.bw/2,Math.min(cg.W-cg.bw/2,e.clientX-r.left)); if(!cg.running) drawCatch(); };
  wrap.addEventListener("pointerdown",move); wrap.addEventListener("pointermove",move);
})();

/* =========================================================
   لعبة: طابق الأطباق
   ========================================================= */
let mem=null;
function setStatus(t){ $("memStatus").textContent=t; }
function stopMemory(){ if(mem){ clearInterval(mem.timer); clearTimeout(mem.preview); mem.done=true; } }
function startMemory(){
  stopAll();
  const M=REST.memory, f=foods(), deck=shuffle([...f,...f]), grid=$("memGrid");
  grid.innerHTML="";
  mem={first:null,lock:true,matched:0,started:0,timer:null,preview:null,done:false,pairs:f.length};
  deck.forEach(x=>{
    const b=document.createElement("button");
    b.className="mcard flip"; b.dataset.f=x;
    b.innerHTML=`<div class="inner"><div class="face front">؟</div><div class="face back">${x}</div></div>`;
    b.addEventListener("click",()=>flipCard(b));
    grid.appendChild(b);
  });
  memTime(M.seconds);
  setStatus("👀 احفظ أماكن الأطباق...");
  mem.preview=setTimeout(()=>{
    grid.querySelectorAll(".mcard").forEach(c=>c.classList.remove("flip"));
    mem.preview=setTimeout(()=>{
      if(!mem||mem.done) return;
      mem.lock=false; mem.started=Date.now(); setStatus("يلا! لاقي الأزواج");
      mem.timer=setInterval(memTick,100);
    },400);
  },2200);
}
function memTime(left){
  const M=REST.memory;
  $("mFill").style.width=Math.max(0,left/M.seconds*100)+"%";
  $("mBar").classList.toggle("low",left<=10);
  $("mTime").textContent="⏱ "+Math.max(0,Math.ceil(left))+" ثانية";
}
function memTick(){
  if(!mem||mem.done) return;
  const left=REST.memory.seconds-(Date.now()-mem.started)/1000;
  memTime(left); if(left<=0) finishMemory(false);
}
function flipCard(b){
  if(!mem||mem.lock||mem.done||b.classList.contains("flip")) return;
  b.classList.add("flip"); buzz(10);
  if(!mem.first){ mem.first=b; return; }
  const a=mem.first; mem.first=null; mem.lock=true;
  if(a.dataset.f===b.dataset.f){
    setTimeout(()=>{
      a.classList.add("matched"); b.classList.add("matched");
      mem.matched++; mem.lock=false; buzz(25);
      if(mem.matched===mem.pairs) finishMemory(true);
      else setStatus(["عاشت ايدك! 👏","ممتاز! 🔥","كمّل! 💪"][mem.matched%3]);
    },250);
  }else{
    setTimeout(()=>{ a.classList.remove("flip"); b.classList.remove("flip"); mem.lock=false; },700);
  }
}
function finishMemory(win){
  if(!mem||mem.done) return;
  const elapsed=(Date.now()-mem.started)/1000, found=mem.matched, pairs=mem.pairs;
  stopMemory();
  if(win){
    setStatus("🎉 كفو!");
    setTimeout(()=>submitResult(0,true,{ extra:"خلصتها بـ "+elapsed.toFixed(1)+" ثانية", clientPassed:true }),600);
  }else{
    setStatus("⏰ خلص الوقت");
    document.querySelectorAll(".mcard").forEach(c=>c.classList.add("flip"));
    setTimeout(()=>submitResult(found,false,{ extra:"لاقيت "+found+" من "+pairs, clientPassed:false, failMsg:"خلص الوقت" }),1300);
  }
}

/* =========================================================
   النتيجة
   ========================================================= */
function defaultExtra(p){ return (p.game==="catch" && p.score!=null) ? "جمعت "+p.score+" أكلة" : ""; }
let clockTimer=null;
function showResult(p, fresh, extra, failMsg){
  stopAll();
  if(extra===undefined) extra=defaultExtra(p);
  if(!p.won){
    $("rEmoji").textContent="😅";
    $("rTitle").textContent = p.passed ? "الصندوق طلع فارغ" : (failMsg || "ما وصلت للهدف");
    $("rPrize").textContent="";
    $("rExtra").textContent=(extra?extra+" — ":"")+"حظ أوفر المرة الجاية!";
    $("couponBlock").style.display="none";
  }else{
    $("rEmoji").textContent = p.redeemed ? "✅" : "🎉";
    $("rTitle").textContent = p.redeemed ? "استلمت هديتك" : "مبروك! ربحت";
    $("rPrize").textContent=p.prize;
    $("rExtra").textContent=extra||"";
    $("rRestName").textContent="كوبون "+REST.name;
    $("rCode").textContent=p.code;
    $("rTime").textContent=fmtTime(p.finished_at);
    const note=$("rNote");
    note.textContent = p.redeemed ? "✅ تم استخدام هذا الكوبون" : "📱 أظهر هذه الشاشة للكاشير قبل الدفع";
    note.classList.toggle("used", !!p.redeemed);
    $("couponBlock").style.display="block";
    if(fresh){ confetti(90); buzz([60,40,60]); }
  }
  clearInterval(clockTimer);
  const upd=()=>{ $("liveClock").textContent=new Date().toLocaleTimeString("ar-IQ"); };
  upd(); clockTimer=setInterval(upd,1000);
  refreshHome();
  show("resultScreen");
}
function confetti(n){
  const cs=getComputedStyle(document.documentElement);
  const colors=[cs.getPropertyValue("--accent").trim(),cs.getPropertyValue("--accent2").trim(),"#fff7ec","#3fbf7f","#9b59b6"];
  for(let i=0;i<n;i++){
    const d=document.createElement("i"); d.className="cf";
    d.style.left=Math.random()*100+"vw"; d.style.background=colors[i%colors.length];
    d.style.animationDuration=(2+Math.random()*2.2)+"s"; d.style.animationDelay=(Math.random()*.6)+"s";
    document.body.appendChild(d); setTimeout(()=>d.remove(),5000);
  }
}

/* =========================================================
   التشغيل
   ========================================================= */
function applyRestaurant(){
  const root=document.documentElement.style;
  if(REST.colors){
    if(REST.colors.primary) root.setProperty("--accent",REST.colors.primary);
    if(REST.colors.secondary) root.setProperty("--accent2",REST.colors.secondary);
  }
  const logo=$("logo"); logo.innerHTML="";
  if(/[\/.]/.test(REST.logo||"")){ const img=document.createElement("img"); img.src=REST.logo; img.alt=REST.name; logo.appendChild(img); }
  else logo.textContent=REST.logo||"🍽️";
  $("rName").textContent=REST.name;
  $("rTag").textContent=REST.tagline||"";
  $("catchChip1").textContent="⏱ "+REST.catch.seconds+" ثانية · 🎯 "+REST.catch.target;
  $("catchChip2").textContent="🎁 "+REST.catch.prize;
  $("memChip1").textContent="⏱ "+REST.memory.seconds+" ثانية";
  $("memChip2").textContent="🎁 "+REST.memory.prize;
  document.title="العب واربح — "+REST.name;
}
async function init(){
  document.querySelectorAll(".companyName").forEach(el=>{
    el.textContent="";
    if(COMPANY.website){ const a=document.createElement("a"); a.href=COMPANY.website; a.target="_blank"; a.textContent=COMPANY.name; el.appendChild(a); }
    else el.textContent=COMPANY.name;
  });
  if(!window.apiReady()){ $("noRestMsg").textContent="⚙️ لازم تحط رابط ومفتاح Supabase بملف config.js"; return show("noRest"); }
  if(!SLUG) return show("noRest");
  showLoading("لحظة...");
  try{
    REST = await api("game_get_restaurant",{p_slug:SLUG});
    if(!REST) return show("noRest");
    applyRestaurant();
    todayPlay = await api("game_today_play",{p_slug:SLUG,p_device:DEVICE});
    refreshHome(); show("home");
  }catch(e){
    showLoading("ما كدرنا نتصل. تأكد من الإنترنت.", init);
  }
}
init();
