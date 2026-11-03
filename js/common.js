'use strict';
/* Utilitaires partagés : formatage, graphiques, QR, son, overlays */
const $ = s => document.querySelector(s);
const rnd = (a,b) => a + Math.random()*(b-a);
const rint = (a,b) => Math.floor(rnd(a,b+1));
const pick = a => a[Math.floor(Math.random()*a.length)];
const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function gauss(){let u=0,v=0;while(!u)u=Math.random();while(!v)v=Math.random();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v)}
function weighted(list){const t=list.reduce((s,x)=>s+x.w,0);let r=Math.random()*t;for(const x of list){if((r-=x.w)<=0)return x}return list[0]}
function uid(){return Math.random().toString(36).slice(2,9)}

const fmtP = p => p < 100 ? p.toFixed(2) : Math.round(p).toString();
const fmtPct = x => { const d=Math.abs(x)<.1?1:0, v=+(x*100).toFixed(d); return (v>0?'+':v<0?'−':'') + Math.abs(v).toFixed(d) + ' %' };
const fmtT = n => Math.floor(n).toLocaleString('fr-FR');
const fmtSigned = n => { n=Math.round(n); return (n>0?'+':n<0?'−':'±') + Math.abs(n).toLocaleString('fr-FR') };
const tone = x => x > 0 ? 'up' : x < 0 ? 'down' : 'flat';
function fmtDur(ms){ms=Math.max(0,ms);const m=Math.ceil(ms/60000),h=Math.floor(m/60);return h?`${h}h${String(m%60).padStart(2,'0')}`:`${m} min`}
function fmtClock(ms){const s=Math.floor(ms/1000),h=Math.floor(s/3600),m=Math.floor(s/60)%60;return `${h}:${String(m).padStart(2,'0')}`}
function fmtCount(ms){const s=Math.max(0,Math.ceil(ms/1000));return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`}
const dirLabel = d => d>0 ? '📈 Hausse' : '📉 Baisse';

/* ---------- graphiques canvas ---------- */
function drawChart(cv, data, color, {grid=false, baseline=null, fill=true, width=2}={}){
  const dpr=window.devicePixelRatio||1, w=cv.clientWidth, h=cv.clientHeight;
  if(!w||!h||!data||data.length<2) return;
  if(cv.width!==Math.round(w*dpr)||cv.height!==Math.round(h*dpr)){cv.width=Math.round(w*dpr);cv.height=Math.round(h*dpr)}
  const c=cv.getContext('2d'); c.setTransform(dpr,0,0,dpr,0,0); c.clearRect(0,0,w,h);
  let mn=Math.min(...data), mx=Math.max(...data);
  if(baseline!=null){mn=Math.min(mn,baseline);mx=Math.max(mx,baseline)}
  if(mx-mn<1e-9){mx+=1;mn-=1}
  const pad=(mx-mn)*.1; mn-=pad; mx+=pad;
  const Y=v=>h-(v-mn)/(mx-mn)*h, X=i=>i/(data.length-1)*w;
  if(grid){
    c.font='500 10px Plex,monospace'; c.fillStyle='rgba(237,230,214,.45)'; c.strokeStyle='rgba(237,230,214,.07)'; c.lineWidth=1;
    for(let i=1;i<4;i++){const v=mn+(mx-mn)*i/4,y=Math.round(Y(v))+.5;c.beginPath();c.moveTo(0,y);c.lineTo(w,y);c.stroke();c.fillText(fmtP(v),4,y-4)}
  }
  if(baseline!=null){const y=Math.round(Y(baseline))+.5;c.setLineDash([2,4]);c.strokeStyle='rgba(237,230,214,.28)';c.lineWidth=1;c.beginPath();c.moveTo(0,y);c.lineTo(w,y);c.stroke();c.setLineDash([])}
  c.beginPath(); data.forEach((v,i)=>i?c.lineTo(X(i),Y(v)):c.moveTo(0,Y(v)));
  c.strokeStyle=color; c.lineWidth=width; c.lineJoin='round'; c.lineCap='round'; c.stroke();
  if(fill){ c.lineTo(w,h); c.lineTo(0,h); c.closePath();
    const g=c.createLinearGradient(0,0,0,h); g.addColorStop(0,color+'2e'); g.addColorStop(1,color+'00'); c.fillStyle=g; c.fill() }
  // point final
  const lx=w-1, ly=Y(data[data.length-1]);
  c.beginPath(); c.arc(lx-2,ly,3,0,Math.PI*2); c.fillStyle=color; c.fill();
}
function drawCharts(root=document){
  root.querySelectorAll('canvas[data-chart]').forEach(cv=>{
    const d=CHARTS[cv.dataset.chart]; if(d) drawChart(cv,d.data,d.color,d.opts||{});
  });
}
let CHARTS = {};

/* ---------- QR ---------- */
function qrSvg(text){
  const q=qrcode(0,'M'); q.addData(text); q.make();
  const n=q.getModuleCount(); let path='';
  for(let r=0;r<n;r++)for(let c=0;c<n;c++) if(q.isDark(r,c)) path+=`M${c},${r}h1v1h-1z`;
  return `<svg viewBox="-2 -2 ${n+4} ${n+4}" shape-rendering="crispEdges" xmlns="http://www.w3.org/2000/svg"><rect x="-2" y="-2" width="${n+4}" height="${n+4}" fill="#fff"/><path d="${path}" fill="#0a0d12"/></svg>`;
}

/* ---------- son & vibration ---------- */
let actx=null, soundOn=true;
function unlockAudio(){try{actx=actx||new (window.AudioContext||window.webkitAudioContext)();if(actx.state==='suspended')actx.resume()}catch(e){}}
function beep(t){
  if(!soundOn||!actx) return;
  const notes = t==='good'?[523,659,784,1046]:t==='bad'?[392,330,262,196]:t==='ann'?[660,660,880]:[440,554,659];
  notes.forEach((f,i)=>{const o=actx.createOscillator(),g=actx.createGain();o.type='triangle';o.frequency.value=f;
    const s=actx.currentTime+i*.11;g.gain.setValueAtTime(.0001,s);g.gain.exponentialRampToValueAtTime(.22,s+.015);g.gain.exponentialRampToValueAtTime(.0001,s+.24);
    o.connect(g).connect(actx.destination);o.start(s);o.stop(s+.3)});
}
function buzz(t){try{navigator.vibrate&&navigator.vibrate(t==='bad'?[180,70,180]:[90])}catch(e){}}
document.addEventListener('pointerdown',unlockAudio,{passive:true});

/* ---------- overlays : flash info (ticket), feuilles, toasts ---------- */
function fmtHMS(ms){const s=Math.max(0,Math.ceil(ms/1000));return `${Math.floor(s/3600)}:${String(Math.floor(s/60)%60).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`}
const SYM={good:'▲',bad:'▼',neutral:'◆'};
const EVQ=[]; let evTimer=null;
function showEvent(ev,{auto=9000}={}){ EVQ.push(ev); if(!$('#evt')) nextEvent(auto) }
function nextEvent(auto){
  const ev=EVQ.shift(); if(!ev) return;
  beep(ev.ann?'ann':ev.tone); buzz(ev.tone);
  const d=document.createElement('div'); d.id='evt'; d.className='evt';
  d.innerHTML=`<div class="ticket">
      <div class="tk-top"><span>Flash info</span><span>${fmtClock(ev.c||0)}${ev.s?' · '+ev.s:''}</span></div>
      <div class="perf"></div>
      <div class="tk-body">
        <div class="tk-ttl">${esc(ev.title)}</div>
        <div class="tk-txt">${esc(ev.text)}</div>
        ${ev.delta!=null?`<div class="tk-delta ${tone(ev.delta)}">${fmtPct(ev.delta)}</div>`:''}
      </div>
      <div class="perf"></div>
      <div class="tk-foot"><span>BoursePio · séance</span><span class="chip chip-${ev.tone}">${SYM[ev.tone]||'◆'}</span></div>
      <button class="btn">${EVQ.length?`Suivant · ${EVQ.length}`:'OK'}</button>
      <div class="evt-bar"><i style="animation-duration:${auto}ms"></i></div>
    </div>`;
  const close=()=>{clearTimeout(evTimer);d.classList.add('out');setTimeout(()=>{d.remove();nextEvent(auto)},150)};
  d.querySelector('button').onclick=close;
  d.onclick=e=>{if(e.target===d)close()};
  document.body.appendChild(d);
  evTimer=setTimeout(close,auto);
}
/* événement mineur (liquidation…) : pas de fenêtre, le bandeau d'actu clignote */
function flashTape(t='bad'){
  beep(t);
  document.querySelectorAll('.tape,.tv-tape').forEach(el=>{el.classList.add(t==='bad'?'flash-bad':'flash');setTimeout(()=>el.classList.remove('flash','flash-bad'),2600)});
}
let toastTimer=null;
function toast(msg,action){
  clearTimeout(toastTimer);
  let el=$('#toast'); if(el) el.remove();
  el=document.createElement('div'); el.id='toast'; el.className='toast';
  el.innerHTML=`<span>${esc(msg)}</span>`;
  if(action){const b=document.createElement('button');b.textContent=action.label;b.onclick=()=>{el.remove();action.fn()};el.appendChild(b)}
  document.body.appendChild(el);
  toastTimer=setTimeout(()=>{el.classList.add('out');setTimeout(()=>el.remove(),150)}, action?6000:2400);
}
let sheetOnClose=null;
function sheet(html,{onClose}={}){
  const t=$('#toast'); if(t) t.remove();
  closeSheet(true);
  const bg=document.createElement('div'); bg.id='sheet'; bg.className='sheet-bg';
  bg.innerHTML=`<div class="sheet" role="dialog">${html}</div>`;
  bg.addEventListener('click',e=>{if(e.target===bg)closeSheet()});
  document.body.appendChild(bg); sheetOnClose=onClose||null;
  return bg.querySelector('.sheet');
}
function closeSheet(instant){
  const bg=$('#sheet'); if(!bg) return;
  const cb=sheetOnClose; sheetOnClose=null; if(cb) cb();
  if(instant){bg.remove();return}
  bg.classList.add('out'); setTimeout(()=>bg.remove(),170);
}
function confirmBox(msg,fn,{ok='Confirmer',danger=true}={}){
  sheet(`<div class="sh"><h2>${esc(msg)}</h2></div><div class="grid2" style="margin-top:22px"><button class="btn" onclick="closeSheet()">Annuler</button><button class="btn ${danger?'btn-down':'btn-brass'}" id="cfm">${ok}</button></div>`);
  $('#cfm').onclick=()=>{closeSheet();fn()};
}

/* ---------- briques de rendu partagées (à partir d'un snapshot) ---------- */
function sigLine(s){
  if(!s.tags.length&&!s.locked) return '';
  return `<div class="sig">${s.locked?'<span class="s-lock">■ Paris gelés</span>':''}${s.tags.map(t=>`<span class="s-${t.t}">${t.icon} ${esc(t.label)}</span>`).join('')}</div>`;
}
function quoteHead(){return `<div class="q-head label"><span>Action</span><span>Séance</span><span>Cours · var.</span></div>`}
function quoteRow(s,{onclick=''}={}){
  CHARTS['q-'+s.id]={data:s.hist,color:s.color,opts:{baseline:s.open,width:1.5}};
  return `<div class="q-row ${onclick?'press':''}" ${onclick?`onclick="${onclick}"`:''} style="--c:${s.color}">
    <div class="q-id"><span class="tk">${s.id}</span><span class="nm">${esc(s.name)}</span></div>
    <canvas class="q-spark" data-chart="q-${s.id}"></canvas>
    <div class="q-px"><b>${fmtP(s.price)}</b><span class="${tone(s.chg)}">${fmtPct(s.chg)}</span></div>
    ${sigLine(s)}
  </div>`;
}
function swatch(t){return `<span class="sw" style="--c:${t.color}"></span>`}
function posRow(p,s,{action=''}={}){
  const g=Math.floor(p.value)-p.paid;
  return `<div class="pos">
    <div class="p-l"><b>${p.s}<em class="${p.dir>0?'up':'down'}">${p.dir>0?'▲':'▼'} ×${p.lev}</em></b>
      <small>${p.paid} @ ${fmtP(p.entry)}${p.lev>1||p.dir<0?` · liq. ${fmtP(p.liq)}`:''}</small></div>
    <div class="p-v"><b>${fmtT(p.value)}</b><span class="${tone(g)}">${fmtSigned(g)}</span></div>
    ${action}
  </div>`;
}
function rankList(teams,{max=99}={}){
  if(!teams.length) return '<p class="note">Aucune équipe.</p>';
  return teams.slice(0,max).map((t,i)=>`<div class="rk ${i===0?'first':''}">
    <span class="rk-n">${String(i+1).padStart(2,'0')}</span>${swatch(t)}
    <div class="rk-name">${esc(t.name)}<small>${t.pos.length} mise${t.pos.length>1?'s':''} · ${fmtT(t.value)} en jeu</small></div>
    <b class="rk-p ${tone(t.pnl)}">${fmtSigned(t.pnl)}</b>
  </div>`).join('');
}
function annCard(a,stocks,clockNow){
  const s=stocks.find(x=>x.id===a.s); if(!s) return '';
  const left=a.at-clockNow;
  return `<div class="ann">
    <span class="label">Annonce · ${s.id}${left<=30000?' · paris gelés':''}</span>
    <div class="ann-t">${esc(a.label)}</div>
    <div class="ann-s">Ça va bouger très fort. Hausse ou baisse ?</div>
    <b class="ann-c" data-count="${a.at}">${fmtCount(left)}</b>
  </div>`;
}
function tapeHtml(evs){
  const e=[...(evs||[])].reverse()[0];
  if(!e) return `<span class="t">--:--</span><span class="w">En attente des premières nouvelles…</span>`;
  return `<span class="t">${fmtClock(e.c)}</span><b class="${e.tone==='good'?'up':e.tone==='bad'?'down':''}">${esc(e.title)}</b><span class="w">${esc(e.text.replace(/\n/g,' · '))}${e.delta!=null?' · '+fmtPct(e.delta):''}</span>`;
}
const RULES_HTML = `
  <div class="rules">
    <div class="rule"><div><b>Tu mises des tickets</b><span>auprès de la banque, sur l'action de ton choix.</span></div></div>
    <div class="rule"><div><b>Hausse ou baisse</b><span>Tu gagnes si l'action va dans le sens que tu as choisi.</span></div></div>
    <div class="rule"><div><b>Multiplicateur ×1 ×2 ×5</b><span>Il multiplie tes gains… et tes pertes. Si ta mise tombe à 0, elle est liquidée.</span></div></div>
    <div class="rule"><div><b>Encaisse quand tu veux</b><span>La banque te rend la valeur actuelle de ta mise.</span></div></div>
    <div class="rule"><div><b>Annonces</b><span>Compte à rebours, puis l'action bouge très fort. Les paris sont gelés 30 s avant.</span></div></div>
  </div>
  <div class="example">
    10 tickets sur MAIA · ▲ hausse · ×2<br>
    MAIA +20 % → ta mise vaut <b class="up">14</b><br>
    MAIA −20 % → ta mise vaut <b class="down">6</b><br>
    MAIA −50 % → <b class="down">liquidée</b>
  </div>`;
