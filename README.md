# 📈 BoursePio

La bourse de la soirée : les équipes misent les tickets gagnés aux jeux de casino **à la hausse ou à la baisse**
sur des actions (nos private jokes), avec un **multiplicateur ×1, ×2 ou ×5**. Le marché bouge en continu,
secoué par des événements et des annonces à compte à rebours.

Trois écrans, une seule appli :

| Écran | Qui | Adresse |
|---|---|---|
| 🏦 **Banque** | toi, sur ton tel | `https://wyrox07.github.io/BoursePio/` |
| 📺 **Grand écran** | le PC branché à la télé | lien affiché dans l'onglet **Diffuser** (`…?room=CODE&tv=1`) |
| 📱 **Joueurs** | chacun sur son tel | ils scannent le **QR code** (onglet Diffuser ou grand écran) |

La partie tourne sur le tel de la banque (sauvegardée dessus, marche même hors-ligne).
Les autres écrans la suivent en direct via un relais MQTT public et gratuit (EMQX + HiveMQ, sans compte).

## Règles (version courte)

1. Une équipe donne des tickets à la banque et choisit : **une action**, **📈 hausse ou 📉 baisse**, **×1 / ×2 / ×5**.
2. Si l'action va dans son sens, la mise prend de la valeur (×2 = deux fois plus vite, ×5 = cinq fois).
3. Si la mise tombe à 0, elle est **liquidée 💀** (avec ×5, une baisse de 20 % suffit).
4. L'équipe **encaisse quand elle veut** : la banque rend la valeur actuelle. Le montant est **bloqué 45 s**
   au moment où tu tapes « Encaisser », le temps de compter les tickets.
5. **Annonces 📣** : compte à rebours, puis l'action bouge de 35 à 80 %. Les paris sur cette action se gèlent 30 s avant.

## Tester en local sur ton PC (avant de pousser)

Il faut [Node.js](https://nodejs.org) (version 18 ou plus) et Git.

```bash
git clone https://github.com/WyroX07/BoursePio.git
cd BoursePio
npm run dev
```

- Ouvre **http://localhost:5173** : c'est la banque. La page se **recharge toute seule** à chaque modification d'un fichier.
- L'adresse « Sur ton tel » affichée dans le terminal marche depuis un tel sur le **même Wi-Fi**,
  et le QR code de l'onglet Diffuser pointe automatiquement vers elle.
- Grand écran en local : onglet Diffuser → **Ouvrir ici** (marche même sans internet, dans le même navigateur).

Une fois content : `git add -A && git commit -m "…" && git push` → GitHub Pages met le site à jour en ~1 minute.

## Organisation du code

| Fichier | Rôle |
|---|---|
| `js/data.js` | **Actions, textes des événements, réglages** : le fichier à modifier pour changer les noms/emojis |
| `js/engine.js` | Moteur : cours, positions, liquidations, événements |
| `js/host.js` | Écrans de la banque |
| `js/screens.js` | Tel des joueurs + grand écran |
| `js/sync.js` | Diffusion en direct (MQTT + onglets du même navigateur) |
| `js/common.js` | Graphiques, QR code, sons, fenêtres |
| `css/app.css` | Tout le style |
| `dev-server.js` | Serveur de test local avec rechargement auto |
