'use strict';
/* Diffusion en direct : la banque publie l'état, les écrans s'abonnent.
   - Relais MQTT publics et gratuits (sans compte), publication sur les deux pour la redondance.
     Le message est "retenu" : un écran qui arrive reçoit tout de suite le dernier état.
   - BroadcastChannel : même navigateur (ex. PC = banque + onglet grand écran), marche hors-ligne. */
const BROKERS = new URLSearchParams(location.search).get('broker')
  ? [new URLSearchParams(location.search).get('broker')]
  : ['wss://broker.emqx.io:8084/mqtt', 'wss://broker.hivemq.com:8884/mqtt'];
const PUBLIC_URL = 'https://wyrox07.github.io/BoursePio/';

const Sync = {
  clients: [], bc: null, room: null, onSnap: null, last: 0, status: 'off', listeners: [],
  topic(room){ return `boursepio/v3/${room}` },
  connect(room, {subscribe=false}={}){
    if(this.room===room && this.clients.length) return;
    this.close(); this.room=room;
    try{ this.bc=new BroadcastChannel('boursepio-'+room);
      if(subscribe) this.bc.onmessage=e=>this.receive(e.data) }catch(e){}
    if(typeof mqtt==='undefined') return this.setStatus();
    for(const url of BROKERS){
      let c;
      try{ c=mqtt.connect(url,{clientId:'bp_'+uid(),keepalive:30,reconnectPeriod:4000,connectTimeout:8000,clean:true}) }catch(e){ continue }
      c.on('connect',()=>{ if(subscribe) c.subscribe(this.topic(room),{qos:0}); this.setStatus(); if(this.pending) this.flush() });
      c.on('close',()=>this.setStatus());
      c.on('offline',()=>this.setStatus());
      c.on('error',()=>{});
      if(subscribe) c.on('message',(_t,buf)=>this.receive(new TextDecoder().decode(buf)));
      this.clients.push(c);
    }
    this.setStatus();
  },
  close(){ this.clients.forEach(c=>{try{c.end(true)}catch(e){}}); this.clients=[]; if(this.bc){this.bc.close();this.bc=null} },
  online(){ return this.clients.some(c=>c.connected) },
  setStatus(){ const s=this.online()?'live':'off'; if(s!==this.status){this.status=s;this.listeners.forEach(f=>f(s))} },
  publish(snap){ this.pending=JSON.stringify(snap); this.flush() },
  flush(){
    const m=this.pending; if(!m) return;
    if(this.bc) try{this.bc.postMessage(m)}catch(e){}
    for(const c of this.clients) if(c.connected) c.publish(this.topic(this.room),m,{qos:0,retain:true});
  },
  receive(m){
    let s; try{ s=typeof m==='string'?JSON.parse(m):m }catch(e){ return }
    if(!s||s.v!==3) return;
    if(s.at<this.last) return;      // plus ancien que ce qu'on a déjà (doublon des deux relais)
    this.last=s.at; this.lastRecv=Date.now();
    if(this.onSnap) this.onSnap(s);
  },
};

/* URL publique pour le QR. En local (serveur de dev), on récupère l'adresse réseau du PC. */
let BASE_URL = PUBLIC_URL;
(async()=>{
  if(!/^(localhost|127\.|192\.168\.|10\.|172\.)/.test(location.hostname)) { if(location.hostname.endsWith('github.io')) BASE_URL=location.origin+location.pathname.replace(/index\.html$/,''); return }
  try{ const r=await fetch('/__lan'); if(r.ok){ BASE_URL=(await r.json()).url } }catch(e){}
})();
const viewerUrl = room => `${BASE_URL}?room=${room}`;
const tvUrl = room => `${BASE_URL}?room=${room}&tv=1`;
