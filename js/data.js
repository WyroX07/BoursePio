'use strict';
/* Catalogue des actions. Toutes démarrent à 10 (× start).
   vol  = volatilité par √minute · drift = tendance par minute */
const CATALOG = [
  {id:'BART', name:'Bart',                 emoji:'🧔', color:'#60a5fa', vol:.010, drift:.0008, sector:'safe', tag:'Sûr',
   desc:'Le daron. Bouge peu, et monte quand tout le reste s\'écroule.'},
  {id:'MAIA', name:'Maia',                 emoji:'🐐', color:'#fbbf24', vol:.016, drift:.0022, sector:'safe', tag:'Régulier',
   desc:'La goat. La meilleure tendance de fond sur la soirée.'},
  {id:'FRIT', name:'Friterie de Lallaing', emoji:'🍟', color:'#fb923c', vol:.014, drift:.0010, sector:'safe', tag:'Sûr',
   desc:'Solide, avec des rushs de temps en temps.'},
  {id:'BKSH', name:'BlackShatta',          emoji:'🖤', color:'#a78bfa', vol:.030, drift:.0012, sector:'hype', tag:'Nerveux',
   desc:'Un truc de fou. Bonne tendance, mais ça secoue.'},
  {id:'THAK', name:'Thaki l\'homme poire', emoji:'🍐', color:'#a3e635', vol:.025, drift:.0004, sector:'hype', tag:'Nerveux',
   desc:'Personne ne sait vraiment. Ni lui.'},
  {id:'BRNR', name:'Les Brainrots',        emoji:'🧠', color:'#f472b6', vol:.030, drift:.0006, sector:'hype', tag:'Remontée', start:.6,
   desc:'Démarre bas. C\'est le moment de le faire remonter.'},
  {id:'SOLE', name:'Soledhie',             emoji:'😱', color:'#2dd4bf', vol:.030, drift:-.0030,sector:'hype', tag:'Montagnes russes',
   desc:'Glisse doucement… puis s\'envole d\'un coup et choque tout le monde.'},
  {id:'RAAL', name:'La RAAL',              emoji:'🎲', color:'#facc15', vol:.050, drift:.0003, sector:'raal', tag:'Imprévisible',
   desc:'Personne n\'a jamais rien prévu à la RAAL.'},
  {id:'AYMR', name:'Aymeric de la RAAL',   emoji:'🎢', color:'#f87171', vol:.070, drift:.0003, sector:'raal', tag:'Chaos',
   desc:'Giga instable. Le casino dans le casino.'},
];
const DEFAULT_PICK = ['BART','MAIA','BKSH','SOLE','AYMR'];
const SECTORS = {safe:'les valeurs sûres', hype:'la hype', raal:'la RAAL'};
const TEAM_COLORS = ['#60a5fa','#f472b6','#a3e635','#fb923c','#c084fc','#facc15','#2dd4bf','#f87171','#818cf8','#4ade80','#e879f9','#38bdf8'];
const FREQ = {calme:[6,10], normal:[3.5,7], chaos:[2,4]}; // minutes entre deux événements
const LEVERAGE = [
  {lev:1, label:'Prudent',   hint:'Suit le cours'},
  {lev:2, label:'Audacieux', hint:'Gains et pertes ×2'},
  {lev:5, label:'Fou',       hint:'×5 · liquidé vite'},
];

const GOOD = [
  '{n} a mis l\'ambiance toute la soirée',
  '{n} a gagné gros au casino',
  'Énorme buzz : tout le monde parle de {n}',
  '{n} a payé sa tournée sans qu\'on lui demande',
  'Un investisseur mystère achète massivement {n}',
  '{n} devient le sponsor officiel de la soirée',
  '{n} a enfin rendu l\'argent qu\'on lui avait prêté',
];
const BAD = [
  '{n} s\'est endormi sur le canapé avant minuit',
  'Scandale : {n} a mis de l\'ananas sur la pizza',
  '{n} a renversé sa bière sur le jeu de cartes',
  '{n} a raté le dernier bus',
  '{n} visé par une enquête pour triche au casino',
  '{n} a oublié de payer sa tournée',
  'Grosse embrouille autour de {n}',
];
const VERDICTS = [
  'Résultats trimestriels de {n}',
  'Le jury se prononce sur {n}',
  'Annonce officielle de {n}',
  'Révélation très attendue sur {n}',
];
