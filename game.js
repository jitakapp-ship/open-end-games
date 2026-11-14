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
function cookieGet(k){ try{ const m=document.cookie.match(new RegExp("(?:^|; )"+k+"=([^;]*)")); return m?decodeURIComponent(m[1]):null; }catch(e){ return null; } }
function cookieSet(k,v){ try{ document.cookie=k+"="+encodeURIComponent(v)+"; max-age=31536000; path=/; SameSite=Lax"+(location.protocol==="https:"?"; Secure":""); }catch(e){} }
const DEVICE = (()=>{ let d=lsGet("rg_device")||cookieGet("rg_device"); if(!d||d.length<8) d=makeId(); lsSet("rg_device",d); cookieSet("rg_device",d); return d; })();

// بصمة الجهاز: أشياء ثابتة بالتلفون نفسه، ما تتغير إذا بدّل المتصفح أو فتح خفي
async function computeFP(){
  const parts=[];
  try{
    const s=window.screen||{};
    parts.push([s.width||0,s.height||0].sort((a,b)=>a-b).join("x"), window.devicePixelRatio||1, s.colorDepth||0);
    try{ parts.push(Intl.DateTimeFormat().resolvedOptions().timeZone||""); }catch(e){ parts.push(""); }
    parts.push((navigator.language||"").slice(0,2).toLowerCase());
    const ua=navigator.userAgent||"";
    const ios=ua.match(/(?:iPhone|iPad|iPod).*? OS (\d+)[_.](\d+)/), and=ua.match(/Android (\d+)/);
    parts.push(ios ? "ios"+ios[1]+"."+ios[2] : and ? "android"+and[1] : (navigator.platform||""));
    parts.push(navigator.maxTouchPoints||0);
    try{
      const c=document.createElement("canvas"), gl=c.getContext("webgl")||c.getContext("experimental-webgl");
      const ext=gl&&gl.getExtension("WEBGL_debug_renderer_info");
      parts.push(ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)||"") : "");
    }catch(e){ parts.push(""); }
  }catch(e){}
  const txt=parts.join("|");
  try{
    const buf=await crypto.subtle.digest("SHA-256", new TextEncoder().encode(txt));
    return Array.from(new Uint8Array(buf)).slice(0,16).map(b=>b.toString(16).padStart(2,"0")).join("");
  }catch(e){
    let h=0; for(let i=0;i<txt.length;i++){ h=(h*31+txt.charCodeAt(i))|0; } return "s"+(h>>>0).toString(16);
  }
}
let FP=null;
let lockInfo=null;   // تلفون لعب من متصفح ثاني خلال 24 ساعة
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
function blocked(){ return !!(REST && REST.one_play_per_day && (todayPlay || lockInfo)); }
function nextAt(){
  if(lockInfo && lockInfo.next_at) return new Date(lockInfo.next_at);
  if(todayPlay && todayPlay.started_at) return new Date(new Date(todayPlay.started_at).getTime()+864e5);
  return null;
}
function waitText(){
  const n=nextAt(); if(!n) return "";
  const ms=n.getTime()-Date.now(); if(ms<=0) return "تكدر تلعب هسه — حدّث الصفحة";
  const t=Math.ceil(ms/6e4), h=Math.floor(t/60), m=t%60;
  const parts=[]; if(h>0) parts.push(h+" ساعة"); if(m>0) parts.push(m+" دقيقة");
  return "تكدر تلعب مرة ثانية بعد "+parts.join(" و ");
}
function gameRunning(){ return (cg && !cg.done) || (mem && !mem.done) || (pg && !pg.done) || (dg && !dg.done); }
function stopAll(){ stopMemory(); stopCatch(); stopPour(); stopDelivery(); }
function goHome(){ stopAll(); refreshHome(); show("home"); }
function refreshHome(){
  const b=blocked();
  $("goCatch").disabled=b; $("goMemory").disabled=b; $("goPour").disabled=b; $("goDelivery").disabled=b;
  $("played").style.display=b?"block":"none";
  if(b){
    $("playedMsg").textContent = (todayPlay ? "✅ لعبت خلال آخر 24 ساعة. " : "⏳ هذا التلفون لعب خلال آخر 24 ساعة. ") + waitText();
    $("showMine").style.display = todayPlay ? "inline-block" : "none";
  }
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
$("goPour").addEventListener("click",()=>startGame("pour"));
$("goDelivery").addEventListener("click",()=>startGame("delivery"));

/* ---------- بداية ونهاية اللعبة (مع السيرفر) ---------- */
async function startGame(game){
  if(busy) return;
  if(blocked()) return openRecord(todayPlay);
  busy=true;
  const ids={catch:"goCatch",memory:"goMemory",pour:"goPour",delivery:"goDelivery"};
  const btn=$(ids[game]); btn.classList.add("loading");
  try{
    const res = await api("game_start",{p_slug:SLUG,p_device:DEVICE,p_game:game,p_table:null,p_fp:FP});
    if(!res || res.error) throw new Error(res && res.error);
    if(res.already && res.locked){
      lockInfo={next_at:res.next_at}; refreshHome(); show("home");
      return toast("هذا التلفون لعب خلال آخر 24 ساعة");
    }
    todayPlay = res.play;
    if(res.already){ refreshHome(); return openRecord(res.play); }
    curPlay = res.play;
    show({catch:"catchScreen",memory:"memoryScreen",pour:"pourScreen",delivery:"deliveryScreen"}[game]);
    ({catch:startCatch,memory:startMemory,pour:startPour,delivery:startDelivery})[game]();
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
    x: 26+Math.random()*(cg.W-52), y:-30, v:(240+320*p)*(0.85+Math.random()*0.35),
    r:0, vr:(Math.random()-.5)*3 });
}
function catchLoop(t){
  if(!cg||cg.done) return;
  const dt=Math.min(0.05,(t-cg.last)/1000); cg.last=t;
  const el=(t-cg.started)/1000, C=cg.C, left=C.seconds-el, p=Math.min(1,el/C.seconds);
  cg.acc+=dt*1000;
  if(cg.acc>=480-240*p){ cg.acc=0; spawn(p); }
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
   لعبة: املأ الكوب
   ========================================================= */
let pg=null;
const POUR_CUPS=[
  { t:.55, b:.17, s:.30, c:"#FF9F1C" },   // برتقال — سهل
  { t:.68, b:.15, s:.36, c:"#E63946" },   // فراولة
  { t:.45, b:.13, s:.42, c:"#7BC950" },   // ليمون
  { t:.72, b:.12, s:.48, c:"#8E44AD" },   // عنب
  { t:.38, b:.10, s:.54, c:"#F4D35E" },   // أناناس
  { t:.62, b:.09, s:.60, c:"#4A2C2A" },   // كولا — أصعب وحدة
];
const DRIP=.22;  // العصير يكمّل بعد الترك
function pourNeed(){ return Math.min(POUR_CUPS.length, (REST.pour && REST.pour.target) || 5); }
function pourSecs(){ return (REST.pour && REST.pour.seconds) || 40; }
function stopPour(){ if(pg){ pg.done=true; cancelAnimationFrame(pg.raf); clearTimeout(pg.next); } }
function startPour(){
  stopAll();
  const wrap=$("pourWrap"), cv=$("pourCv");
  const dpr=Math.min(window.devicePixelRatio||1,2), W=wrap.clientWidth, H=wrap.clientHeight;
  cv.width=W*dpr; cv.height=H*dpr; cv.style.width=W+"px"; cv.style.height=H+"px";
  const ctx=cv.getContext("2d"); ctx.setTransform(dpr,0,0,dpr,0,0);
  pg={ ctx,W,H, idx:0, level:0, rate:0, pourT:0, drip:0, spill:false, state:"ready",
       cups: POUR_CUPS.map(c=>({ ...c, t: Math.min(.82, Math.max(.28, c.t+(Math.random()-.5)*.14)) })),
       results:[], msg:"", done:false, raf:0, next:0, last:performance.now(), wob:0, started:performance.now() };
  pourHud();
  pg.raf=requestAnimationFrame(pourLoop);
}
function pourHud(){
  if(!pg) return;
  const N=pg.cups.length;
  $("pGoal").textContent="🥤 كوب "+Math.min(pg.idx+1,N)+" من "+N+" · لازم "+pourNeed();
  $("pCups").textContent=pg.cups.map((c,i)=> i<pg.results.length ? (pg.results[i]?"✅":"❌") : "⚪").join("");
}
function pourDown(e){
  if(!pg||pg.done||pg.state!=="ready") return;
  if(e&&e.cancelable) e.preventDefault();
  pg.state="pouring"; pg.pourT=0; buzz(10);
}
function pourUp(){
  if(!pg||pg.done||pg.state!=="pouring") return;
  pg.state="settling"; pg.drip=DRIP;
}
function pourLoop(t){
  if(!pg||pg.done) return;
  const dt=Math.min(.05,(t-pg.last)/1000); pg.last=t;
  const cup=pg.cups[pg.idx];
  const left=pourSecs()-(t-pg.started)/1000;
  $("pTime").textContent="⏱ "+Math.max(0,Math.ceil(left));
  $("pFill").style.width=Math.max(0,left/pourSecs()*100)+"%";
  $("pBar").classList.toggle("low",left<=8);
  if(left<=0){
    while(pg.results.length<pg.cups.length) pg.results.push(false);
    pourHud(); return finishPour(true);
  }
  if(pg.state==="pouring"){
    pg.pourT+=dt; pg.rate=cup.s*(1+0.45*pg.pourT); pg.level+=pg.rate*dt;
  }else if(pg.state==="settling"){
    pg.level+=pg.rate*Math.max(0,pg.drip/DRIP)*dt; pg.drip-=dt;
    if(pg.drip<=0) judgeCup();
  }
  if(pg.level>=1 && (pg.state==="pouring"||pg.state==="settling")){ pg.level=1; pg.spill=true; judgeCup(); }
  pg.wob+=dt;
  drawPour();
  pg.raf=requestAnimationFrame(pourLoop);
}
function judgeCup(){
  const cup=pg.cups[pg.idx];
  pg.state="judged";
  const hit=!pg.spill && Math.abs(pg.level-cup.t)<=cup.b/2;
  pg.results.push(hit);
  pg.msg = pg.spill ? "💦 طفح!" : hit ? "✅ ممتاز!" : (pg.level<cup.t ? "❌ ناقص" : "❌ زايد");
  buzz(hit?[30,40,30]:120);
  pourHud();
  pg.next=setTimeout(()=>{
    if(!pg||pg.done) return;
    if(pg.idx>=pg.cups.length-1) return finishPour();
    pg.idx++; pg.level=0; pg.rate=0; pg.spill=false; pg.msg=""; pg.state="ready"; pourHud();
  },1150);
}
function finishPour(timeUp){
  const hits=pg.results.filter(Boolean).length, need=pourNeed(), N=pg.cups.length;
  stopPour();
  submitResult(hits,false,{ extra:"ضبطت "+hits+" من "+N+" أكواب", clientPassed:hits>=need,
                            failMsg: timeUp ? "خلص الوقت" : "ما ضبطت الأكواب" });
}
function drawPour(){
  const {ctx,W,H}=pg, cup=pg.cups[pg.idx], cx=W/2;
  const gwT=Math.min(W*.5,210), gwB=gwT*.72, top=Math.max(96,H*.24), bot=H-24, gh=bot-top;
  const half=y=>(gwT+(gwB-gwT)*((y-top)/gh))/2;
  const glass=()=>{ ctx.beginPath(); ctx.moveTo(cx-gwT/2,top); ctx.lineTo(cx-gwB/2+10,bot); ctx.quadraticCurveTo(cx-gwB/2,bot,cx-gwB/2+12,bot);
    ctx.lineTo(cx+gwB/2-12,bot); ctx.quadraticCurveTo(cx+gwB/2,bot,cx+gwB/2-10,bot); ctx.lineTo(cx+gwT/2,top); ctx.closePath(); };
  ctx.clearRect(0,0,W,H);

  // الحنفية
  ctx.fillStyle="rgba(255,255,255,.13)"; rrect(ctx,cx-64,10,128,38,12); ctx.fill();
  ctx.fillStyle=cup.c; ctx.beginPath(); ctx.arc(cx,29,8,0,Math.PI*2); ctx.fill();
  ctx.fillStyle="rgba(255,255,255,.28)"; rrect(ctx,cx-9,46,18,18,4); ctx.fill();

  // الخيط النازل
  const ly=bot-pg.level*gh;
  const streaming = pg.state==="pouring" || (pg.state==="settling" && pg.drip>0);
  if(streaming){
    const w = pg.state==="pouring" ? 9 : 9*Math.max(.25,pg.drip/DRIP);
    ctx.fillStyle=cup.c; ctx.fillRect(cx-w/2,64,w,Math.max(0,ly-64));
  }

  // المنطقة الخضراء
  const yA=bot-(cup.t+cup.b/2)*gh, yB=bot-(cup.t-cup.b/2)*gh;
  ctx.save(); glass(); ctx.clip();
  ctx.fillStyle="rgba(63,191,127,.20)"; ctx.fillRect(0,yA,W,yB-yA);
  // العصير
  if(pg.level>0){
    const wave=pg.state==="pouring"?Math.sin(pg.wob*14)*2.5:Math.sin(pg.wob*6)*1.2;
    ctx.fillStyle=cup.c;
    ctx.beginPath(); ctx.moveTo(0,ly+wave); ctx.quadraticCurveTo(cx,ly-wave,W,ly+wave); ctx.lineTo(W,bot+2); ctx.lineTo(0,bot+2); ctx.closePath(); ctx.fill();
    ctx.fillStyle="rgba(255,255,255,.35)"; ctx.fillRect(0,ly-1,W,4);
  }
  ctx.restore();

  ctx.setLineDash([7,5]); ctx.strokeStyle="#3fbf7f"; ctx.lineWidth=2;
  [yA,yB].forEach(y=>{ const hw=half(y)+12; ctx.beginPath(); ctx.moveTo(cx-hw,y); ctx.lineTo(cx+hw,y); ctx.stroke(); });
  ctx.setLineDash([]);
  // سهم "هنا"
  const my=(yA+yB)/2, ax=cx+half(my)+18;
  ctx.fillStyle="#3fbf7f"; ctx.beginPath(); ctx.moveTo(ax,my); ctx.lineTo(ax+12,my-8); ctx.lineTo(ax+12,my+8); ctx.closePath(); ctx.fill();
  ctx.font="900 15px Cairo, sans-serif"; ctx.textAlign="left"; ctx.textBaseline="middle"; ctx.fillText("هنا",ax+16,my+1);

  // الكوب
  glass(); ctx.strokeStyle="rgba(255,255,255,.75)"; ctx.lineWidth=3; ctx.stroke();
  ctx.strokeStyle="rgba(255,255,255,.16)"; ctx.lineWidth=7; ctx.lineCap="round";
  ctx.beginPath(); ctx.moveTo(cx-gwT/2+18,top+16); ctx.lineTo(cx-gwB/2+18,bot-16); ctx.stroke(); ctx.lineCap="butt";

  // رسائل
  ctx.textAlign="center"; ctx.textBaseline="middle";
  if(pg.state==="ready"){
    ctx.fillStyle="#fff"; ctx.font="900 19px Cairo, sans-serif";
    ctx.fillText("👇 اضغط باستمرار حتى تسكب", cx, top-20);
  }
  if(pg.msg){
    ctx.font="900 30px Cairo, sans-serif"; ctx.lineWidth=6; ctx.strokeStyle="rgba(0,0,0,.55)";
    ctx.strokeText(pg.msg,cx,top+gh*.35); ctx.fillStyle="#fff"; ctx.fillText(pg.msg,cx,top+gh*.35);
  }
}
(function bindPourInput(){
  const wrap=$("pourWrap");
  wrap.addEventListener("pointerdown",pourDown);
  ["pointerup","pointercancel"].forEach(ev=>window.addEventListener(ev,pourUp));
  wrap.addEventListener("pointerleave",pourUp);
  wrap.addEventListener("contextmenu",e=>e.preventDefault());
  window.addEventListener("blur",pourUp);
})();


/* =========================================================
   لعبة: وصّل الطلب — بالتعاون مع تطبيق جيتك
   ========================================================= */
let dg=null;
const JITAK_IMG=new Image(); JITAK_IMG.src="jitak.png";
const CAR_COLORS=["#e63946","#f4a261","#2a9d8f","#e9c46a","#b8c0cc","#f1faee","#457b9d","#9b5de5"];
function delCfg(){ const d=(REST&&REST.delivery)||{}; return { seconds:d.seconds||60, target:d.target||20, signs:Array.isArray(d.signs)?d.signs:[] }; }
function stopDelivery(){ if(dg){ dg.done=true; cancelAnimationFrame(dg.raf); clearTimeout(dg.cd); } }
function startDelivery(){
  stopAll();
  const D=delCfg(), wrap=$("delWrap"), cv=$("delCv");
  const dpr=Math.min(window.devicePixelRatio||1,2), W=wrap.clientWidth, H=wrap.clientHeight;
  cv.width=W*dpr; cv.height=H*dpr; cv.style.width=W+"px"; cv.style.height=H+"px";
  const ctx=cv.getContext("2d"); ctx.setTransform(dpr,0,0,dpr,0,0);
  const roadW=Math.min(W*0.76,330), roadL=(W-roadW)/2, laneW=roadW/3;
  dg={ ctx,W,H,D,roadL,roadW,laneW, lane:1, x:roadL+laneW*1.5, py:H-78,
       score:0, lives:3, inv:0, shake:0, ents:[], pops:[], scroll:0, rowAcc:0,
       signAcc:0, signIdx:0, started:0, last:0, raf:0, cd:0, done:false, running:false };
  dHud(D.seconds); drawDelivery();
  dCountdown(["3","2","1","انطلق!"],0);
}
function dCountdown(seq,i){
  const ov=$("dOverlay");
  if(!dg||dg.done){ ov.classList.remove("show"); return; }
  if(i>=seq.length){ ov.classList.remove("show"); dg.running=true; dg.started=dg.last=performance.now(); dg.raf=requestAnimationFrame(delLoop); return; }
  ov.innerHTML="<span>"+seq[i]+"</span>"; ov.classList.add("show");
  dg.cd=setTimeout(()=>dCountdown(seq,i+1), i===seq.length-1?500:750);
}
function dHud(left){
  const D=dg.D;
  const g=$("dGoal"); g.textContent="📦 "+dg.score+" من "+D.target; g.classList.toggle("done",dg.score>=D.target);
  $("dLives").textContent="❤️".repeat(Math.max(0,dg.lives))+"🤍".repeat(Math.max(0,3-dg.lives));
  $("dTime").textContent="⏱ "+Math.max(0,Math.ceil(left));
  $("dFill").style.width=Math.max(0,left/D.seconds*100)+"%";
  $("dBar").classList.toggle("low",left<=10);
  const km=Math.max(0,4*left/D.seconds);
  $("dDist").textContent="📍 "+(REST?REST.name:"")+" — باقي "+km.toFixed(1)+" كم";
}
function laneX(l){ return dg.roadL+dg.laneW*(l+.5); }
function delSpeed(p){ return 260+250*p; }
function delSpawnRow(p){
  // نضمن دايماً أكو مسار مفتوح يوصله اللاعب من المسار المفتوح بالصف اللي قبله
  const prev=dg.lastFree||[0,1,2];
  let n=Math.random()<(0.2+0.3*p)?2:1, lanes;
  if(n===2){
    const ok=[0,1,2].filter(f=>prev.some(q=>Math.abs(q-f)<=1));
    const f=ok[Math.floor(Math.random()*ok.length)];
    lanes=[...shuffle([0,1,2].filter(l=>l!==f)), f];
  }else lanes=shuffle([0,1,2]);
  dg.lastFree=lanes.slice(n);
  lanes.slice(0,n).forEach(l=>{
    const r=Math.random(), lw=dg.laneW;
    if(r<0.6) dg.ents.push({t:"car",l,y:-110,w:Math.min(46,lw*.66),h:80,c:CAR_COLORS[Math.floor(Math.random()*CAR_COLORS.length)]});
    else if(r<0.82) dg.ents.push({t:"hole",l,y:-60,w:lw*.56,h:30});
    else dg.ents.push({t:"bar",l,y:-50,w:lw*.82,h:20});
  });
  const free=lanes.slice(n);
  if(Math.random()<0.34){ dg.ents.push({t:"bag",l:free[Math.floor(Math.random()*free.length)],y:-40,w:34,h:34}); }
}
function delSign(){
  const D=dg.D, names=D.signs;
  const left=D.seconds-(performance.now()-dg.started)/1000;
  const txt = names.length ? names[dg.signIdx++ % names.length]
                           : "📍 "+(REST?REST.name:"")+" ↑ "+Math.max(0.1,4*left/D.seconds-0.3).toFixed(1)+" كم";
  dg.ents.push({t:"sign",l:1,y:-70,w:dg.roadW*.82,h:30,txt});
}
function delLoop(t){
  if(!dg||dg.done) return;
  const dt=Math.min(.05,(t-dg.last)/1000); dg.last=t;
  const D=dg.D, el=(t-dg.started)/1000, left=D.seconds-el, p=Math.min(1,el/D.seconds);
  const v=delSpeed(p), move=v*dt;
  dg.scroll+=move; dg.rowAcc+=move; dg.signAcc+=dt;
  if(dg.rowAcc>=320-115*p){ dg.rowAcc=0; delSpawnRow(p); }
  if(dg.signAcc>=8.5){ dg.signAcc=0; delSign(); }
  dg.x+=(laneX(dg.lane)-dg.x)*Math.min(1,dt*20);
  if(dg.inv>0) dg.inv-=dt;
  if(dg.shake>0) dg.shake-=dt;
  const pw=30, ph=60, px=dg.x, py=dg.py;
  dg.ents=dg.ents.filter(e=>{
    e.y+=move;
    if(e.t!=="sign" && !e.hit){
      const ex=laneX(e.l);
      const hitX=Math.abs(ex-px) < (e.w+pw)/2-4, hitY=Math.abs(e.y-py) < (e.h+ph)/2-6;
      if(hitX&&hitY){
        if(e.t==="bag"){ dg.score++; buzz(10); dg.pops.push({x:ex,y:py-46,t:0,s:"+1 📦",c:"#9ff0c2"}); return false; }
        if(dg.inv<=0){
          e.hit=true; dg.lives--; dg.inv=1.3; dg.shake=.4; buzz([80,40,80]);
          dg.pops.push({x:px,y:py-50,t:0,s:e.t==="hole"?"حفرة! 💥":"اصطدام! 💥",c:"#ff7a6e"});
          if(dg.lives<=0){ dHud(left); drawDelivery(); return finishDelivery(false), false; }
        }
      }
    }
    return e.y<dg.H+120;
  });
  if(!dg||dg.done) return;
  dg.pops=dg.pops.filter(q=>(q.t+=dt)<.8);
  dHud(left); drawDelivery();
  if(left<=0) return finishDelivery(true);
  dg.raf=requestAnimationFrame(delLoop);
}
function finishDelivery(completed){
  if(!dg||dg.done) return;
  const s=dg.score, D=dg.D; stopDelivery();
  submitResult(s, completed, {
    extra: completed ? "وصّلت "+s+" طلب لقلب المدينة 🛵" : "وصّلت "+s+" طلب قبل ما تتصادم 3 مرات",
    clientPassed: completed && s>=D.target,
    failMsg: completed ? "ما وصّلت طلبات كافية" : "تصادمت 3 مرات"
  });
}
function drawScooter(ctx,x,y,blink){
  if(blink) ctx.globalAlpha=.35;
  ctx.fillStyle="rgba(0,0,0,.35)"; ctx.beginPath(); ctx.ellipse(x+3,y+6,20,36,0,0,Math.PI*2); ctx.fill();
  ctx.fillStyle="#111"; rrect(ctx,x-5,y-36,10,16,4); ctx.fill(); rrect(ctx,x-5,y+22,10,16,4); ctx.fill();
  const g=ctx.createLinearGradient(x-12,y-30,x+12,y+30); g.addColorStop(0,"#3b36ff"); g.addColorStop(1,"#8a2be2");
  ctx.fillStyle=g; rrect(ctx,x-11,y-28,22,50,9); ctx.fill();
  ctx.strokeStyle="#d9d9e8"; ctx.lineWidth=3; ctx.lineCap="round"; ctx.beginPath(); ctx.moveTo(x-15,y-20); ctx.lineTo(x+15,y-20); ctx.stroke(); ctx.lineCap="butt";
  ctx.fillStyle="#fff"; rrect(ctx,x-16,y+2,32,28,5); ctx.fill();
  ctx.strokeStyle="#5a2be0"; ctx.lineWidth=2.5; rrect(ctx,x-16,y+2,32,28,5); ctx.stroke();
  if(JITAK_IMG.complete&&JITAK_IMG.naturalWidth){ ctx.drawImage(JITAK_IMG,x-11,y+5,22,22); }
  ctx.fillStyle="#5a2be0"; ctx.beginPath(); ctx.arc(x,y-8,9,0,Math.PI*2); ctx.fill();
  ctx.fillStyle="rgba(255,255,255,.55)"; ctx.beginPath(); ctx.arc(x,y-11,5,Math.PI,0); ctx.fill();
  ctx.globalAlpha=1;
}
function drawDelivery(){
  const {ctx,W,H,roadL,roadW,laneW}=dg;
  ctx.save(); ctx.clearRect(0,0,W,H);
  if(dg.shake>0) ctx.translate((Math.random()-.5)*10,(Math.random()-.5)*6);
  // الأرصفة والبنايات
  ctx.fillStyle="#3d3a45"; ctx.fillRect(-10,-10,W+20,H+20);
  const pal=["#6d597a","#b56576","#355070","#e56b6f","#4a4e69","#9a8c98"], B=96, off=dg.scroll%B;
  for(let k=-1;k<=Math.ceil(H/B)+1;k++){
    const y=k*B+off-B, idx=Math.floor(dg.scroll/B)-k;
    const cl=pal[((idx%6)+6)%6], cr=pal[(((idx+3)%6)+6)%6];
    if(roadL>14){
      ctx.fillStyle=cl; ctx.fillRect(4,y+6,roadL-12,B-14);
      ctx.fillStyle="rgba(255,255,255,.18)"; ctx.fillRect(8,y+12,roadL-20,8);
      ctx.fillStyle=cr; ctx.fillRect(roadL+roadW+8,y+6,W-(roadL+roadW)-12,B-14);
      ctx.fillStyle="rgba(255,255,255,.18)"; ctx.fillRect(roadL+roadW+12,y+12,W-(roadL+roadW)-20,8);
    }
  }
  // الشارع
  ctx.fillStyle="#2b2b31"; ctx.fillRect(roadL,-10,roadW,H+20);
  ctx.fillStyle="#e9e9ef"; ctx.fillRect(roadL,-10,4,H+20); ctx.fillRect(roadL+roadW-4,-10,4,H+20);
  ctx.fillStyle="rgba(255,255,255,.65)";
  const dOff=dg.scroll%64;
  for(let i=1;i<3;i++){ const x=roadL+laneW*i-2; for(let y=-64+dOff;y<H;y+=64) ctx.fillRect(x,y,4,34); }
  // العناصر
  ctx.textAlign="center"; ctx.textBaseline="middle";
  dg.ents.forEach(e=>{
    const x=laneX(e.l), y=e.y;
    if(e.t==="car"){
      ctx.fillStyle="rgba(0,0,0,.35)"; rrect(ctx,x-e.w/2+3,y-e.h/2+5,e.w,e.h,10); ctx.fill();
      ctx.fillStyle=e.c; rrect(ctx,x-e.w/2,y-e.h/2,e.w,e.h,10); ctx.fill();
      ctx.fillStyle="rgba(20,30,45,.85)"; rrect(ctx,x-e.w/2+5,y-e.h/2+14,e.w-10,16,4); ctx.fill(); rrect(ctx,x-e.w/2+6,y+e.h/2-22,e.w-12,11,3); ctx.fill();
      ctx.fillStyle="#ff3b3b"; ctx.fillRect(x-e.w/2+3,y+e.h/2-4,8,3); ctx.fillRect(x+e.w/2-11,y+e.h/2-4,8,3);
    }else if(e.t==="hole"){
      ctx.fillStyle="#121214"; ctx.beginPath(); ctx.ellipse(x,y,e.w/2,e.h/2,0,0,Math.PI*2); ctx.fill();
      ctx.strokeStyle="#55525c"; ctx.lineWidth=3; ctx.stroke();
    }else if(e.t==="bar"){
      ctx.save(); rrect(ctx,x-e.w/2,y-e.h/2,e.w,e.h,4); ctx.clip();
      for(let i=-2;i<12;i++){ ctx.fillStyle=i%2?"#fff":"#e63946"; ctx.beginPath(); const sx=x-e.w/2+i*12; ctx.moveTo(sx,y+e.h/2); ctx.lineTo(sx+12,y+e.h/2); ctx.lineTo(sx+24,y-e.h/2); ctx.lineTo(sx+12,y-e.h/2); ctx.closePath(); ctx.fill(); }
      ctx.restore();
    }else if(e.t==="bag"){
      ctx.fillStyle="rgba(255,214,102,.28)"; ctx.beginPath(); ctx.arc(x,y,22,0,Math.PI*2); ctx.fill();
      ctx.font="28px system-ui, 'Apple Color Emoji','Segoe UI Emoji',sans-serif"; ctx.fillText("🥡",x,y+1);
    }else if(e.t==="sign"){
      ctx.fillStyle="#5d5d66"; ctx.fillRect(roadL+6,y-e.h/2,4,e.h+18); ctx.fillRect(roadL+roadW-10,y-e.h/2,4,e.h+18);
      ctx.fillStyle="#1b7f3a"; rrect(ctx,dg.W/2-e.w/2,y-e.h/2,e.w,e.h,6); ctx.fill();
      ctx.strokeStyle="#fff"; ctx.lineWidth=2; rrect(ctx,dg.W/2-e.w/2+3,y-e.h/2+3,e.w-6,e.h-6,4); ctx.stroke();
      ctx.fillStyle="#fff"; ctx.font="900 14px Cairo, sans-serif"; ctx.fillText(e.txt,dg.W/2,y+1,e.w-16);
    }
  });
  drawScooter(ctx,dg.x,dg.py, dg.inv>0 && Math.floor(dg.inv*10)%2===0);
  ctx.font="900 20px Cairo, sans-serif";
  dg.pops.forEach(q=>{ ctx.globalAlpha=1-q.t/.8; ctx.fillStyle=q.c; ctx.fillText(q.s,q.x,q.y-q.t*50); });
  ctx.globalAlpha=1;
  ctx.restore();
}
(function bindDeliveryInput(){
  const wrap=$("delWrap");
  const go=d=>{ if(!dg||dg.done||!dg.running) return; dg.lane=Math.max(0,Math.min(2,dg.lane+d)); buzz(6); };
  wrap.addEventListener("pointerdown",e=>{ const r=wrap.getBoundingClientRect(); go(e.clientX-r.left<r.width/2?-1:1); });
  wrap.addEventListener("contextmenu",e=>e.preventDefault());
  window.addEventListener("keydown",e=>{ if(!dg||dg.done) return; if(e.key==="ArrowLeft") go(-1); else if(e.key==="ArrowRight") go(1); });
})();

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
    $("rTitle").textContent = p.redeemed ? "استلمت هديتك" : "مبروك!";
    $("rPrize").textContent = p.redeemed ? "" : "لقد ربحت هدية 🎁";
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
  $("catchChip2").textContent="🎁 هدية";
  $("memChip1").textContent="⏱ "+REST.memory.seconds+" ثانية";
  $("pourChip1").textContent="⏱ "+pourSecs()+" ثانية · 🎯 "+pourNeed()+" من 6";
  const games=Array.isArray(REST.games)&&REST.games.length?REST.games:["catch","memory","pour"];
  [["goDelivery","delivery"],["goCatch","catch"],["goMemory","memory"],["goPour","pour"]].forEach(([id,gm])=>{ $(id).style.display=games.includes(gm)?"":"none"; });
  const DC=delCfg(); $("delChip1").textContent="⏱ "+DC.seconds+" ثانية · 📦 "+DC.target+" طلب";
  $("memChip2").textContent="🎁 هدية";
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
    FP = await computeFP();
    const st = await api("game_check",{p_slug:SLUG,p_device:DEVICE,p_fp:FP}) || {};
    todayPlay = st.own ? st.play : null;
    lockInfo = (st.next_at && !st.own) ? {next_at:st.next_at} : null;
    refreshHome(); show("home");
  }catch(e){
    showLoading("ما كدرنا نتصل. تأكد من الإنترنت.", init);
  }
}
init();
