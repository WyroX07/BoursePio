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
const draw = () => IS_TV ? renderTV() : renderViewer();

function screensInit(){
  document.body.classList.add(IS_TV?'mode-tv':'mode-viewer');
  Sync.onSnap=s=>{ const first=!VS; VS=s; recvAt=Date.now(); draw(); handleEvents(first) };
  Sync.connect(ROOM,{subscribe:true});
  Sync.listeners.push(draw);
  IS_TV?tvStart():renderViewer();
  setInterval(()=>{
    const now=vClock();
    document.querySelectorAll('[data-count]').forEach(el=>el.textContent=fmtCount(+el.dataset.count-now));
    const c=$('#hclock'); if(c&&VS&&VS.started&&!VS.ended) c.textContent=fmtHMS(VS.dur-now);
    const st=$('#stale'); if(st) st.hidden=!stale()||!VS;
  },1000);
  window.addEventListener('resize',()=>requestAnimationFrame(()=>drawCharts()));
}
function handleEvents(first){
  const evs=VS.evs||[], max=evs.reduce((m,e)=>Math.max(m,e.id),0);
  if(first||lastEv===null||max<lastEv){ lastEv=max; return }   // pas d'avalanche à l'arrivée
  for(const e of evs) if(e.id>lastEv){
    if(e.minor) flashTape(e.tone);
    else showEvent(e,{auto:IS_TV?10000:7000});
  }
  lastEv=max;
}
function phaseLabel(){ return VS.ended?'Clôturé':VS.paused?'En pause':VS.phase.name }

/* ---------- tel des joueurs ---------- */
function renderViewer(){
  CHARTS={};
  const h=$('#hdr'), m=$('#main'), n=$('#nav');
  if(!ROOM){ h.innerHTML=''; n.innerHTML='';
    m.innerHTML=`<section class="hero"><h1>Bourse<i>Pio</i></h1><p>Scanne le QR code affiché par la banque pour suivre la partie.</p></section><div class="sec"><span class="label">Règles</span></div>${RULES_HTML}`; return }
  const now=vClock(), live=Sync.status==='live'&&!stale(), on=VS&&VS.started;
  h.innerHTML=`<div class="hdr">
      <div><div class="mark">Bourse<i>Pio</i></div>
        <div class="meta">${on?`<span class="${VS.phase.hot&&!VS.ended?'hot':''}">${phaseLabel()}</span>`:''}<span class="dot ${live?'on':''}">${ROOM}</span></div></div>
      ${on?`<div class="clock"><b id="hclock">${VS.ended?'0:00:00':fmtHMS(VS.dur-now)}</b><span>${VS.ended?'Séance close':'Restant'}</span></div>`:''}
    </div>
    ${on?`<div class="bar"><i style="transform:scaleX(${clamp(VS.clock/VS.dur,0,1)})"></i></div><div class="tape">${tapeHtml(VS.evs)}</div>`:'<div style="height:12px"></div>'}
    <div id="stale" class="stale" ${stale()&&VS?'':'hidden'}>Pas de nouvelles de la banque, reconnexion…</div>`;
  const tabs=[['market','Marché'],['rank','Classement'],['me','Mon équipe'],['rules','Règles']];
  n.innerHTML=tabs.map(([k,l])=>`<button class="${VUI.tab===k?'on':''}" onclick="VUI.tab='${k}';scrollTo(0,0);renderViewer()">${l}</button>`).join('');
  if(VUI.tab==='rules'){ m.innerHTML=`<div class="sec"><span class="label">Règles</span></div>${RULES_HTML}`; return }
  if(!VS){ m.innerHTML=`<div class="waiting"><div class="spin"></div><span>Connexion à la partie ${esc(ROOM)}…</span><span class="faint">${Sync.status==='live'?'En attente de la banque':'Connexion au relais en direct'}</span></div>`; return }
  if(!VS.started){ m.innerHTML=`<div class="waiting"><span>La partie va bientôt commencer.</span></div><div class="sec"><span class="label">Règles</span></div>${RULES_HTML}`; return }
  const y=scrollY;
  if(VUI.tab==='market') m.innerHTML=`${VS.ann.map(a=>annCard(a,VS.stocks,now)).join('')}
    <div class="sec"><span class="label">Cotations</span><span class="label">Mise auprès de la banque</span></div>
    ${VS.stocks.map(s=>quoteRow(s)).join('')}
    <p class="note">Cours en tickets par action. Variation depuis l'ouverture.</p>`;
  else if(VUI.tab==='rank') m.innerHTML=`<div class="sec"><span class="label">Classement</span><span class="label">Bilan</span></div>${rankList(VS.teams)}
    <p class="note">Bilan = encaissé + valeur des mises en cours − misé.</p>`;
  else m.innerHTML=viewMine();
  scrollTo(0,y);
  requestAnimationFrame(()=>drawCharts(m));
}
function viewMine(){
  let my=null; try{my=localStorage.getItem(MYKEY)}catch(e){}
  const t=VS.teams.find(x=>x.id===my);
  const picker=VS.teams.map(x=>`<button class="list-opt ${x.id===my?'on':''}" style="grid-template-columns:12px 1fr" onclick="setMine('${x.id}')">${swatch(x)}<span class="t-name" style="font-size:20px">${esc(x.name)}</span></button>`).join('');
  if(!t) return `<div class="sec"><span class="label">Choisis ton équipe</span></div>${picker||'<p class="note">Aucune équipe pour l\'instant.</p>'}`;
  const rank=VS.teams.indexOf(t)+1;
  return `<section class="team">
      <div class="t-head">${swatch(t)}<span class="t-name">${esc(t.name)}</span><b class="t-pnl ${tone(t.pnl)}">${fmtSigned(t.pnl)}</b></div>
      <div class="t-sub">${rank}${rank===1?'re':'e'} sur ${VS.teams.length} · misé ${fmtT(t.in)} · encaissé ${fmtT(t.out)}</div>
      ${t.pos.length?`<div class="pos-list">${t.pos.map(p=>posRow(p)).join('')}</div>`:'<p class="note" style="margin-left:19px">Aucune mise en cours. Va voir la banque !</p>'}
    </section>
    <p class="note">Valeur = ce que la banque te rendrait maintenant. « liq. » = cours où la mise tombe à zéro.</p>
    <div class="sec"><span class="label">Changer d'équipe</span></div>${picker}`;
}
function setMine(id){ try{localStorage.setItem(MYKEY,id)}catch(e){} renderViewer() }

/* ---------- grand écran ---------- */
function tvStart(){
  $('#main').innerHTML=`<div class="tv-start"><div class="mark">Bourse<i>Pio</i></div>
    <span class="label">Partie ${esc(ROOM)}</span>
    <button class="btn btn-brass btn-xl" onclick="tvGo()">Lancer l'affichage</button>
    <span class="note">Plein écran et son des événements</span></div>`;
}
function tvGo(){
  unlockAudio();
  try{document.documentElement.requestFullscreen&&document.documentElement.requestFullscreen()}catch(e){}
  VUI.tvOn=true; renderTV();
}
function qrPanel(){ return `<div class="qr-block">${qrSvg(viewerUrl(ROOM))}<div><h2>Suis tes mises</h2><p>Scanne pour voir les cours et ton équipe sur ton tel.</p></div></div>` }
function renderTV(){
  if(!VUI.tvOn) return;
  CHARTS={};
  const m=$('#main'), now=vClock(), live=Sync.status==='live'&&!stale();
  if(!VS||!VS.started){
    m.innerHTML=`<div class="tv-start"><div class="mark">Bourse<i>Pio</i></div>
      <span class="label">${VS?'La séance va bientôt ouvrir':'Connexion à la partie '+esc(ROOM)+'…'}</span>
      <div style="width:min(560px,80vw)">${qrPanel()}</div></div>`;
    return;
  }
  m.innerHTML=`<div class="tv">
    <header class="tv-head">
      <div class="mark">Bourse<i>Pio</i></div>
      <div class="meta"><span class="${VS.phase.hot&&!VS.ended?'hot':''}">${phaseLabel()}</span><span class="dot ${live?'on':''}">${live?'En direct':'Reconnexion'}</span></div>
      <div class="tv-clock"><b id="hclock">${VS.ended?'0:00:00':fmtHMS(VS.dur-now)}</b><span>${VS.ended?'Séance close':'Temps restant'}</span></div>
    </header>
    <section class="board">
      <div class="b-head label"><span>Action</span><span>Séance</span><span>Cours</span><span>Var.</span></div>
      ${VS.stocks.map(boardRow).join('')}
    </section>
    <aside class="tv-side">
      ${VS.ann.map(a=>annCard(a,VS.stocks,now)).join('')}
      <div class="tv-rank"><div class="sec" style="margin-top:0"><span class="label">Classement</span><span class="label">Bilan</span></div>${rankList(VS.teams,{max:8})}</div>
      ${qrPanel()}
    </aside>
    <footer class="tv-tape">${tapeHtml(VS.evs)}</footer>
  </div>`;
  requestAnimationFrame(()=>drawCharts(m));
}
function boardRow(s){
  CHARTS['b-'+s.id]={data:s.hist,color:s.color,opts:{baseline:s.open,width:2}};
  return `<div class="b-row" style="--c:${s.color}">
    <div class="b-id"><span class="tk">${s.id}</span><span class="nm">${esc(s.name)}</span></div>
    <div class="b-mid"><canvas class="b-spark" data-chart="b-${s.id}"></canvas>${sigLine(s)}</div>
    <div class="b-px">${fmtP(s.price)}</div>
    <div class="b-ch ${tone(s.chg)}">${fmtPct(s.chg)}</div>
  </div>`;
}
