'use strict';
/* Interface de la banque : crée la partie, prend les mises, paie les encaissements, diffuse. */
const UI = {tab:'market'};
let V = null; // dernier snapshot

function liveClock(){ return S.clock + (S.started&&!S.paused&&!S.ended ? Math.min(Date.now()-S.lastReal, TICK_SEC*1000) : 0) }

function hostInit(){
  document.body.classList.add('mode-host');
  soundOn=S.settings.sound;
  Hooks.onEvent=ev=>{ if(!ev.minor) showEvent(ev,{auto:ev.ann?12000:8000}); if(ev.final){UI.tab='rank'} };
  Hooks.onMinor=m=>flashTape(m.tone);
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
  if(!S.started){ h.innerHTML=`<div class="hdr" style="padding-bottom:12px"><div class="mark">Bourse<i>Pio</i></div><span class="label">Nouvelle partie</span></div>`; return }
  const ph=phase(), live=Sync.status==='live';
  h.innerHTML=`<div class="hdr">
      <div><div class="mark">Bourse<i>Pio</i></div>
        <div class="meta"><span class="${ph.hot&&!S.ended?'hot':''}">${S.ended?'Clôturé':S.paused?'En pause':ph.name}</span><span class="dot ${live?'on':''}">${S.room}</span></div></div>
      <div class="clock"><b id="hclock">${S.ended?'0:00:00':fmtHMS(S.duration-liveClock())}</b><span>${S.ended?'Séance close':'Restant'}</span></div>
    </div>
    <div class="bar"><i style="transform:scaleX(${clamp(S.clock/S.duration,0,1)})"></i></div>
    <div class="tape">${tapeHtml(S.evs)}</div>`;
}
function renderNav(){
  const tabs=[['market','Marché'],['teams','Équipes'],['rank','Classement'],['share','Écrans'],['settings','Réglages']];
  $('#nav').innerHTML=tabs.map(([k,l])=>`<button class="${UI.tab===k?'on':''}" onclick="go('${k}')">${l}</button>`).join('');
}
function go(t){ UI.tab=t; window.scrollTo(0,0); render() }
function updateCounts(){
  const now=liveClock();
  document.querySelectorAll('[data-count]').forEach(el=>el.textContent=fmtCount(+el.dataset.count-now));
  const c=$('#hclock'); if(c&&S.started&&!S.ended) c.textContent=fmtHMS(S.duration-now);
  if(CASH) refreshCash();
}

/* ---------- configuration ---------- */
function viewSetup(){
  const d=S.duration/60000, st=S.settings;
  return `
  <section class="hero">
    <h1>La bourse<br>de la <i>soirée</i></h1>
    <p>Les équipes misent leurs tickets à la hausse ou à la baisse, avec un multiplicateur. Tu tiens la banque : l'appli calcule tout et l'affiche en direct sur le grand écran et les tels.</p>
  </section>
  <div class="sec"><span class="label">Équipes</span><span class="label">${S.teams.length}</span></div>
  ${S.teams.map(t=>`<div class="team-row">${swatch(t)}<span class="t-name" style="margin-left:10px">${esc(t.name)}</span><button class="x" onclick="removeTeam('${t.id}')" aria-label="Retirer">×</button></div>`).join('')}
  <div class="field-row"><input id="np" placeholder="Nom de l'équipe" maxlength="18" enterkeyhint="done" onkeydown="if(event.key==='Enter')addTeam()"><button class="btn" onclick="addTeam()">Ajouter</button></div>
  <div class="sec"><span class="label">Actions cotées</span><span class="label">${S.pick.length} sélectionnées</span></div>
  ${CATALOG.map(c=>`<button class="list-opt ${S.pick.includes(c.id)?'on':''}" style="--c:${c.color}" onclick="togglePick('${c.id}')">
      <span class="box"></span><span><span class="tk">${c.id}</span><span class="nm">${esc(c.name)}</span></span><span class="label">${c.tag}</span></button>`).join('')}
  <p class="note">4 à 6 actions, c'est l'idéal.</p>
  <div class="sec"><span class="label">Durée</span></div>
  <div class="seg">${[[60,'1h'],[120,'2h'],[180,'3h'],[240,'4h']].map(([m,l])=>`<button class="${d===m?'on':''}" onclick="S.duration=${m}*60000;save();render()">${l}</button>`).join('')}</div>
  <div class="sec"><span class="label">Événements</span></div>
  <div class="seg">${Object.entries(FREQ).map(([k,[a,b]])=>`<button class="${st.freq===k?'on':''}" onclick="S.settings.freq='${k}';save();render()">${k[0].toUpperCase()+k.slice(1)}<small>${a}–${b} min</small></button>`).join('')}</div>
  <button class="btn btn-brass btn-xl btn-block" style="margin-top:34px" onclick="doStart()">Ouvrir les marchés</button>
  <p class="note center">Code de la partie <span class="mono brass">${S.room}</span></p>`;
}
function togglePick(id){ S.pick=S.pick.includes(id)?S.pick.filter(x=>x!==id):[...S.pick,id]; save(); render() }
function doStart(){
  if(!S.teams.length) return toast('Ajoute au moins une équipe');
  if(S.pick.length<2) return toast('Choisis au moins 2 actions');
  startGame(); Sync.connect(S.room); unlockAudio(); requestWake(); UI.tab='market'; render(); publish();
}

/* ---------- marché ---------- */
function viewMarket(){
  return `
  ${V.ann.map(a=>annCard(a,V.stocks,liveClock())).join('')}
  <div class="sec"><span class="label">Cotations</span><span class="label">${S.ended?'Marché fermé':'Touche pour miser'}</span></div>
  ${V.stocks.map(s=>quoteRow(s,{onclick:S.ended?'':`betFromStock('${s.id}')`})).join('')}
  <p class="note">Cours en tickets par action. Variation depuis l'ouverture.</p>`;
}

/* ---------- équipes ---------- */
function viewTeams(){
  return `
  ${V.teams.length?V.teams.map(teamBlock).join(''):'<p class="note">Aucune équipe.</p>'}
  ${S.ended?'':`<div class="sec"><span class="label">Nouvelle équipe</span></div>
  <div class="field-row"><input id="np" placeholder="Nom de l'équipe" maxlength="18" enterkeyhint="done" onkeydown="if(event.key==='Enter')addTeam()"><button class="btn" onclick="addTeam()">Ajouter</button></div>`}`;
}
function teamBlock(t){
  const total=t.pos.reduce((s,p)=>s+Math.floor(p.value),0);
  return `<section class="team">
    <div class="t-head">${swatch(t)}<span class="t-name">${esc(t.name)}</span><b class="t-pnl ${tone(t.pnl)}">${fmtSigned(t.pnl)}</b></div>
    <div class="t-sub">Misé ${fmtT(t.in)} · encaissé ${fmtT(t.out)}</div>
    ${t.pos.length?`<div class="pos-list">${t.pos.map(p=>posRow(p,null,{action:`<button class="btn cash" onclick="openCash('${p.id}')">Encaisser</button>`})).join('')}</div>`:'<div style="height:14px"></div>'}
    ${S.ended
      ? (t.pos.length?`<button class="btn btn-up btn-block" onclick="cashAll('${t.id}')">Tout rendre · ${total} tickets</button>`:'')
      : `<button class="btn btn-line" onclick="openBet('${t.id}')">+ Nouvelle mise</button>`}
  </section>`;
}
function addTeam(){
  const i=$('#np'), n=(i?i.value:'').trim(); if(!n) return;
  if(S.teams.some(t=>t.name.toLowerCase()===n.toLowerCase())) return toast('Ce nom existe déjà');
  S.teams.push({id:uid(),name:n,color:TEAM_COLORS[S.teams.length%TEAM_COLORS.length],in:0,out:0});
  if(S.started) addLog(`${n} rejoint la partie`);
  i.value=''; i.blur(); save(); render(); publish();
  setTimeout(()=>{const x=$('#np');if(x&&!S.started)x.focus()},0);
}
function removeTeam(id){
  const t=team(id), go=()=>{S.teams=S.teams.filter(x=>x.id!==id);S.pos=S.pos.filter(p=>p.t!==id);save();render();publish()};
  if(S.pos.some(p=>p.t===id)) confirmBox(`${t.name} a encore des mises en cours. Supprimer ?`,go); else go();
}
function renameTeam(id){const t=team(id),n=prompt('Nouveau nom',t.name);if(n&&n.trim()){t.name=n.trim().slice(0,18);save();render();publish()}}

/* ---------- mise ---------- */
let BET=null;
function betFromStock(sid){
  if(!S.teams.length) return toast('Ajoute une équipe d\'abord');
  if(S.teams.length===1) return openBet(S.teams[0].id,sid);
  sheet(`<div class="sh"><div><span class="label">Miser sur ${sid}</span><h2>Quelle équipe ?</h2></div><button class="x" onclick="closeSheet()">×</button></div>
    ${V.teams.map(t=>`<button class="list-opt" style="grid-template-columns:12px 1fr" onclick="openBet('${t.id}','${sid}')">${swatch(t)}<span class="t-name" style="font-size:22px">${esc(t.name)}</span></button>`).join('')}`);
}
function openBet(tid,sid){
  BET={tid,sid:sid||null,dir:1,lev:1,amt:10};
  sheet('<div id="bet"></div>',{onClose:()=>{BET=null}});
  drawBet();
}
function drawBet(){
  const el=$('#bet'); if(!el||!BET) return;
  const t=team(BET.tid), st=BET.sid?stock(BET.sid):null, lock=st?canTrade(st.id):{ok:true};
  el.innerHTML=`
    <div class="sh"><div><span class="label">Nouvelle mise</span><h2>${esc(t.name)}</h2></div><button class="x" onclick="closeSheet()">×</button></div>
    <div class="step label">01 · Action</div>
    <div class="cells">${V.stocks.map(s=>`<button class="cell ${BET.sid===s.id?'on':''} ${s.locked?'locked':''}" onclick="BET.sid='${s.id}';drawBet()">
      <span class="tk">${s.id}</span><span>${fmtP(s.price)} <i class="${tone(s.mom)}" style="font-style:normal">${s.mom>=0?'▲':'▼'}</i></span></button>`).join('')}</div>
    ${st?`<p class="desc"><b style="color:var(--ink)">${esc(st.name)}</b> — ${esc(st.desc)}</p>`:''}
    <div class="step label">02 · Sens</div>
    <div class="dir"><button class="${BET.dir>0?'on d-up':''}" onclick="BET.dir=1;drawBet()">▲ Hausse<small>gagne si ça monte</small></button>
      <button class="${BET.dir<0?'on d-down':''}" onclick="BET.dir=-1;drawBet()">▼ Baisse<small>gagne si ça descend</small></button></div>
    <div class="step label">03 · Multiplicateur</div>
    <div class="seg">${LEVERAGE.map(l=>`<button class="${BET.lev===l.lev?'on':''}" onclick="BET.lev=${l.lev};drawBet()">×${l.lev}<small>${l.label}</small></button>`).join('')}</div>
    <div class="step label">04 · Tickets</div>
    <div class="stepper"><button class="x" onclick="setAmt(-1)">−</button>
      <input id="amt" type="number" inputmode="numeric" value="${BET.amt}" oninput="BET.amt=Math.max(0,parseInt(this.value)||0);drawScenario()">
      <button class="x" onclick="setAmt(1)">+</button></div>
    <div class="chips" style="margin-top:12px">${[5,10,20,50].map(n=>`<button class="opt ${BET.amt===n?'on':''}" style="flex:1" onclick="BET.amt=${n};drawBet()">${n}</button>`).join('')}</div>
    <div id="scn"></div>
    <button class="btn btn-brass btn-xl btn-block" ${!st||!lock.ok||!BET.amt?'disabled':''} onclick="confirmBet()">
      ${!st?'Choisis une action':!lock.ok?lock.why:`Prendre ${BET.amt} ticket${BET.amt>1?'s':''}`}</button>`;
  drawScenario();
}
function drawScenario(){
  const el=$('#scn'); if(!el||!BET) return;
  const st=BET.sid?stock(BET.sid):null; if(!st){el.innerHTML='';return}
  const stake=BET.amt*(1-S.settings.fee/100), val=x=>Math.max(0,Math.floor(stake*(1+BET.dir*BET.lev*x)));
  const liq=BET.lev>1||BET.dir<0?(BET.dir>0?st.price*(1-1/BET.lev):st.price*(1+1/BET.lev)):null;
  el.innerHTML=`<div class="scn">
      <div><span>Si ${st.id} +20 %</span><b class="${tone(val(.2)-BET.amt)}">${val(.2)} tickets</b></div>
      <div><span>Si ${st.id} −20 %</span><b class="${tone(val(-.2)-BET.amt)}">${val(-.2)} tickets</b></div>
      <div><span>Liquidation</span><b>${liq?(BET.dir>0?'cours ≤ ':'cours ≥ ')+fmtP(liq):'jamais'}</b></div>
      ${S.settings.fee?`<div><span>Frais inclus</span><b>${S.settings.fee} %</b></div>`:''}
    </div>`;
}
function setAmt(d){BET.amt=Math.max(1,(BET.amt||0)+d);const a=$('#amt');if(a)a.value=BET.amt;drawScenario()}
function confirmBet(){
  const b=BET, t=team(b.tid), r=openPos(b.tid,b.sid,b.dir,b.lev,b.amt);
  if(r.err) return toast(r.err);
  closeSheet(); buzz('good');
  toast(`Prends ${b.amt} ticket${b.amt>1?'s':''} à ${t.name}`,{label:'Annuler',fn:()=>{undo();toast('Mise annulée, rends les tickets')}});
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
  if(!p){ el.innerHTML=`<div class="sh"><h2>Mise liquidée</h2><button class="x" onclick="closeSheet()">×</button></div><p class="note">Elle vient de tomber à zéro.</p>`; return }
  const t=team(p.t), g=CASH.amount-p.paid;
  el.innerHTML=`
    <div class="sh"><div><span class="label">Encaissement</span><h2>${esc(t.name)}</h2></div><button class="x" onclick="closeSheet()">×</button></div>
    <div class="ticket cash-t">
      <div class="tk-top"><span>${p.s} ${p.dir>0?'▲':'▼'} ×${p.lev}</span><span>misé ${p.paid}</span></div>
      <div class="perf"></div>
      <div class="tk-body"><div class="label" style="color:#6d6555">Rends</div><div class="cash-n">${CASH.amount}</div><div class="cash-u">ticket${CASH.amount>1?'s':''}</div>
        <div class="mono ${tone(g)}" style="margin-top:8px;font-weight:600">${fmtSigned(g)} sur la mise</div></div>
      <div class="lock"><i id="lockbar"></i></div><div class="lock-t" id="locktxt"></div>
    </div>
    <button id="cashok" class="btn btn-up btn-xl btn-block" onclick="confirmCash()">J'ai rendu ${CASH.amount} tickets</button>`;
  refreshCash();
}
function refreshCash(){
  if(!CASH) return;
  const left=QUOTE_MS-(Date.now()-CASH.at), bar=$('#lockbar'), txt=$('#locktxt'), ok=$('#cashok');
  if(!bar) return;
  bar.style.transform=`scaleX(${clamp(left/QUOTE_MS,0,1)})`;
  if(left>0){ txt.textContent=`Montant bloqué ${Math.ceil(left/1000)} s, même si le cours bouge` }
  else { txt.textContent='Montant expiré'; ok.textContent='Recalculer au cours actuel'; ok.className='btn btn-xl btn-block'; ok.onclick=()=>{CASH=quote(CASH.pid);drawCash()} }
}
function confirmCash(){
  const q=CASH, r=closePos(q); if(r.err) return toast(r.err);
  closeSheet(); buzz('good');
  toast(`${q.amount} tickets rendus`,{label:'Annuler',fn:()=>{undo();toast('Encaissement annulé, reprends les tickets')}});
}
function cashAll(tid){
  const t=team(tid), qs=S.pos.filter(p=>p.t===tid).map(p=>quote(p.id)), total=qs.reduce((s,q)=>s+q.amount,0);
  confirmBox(`Rendre ${total} tickets à ${t.name} ?`,()=>{qs.forEach(q=>closePos(q));toast(`${total} tickets rendus à ${t.name}`)},{ok:'C\'est fait',danger:false});
}
function refreshSheet(){ if(BET) drawScenario(); }

/* ---------- classement ---------- */
function viewRank(){
  return `
  ${S.ended?`<div class="ann"><span class="label">Séance terminée</span><div class="ann-t">Rends les tickets</div><div class="ann-s">Onglet Équipes → « Tout rendre » pour chaque équipe.</div></div>`:''}
  <div class="sec"><span class="label">Classement</span><span class="label">Bilan</span></div>
  ${rankList(V.teams)}
  <p class="note">Bilan = encaissé + valeur des mises en cours − misé.</p>
  <div class="sec"><span class="label">Journal</span></div>
  ${S.log.slice(0,60).map(l=>`<div class="log"><span class="t">${fmtClock(l.c)}</span><span class="${l.t==='good'?'up':l.t==='bad'?'down':''}">${esc(l.text)}</span></div>`).join('')||'<p class="note">Vide.</p>'}`;
}

/* ---------- écrans ---------- */
function viewShare(){
  const live=Sync.status==='live', url=viewerUrl(S.room);
  return `
  <div class="sec"><span class="label">Tels des joueurs</span><span class="dot ${live?'on':''} label">${live?'En direct':'Hors-ligne'}</span></div>
  <div class="qr-block">${qrSvg(url)}<div><h2>Scanne & suis</h2><p>Cours, classement et mises de ton équipe en direct. Rien à installer.</p></div></div>
  ${live?'':'<p class="note">Pas de réseau pour l\'instant : les écrans reprendront tout seuls.</p>'}
  <div class="sec"><span class="label">Grand écran</span></div>
  <p class="note" style="margin-top:0">Sur le PC branché à la télé :</p>
  <div class="url">${esc(tvUrl(S.room).replace(/^https?:\/\//,''))}</div>
  <div class="grid2"><button class="btn" onclick="copy('${tvUrl(S.room)}')">Copier</button><button class="btn" onclick="window.open('${tvUrl(S.room)}','_blank')">Ouvrir ici</button></div>`;
}
function copy(t){ navigator.clipboard&&navigator.clipboard.writeText(t).then(()=>toast('Lien copié'),()=>prompt('Copie ce lien',t)) }

/* ---------- réglages ---------- */
function viewSettings(){
  const s=S.settings;
  return `
  <div class="sec"><span class="label">Partie</span></div>
  ${S.ended?`<button class="btn btn-brass btn-block" onclick="extend(30,true)">Rouvrir le marché +30 min</button>`:`
  <div class="grid2">
    <button class="btn ${S.paused?'btn-up':''}" onclick="togglePause()">${S.paused?'Reprendre':'Pause'}</button>
    <button class="btn" onclick="manualEvent()">Événement</button>
    <button class="btn" onclick="extend(30)">+30 min</button>
    <button class="btn" onclick="extend(-15)">−15 min</button>
  </div>
  <button class="btn btn-quiet btn-block down" style="margin-top:8px" onclick="confirmBox('Clôturer la séance maintenant ?',()=>{endGame();render();publish()})">Clôturer maintenant</button>`}
  <div class="sec"><span class="label">Réglages</span></div>
  <div class="field"><span class="label">Fréquence des événements</span>
    <div class="seg">${Object.keys(FREQ).map(k=>`<button class="${s.freq===k?'on':''}" onclick="S.settings.freq='${k}';scheduleNext();save();render()">${k[0].toUpperCase()+k.slice(1)}</button>`).join('')}</div></div>
  <div class="field"><span class="label">Frais par mise</span>
    <div class="seg">${[0,5,10].map(f=>`<button class="${s.fee===f?'on':''}" onclick="S.settings.fee=${f};save();render()">${f} %</button>`).join('')}</div></div>
  <label class="toggle"><span>Son des événements</span><input type="checkbox" ${s.sound?'checked':''} onchange="S.settings.sound=soundOn=this.checked;save()"></label>
  <label class="toggle"><span>Garder l'écran allumé</span><input type="checkbox" ${s.wake?'checked':''} onchange="S.settings.wake=this.checked;save();if(this.checked)requestWake();else if(wake)wake.release()"></label>
  <div class="sec"><span class="label">Équipes</span></div>
  ${S.teams.map(t=>`<div class="team-row">${swatch(t)}<span class="t-name" style="margin-left:10px">${esc(t.name)}</span><span style="display:flex;gap:8px"><button class="x" onclick="renameTeam('${t.id}')" aria-label="Renommer">✎</button><button class="x" onclick="removeTeam('${t.id}')" aria-label="Supprimer">×</button></span></div>`).join('')||'<p class="note">Aucune.</p>'}
  <div class="sec"><span class="label">Sauvegarde</span></div>
  <div class="grid2"><button class="btn" onclick="exportGame()">Exporter</button><button class="btn" onclick="$('#imp').click()">Importer</button></div>
  <input type="file" id="imp" accept="application/json,.json" hidden onchange="importGame(this.files[0])">
  <p class="note">La partie est enregistrée sur ce téléphone. Si l'écran se verrouille, le marché rattrape le temps perdu.</p>
  <button class="btn btn-quiet btn-block down" style="margin-top:26px" onclick="confirmBox('Effacer la partie et tout recommencer ?',resetGame)">Nouvelle partie</button>`;
}
function togglePause(){S.paused=!S.paused;S.lastReal=Date.now();addLog(S.paused?'Marché en pause':'Reprise des cotations');save();render();publish()}
function extend(min,reopen){
  S.duration=Math.max(S.clock+5*60000,S.duration+min*60000);
  if(reopen){S.ended=false;S.lastReal=Date.now();addLog('Réouverture du marché')}
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
