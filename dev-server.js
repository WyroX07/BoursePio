// Serveur de test local, sans dépendance : `node dev-server.js` (ou `npm run dev`).
// - sert le dossier sur le port 5173, accessible depuis le PC et depuis un tel sur le même Wi-Fi
// - recharge automatiquement la page à chaque fichier modifié
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
const ROOT = __dirname, PORT = +process.env.PORT || 5173;
const TYPES = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8',
  '.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png','.svg':'image/svg+xml'};
const RELOAD = `<script>new EventSource('/__reload').onmessage=()=>location.reload()</script>`;
const clients = new Set();

function lanIp() {
  for (const list of Object.values(os.networkInterfaces()))
    for (const i of list || []) if (i.family === 'IPv4' && !i.internal) return i.address;
  return 'localhost';
}
const LAN = `http://${lanIp()}:${PORT}/`;

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/__reload') {
    res.writeHead(200, {'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive'});
    res.write(': ok\n\n'); clients.add(res); req.on('close', () => clients.delete(res)); return;
  }
  if (url.pathname === '/__lan') { res.writeHead(200, {'Content-Type': 'application/json'}); return res.end(JSON.stringify({url: LAN})); }
  let file = path.normalize(path.join(ROOT, decodeURIComponent(url.pathname)));
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('404'); }
    const ext = path.extname(file);
    if (ext === '.html') data = data.toString().replace('</body>', RELOAD + '</body>');
    res.writeHead(200, {'Content-Type': TYPES[ext] || 'application/octet-stream', 'Cache-Control': 'no-store'});
    res.end(data);
  });
}).listen(PORT, '0.0.0.0', () => {
  console.log(`\n  BoursePio en local (rechargement auto)\n`);
  console.log(`  Banque       http://localhost:${PORT}/`);
  console.log(`  Sur ton tel  ${LAN}   (même Wi-Fi)\n`);
});

let t = null;
fs.watch(ROOT, {recursive: true}, (_e, f) => {
  if (!f || f.startsWith('.git') || f.startsWith('node_modules')) return;
  clearTimeout(t); t = setTimeout(() => clients.forEach(c => c.write('data: reload\n\n')), 80);
});
