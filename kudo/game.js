/* =========================================================
   KUDO KUDO — فرع الموصل · ألعاب
   By Open End Technology
   ========================================================= */
if (window.top !== window.self) { try { window.top.location = window.self.location.href; } catch (e) { document.documentElement.innerHTML = ""; } }
const $ = id => document.getElementById(id);
const APP = window.APP || {};
const COMPANY = APP.COMPANY || { name: "" };
const params = new URLSearchParams(location.search);
const SLUG = "kudo-kudo-mosul";
const DEFAULT_FOODS = ["🍗","🍔","🌯","🍗","🍟","🥤"];

let REST = null;       // إعدادات المطعم من السيرفر
const isKudo = () => true;
const IMG = src => { const i=new Image(); i.src=src; return i; };
const MASCOT = IMG("assets/mascot-sprite.png"), MASCOT_HEAD = IMG("assets/mascot-head.png");
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
function gameRunning(){ return (cg && !cg.done) || (dg && !dg.done) || (xg && !xg.done); }
function stopAll(){ stopCatch(); stopDelivery(); stopXmas(); }
function goHome(){ stopAll(); refreshHome(); show("home"); }
function refreshHome(){
  const b=blocked();
  $("goCatch").disabled=b; $("goDelivery").disabled=b; $("goXmas").disabled=b;
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
$("goDelivery").addEventListener("click",()=>startGame("delivery"));
$("goXmas").addEventListener("click",()=>startGame("xmas"));
$("playNow").addEventListener("click",()=>{ refreshHome(); show("home"); });

/* ---------- بداية ونهاية اللعبة (مع السيرفر) ---------- */
async function startGame(game){
  if(busy) return;
  if(blocked()) return openRecord(todayPlay);
  busy=true;
  const ids={catch:"goCatch",delivery:"goDelivery",xmas:"goXmas"};
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
    show({catch:"catchScreen",delivery:"deliveryScreen",xmas:"xmasScreen"}[game]);
    ({catch:startCatch,delivery:startDelivery,xmas:startXmas})[game]();
  }catch(e){
    toast(String(e&&e.message).includes("rate_limited") ? "محاولات كثيرة — انتظر شوية وجرّب مرة ثانية" : "صار خلل بالاتصال، حاول مرة ثانية");
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
  const css=getComputedStyle(document.documentElement), by=H-48, bw=cg.bw;
  const g=ctx.createLinearGradient(0,by-8,0,by+18);
  g.addColorStop(0,css.getPropertyValue("--accent").trim()||"#F2A541");
  g.addColorStop(1,css.getPropertyValue("--accent2").trim()||"#E85D3A");
  // سطل KUDO
  const top=by-14, bot=by+22, wt=bw, wb=bw*.78, cx=cg.x;
  ctx.fillStyle="rgba(0,0,0,.3)"; ctx.beginPath(); ctx.ellipse(cx+3,bot+3,wb/2,5,0,0,Math.PI*2); ctx.fill();
  ctx.save(); ctx.beginPath(); ctx.moveTo(cx-wt/2,top); ctx.lineTo(cx+wt/2,top); ctx.lineTo(cx+wb/2,bot); ctx.lineTo(cx-wb/2,bot); ctx.closePath(); ctx.clip();
  for(let i=-6;i<6;i++){ ctx.fillStyle=(i%2===0)?"#e4002b":"#ffffff"; ctx.fillRect(cx+i*14,top,14,bot-top); }
  ctx.fillStyle="#e4002b"; ctx.fillRect(cx-wt/2,top+9,wt,15);
  ctx.fillStyle="#fff"; ctx.font="900 11px Cairo, sans-serif"; ctx.textAlign="center"; ctx.textBaseline="middle"; ctx.fillText("KUDO KUDO",cx,top+17);
  ctx.restore();
  ctx.fillStyle="#ffc72c"; rrect(ctx,cx-wt/2-3,top-5,wt+6,7,3); ctx.fill();
  ctx.fillStyle="#c96a12"; [-.28,-.08,.14,.3].forEach((f,i)=>{ ctx.beginPath(); ctx.ellipse(cx+f*wt,top-7-(i%2)*3,8,6,f,0,Math.PI*2); ctx.fill(); });
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
   لعبة: وصّل الطلب — بالتعاون مع تطبيق جيتك
   ========================================================= */
let dg=null;
const JITAK_IMG=new Image(); JITAK_IMG.src="assets/jitak.png";
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
  const g=$("dGoal"); g.textContent=(isKudo()?"🍗 ":"📦 ")+dg.score+" من "+D.target; g.classList.toggle("done",dg.score>=D.target);
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
        if(e.t==="bag"){ dg.score++; buzz(10); dg.pops.push({x:ex,y:py-46,t:0,s:"+1 🍗",c:"#9ff0c2"}); return false; }
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
  if(MASCOT_HEAD.complete && MASCOT_HEAD.naturalWidth){
    const hh=34, hw=hh*MASCOT_HEAD.naturalWidth/MASCOT_HEAD.naturalHeight;
    ctx.drawImage(MASCOT_HEAD,x-hw/2,y-30,hw,hh);
  }else if(isKudo()){
    // راس الدجاجة من فوگ: عُرف أحمر + منقار + نظارة
    ctx.fillStyle="#ffb000"; ctx.beginPath(); ctx.moveTo(x-4,y-15); ctx.lineTo(x,y-24); ctx.lineTo(x+4,y-15); ctx.closePath(); ctx.fill();
    ctx.fillStyle="#fff"; ctx.beginPath(); ctx.arc(x,y-8,10,0,Math.PI*2); ctx.fill();
    ctx.fillStyle="#111"; rrect(ctx,x-9,y-14,18,4,2); ctx.fill();
    ctx.fillStyle="#e4002b"; [-5,-1,3].forEach(dy=>{ ctx.beginPath(); ctx.arc(x,y+dy-4,3,0,Math.PI*2); ctx.fill(); });
  }else{
  ctx.fillStyle="#5a2be0"; ctx.beginPath(); ctx.arc(x,y-8,9,0,Math.PI*2); ctx.fill();
  ctx.fillStyle="rgba(255,255,255,.55)"; ctx.beginPath(); ctx.arc(x,y-11,5,Math.PI,0); ctx.fill();
  }
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
      ctx.font="28px system-ui, 'Apple Color Emoji','Segoe UI Emoji',sans-serif"; ctx.fillText(isKudo()?"🍗":"🥡",x,y+1);
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
   لعبة: رحلة بابا نويل 🎅 (كريسماس)
   ========================================================= */
let xg=null;
const XG=2300, XJUMP=-800, XCUT=-330;
const GIFT_COLORS=["#e63946","#2a9d8f","#f4c430","#9b5de5","#ff7f11"];
function xmasCfg(){ const d=(REST&&REST.xmas)||{}; return { seconds:d.seconds||45, target:d.target||35 }; }
function stopXmas(){ if(xg){ xg.done=true; cancelAnimationFrame(xg.raf); clearTimeout(xg.cd); } }
function xSpeed(p){ return 220+110*p; }
function startXmas(){
  stopAll();
  const C=xmasCfg(), wrap=$("xmasWrap"), cv=$("xmasCv");
  const dpr=Math.min(window.devicePixelRatio||1,2), W=wrap.clientWidth, H=wrap.clientHeight;
  cv.width=W*dpr; cv.height=H*dpr; cv.style.width=W+"px"; cv.style.height=H+"px";
  const ctx=cv.getContext("2d"); ctx.setTransform(dpr,0,0,dpr,0,0);
  const gy=H-62;
  xg={ ctx,W,H,C,gy, sx:Math.round(W*.26), x:0, y:gy, vy:0, onGround:true, coyote:.1, buffer:0, holding:false,
       lives:3, inv:0, shake:0, score:0, runT:0, ground:[{x0:-500,x1:620}], plats:[], spikes:[], men:[], gifts:[], pops:[],
       genX:620, lastType:"flat", started:0, last:0, raf:0, cd:0, done:false, running:false,
       flakes:Array.from({length:60},()=>({x:Math.random()*W,y:Math.random()*H,r:1+Math.random()*2.2,v:20+Math.random()*40,d:Math.random()*6})),
       stars:Array.from({length:40},()=>({x:Math.random()*W,y:Math.random()*H*.45,r:Math.random()*1.4+.3})) };
  xGen(0);
  xHud(C.seconds); drawXmas();
  xCountdown(["3","2","1","يلا!"],0);
}
function xCountdown(seq,i){
  const ov=$("xOverlay");
  if(!xg||xg.done){ ov.classList.remove("show"); return; }
  if(i>=seq.length){ ov.classList.remove("show"); xg.running=true; xg.started=xg.last=performance.now(); xg.raf=requestAnimationFrame(xLoop); return; }
  ov.innerHTML="<span>"+seq[i]+"</span>"; ov.classList.add("show");
  xg.cd=setTimeout(()=>xCountdown(seq,i+1), i===seq.length-1?500:750);
}
function xHud(left){
  const C=xg.C, g=$("xGoal");
  g.textContent=(isKudo()?"🍗 ":"🎁 ")+xg.score+" من "+C.target; g.classList.toggle("done",xg.score>=C.target);
  $("xLives").textContent="❤️".repeat(Math.max(0,xg.lives))+"🤍".repeat(Math.max(0,3-xg.lives));
  $("xTime").textContent="⏱ "+Math.max(0,Math.ceil(left));
  $("xFill").style.width=Math.max(0,left/C.seconds*100)+"%";
  $("xBar").classList.toggle("low",left<=10);
}
function xGiftArc(x0,x1,baseY,n,h){
  for(let i=0;i<n;i++){ const f=n===1?.5:i/(n-1); xg.gifts.push({x:x0+(x1-x0)*f, y:baseY-Math.sin(f*Math.PI)*h, c:GIFT_COLORS[Math.floor(Math.random()*GIFT_COLORS.length)], got:false}); }
}
function xGen(p){
  const rnd=(a,b)=>a+Math.random()*(b-a);
  while(xg.genX < xg.x - xg.sx + xg.W*2.4){
    const v=xSpeed(p), air=0.7, maxGap=Math.min(70+95*p, .72*air*v);
    const r=Math.random(); let type = r<.42?"flat": r<.78?"gap":"plat";
    if(p<.12 && type==="plat") type="gap";
    if(xg.lastType==="plat" && type==="plat") type="flat";
    xg.lastType=type;
    const gy=xg.gy, x=xg.genX, wantGifts=Math.random()<.6;
    if(type==="flat"){
      const len=rnd(260,400), seg={x0:x,x1:x+len}; xg.ground.push(seg);
      const mid=x+len/2, roll=Math.random();
      if(p>.08 && roll<.34+.25*p){ xg.spikes.push({x:mid,w:34,h:22}); if(wantGifts) xGiftArc(mid-60,mid+60,gy-46,3,60); }
      else if(p>.12 && len>=300 && roll<.62+.2*p){ xg.men.push({x:x+len*.7,seg,alive:true,dir:-1,v:30+30*p,squash:0}); if(wantGifts) xGiftArc(x+60,x+170,gy-30,3,0); }
      else if(wantGifts) xGiftArc(x+60,x+len-60,gy-30,3,0);
      xg.genX=seg.x1;
    }else if(type==="gap"){
      const len=rnd(170,260), gap=rnd(Math.max(55,maxGap*.6),maxGap);
      xg.ground.push({x0:x,x1:x+len});
      if(wantGifts) xGiftArc(x+len-10,x+len+gap+10,gy-40,3,85);
      xg.genX=x+len+gap;
    }else{
      const len=rnd(170,230), gap=rnd(190,240), px0=x+len+gap/2-58, py=gy-92;
      xg.ground.push({x0:x,x1:x+len});
      xg.plats.push({x0:px0,x1:px0+116,y:py});
      if(wantGifts) xGiftArc(px0+20,px0+96,py-28,3,0);
      xg.genX=x+len+gap;
    }
  }
}
function xOnSolid(wx){ return xg.ground.some(s=>wx+9>s.x0 && wx-9<s.x1); }
function xHit(why){
  if(xg.inv>0) return;
  xg.lives--; xg.inv=1.5; xg.shake=.4; buzz([80,40,80]);
  xg.pops.push({x:xg.x,y:xg.y-60,t:0,s:why,c:"#ff8a80"});
}
function xLoop(t){
  if(!xg||xg.done) return;
  const dt=Math.min(.04,(t-xg.last)/1000); xg.last=t;
  const C=xg.C, el=(t-xg.started)/1000, left=C.seconds-el, p=Math.min(1,el/C.seconds), v=xSpeed(p);
  xg.x+=v*dt; xg.runT+=dt*v/40;
  // القفز
  if(xg.buffer>0) xg.buffer-=dt;
  if(xg.onGround) xg.coyote=.1; else xg.coyote-=dt;
  if(xg.buffer>0 && xg.coyote>0){ xg.vy=XJUMP; xg.onGround=false; xg.coyote=0; xg.buffer=0; buzz(6); }
  if(!xg.holding && xg.vy<XCUT) xg.vy=XCUT;
  const prevY=xg.y; xg.vy+=XG*dt; xg.y+=xg.vy*dt; xg.onGround=false;
  if(xg.vy>=0){
    if(prevY<=xg.gy+1 && xg.y>=xg.gy && xOnSolid(xg.x)){ xg.y=xg.gy; xg.vy=0; xg.onGround=true; }
    for(const pl of xg.plats){ if(xg.x+9>pl.x0 && xg.x-9<pl.x1 && prevY<=pl.y+1 && xg.y>=pl.y){ xg.y=pl.y; xg.vy=0; xg.onGround=true; } }
  }
  if(xg.inv>0) xg.inv-=dt;
  if(xg.shake>0) xg.shake-=dt;
  // وقع بحفرة
  if(xg.y>xg.H+60){
    xg.inv=0; xHit("وقعت! 💥");
    const next=xg.ground.find(s=>s.x1>xg.x+40);
    if(next){ xg.x=Math.max(next.x0+30,xg.x); }
    xg.y=xg.gy; xg.vy=0; xg.onGround=true;
  }
  // ثلج حاد
  for(const sp of xg.spikes){ if(Math.abs(sp.x-xg.x)<sp.w/2+6 && xg.y>xg.gy-sp.h+5) xHit(isKudo()?"حار! 🔥":"آخ! 💥"); }
  // رجال الثلج
  for(const m of xg.men){
    if(!m.alive){ m.squash+=dt; continue; }
    m.x+=m.dir*m.v*dt; if(m.x<m.seg.x0+20||m.x>m.seg.x1-20){ m.dir*=-1; m.x=Math.max(m.seg.x0+20,Math.min(m.seg.x1-20,m.x)); }
    const top=xg.gy-46;
    if(Math.abs(m.x-xg.x)<24 && xg.y>top && xg.y-42<xg.gy){
      if(xg.vy>0 && prevY<=top+12){ m.alive=false; xg.vy=-560; xg.score+=2; buzz(20); xg.pops.push({x:m.x,y:top-10,t:0,s:isKudo()?"+2 🦊":"+2 ⛄",c:"#9ff0c2"}); }
      else xHit(isKudo()?"ثعلب! 💥":"رجل الثلج! 💥");
    }
  }
  // الهدايا
  for(const g of xg.gifts){ if(!g.got && Math.abs(g.x-xg.x)<22 && Math.abs(g.y-(xg.y-22))<30){ g.got=true; xg.score++; buzz(8); xg.pops.push({x:g.x,y:g.y-14,t:0,s:"+1",c:"#ffe08a"}); } }
  // تنظيف وتوليد
  const camL=xg.x-xg.sx-120;
  xg.ground=xg.ground.filter(s=>s.x1>camL); xg.plats=xg.plats.filter(s=>s.x1>camL);
  xg.spikes=xg.spikes.filter(s=>s.x>camL); xg.men=xg.men.filter(m=>m.x>camL && m.squash<.6); xg.gifts=xg.gifts.filter(g=>g.x>camL && !(g.got&&g.x<xg.x-40));
  xg.pops=xg.pops.filter(q=>(q.t+=dt)<.8);
  xGen(p);
  xHud(left); drawXmas();
  if(xg.lives<=0) return finishXmas(false);
  if(left<=0) return finishXmas(true);
  xg.raf=requestAnimationFrame(xLoop);
}
function finishXmas(completed){
  if(!xg||xg.done) return;
  const s=xg.score, C=xg.C; stopXmas();
  submitResult(s, completed, {
    extra: isKudo() ? (completed ? "جمعت "+s+" قطعة دجاج مقرمش 🍗" : "جمعت "+s+" قطعة قبل ما تخلص المحاولات")
                    : (completed ? "جمعت "+s+" هدية ووصّلت بابا نويل للبيت 🎄" : "جمعت "+s+" هدية قبل ما تخلص المحاولات"),
    clientPassed: completed && s>=C.target,
    failMsg: completed ? (isKudo()?"ما جمعت دجاج كافي":"ما جمعت هدايا كافية") : "خلصت المحاولات"
  });
}
function drawMascot(ctx,x,y,t,air,blink){
  if(!(MASCOT.complete && MASCOT.naturalWidth)) return drawChicken(ctx,x,y,t,air,blink);
  const h=64, w=h*MASCOT.naturalWidth/MASCOT.naturalHeight, sw=air?0.5:Math.sin(t*2.2);
  if(blink) ctx.globalAlpha=.35;
  if(!air){ ctx.fillStyle="rgba(0,0,0,.25)"; ctx.beginPath(); ctx.ellipse(x,y+2,16,4,0,0,Math.PI*2); ctx.fill(); }
  // رجلين تركض
  ctx.strokeStyle="#f6a800"; ctx.lineWidth=3.4; ctx.lineCap="round";
  [[-5,sw],[6,-sw]].forEach(([dx,s])=>{ ctx.save(); ctx.translate(x+dx,y-9); ctx.rotate(s*.55); ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(0,8); ctx.lineTo(5,10); ctx.moveTo(0,8); ctx.lineTo(-3,10); ctx.stroke(); ctx.restore(); });
  ctx.lineCap="butt";
  const bob=air?0:Math.abs(Math.sin(t*2.2))*2.5;
  ctx.save(); ctx.translate(x,y-8-bob); ctx.rotate(air?-.12:Math.sin(t*2.2)*.03);
  ctx.drawImage(MASCOT,-w/2,-h,w,h);
  ctx.restore(); ctx.globalAlpha=1;
}
function drawChicken(ctx,x,y,t,air,blink){
  if(blink) ctx.globalAlpha=.35;
  const sw=air?0.6:Math.sin(t*2.2), fl=Math.sin(t*1.6);
  if(!air){ ctx.fillStyle="rgba(0,0,0,.22)"; ctx.beginPath(); ctx.ellipse(x,y+2,15,4,0,0,Math.PI*2); ctx.fill(); }
  // العباية
  ctx.fillStyle="#c8001e"; ctx.beginPath(); ctx.moveTo(x-6,y-40); ctx.quadraticCurveTo(x-26,y-30+fl*3,x-30,y-12+fl*4); ctx.lineTo(x-12,y-16); ctx.closePath(); ctx.fill();
  // الرجلين
  ctx.strokeStyle="#f6a800"; ctx.lineWidth=3.2; ctx.lineCap="round";
  [[-4,sw],[5,-sw]].forEach(([dx,s])=>{ ctx.save(); ctx.translate(x+dx,y-12); ctx.rotate(s*.5); ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(0,10); ctx.lineTo(5,12); ctx.moveTo(0,10); ctx.lineTo(-3,12); ctx.stroke(); ctx.restore(); });
  ctx.lineCap="butt";
  // الجسم
  ctx.fillStyle="#fff"; ctx.beginPath(); ctx.ellipse(x,y-25,13,15,0,0,Math.PI*2); ctx.fill();
  ctx.fillStyle="#e4002b"; rrect(ctx,x-12,y-31,24,17,7); ctx.fill();
  ctx.fillStyle="#ffc72c"; ctx.fillRect(x-12,y-17,24,3);
  ctx.fillStyle="#fff"; ctx.font="900 6px sans-serif"; ctx.textAlign="center"; ctx.textBaseline="middle"; ctx.fillText("KUDO",x,y-25);
  // الإيد بالكف الأصفر
  ctx.fillStyle="#fff"; ctx.beginPath(); ctx.ellipse(x+10,y-27-sw*2,4,7,-.6,0,Math.PI*2); ctx.fill();
  ctx.fillStyle="#ffc72c"; ctx.beginPath(); ctx.arc(x+14,y-22-sw*3,3.6,0,Math.PI*2); ctx.fill();
  // الراس
  ctx.fillStyle="#fff"; ctx.beginPath(); ctx.arc(x+3,y-44,9.5,0,Math.PI*2); ctx.fill();
  ctx.fillStyle="#e4002b"; [[-1,-55,3.4],[3,-57,3.8],[7,-55,3.4]].forEach(([dx,dy,r])=>{ ctx.beginPath(); ctx.arc(x+dx,y+dy,r,0,Math.PI*2); ctx.fill(); });
  ctx.fillStyle="#ffb000"; ctx.beginPath(); ctx.moveTo(x+11,y-45); ctx.lineTo(x+19,y-42); ctx.lineTo(x+11,y-39); ctx.closePath(); ctx.fill();
  ctx.fillStyle="#e4002b"; ctx.beginPath(); ctx.arc(x+12,y-36,2.6,0,Math.PI*2); ctx.fill();
  ctx.fillStyle="#111"; rrect(ctx,x+1,y-49,12,5,2); ctx.fill(); ctx.fillRect(x-6,y-48,8,1.5);
  ctx.globalAlpha=1;
}
function drawXmas(){
  const {ctx,W,H,gy}=xg, cam=xg.x-xg.sx, K=isKudo();
  ctx.save(); ctx.clearRect(0,0,W,H);
  if(xg.shake>0) ctx.translate((Math.random()-.5)*9,(Math.random()-.5)*5);
  {
    // سما الغروب بألوان كودو
    const sky=ctx.createLinearGradient(0,0,0,H); sky.addColorStop(0,"#b0001a"); sky.addColorStop(.6,"#ff5a1f"); sky.addColorStop(1,"#ffb347");
    ctx.fillStyle=sky; ctx.fillRect(-10,-10,W+20,H+20);
    ctx.fillStyle="rgba(255,224,138,.35)"; ctx.beginPath(); ctx.arc(W-70,74,52,0,Math.PI*2); ctx.fill();
    ctx.fillStyle="#ffe08a"; ctx.beginPath(); ctx.arc(W-70,74,32,0,Math.PI*2); ctx.fill();
    // مدينة بعيدة + منارة مايلة
    const B1=110, off1=-((cam*.15)%B1);
    for(let k=-1;k<W/B1+2;k++){
      const bx=k*B1+off1, idx=Math.floor((cam*.15)/B1)+k, h=40+((idx*53)%4)*14;
      ctx.fillStyle="rgba(110,0,16,.55)"; ctx.fillRect(bx,H*.62-h,60,h+40); ctx.fillRect(bx+66,H*.62-h*.6,34,h*.6+40);
      if(((idx%5)+5)%5===0){ ctx.save(); ctx.translate(bx+40,H*.62-h); ctx.rotate(-.08); ctx.fillRect(-5,-70,10,72); ctx.beginPath(); ctx.arc(0,-72,7,Math.PI,0); ctx.fill(); ctx.restore(); }
    }
    const B2=140, off2=-((cam*.4)%B2);
    for(let k=-1;k<W/B2+2;k++){
      const bx=k*B2+off2, idx=Math.floor((cam*.4)/B2)+k, h=46+((idx*29)%3)*16, by=H*.7-h;
      ctx.fillStyle="#8a0715"; ctx.fillRect(bx+20,by,76,h+60);
      ctx.fillStyle="#ffd36b"; for(let r=0;r<Math.floor(h/18);r++) for(let c=0;c<3;c++) if(((idx+r+c)%3)) ctx.fillRect(bx+28+c*22,by+8+r*18,10,8);
    }
    // الأرض المقرمشة
    xg.ground.forEach(s=>{
      const a=s.x0-cam, b=s.x1-cam; if(b<-20||a>W+20) return;
      ctx.fillStyle="#a8530f"; ctx.fillRect(a,gy+10,b-a,H-gy);
      ctx.fillStyle="#ffc94d"; rrect(ctx,a-2,gy-4,b-a+4,18,8); ctx.fill();
      ctx.fillStyle="#e09a1a"; for(let i=a+6;i<b-4;i+=13){ ctx.beginPath(); ctx.arc(i,gy+3+((i*7)%5),2.2,0,Math.PI*2); ctx.fill(); }
    });
    // منصات مظلة المطعم
    xg.plats.forEach(pl=>{
      const a=pl.x0-cam, w=pl.x1-pl.x0, y=pl.y;
      for(let i=0;i<w;i+=14){ ctx.fillStyle=(i/14)%2?"#fff":"#e4002b"; ctx.fillRect(a+i,y-4,Math.min(14,w-i),14); ctx.beginPath(); ctx.arc(a+i+7,y+10,7,0,Math.PI); ctx.fill(); }
      ctx.fillStyle="#ffc72c"; ctx.fillRect(a,y-6,w,4);
    });
    // نار
    const fl=performance.now()/90;
    xg.spikes.forEach(sp=>{
      const x=sp.x-cam;
      [-11,0,11].forEach((dx,i)=>{ const h=(i===1?sp.h+6:sp.h)*(0.85+0.15*Math.sin(fl+i*2));
        ctx.fillStyle="#ff3d00"; ctx.beginPath(); ctx.moveTo(x+dx-8,gy); ctx.quadraticCurveTo(x+dx-6,gy-h*.6,x+dx,gy-h); ctx.quadraticCurveTo(x+dx+6,gy-h*.6,x+dx+8,gy); ctx.closePath(); ctx.fill();
        ctx.fillStyle="#ffd000"; ctx.beginPath(); ctx.moveTo(x+dx-4,gy); ctx.quadraticCurveTo(x+dx-3,gy-h*.4,x+dx,gy-h*.6); ctx.quadraticCurveTo(x+dx+3,gy-h*.4,x+dx+4,gy); ctx.closePath(); ctx.fill(); });
    });
    // ثعالب
    xg.men.forEach(m=>{
      const x=m.x-cam, sq=m.alive?1:Math.max(.15,1-m.squash*1.6), d=m.dir, st=Math.sin(performance.now()/90)*2;
      ctx.save(); ctx.translate(x,gy); ctx.scale(1,sq);
      ctx.fillStyle="#e8650f"; ctx.beginPath(); ctx.ellipse(-d*16,-16,12,6,d*.5,0,Math.PI*2); ctx.fill();
      ctx.fillStyle="#fff"; ctx.beginPath(); ctx.arc(-d*25,-20,4,0,Math.PI*2); ctx.fill();
      ctx.fillStyle="#e8650f"; ctx.beginPath(); ctx.ellipse(0,-16,15,10,0,0,Math.PI*2); ctx.fill();
      ctx.fillStyle="#5a2a08"; ctx.fillRect(-9,-8,4,8+st*.5); ctx.fillRect(6,-8,4,8-st*.5);
      ctx.fillStyle="#e8650f"; ctx.beginPath(); ctx.arc(d*12,-28,9,0,Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(d*6,-34); ctx.lineTo(d*8,-44); ctx.lineTo(d*12,-35); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(d*13,-35); ctx.lineTo(d*17,-44); ctx.lineTo(d*18,-33); ctx.closePath(); ctx.fill();
      ctx.fillStyle="#fff"; ctx.beginPath(); ctx.moveTo(d*14,-28); ctx.lineTo(d*25,-25); ctx.lineTo(d*14,-21); ctx.closePath(); ctx.fill();
      ctx.fillStyle="#111"; ctx.beginPath(); ctx.arc(d*25,-25,2,0,Math.PI*2); ctx.arc(d*12,-30,1.6,0,Math.PI*2); ctx.fill();
      ctx.restore();
    });
    // دجاج مقرمش
    const bob=Math.sin(performance.now()/220)*2;
    xg.gifts.forEach(gf=>{
      if(gf.got) return; const x=gf.x-cam, y=gf.y+bob; if(x<-20||x>W+20) return;
      ctx.save(); ctx.translate(x,y); ctx.rotate(-.6);
      ctx.fillStyle="#f3efe6"; ctx.fillRect(5,-2,9,4); ctx.beginPath(); ctx.arc(14,-2.5,2.6,0,Math.PI*2); ctx.arc(14,2.5,2.6,0,Math.PI*2); ctx.fill();
      ctx.fillStyle="#c96a12"; ctx.beginPath(); ctx.ellipse(-3,0,10,8,0,0,Math.PI*2); ctx.fill();
      ctx.fillStyle="#f0a63a"; [[-8,-3],[-4,3],[1,-4],[-1,1],[3,3]].forEach(([a,b])=>{ ctx.beginPath(); ctx.arc(a,b,1.8,0,Math.PI*2); ctx.fill(); });
      ctx.restore();
    });
    drawMascot(ctx,xg.sx,xg.y,xg.runT,!xg.onGround, xg.inv>0 && Math.floor(xg.inv*10)%2===0);
  }
  // نقاط
  ctx.textAlign="center"; ctx.textBaseline="middle"; ctx.font="900 18px Cairo, sans-serif";
  xg.pops.forEach(q=>{ ctx.globalAlpha=1-q.t/.8; ctx.fillStyle=q.c; ctx.fillText(q.s,q.x-cam,q.y-q.t*45); });
  ctx.globalAlpha=1;
  ctx.restore();
}
(function bindXmasInput(){
  const wrap=$("xmasWrap");
  const down=e=>{ if(!xg||xg.done) return; if(e&&e.cancelable) e.preventDefault(); xg.holding=true; xg.buffer=.13; };
  const up=()=>{ if(xg) xg.holding=false; };
  wrap.addEventListener("pointerdown",down);
  ["pointerup","pointercancel"].forEach(ev=>window.addEventListener(ev,up));
  wrap.addEventListener("pointerleave",up);
  wrap.addEventListener("contextmenu",e=>e.preventDefault());
  window.addEventListener("keydown",e=>{ if(!xg||xg.done) return; if(e.code==="Space"||e.key==="ArrowUp"){ e.preventDefault(); if(!xg.holding) down(); } });
  window.addEventListener("keyup",e=>{ if(e.code==="Space"||e.key==="ArrowUp") up(); });
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
    const meal = p.prize && p.prize!=="هدية" ? p.prize : "";
    $("rTitle").textContent = p.redeemed ? "استلمت هديتك" : (meal ? "مبروك! ربحت" : "مبروك!");
    $("rPrize").textContent = meal ? meal+" 🎁" : (p.redeemed ? "" : "لقد ربحت هدية 🎁");
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
  $("catchChip1").textContent="⏱ "+REST.catch.seconds+" ثانية";
  $("catchChip2").textContent="🎯 "+REST.catch.target+" قطعة";
  const XC=xmasCfg(); $("xmasChip1").textContent="⏱ "+XC.seconds+" ثانية"; $("xmasChip2").textContent="🍗 "+XC.target+" قطعة";
  const DC=delCfg(); $("delChip1").textContent="⏱ "+DC.seconds+" ثانية"; $("delChip2").textContent="🛵 "+DC.target+" طلب";
  const games=Array.isArray(REST.games)&&REST.games.length?REST.games:["catch","xmas","delivery"];
  [["goCatch","catch"],["goXmas","xmas"],["goDelivery","delivery"]].forEach(([id,gm])=>{ $(id).style.display=games.includes(gm)?"":"none"; });
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
    refreshHome(); show("landing");
    document.body.classList.add("ready");
  }catch(e){
    showLoading("ما كدرنا نتصل. تأكد من الإنترنت.", init);
  }
}
init();
