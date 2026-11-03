'use strict';
/* Écrans en lecture seule : tel des joueurs (via QR) et grand écran (?tv=1).
   Ils n'ont aucun état propre : ils affichent le dernier snapshot reçu de la banque. */
let VS=null, recvAt=0, lastEv=null;
const params=new URLSearchParams(location.search);
const ROOM=(params.get('room')||'').toUpperCase();
const IS_TV=params.has('tv');
const VUI={tab:'market'};
const MYKEY='boursepio.team.'+ROOM;

function vClock(){ if(!VS) return 0; return VS.clock+(VS.started&&!VS.paused&&!VS.ended?Math.min(Date.now()-recvAt,8000):0) }
function stale(){ return !VS || Date.now()-recvAt>25000 }

function screensInit(){
  document.body.classList.add(IS_TV?'mode-tv':'mode-viewer');
  Sync.onSnap=s=>{
    const first=!VS; VS=s; recvAt=Date.now();
    handleEvents(first);
    IS_TV?renderTV():renderViewer();
  };
  Sync.connect(ROOM,{subscribe:true});
  Sync.listeners.push(()=>IS_TV?renderTV():renderViewer());
  IS_TV?tvStart():renderViewer();
  setInterval(()=>{
    const now=vClock();
    document.querySelectorAll('[data-count]').forEach(el=>el.textContent=fmtCount(+el.dataset.count-now));
    const t=$('#tleft'); if(t&&VS&&VS.started&&!VS.ended) t.textContent=fmtDur(VS.dur-now);
    const st=$('#stale'); if(st) st.hidden=!stale()||!VS;
  },1000);
  window.addEventListener('resize',()=>requestAnimationFrame(()=>drawCharts()));
}
function handleEvents(first){
  const evs=VS.evs||[], max=evs.reduce((m,e)=>Math.max(m,e.id),0);
  if(first||lastEv===null||max<lastEv){ lastEv=max; return }   // pas d'avalanche à l'arrivée
  for(const e of evs) if(e.id>lastEv){
    if(e.minor) banner(e.icon,`${e.title} — ${e.text}`,e.tone);
    else showEvent(e,{auto:IS_TV?10000:7000});
  }
  lastEv=max;
}

/* ---------- tel des joueurs ---------- */
function renderViewer(){
  CHARTS={};
  const h=$('#hdr'), m=$('#main'), n=$('#nav');
  if(!ROOM){ h.innerHTML=''; m.innerHTML=`<section class="hero"><h1>BoursePio</h1><p>Scanne le QR code affiché par la banque pour suivre la partie.</p></section>${RULES_HTML}`; n.innerHTML=''; return }
  const now=vClock(), live=Sync.status==='live';
  h.innerHTML=`<div class="hdr-row">
      <div class="hdr-left"><div class="brand">Bourse<span>Pio</span></div>
        ${VS&&VS.phase?`<span class="pill ${VS.phase.hot&&!VS.ended?'pill-hot':''}">${VS.ended?'Clôturé':VS.paused?'⏸ Pause':VS.phase.name}</span>`:''}</div>
      <span class="live ${live&&!stale()?'on':''}"><i></i>${ROOM}</span>
      ${VS&&VS.started?`<div class="hdr-time"><b class="num" id="tleft">${VS.ended?'Fin':fmtDur(VS.dur-now)}</b><span>${VS.ended?'terminé':'restantes'}</span></div>`:''}
    </div>
    ${VS&&VS.started?`<div class="progress"><i style="transform:scaleX(${clamp(VS.clock/VS.dur,0,1)})"></i></div>`:''}
    <div id="stale" class="stale" ${stale()&&VS?'':'hidden'}>📡 Pas de nouvelles de la banque… reconnexion</div>`;
  const tabs=[['market','📈','Marché'],['rank','🏆','Classement'],['me','🎟️','Mon équipe'],['rules','❓','Règles']];
  n.innerHTML=tabs.map(([k,i,l])=>`<button class="${VUI.tab===k?'on':''}" onclick="VUI.tab='${k}';scrollTo(0,0);renderViewer()"><i>${i}</i><span>${l}</span></button>`).join('');
  if(!VS){ m.innerHTML=`<div class="waiting"><div class="spinner"></div><b>Connexion à la partie ${esc(ROOM)}…</b><span class="muted small">${live?'Connecté, en attente de la banque.':'Connexion au relais en direct…'}</span></div>${VUI.tab==='rules'?RULES_HTML:''}`; return }
  if(!VS.started){ m.innerHTML=`<div class="waiting"><span style="font-size:42px">⏳</span><b>La partie va bientôt commencer</b></div>${RULES_HTML}`; return }
  const y=scrollY;
  if(VUI.tab==='market') m.innerHTML=`${VS.ann.map(a=>annCard(a,VS.stocks,now)).join('')}<div class="tiles">${VS.stocks.map(s=>stockTile(s)).join('')}</div>
    <p class="hint center">Pour miser ou encaisser, va voir la banque.</p>`;
  else if(VUI.tab==='rank') m.innerHTML=`<div class="card">${rankList(VS.teams)}</div><p class="hint">Bilan = tickets encaissés + valeur des mises en cours − tickets misés.</p>`;
  else if(VUI.tab==='me') m.innerHTML=viewMine();
  else m.innerHTML=RULES_HTML;
  scrollTo(0,y);
  requestAnimationFrame(()=>drawCharts(m));
}
function viewMine(){
  let my=null; try{my=localStorage.getItem(MYKEY)}catch(e){}
  const t=VS.teams.find(x=>x.id===my);
  const picker=`<div class="chips">${VS.teams.map(x=>`<button class="chip ${x.id===my?'on':''}" onclick="setMine('${x.id}')">${avatar(x)} ${esc(x.name)}</button>`).join('')}</div>`;
  if(!t) return `<h3 class="mt-0">C'est quoi ton équipe ?</h3>${picker||'<div class="empty">Aucune équipe pour l\'instant</div>'}`;
  const rank=VS.teams.indexOf(t)+1;
  return `<div class="card team" style="--c:${t.color}">
      <div class="team-head">${avatar(t)}<div class="team-name"><b>${esc(t.name)}</b><span class="muted small">${rank}${rank===1?'re':'e'} sur ${VS.teams.length}</span></div>
        <div class="team-pnl"><b class="num ${tone(t.pnl)}">${fmtSigned(t.pnl)}</b><span class="muted small">bilan</span></div></div>
      ${t.pos.length?`<div class="pos-list">${t.pos.map(p=>posRow(p,VS.stocks.find(s=>s.id===p.s))).join('')}</div>`:'<p class="muted">Aucune mise en cours. Va voir la banque pour miser !</p>'}
    </div>
    <p class="hint">Les montants sont ce que la banque te rendrait si tu encaissais maintenant. 💀 = cours où la mise est liquidée.</p>
    <h3>Changer d'équipe</h3>${picker}`;
}
function setMine(id){ try{localStorage.setItem(MYKEY,id)}catch(e){} renderViewer() }

/* ---------- grand écran ---------- */
function tvFeed(){
  const n=VS.stocks.length, cols=n===2||n===4?2:3, free=(cols-n%cols)%cols;
  if(!free) return '';
  const evs=[...VS.evs].reverse().slice(0,free>1?7:5);
  return `<div class="card tv-feed" style="grid-column:span ${free}"><h3 class="mt-0">📰 Dernières infos</h3>
    ${evs.map(e=>`<div class="feed"><span>${e.icon}</span><div><b>${esc(e.title)}</b><span class="muted small">${esc(e.text.split('\n')[0])}</span></div>${e.delta!=null?`<b class="num ${tone(e.delta)}">${fmtPct(e.delta)}</b>`:''}</div>`).join('')}</div>`;
}
function tvStart(){
  $('#main').innerHTML=`<div class="tv-start"><div class="brand brand-xl">Bourse<span>Pio</span></div>
    <p class="muted">Partie ${esc(ROOM)}</p>
    <button class="btn btn-primary btn-xl" onclick="tvGo()">▶ Lancer l'affichage</button>
    <p class="hint">Plein écran + son des événements</p></div>`;
}
function tvGo(){
  unlockAudio();
  try{document.documentElement.requestFullscreen&&document.documentElement.requestFullscreen()}catch(e){}
  VUI.tvOn=true; renderTV();
}
function renderTV(){
  if(!VUI.tvOn) return;
  CHARTS={};
  const m=$('#main'), now=vClock(), live=Sync.status==='live'&&!stale();
  if(!VS||!VS.started){
    m.innerHTML=`<div class="tv-wait"><div class="brand brand-xl">Bourse<span>Pio</span></div>
      <p>${VS?'La partie va bientôt commencer':'Connexion à la partie '+esc(ROOM)+'…'}</p>
      <div class="tv-qr">${qrSvg(viewerUrl(ROOM))}<span>Scanne pour suivre sur ton tel</span></div></div>`;
    return;
  }
  const ev=[...VS.evs].reverse().find(e=>!e.minor);
  m.innerHTML=`<div class="tv">
    <header class="tv-head">
      <div class="brand brand-lg">Bourse<span>Pio</span></div>
      <span class="pill pill-lg ${VS.phase.hot&&!VS.ended?'pill-hot':''}">${VS.ended?'Clôturé':VS.paused?'⏸ Pause':VS.phase.name}</span>
      <span class="live ${live?'on':''}"><i></i>${live?'En direct':'Reconnexion…'}</span>
      <div class="tv-time"><b class="num" id="tleft">${VS.ended?'Terminé':fmtDur(VS.dur-now)}</b><span>${VS.ended?'':'restantes'}</span></div>
    </header>
    <div class="progress"><i style="transform:scaleX(${clamp(VS.clock/VS.dur,0,1)})"></i></div>
    <section class="tv-tiles n${VS.stocks.length}">${VS.stocks.map(s=>stockTile(s,{big:true})).join('')}${tvFeed()}</section>
    <aside class="tv-side">
      ${VS.ann.map(a=>annCard(a,VS.stocks,now)).join('')}
      <div class="card tv-rank"><h3 class="mt-0">🏆 Classement</h3>${rankList(VS.teams.slice(0,8),{compact:true})}</div>
      <div class="tv-qr">${qrSvg(viewerUrl(ROOM))}<span>Suis tes mises<br>sur ton tel</span></div>
    </aside>
    <footer class="tv-foot">${ev?`<span>${ev.icon}</span><b>${esc(ev.title)}</b><span class="muted">${esc(ev.text.replace(/\n/g,' · '))}</span>`:'<span class="muted">Misez à la hausse ou à la baisse auprès de la banque 🎟️</span>'}</footer>
  </div>`;
  requestAnimationFrame(()=>drawCharts(m));
}
