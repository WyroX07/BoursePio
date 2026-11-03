'use strict';
/* Moteur du jeu (uniquement sur l'appareil de la banque).
   Tout l'état vit dans S et est sauvegardé dans localStorage. */
const KEY = 'boursepio.v3';
const TICK_SEC = 4;
const MAX_HIST = 2000;
const LOCK_MS = 30000;      // paris gelés avant une annonce
const QUOTE_MS = 45000;     // durée de blocage d'un montant à encaisser

let S = loadGame();
const Hooks = {onEvent(){}, onMinor(){}, onChange(){}};

function newGame(){
  return {
    v:3, id:uid(), room:roomCode(), started:false, ended:false, paused:false,
    clock:0, lastReal:Date.now(), duration:180*60000, histEvery:1, tickCount:0,
    settings:{freq:'normal', fee:0, sound:true, wake:true},
    pick:[...DEFAULT_PICK], stocks:[], teams:[], pos:[],
    log:[], evs:[], evSeq:0, pending:[], nextEventAt:0, undo:null,
  };
}
function roomCode(){const a='ABCDEFGHJKMNPQRSTUVWXYZ23456789';let s='';for(let i=0;i<5;i++)s+=a[Math.floor(Math.random()*a.length)];return s}
function loadGame(){try{const s=JSON.parse(localStorage.getItem(KEY));if(s&&s.v===3)return s}catch(e){}return newGame()}
let saveT=null;
function save(){clearTimeout(saveT);saveT=setTimeout(saveNow,250)}
function saveNow(){clearTimeout(saveT);try{localStorage.setItem(KEY,JSON.stringify(S))}catch(e){}}

const stock = id => S.stocks.find(s=>s.id===id);
const team = id => S.teams.find(t=>t.id===id);
const has = id => !!stock(id);
function addLog(text,t='neutral',icon=''){S.log.unshift({c:S.clock,text,t,icon});if(S.log.length>400)S.log.length=400}

/* ---------- phases ---------- */
function phase(){
  const p=S.clock/S.duration;
  if(p<.06) return {name:'Ouverture', vol:.8, ev:1.2, hot:false};
  if(p<.72) return {name:'Séance', vol:1, ev:1, hot:false};
  if(p<.92) return {name:'Heure de folie', vol:1.5, ev:.6, hot:true};
  return {name:'Sprint final', vol:2, ev:.45, hot:true};
}

/* ---------- prix ---------- */
function jump(st,pct,keep=.6){
  // hausse/baisse symétriques en log : +25 % puis −25 % ≈ retour au départ
  const f=pct>=0?1+pct:1/(1-pct);
  st.price=clamp(st.price*f,.1,st.base*30);
  st.base=Math.max(.5,st.base*Math.pow(f,keep));
  return f-1;
}
function addEffect(st,min,{drift=0,vol=1}){st.effects.push({until:S.clock+min*60000,drift,vol})}
function effects(st){let d=0,v=1,until=0;for(const e of st.effects)if(e.until>S.clock){d+=e.drift;v*=e.vol;until=Math.max(until,e.until)}return {d,v,until}}

function step(){
  const dt=TICK_SEC/60, ph=phase();
  S.clock+=TICK_SEC*1000; S.tickCount++;
  for(const st of S.stocks){
    st.effects=st.effects.filter(e=>e.until>S.clock);
    const ef=effects(st);
    const rev=-0.012*Math.log(st.price/st.base);   // rappel vers la valeur de fond
    const r=(st.drift+ef.d+rev)*dt + st.vol*ef.v*ph.vol*Math.sqrt(dt)*gauss();
    st.price=clamp(st.price*Math.exp(r),.1,st.base*30);
    st.base=Math.max(.5,st.base*Math.exp(.3*st.vol*Math.sqrt(dt)*gauss()));
  }
  if(S.tickCount%S.histEvery===0){
    for(const st of S.stocks) st.hist.push(Math.round(st.price*1000)/1000);
    if(S.stocks[0].hist.length>MAX_HIST){for(const st of S.stocks)st.hist=st.hist.filter((_,i)=>i%2===0);S.histEvery*=2}
  }
  checkLiquidations();
  const due=S.pending.filter(p=>p.at<=S.clock); S.pending=S.pending.filter(p=>p.at>S.clock);
  for(const p of due) fire(resolvePending(p));
  if(S.clock>=S.nextEventAt){fire(randomEvent());scheduleNext()}
  if(S.clock>=S.duration) endGame();
}
function scheduleNext(){const [a,b]=FREQ[S.settings.freq];S.nextEventAt=S.clock+rnd(a,b)*phase().ev*60000}

function tick(){
  const now=Date.now();
  if(!S.started||S.ended||S.paused){S.lastReal=now;return 0}
  let n=0;
  while(now-S.lastReal>=TICK_SEC*1000&&n<3600&&!S.ended){S.lastReal+=TICK_SEC*1000;step();n++}
  if(n>=3600) S.lastReal=now;
  if(n) save();
  return n;
}

/* ---------- positions ---------- */
function liqPrice(p){return p.dir>0 ? p.entry*(1-1/p.lev) : p.entry*(1+1/p.lev)}
function posValue(p){const r=stock(p.s).price/p.entry;return Math.max(0,p.stake*(1+p.dir*p.lev*(r-1)))}
function teamValue(t){return S.pos.filter(p=>p.t===t.id).reduce((s,p)=>s+posValue(p),0)}
function ranking(){
  return S.teams.map(t=>{const v=teamValue(t);return {t,value:v,pnl:v+t.out-t.in}}).sort((a,b)=>b.pnl-a.pnl||b.value-a.value);
}
function canTrade(sid){
  if(!S.started||S.ended) return {ok:false,why:'Marché fermé'};
  const v=S.pending.find(p=>p.kind==='verdict'&&p.id===sid&&p.at-S.clock<=LOCK_MS);
  if(v) return {ok:false,why:'Paris gelés : annonce imminente'};
  return {ok:true};
}
function snapUndo(label){S.undo={label,pos:JSON.stringify(S.pos),teams:JSON.stringify(S.teams)}}
function openPos(tid,sid,dir,lev,tickets){
  const c=canTrade(sid); if(!c.ok) return {err:c.why};
  const t=team(tid), st=stock(sid);
  snapUndo('mise');
  const stake=tickets*(1-S.settings.fee/100);
  const p={id:uid(),t:tid,s:sid,dir,lev,paid:tickets,stake,entry:st.price,at:S.clock};
  S.pos.push(p); t.in+=tickets;
  addLog(`${t.name} mise ${tickets} sur ${st.emoji} ${st.name} (${dir>0?'hausse':'baisse'} ×${lev})`,'neutral','🟢');
  save(); Hooks.onChange(); return {pos:p};
}
function quote(pid){const p=S.pos.find(x=>x.id===pid);return p?{pid,amount:Math.floor(posValue(p)),at:Date.now(),clock:S.clock}:null}
function closePos(q){
  const p=S.pos.find(x=>x.id===q.pid); if(!p) return {err:'Position introuvable (liquidée ?)'};
  if(Date.now()-q.at>QUOTE_MS) return {err:'Montant expiré, recalcule'};
  const t=team(p.t), st=stock(p.s);
  snapUndo('encaissement');
  S.pos=S.pos.filter(x=>x!==p); t.out+=q.amount;
  addLog(`${t.name} encaisse ${q.amount} sur ${st.emoji} ${st.name} (misé ${p.paid})`,'neutral','💸');
  save(); Hooks.onChange(); return {ok:true};
}
function undo(){
  const u=S.undo; if(!u) return;
  S.pos=JSON.parse(u.pos); S.teams=JSON.parse(u.teams); S.undo=null;
  addLog(`↩️ Dernière ${u.label} annulée`);
  save(); Hooks.onChange();
}
function checkLiquidations(){
  for(const p of [...S.pos]){
    if(posValue(p)>0) continue;
    const t=team(p.t), st=stock(p.s);
    S.pos=S.pos.filter(x=>x!==p);
    const txt=`${t.name} perd ses ${p.paid} tickets sur ${st.emoji} ${st.name} (${p.dir>0?'hausse':'baisse'} ×${p.lev})`;
    addLog('Liquidé : '+txt,'bad','💀');
    Hooks.onMinor({icon:'💀',text:'LIQUIDÉ — '+txt,tone:'bad'});
    pushEv({tone:'bad',icon:'💀',title:'Liquidé',text:txt,minor:true});
  }
}

/* ---------- événements ---------- */
function pushEv(ev){ev.id=++S.evSeq;ev.c=S.clock;S.evs.push(ev);if(S.evs.length>30)S.evs.shift();return ev}
function fire(ev){
  if(!ev) return;
  pushEv(ev);
  addLog(`${ev.title} — ${ev.text.replace(/\n/g,' ')}`,ev.tone,ev.icon);
  Hooks.onEvent(ev);
}
const pctTxt = p => `${p>=0?'📈 +':'📉 −'}${Math.round(Math.abs(p)*100)} %`;
const soft = st => st.sector==='safe'?.5:1;
const risky = () => S.stocks.filter(s=>s.vol>=.025);
const refuge = () => stock('BART') || [...S.stocks].sort((a,b)=>a.vol-b.vol)[0];

const EVENTS = [
  {w:16, run(){const st=pick(S.stocks), p=jump(st,rnd(.15,.4)*soft(st)); addEffect(st,rnd(4,8),{drift:.006});
     return {tone:'good',icon:st.emoji,title:'Bonne nouvelle !',text:pick(GOOD).replace('{n}',st.name),s:st.id,delta:p}}},
  {w:16, run(){const st=pick(S.stocks), p=jump(st,-rnd(.15,.4)*soft(st)); addEffect(st,rnd(4,8),{drift:-.006});
     return {tone:'bad',icon:st.emoji,title:'Mauvaise nouvelle…',text:pick(BAD).replace('{n}',st.name),s:st.id,delta:p}}},
  {w:12, cond:()=>!S.pending.some(p=>p.kind==='verdict'), run(){const st=pick(S.stocks), at=S.clock+rnd(2.5,4)*60000, label=pick(VERDICTS).replace('{n}',st.name);
     S.pending.push({kind:'verdict',id:st.id,at,label});
     return {tone:'neutral',ann:true,icon:'📣',title:'Annonce à venir',text:`${label} dans ${fmtCount(at-S.clock)}.\nÇa va bouger très fort : hausse ou baisse ?\nLes paris sur ${st.name} se gèlent 30 s avant.`,s:st.id}}},
  {w:4, run(){const r=refuge(); S.stocks.forEach(s=>{if(s===r) jump(s,rnd(.1,.25)); else jump(s,-rnd(.2,.4)*soft(s),.5)});
     return {tone:'bad',icon:'💥',title:'KRACH',text:`Tout le marché s'effondre !\nSeul ${r.emoji} ${r.name} tient bon.`}}},
  {w:4, run(){const m=rnd(5,8); S.stocks.forEach(s=>addEffect(s,m,{drift:.02}));
     return {tone:'good',icon:'🐂',title:'Euphorie',text:`Tout le marché grimpe pendant ~${Math.round(m)} minutes. Les paris à la hausse sont rois.`}}},
  {w:4, run(){const m=rnd(5,8); S.stocks.forEach(s=>addEffect(s,m,{drift:-.02}));
     return {tone:'bad',icon:'🐻',title:'Marché baissier',text:`Tout glisse pendant ~${Math.round(m)} minutes. Le moment de parier à la baisse ?`}}},
  {w:5, run(){const st=pick(risky().length?risky():S.stocks); addEffect(st,8,{vol:3});
     return {tone:'neutral',icon:'🌪️',title:'Tempête',text:`${st.emoji} ${st.name} devient incontrôlable pendant 8 minutes. Les ×5 vont souffrir.`,s:st.id}}},
  {w:8, run(){const st=pick(S.stocks), dir=Math.random()<.5?1:-1;
     S.pending.push({kind:'rumor',id:st.id,at:S.clock+rnd(2,4)*60000,dir,truth:Math.random()<.65});
     return {tone:'neutral',icon:'🤫',title:'Rumeur…',text:`On raconte que ${st.emoji} ${st.name} va ${dir>0?'EXPLOSER':'S\'EFFONDRER'} d'ici quelques minutes.\nInfo ou intox ?`,s:st.id}}},
  {w:6, run(){const longs=S.pos.filter(p=>p.dir>0); const st=longs.length?stock(pick(longs).s):pick(S.stocks); const pct=rint(15,30)/100;
     const ps=S.pos.filter(p=>p.s===st.id&&p.dir>0); ps.forEach(p=>p.stake*=1+pct);
     const names=[...new Set(ps.map(p=>team(p.t).name))];
     return {tone:'good',icon:'💰',title:'Dividende',text:`${st.emoji} ${st.name} récompense ses fidèles : +${Math.round(pct*100)} % sur les mises à la hausse.\n${names.length?'Gagnants : '+names.join(', '):'Personne n\'en profite…'}`,s:st.id}}},
  {w:2, run(){const st=pick(risky().length?risky():S.stocks), p=jump(st,rnd(.5,1),.6);
     return {tone:'good',icon:'🤝',title:'OPA surprise',text:`Un géant américain rachète ${st.name}.`,s:st.id,delta:p}}},
  {w:2, cond:()=>risky().length>0, run(){const st=pick(risky()), p=jump(st,-5.5,.7);
     if(Math.random()<.6) S.pending.push({kind:'rescue',id:st.id,at:S.clock+rnd(3,6)*60000});
     return {tone:'bad',icon:'☠️',title:'FAILLITE',text:`${st.emoji} ${st.name} est en cessation de paiement.\nUn repreneur va-t-il se manifester ?`,s:st.id,delta:p}}},
  {w:3, cond:()=>S.pos.length>0, run(){const p=pick(S.pos), t=team(p.t), st=stock(p.s);
     if(Math.random()<.5){p.stake*=2; return {tone:'good',icon:'🎰',title:'Double ou rien : DOUBLE',text:`La mise de ${t.name} sur ${st.emoji} ${st.name} vient de doubler !`}}
     S.pos=S.pos.filter(x=>x!==p); addLog(`${t.name} perd ${p.paid} tickets (double ou rien)`,'bad','🎰');
     return {tone:'bad',icon:'🎰',title:'Double ou rien : RIEN',text:`La mise de ${t.name} sur ${st.emoji} ${st.name} part en fumée.`}}},
  {w:3, cond:()=>ranking().some(r=>r.value>0), run(){const r=ranking().filter(r=>r.value>0)[0];
     S.pos.filter(p=>p.t===r.t.id).forEach(p=>p.stake*=.8);
     return {tone:'bad',icon:'🕵️',title:'Contrôle fiscal',text:`Le fisc s'intéresse à l'équipe en tête…\n${r.t.name} perd 20 % sur toutes ses mises.`}}},
  {w:3, cond:()=>S.teams.length>1, run(){const r=ranking(), t=r[r.length-1].t, st=refuge();
     S.pos.push({id:uid(),t:t.id,s:st.id,dir:1,lev:2,paid:0,stake:8,entry:st.price,at:S.clock,gift:true});
     return {tone:'good',icon:'🎁',title:`${st.name} est généreux`,text:`Cadeau pour la dernière équipe :\n${t.name} reçoit une mise gratuite de 8 tickets sur ${st.emoji} ${st.name} (hausse ×2).`}}},
  {w:2, run(){S.stocks.forEach(s=>addEffect(s,4,{vol:.25}));
     return {tone:'neutral',icon:'☕',title:'Pause café',text:'Le marché se calme pendant 4 minutes. Le moment de placer ses pions.'}}},
  // événements liés aux actions de la bande
  {w:4, cond:()=>has('BRNR'), run(){const st=stock('BRNR'), p=jump(st,rnd(.5,1.2),.3);
     S.pending.push({kind:'dump',id:st.id,at:S.clock+rnd(3,6)*60000});
     return {tone:'good',icon:'🧠',title:'Brainrot viral',text:'Un TikTok des Brainrots fait 4 millions de vues.\n(Ça va durer… non ?)',s:st.id,delta:p}}},
  {w:3, cond:()=>has('BRNR'), run(){const st=stock('BRNR'), p=jump(st,rnd(.2,.35),.8); addEffect(st,8,{drift:.006});
     return {tone:'good',icon:'🧠',title:'Le retour des Brainrots',text:'Les Brainrots reviennent à la mode, la remontée est lancée !',s:st.id,delta:p}}},
  {w:4, cond:()=>has('SOLE'), run(){const st=stock('SOLE'), p=jump(st,rnd(.8,2),.05);
     return {tone:'good',icon:'😱',title:'Soledhie choque tout le monde',text:'Personne ne comprend comment, mais ça s\'envole.\n(Ça ne durera pas…)',s:st.id,delta:p}}},
  {w:4, cond:()=>has('RAAL'), run(){const st=stock('RAAL'), p=jump(st,rnd(.3,.7)*(Math.random()<.5?1:-1),.5);
     return {tone:p>0?'good':'bad',icon:'🎲',title:'La RAAL fait n\'importe quoi',text:'Personne n\'avait prévu ça, comme d\'hab.',s:st.id,delta:p}}},
  {w:4, cond:()=>has('AYMR'), run(){const st=stock('AYMR'); addEffect(st,6,{vol:2.5}); const p=jump(st,rnd(.35,.8)*(Math.random()<.5?1:-1),.5);
     return {tone:p>0?'good':'bad',icon:'🎢',title:'Aymeric a encore frappé',text:'Et ça part en vrille pendant 6 minutes.',s:st.id,delta:p}}},
  {w:3, cond:()=>has('MAIA'), run(){const st=stock('MAIA'), p=jump(st,rnd(.15,.3),.9);
     return {tone:'good',icon:'🐐',title:'Maia reste la goat',text:'Était-ce encore à prouver ?',s:st.id,delta:p}}},
  {w:2, cond:()=>has('FRIT'), run(){const st=stock('FRIT'), p=jump(st,rnd(.15,.3),.8); addEffect(st,6,{drift:.006});
     return {tone:'good',icon:'🍟',title:'Rush à la friterie',text:'Tout Lallaing fait la queue pour une mitraillette.',s:st.id,delta:p}}},
  {w:3, cond:()=>has('BART'), run(){const st=stock('BART'), p=jump(st,-rnd(.15,.25),.6);
     return {tone:'bad',icon:'🧔',title:'Bart s\'est endormi devant le foot',text:'Même les darons ont leurs mauvais jours.',s:st.id,delta:p}}},
];
function randomEvent(){return weighted(EVENTS.filter(e=>!e.cond||e.cond())).run()}
function resolvePending(p){
  const st=stock(p.id); if(!st) return null;
  if(p.kind==='verdict'){
    const dir=Math.random()<.5?1:-1, v=jump(st,dir*rnd(.35,.8)*soft(st),.7);
    addEffect(st,4,{drift:.006*dir});
    return {tone:dir>0?'good':'bad',icon:dir>0?'🚀':'🪦',title:dir>0?'Verdict : ÇA EXPLOSE':'Verdict : LA CHUTE',text:p.label,s:st.id,delta:v};
  }
  if(p.kind==='rumor'){
    if(p.truth){const v=jump(st,rnd(.25,.5)*p.dir);addEffect(st,4,{drift:.006*p.dir});
      return {tone:v>0?'good':'bad',icon:'✅',title:'La rumeur était vraie',text:`${st.emoji} ${st.name}`,s:st.id,delta:v}}
    const v=jump(st,-rnd(.08,.18)*p.dir);
    return {tone:'neutral',icon:'❌',title:'Intox !',text:`La rumeur sur ${st.emoji} ${st.name} était fausse.`,s:st.id,delta:v};
  }
  if(p.kind==='rescue'){const v=jump(st,rnd(.8,1.5),.6);
    return {tone:'good',icon:'🦸',title:'Sauvetage',text:`Un repreneur relance ${st.emoji} ${st.name} !`,s:st.id,delta:v}}
  if(p.kind==='dump'){const v=jump(st,-rnd(.5,1),.6);
    return {tone:'bad',icon:'🪂',title:'Pump & dump',text:`Les gros portefeuilles ont tout revendu : ${st.emoji} ${st.name} s'écroule.`,s:st.id,delta:v}}
}

/* ---------- cycle de partie ---------- */
function startGame(){
  S.stocks=CATALOG.filter(c=>S.pick.includes(c.id)).map(c=>{const p=10*(c.start||1);return {...c,price:p,base:10,open:p,hist:[p],effects:[]}});
  S.started=true; S.clock=0; S.lastReal=Date.now();
  scheduleNext(); S.nextEventAt=Math.min(S.nextEventAt,2*60000);
  fire({tone:'neutral',icon:'🔔',title:'Ouverture des marchés',text:`La séance dure ${fmtDur(S.duration)}.\nMisez à la hausse ou à la baisse… et encaissez au bon moment.`});
  saveNow();
}
function endGame(){
  if(S.ended) return;
  S.ended=true; addLog('Clôture de la séance','neutral','🔔');
  fire({tone:'neutral',icon:'🔔',title:'Clôture des marchés',text:'La séance est terminée ! Chaque équipe récupère la valeur de ses mises.',final:true});
  saveNow();
}

/* ---------- snapshot diffusé aux écrans ---------- */
function downsample(a,n){if(a.length<=n)return a;const o=[];for(let i=0;i<n;i++)o.push(a[Math.round(i*(a.length-1)/(n-1))]);return o}
function stockTags(st){
  const tags=[], ef=effects(st), m=Math.max(1,Math.ceil((ef.until-S.clock)/60000));
  if(ef.d>.003) tags.push({t:'up',icon:'🐂',label:`Élan haussier · ${m} min`});
  else if(ef.d<-.003) tags.push({t:'down',icon:'🐻',label:`Pression baissière · ${m} min`});
  if(ef.v>1.5) tags.push({t:'warn',icon:'🌪️',label:`Instable · ${m} min`});
  else if(ef.v<.6) tags.push({t:'calm',icon:'☕',label:'Calme'});
  if(S.pending.some(p=>p.kind==='rumor'&&p.id===st.id)) tags.push({t:'warn',icon:'🤫',label:'Rumeur'});
  if(S.pending.some(p=>p.kind==='verdict'&&p.id===st.id)) tags.push({t:'ann',icon:'📣',label:'Annonce imminente'});
  return tags;
}
function snapshot(){
  const ppm=60/(TICK_SEC*S.histEvery);
  return {
    v:3, gid:S.id, room:S.room, at:Date.now(), started:S.started, ended:S.ended, paused:S.paused,
    clock:S.clock, dur:S.duration, phase:S.started?{name:phase().name,hot:phase().hot}:null,
    stocks:S.stocks.map(st=>{const h=st.hist, ago=h[Math.max(0,h.length-1-Math.round(5*ppm))]||st.open;
      return {id:st.id,name:st.name,emoji:st.emoji,color:st.color,tag:st.tag,desc:st.desc,
        price:st.price,open:st.open,chg:st.price/st.open-1,mom:st.price/ago-1,hist:downsample(h,160),
        tags:stockTags(st),locked:S.started&&!S.ended&&!canTrade(st.id).ok}}),
    teams:ranking().map(r=>({id:r.t.id,name:r.t.name,color:r.t.color,in:r.t.in,out:r.t.out,value:r.value,pnl:r.pnl,
      pos:S.pos.filter(p=>p.t===r.t.id).map(p=>({id:p.id,s:p.s,dir:p.dir,lev:p.lev,paid:p.paid,entry:p.entry,value:posValue(p),liq:liqPrice(p)}))})),
    evs:S.evs.slice(-8),
    ann:S.pending.filter(p=>p.kind==='verdict').map(p=>({s:p.id,at:p.at,label:p.label})),
  };
}
