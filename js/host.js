'use strict';
/* Interface de la banque : crée la partie, prend les mises, paie les encaissements, diffuse. */
const UI = {tab:'market'};
let V = null; // dernier snapshot

function liveClock(){ return S.clock + (S.started&&!S.paused&&!S.ended ? Math.min(Date.now()-S.lastReal, TICK_SEC*1000) : 0) }

function hostInit(){
  document.body.classList.add('mode-host');
  soundOn=S.settings.sound;
  Hooks.onEvent=ev=>{ if(!ev.minor) showEvent(ev,{auto:ev.ann?12000:8000}); if(ev.final){UI.tab='rank'} };
  Hooks.onMinor=m=>banner(m.icon,m.text,m.tone);
  Hooks.onChange=()=>{ render(); publish() };
  Sync.listeners.push(()=>renderHeader());
  if(S.started) Sync.connect(S.room);
  tick(); render(); publish();
  setInterval(()=>{ const n=tick(); if(n){ render(); publish() } else updateCounts() }, 1000);
  setInterval(()=>{ if(S.started) publish() }, 10000);   // battement : les nouveaux écrans reçoivent l'état
  document.addEventListener('visibilitychange',()=>{ if(document.visibilityState==='visible'){ if(tick()) render(); publish(); requestWake() } else saveNow() });
  document.addEventListener('pointerdown',()=>{ if(S.started&&!S.ended) requestWake() },{passive:true});
  window.addEventListener('resize',()=>requestAnimationFrame(()=>drawCharts()));
}
function publish(){ if(S.started) Sync.publish(snapshot()) }

let wake=null;
async function requestWake(){ if(!S.settings.wake||!('wakeLock' in navigator)) return; try{ if(!wake||wake.released) wake=await navigator.wakeLock.request('screen') }catch(e){} }

/* ---------- rendu ---------- */
function render(){
  V=snapshot(); CHARTS={};
  renderHeader();
  const m=$('#main');
  // ne pas écraser un champ en cours de saisie
  if(document.activeElement&&m.contains(document.activeElement)&&document.activeElement.tagName==='INPUT') return;
  const y=window.scrollY;
  if(!S.started){ m.innerHTML=viewSetup(); $('#nav').innerHTML=''; return }
  m.innerHTML = UI.tab==='market'?viewMarket() : UI.tab==='teams'?viewTeams() : UI.tab==='rank'?viewRank() : UI.tab==='share'?viewShare() : viewSettings();
  renderNav(); window.scrollTo(0,y);
  requestAnimationFrame(()=>drawCharts(m));
  refreshSheet();
}
function renderHeader(){
  const h=$('#hdr');
  if(!S.started){ h.innerHTML=`<div class="hdr-row"><div class="brand">Bourse<span>Pio</span></div><span class="muted small">Nouvelle partie</span></div>`; return }
  const ph=V?V.phase:phase(), left=S.duration-liveClock(), live=Sync.status==='live';
  h.innerHTML=`<div class="hdr-row">
      <div class="hdr-left"><div class="brand">Bourse<span>Pio</span></div>
        <span class="pill ${ph&&ph.hot&&!S.ended?'pill-hot':''}">${S.ended?'Clôturé':S.paused?'⏸ Pause':ph.name}</span></div>
      <button class="live ${live?'on':''}" onclick="go('share')" title="${live?'Diffusion en direct':'Hors-ligne'}"><i></i>${S.room}</button>
      <div class="hdr-time"><b class="num">${S.ended?'Fin':fmtDur(left)}</b><span>${S.ended?'séance terminée':'restantes'}</span></div>
    </div>
    <div class="progress"><i style="transform:scaleX(${clamp(S.clock/S.duration,0,1)})"></i></div>`;
}
function renderNav(){
  const tabs=[['market','📈','Marché'],['teams','👥','Équipes'],['rank','🏆','Classement'],['share','📺','Diffuser'],['settings','⚙️','Réglages']];
  $('#nav').innerHTML=tabs.map(([k,i,l])=>`<button class="${UI.tab===k?'on':''}" onclick="go('${k}')"><i>${i}</i><span>${l}</span></button>`).join('');
}
function go(t){ UI.tab=t; window.scrollTo(0,0); render() }
function updateCounts(){
  const now=liveClock();
  document.querySelectorAll('[data-count]').forEach(el=>el.textContent=fmtCount(+el.dataset.count-now));
  const ht=document.querySelector('.hdr-time b'); if(ht&&S.started&&!S.ended) ht.textContent=fmtDur(S.duration-now);
  if(CASH) refreshCash();
}

/* ---------- configuration ---------- */
function viewSetup(){
  const d=S.duration/60000, st=S.settings;
  return `
  <section class="hero">
    <h1>La bourse de la soirée</h1>
    <p>Les équipes misent leurs tickets <b>à la hausse ou à la baisse</b> sur les actions, avec un multiplicateur. Tu tiens la banque, l'appli calcule tout et l'affiche en direct sur le grand écran et sur les tels.</p>
  </section>
  <h3>Équipes <span class="muted">${S.teams.length}</span></h3>
  <div class="row"><input id="np" placeholder="Nom de l'équipe" maxlength="18" enterkeyhint="done" onkeydown="if(event.key==='Enter')addTeam()"><button class="btn btn-primary" onclick="addTeam()">Ajouter</button></div>
  <div class="chips mt-s">${S.teams.map(t=>`<button class="chip" onclick="removeTeam('${t.id}')">${avatar(t)} ${esc(t.name)} <span class="muted">✕</span></button>`).join('')||'<span class="muted small">Ajoute au moins une équipe (on peut en ajouter pendant la partie).</span>'}</div>
  <h3>Actions cotées <span class="muted">${S.pick.length}</span></h3>
  <div class="pick-grid">${CATALOG.map(c=>`<button class="pick ${S.pick.includes(c.id)?'on':''}" onclick="togglePick('${c.id}')" style="--c:${c.color}">
      <span class="pick-emoji">${c.emoji}</span><b>${esc(c.name)}</b><span class="tag">${c.tag}</span><span class="pick-check">✓</span></button>`).join('')}</div>
  <p class="hint">4 à 6 actions, c'est l'idéal : assez de choix, sans s'y perdre.</p>
  <h3>Durée</h3>
  <div class="seg">${[[60,'1h'],[120,'2h'],[180,'3h'],[240,'4h']].map(([m,l])=>`<button class="${d===m?'on':''}" onclick="S.duration=${m}*60000;save();render()">${l}</button>`).join('')}</div>
  <h3>Événements</h3>
  <div class="seg">${Object.entries(FREQ).map(([k,[a,b]])=>`<button class="${st.freq===k?'on':''}" onclick="S.settings.freq='${k}';save();render()">${k[0].toUpperCase()+k.slice(1)}<small>${a}–${b} min</small></button>`).join('')}</div>
  <button class="btn btn-primary btn-xl btn-block mt-l" onclick="doStart()">🔔 Ouvrir les marchés</button>
  <p class="hint center">Code de la partie : <b>${S.room}</b></p>`;
}
function togglePick(id){ S.pick=S.pick.includes(id)?S.pick.filter(x=>x!==id):[...S.pick,id]; save(); render() }
function doStart(){
  if(!S.teams.length) return toast('Ajoute au moins une équipe');
  if(S.pick.length<2) return toast('Choisis au moins 2 actions');
  startGame(); Sync.connect(S.room); unlockAudio(); requestWake(); UI.tab='market'; render(); publish();
}

/* ---------- marché ---------- */
function viewMarket(){
  const now=liveClock(), evs=[...V.evs].reverse().filter(e=>!e.minor).slice(0,3);
  return `
  ${V.ann.map(a=>annCard(a,V.stocks,now)).join('')}
  <div class="tiles">${V.stocks.map(s=>stockTile(s,{onclick:S.ended?'':`betFromStock('${s.id}')`})).join('')}</div>
  <p class="hint center">Touche une action pour miser · cours en tickets · variation depuis l'ouverture</p>
  ${evs.length?`<h3>Dernières infos</h3><div class="card">${evs.map(e=>`<div class="feed"><span>${e.icon}</span><div><b>${esc(e.title)}</b><span class="muted small">${esc(e.text.split('\n')[0])}</span></div><span class="muted small num">${fmtClock(e.c)}</span></div>`).join('')}</div>`:''}`;
}

/* ---------- équipes ---------- */
function viewTeams(){
  return `
  ${S.ended?'':`<div class="row mb"><input id="np" placeholder="Nouvelle équipe" maxlength="18" enterkeyhint="done" onkeydown="if(event.key==='Enter')addTeam()"><button class="btn" onclick="addTeam()">Ajouter</button></div>`}
  ${V.teams.length?V.teams.map(teamCard).join(''):'<div class="empty">Aucune équipe</div>'}`;
}
function teamCard(t){
  const total=t.pos.reduce((s,p)=>s+Math.floor(p.value),0);
  return `<div class="card team" style="--c:${t.color}">
    <div class="team-head">${avatar(t)}<div class="team-name"><b>${esc(t.name)}</b><span class="muted small">misé ${fmtT(t.in)} · encaissé ${fmtT(t.out)}</span></div>
      <div class="team-pnl"><b class="num ${tone(t.pnl)}">${fmtSigned(t.pnl)}</b><span class="muted small">bilan</span></div></div>
    ${t.pos.length?`<div class="pos-list">${t.pos.map(p=>posRow(p,V.stocks.find(s=>s.id===p.s),{action:`<button class="btn btn-cash" onclick="openCash('${p.id}')">Encaisser<b class="num">${fmtT(p.value)}</b></button>`})).join('')}</div>`:''}
    ${S.ended
      ? (t.pos.length?`<button class="btn btn-up btn-block" onclick="cashAll('${t.id}')">💸 Tout rendre : ${total} tickets</button>`:'')
      : `<button class="btn btn-primary btn-block" onclick="openBet('${t.id}')">＋ Nouvelle mise</button>`}
  </div>`;
}
function addTeam(){
  const i=$('#np'), n=(i?i.value:'').trim(); if(!n) return;
  if(S.teams.some(t=>t.name.toLowerCase()===n.toLowerCase())) return toast('Ce nom existe déjà');
  S.teams.push({id:uid(),name:n,color:TEAM_COLORS[S.teams.length%TEAM_COLORS.length],in:0,out:0});
  if(S.started) addLog(`${n} rejoint la partie`,'neutral','👋');
  i.value=''; i.blur(); save(); render(); publish();
  setTimeout(()=>{const x=$('#np');if(x&&!S.started)x.focus()},0);
}
function removeTeam(id){
  const t=team(id), go=()=>{S.teams=S.teams.filter(x=>x.id!==id);S.pos=S.pos.filter(p=>p.t!==id);save();render();publish()};
  if(S.pos.some(p=>p.t===id)) confirmBox(`${t.name} a encore des mises en cours. Supprimer quand même ?`,go); else go();
}
function renameTeam(id){const t=team(id),n=prompt('Nouveau nom',t.name);if(n&&n.trim()){t.name=n.trim().slice(0,18);save();render();publish()}}

/* ---------- mise ---------- */
let BET=null;
function betFromStock(sid){
  if(!S.teams.length) return toast('Ajoute une équipe d\'abord');
  if(S.teams.length===1) return openBet(S.teams[0].id,sid);
  sheet(`<h2 class="sheet-title">Qui mise sur ${esc(stock(sid).name)} ?</h2>
    <div class="team-pick">${V.teams.map(t=>`<button class="chip chip-lg" onclick="openBet('${t.id}','${sid}')">${avatar(t)} ${esc(t.name)}</button>`).join('')}</div>`);
}
function openBet(tid,sid){
  BET={tid,sid:sid||null,dir:1,lev:1,amt:10};
  sheet('<div id="bet"></div>',{onClose:()=>{BET=null}});
  drawBet();
}
function drawBet(){
  const el=$('#bet'); if(!el||!BET) return;
  const t=team(BET.tid);
  const st=BET.sid?stock(BET.sid):null, lock=st?canTrade(st.id):{ok:true};
  el.innerHTML=`
    <div class="sheet-head"><h2 class="sheet-title">${avatar(t)} Mise de ${esc(t.name)}</h2><button class="icon-btn" onclick="closeSheet()">✕</button></div>
    <div class="step"><span class="step-n">1</span>Sur quelle action ?</div>
    <div class="stock-pick">${S.stocks.map(s=>{const sv=V.stocks.find(x=>x.id===s.id);return `<button class="sp ${BET.sid===s.id?'on':''} ${sv.locked?'locked':''}" style="--c:${s.color}" onclick="BET.sid='${s.id}';drawBet()">
      <span>${s.emoji}</span><b>${esc(s.name)}</b><span class="num small">${fmtP(sv.price)} <i class="${tone(sv.mom)}">${sv.mom>=0?'▲':'▼'}</i></span>${sv.locked?'<span class="small">🔒</span>':''}</button>`}).join('')}</div>
    ${st?`<p class="hint">${st.emoji} ${esc(st.desc)}</p>`:''}
    <div class="step"><span class="step-n">2</span>Hausse ou baisse ?</div>
    <div class="grid2"><button class="dir ${BET.dir>0?'on up':''}" onclick="BET.dir=1;drawBet()">📈 Hausse<small>gagne si ça monte</small></button>
      <button class="dir ${BET.dir<0?'on down':''}" onclick="BET.dir=-1;drawBet()">📉 Baisse<small>gagne si ça descend</small></button></div>
    <div class="step"><span class="step-n">3</span>Multiplicateur</div>
    <div class="seg seg-lg">${LEVERAGE.map(l=>`<button class="${BET.lev===l.lev?'on':''} ${l.lev===5?'hot':''}" onclick="BET.lev=${l.lev};drawBet()">×${l.lev}<small>${l.label}</small></button>`).join('')}</div>
    <div class="step"><span class="step-n">4</span>Tickets misés</div>
    <div class="amount"><button class="icon-btn" onclick="setAmt(-1)">−</button>
      <input id="amt" type="number" inputmode="numeric" value="${BET.amt}" oninput="BET.amt=Math.max(0,parseInt(this.value)||0);drawScenario()">
      <button class="icon-btn" onclick="setAmt(1)">＋</button></div>
    <div class="chips chips-even mt-s">${[5,10,20,50].map(n=>`<button class="chip" onclick="BET.amt=${n};drawBet()">${n}</button>`).join('')}</div>
    <div id="scn"></div>
    <button class="btn ${BET.dir>0?'btn-up':'btn-down'} btn-xl btn-block" ${!st||!lock.ok||!BET.amt?'disabled':''} onclick="confirmBet()">
      ${!st?'Choisis une action':!lock.ok?'🔒 '+lock.why:`✋ Prendre ${BET.amt} ticket${BET.amt>1?'s':''}`}</button>`;
  drawScenario();
}
function drawScenario(){
  const el=$('#scn'); if(!el||!BET) return;
  const st=BET.sid?stock(BET.sid):null; if(!st){el.innerHTML='';return}
  const stake=BET.amt*(1-S.settings.fee/100), val=x=>Math.max(0,Math.floor(stake*(1+BET.dir*BET.lev*x)));
  const liq=BET.lev>1||BET.dir<0?(BET.dir>0?st.price*(1-1/BET.lev):st.price*(1+1/BET.lev)):null;
  el.innerHTML=`<div class="scenario">
      <div><span class="muted small">Si ${esc(st.name)} +20 %</span><b class="num ${tone(val(.2)-BET.amt)}">${val(.2)} 🎟️</b></div>
      <div><span class="muted small">Si ${esc(st.name)} −20 %</span><b class="num ${tone(val(-.2)-BET.amt)}">${val(-.2)} 🎟️</b></div>
      <div><span class="muted small">💀 Liquidé si cours</span><b class="num">${liq?(BET.dir>0?'≤ ':'≥ ')+fmtP(liq):'jamais'}</b></div>
    </div>${S.settings.fee?`<p class="hint">Frais ${S.settings.fee} % inclus.</p>`:''}`;
}
function setAmt(d){BET.amt=Math.max(1,(BET.amt||0)+d);const a=$('#amt');if(a)a.value=BET.amt;drawScenario()}
function confirmBet(){
  const b=BET, t=team(b.tid), r=openPos(b.tid,b.sid,b.dir,b.lev,b.amt);
  if(r.err) return toast(r.err);
  closeSheet(); buzz('good');
  toast(`✋ Prends ${b.amt} ticket${b.amt>1?'s':''} à ${t.name}`,{label:'Annuler',fn:()=>{undo();toast('Mise annulée : rends les tickets')}});
}

/* ---------- encaissement avec montant bloqué ---------- */
let CASH=null;
function openCash(pid){
  const q=quote(pid); if(!q) return;
  CASH=q; sheet('<div id="cash"></div>',{onClose:()=>{CASH=null}}); drawCash();
}
function drawCash(){
  const el=$('#cash'); if(!el||!CASH) return;
  const p=S.pos.find(x=>x.id===CASH.pid);
  if(!p){ el.innerHTML=`<h2 class="sheet-title">Cette mise n'existe plus</h2><p class="muted">Elle vient d'être liquidée.</p><button class="btn btn-block" onclick="closeSheet()">Fermer</button>`; return }
  const t=team(p.t), st=stock(p.s), g=CASH.amount-p.paid;
  el.innerHTML=`
    <div class="sheet-head"><h2 class="sheet-title">${avatar(t)} ${esc(t.name)} encaisse</h2><button class="icon-btn" onclick="closeSheet()">✕</button></div>
    <p class="muted">${st.emoji} ${esc(st.name)} · ${p.dir>0?'📈 hausse':'📉 baisse'} ×${p.lev} · misé ${p.paid}</p>
    <div class="cash-big"><span>Rends</span><b class="num">${CASH.amount}</b><span>ticket${CASH.amount>1?'s':''}</span></div>
    <p class="center"><span class="chip-${tone(g)} num">${fmtSigned(g)} par rapport à la mise</span></p>
    <div class="lock"><i id="lockbar"></i><span id="locktxt"></span></div>
    <button id="cashok" class="btn btn-up btn-xl btn-block" onclick="confirmCash()">💸 J'ai rendu ${CASH.amount} tickets</button>`;
  refreshCash();
}
function refreshCash(){
  if(!CASH) return;
  const left=QUOTE_MS-(Date.now()-CASH.at), bar=$('#lockbar'), txt=$('#locktxt'), ok=$('#cashok');
  if(!bar) return;
  bar.style.transform=`scaleX(${clamp(left/QUOTE_MS,0,1)})`;
  if(left>0){ txt.textContent=`🔒 Montant bloqué encore ${Math.ceil(left/1000)} s, même si le cours bouge` }
  else { txt.textContent='⏱️ Montant expiré'; ok.textContent='🔄 Recalculer au cours actuel'; ok.className='btn btn-xl btn-block'; ok.onclick=()=>{CASH=quote(CASH.pid);drawCash()} }
}
function confirmCash(){
  const q=CASH, r=closePos(q); if(r.err) return toast(r.err);
  closeSheet(); buzz('good');
  toast(`💸 ${q.amount} tickets rendus`,{label:'Annuler',fn:()=>{undo();toast('Encaissement annulé : reprends les tickets')}});
}
function cashAll(tid){
  const t=team(tid), qs=S.pos.filter(p=>p.t===tid).map(p=>quote(p.id)), total=qs.reduce((s,q)=>s+q.amount,0);
  confirmBox(`Rendre ${total} tickets à ${t.name} ?`,()=>{qs.forEach(q=>closePos(q));toast(`💸 ${total} tickets rendus à ${t.name}`)},{ok:'C\'est fait',danger:false});
}
function refreshSheet(){ if(BET) drawScenario(); }

/* ---------- classement ---------- */
function viewRank(){
  return `
  ${S.ended?`<div class="card card-accent"><b>🔔 Séance terminée.</b> Dans <b>Équipes</b>, « Tout rendre » indique combien de tickets rendre à chaque équipe.</div>`:''}
  <div class="card">${rankList(V.teams)}</div>
  <p class="hint">Bilan = tickets encaissés + valeur des mises en cours − tickets misés.</p>
  <h3>Journal</h3>
  <div class="card">${S.log.slice(0,60).map(l=>`<div class="feed"><span>${l.icon||'•'}</span><div class="${l.t==='good'?'up':l.t==='bad'?'down':''}">${esc(l.text)}</div><span class="muted small num">${fmtClock(l.c)}</span></div>`).join('')||'<span class="muted">Vide</span>'}</div>`;
}

/* ---------- diffusion ---------- */
function viewShare(){
  const live=Sync.status==='live', url=viewerUrl(S.room);
  return `
  <div class="card share">
    <div class="share-qr">${qrSvg(url)}</div>
    <h2>Suivre la partie sur son tel</h2>
    <p class="muted">Les joueurs scannent ce QR : cours, classement et leurs mises en direct, sans rien installer.</p>
    <p class="status ${live?'up':'down'}">${live?'● Diffusion en direct':'● Hors-ligne : les écrans reprendront dès que le réseau revient'}</p>
  </div>
  <div class="card">
    <h3 class="mt-0">📺 Grand écran</h3>
    <p>Sur le PC branché à la télé, ouvre :</p>
    <p class="url">${esc(tvUrl(S.room).replace(/^https?:\/\//,''))}</p>
    <div class="grid2"><button class="btn" onclick="copy('${tvUrl(S.room)}')">Copier le lien</button><button class="btn" onclick="window.open('${tvUrl(S.room)}','_blank')">Ouvrir ici</button></div>
    <p class="hint">Code de la partie : <b>${S.room}</b></p>
  </div>`;
}
function copy(t){ navigator.clipboard&&navigator.clipboard.writeText(t).then(()=>toast('Lien copié'),()=>prompt('Copie ce lien',t)) }

/* ---------- réglages ---------- */
function viewSettings(){
  const s=S.settings;
  return `
  <h3 class="mt-0">Partie</h3>
  ${S.ended?`<button class="btn btn-primary btn-block" onclick="extend(30,true)">Rouvrir le marché +30 min</button>`:`
  <div class="grid2">
    <button class="btn ${S.paused?'btn-up':''}" onclick="togglePause()">${S.paused?'▶️ Reprendre':'⏸ Pause'}</button>
    <button class="btn" onclick="manualEvent()">⚡ Événement</button>
    <button class="btn" onclick="extend(30)">＋30 min</button>
    <button class="btn" onclick="extend(-15)">−15 min</button>
  </div>
  <button class="btn btn-ghost btn-block mt-s down" onclick="confirmBox('Clôturer la séance maintenant ?',()=>{endGame();render();publish()})">🔔 Clôturer maintenant</button>`}
  <h3>Réglages</h3>
  <div class="card">
    <div class="field"><span>Fréquence des événements</span>
      <div class="seg">${Object.keys(FREQ).map(k=>`<button class="${s.freq===k?'on':''}" onclick="S.settings.freq='${k}';scheduleNext();save();render()">${k[0].toUpperCase()+k.slice(1)}</button>`).join('')}</div></div>
    <div class="field"><span>Frais par mise</span>
      <div class="seg">${[0,5,10].map(f=>`<button class="${s.fee===f?'on':''}" onclick="S.settings.fee=${f};save();render()">${f} %</button>`).join('')}</div></div>
    <label class="toggle"><span>🔊 Son des événements</span><input type="checkbox" ${s.sound?'checked':''} onchange="S.settings.sound=soundOn=this.checked;save()"></label>
    <label class="toggle"><span>💡 Garder l'écran allumé</span><input type="checkbox" ${s.wake?'checked':''} onchange="S.settings.wake=this.checked;save();if(this.checked)requestWake();else if(wake)wake.release()"></label>
  </div>
  <h3>Équipes</h3>
  <div class="card">${S.teams.map(t=>`<div class="feed"><span>${avatar(t)}</span><div>${esc(t.name)}</div><span><button class="icon-btn" onclick="renameTeam('${t.id}')">✏️</button> <button class="icon-btn" onclick="removeTeam('${t.id}')">🗑️</button></span></div>`).join('')||'<span class="muted">Aucune</span>'}</div>
  <h3>Sauvegarde</h3>
  <div class="grid2"><button class="btn" onclick="exportGame()">📤 Exporter</button><button class="btn" onclick="$('#imp').click()">📥 Importer</button></div>
  <input type="file" id="imp" accept="application/json,.json" hidden onchange="importGame(this.files[0])">
  <p class="hint">La partie est enregistrée sur ce téléphone. Si l'écran se verrouille, le marché rattrape le temps perdu.</p>
  <button class="btn btn-ghost btn-block mt-l down" onclick="confirmBox('Effacer la partie et tout recommencer ?',resetGame)">Nouvelle partie (tout effacer)</button>`;
}
function togglePause(){S.paused=!S.paused;S.lastReal=Date.now();addLog(S.paused?'Marché en pause':'Reprise des cotations','neutral',S.paused?'⏸':'▶️');save();render();publish()}
function extend(min,reopen){
  S.duration=Math.max(S.clock+5*60000,S.duration+min*60000);
  if(reopen){S.ended=false;S.lastReal=Date.now();addLog('Réouverture du marché','neutral','🔔')}
  save();render();publish();toast(`Durée totale : ${fmtDur(S.duration)}`);
}
function manualEvent(){ if(S.paused) return toast('Le marché est en pause'); fire(randomEvent()); scheduleNext(); save(); render(); publish() }
function resetGame(){ localStorage.removeItem(KEY); S=newGame(); Sync.close(); UI.tab='market'; render() }
function exportGame(){
  const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([JSON.stringify(S)],{type:'application/json'}));
  a.download=`boursepio-${new Date().toISOString().slice(0,16).replace(/[:T]/g,'-')}.json`; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),5000);
}
function importGame(f){
  if(!f) return; const r=new FileReader();
  r.onload=()=>{try{const s=JSON.parse(r.result);if(s.v!==3)throw 0;S=s;S.lastReal=Date.now();saveNow();if(S.started)Sync.connect(S.room);render();publish();toast('Partie importée')}catch(e){toast('Fichier invalide')}};
  r.readAsText(f);
}
