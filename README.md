# 📈 BoursePio

Bourse de soirée entre potes : les joueurs placent les tickets gagnés aux autres jeux de casino
sur un marché fictif qui bouge en continu, secoué par des événements aléatoires.

**Une seule appli, sur un seul téléphone (celui du banquier).** Pas de serveur, pas de compte :
tout est stocké sur le téléphone et l'appli fonctionne hors-ligne une fois chargée.

## Installer sur le téléphone

1. Sur GitHub : **Settings → Pages → Build and deployment → Source : GitHub Actions**.
   Le workflow `.github/workflows/pages.yml` publie l'appli à chaque push sur `main`
   (adresse : `https://wyrox07.github.io/BoursePio/`).
2. Ouvre cette adresse sur ton téléphone (en 5G, une seule fois suffit).
3. Ajoute-la à l'écran d'accueil :
   - iPhone (Safari) : bouton Partager → **Sur l'écran d'accueil**
   - Android (Chrome) : menu ⋮ → **Installer l'application**
4. Ensuite elle se lance comme une vraie appli, même en mode avion.

## Déroulé d'une partie

1. **Configuration** : ajoute les joueurs, choisis la durée (1h à 4h), la fréquence des événements et les frais.
2. **Ouvrir les marchés** : les cours bougent toutes les 4 secondes.
3. **Investir** : un joueur te donne X tickets → Joueurs → son nom → Investir → choisis l'action.
4. **Retirer** : Joueurs → son nom → Retirer → l'appli te dit combien de tickets lui rendre.
5. **Clôture** : à la fin du temps, le Classement affiche combien rendre à chacun.

Une erreur ? Le bouton **Annuler** du message de confirmation annule la dernière opération.

## Les actions

| Action | Profil |
|---|---|
| 🏦 Pio Banque | 🛡️ sûr, légère hausse de fond |
| 🥇 Lingot d'Or | 🛡️ valeur refuge, monte quand le marché s'effondre |
| 🍕 Pizza Holding · 🍺 Brasserie Mousse · 🥙 Kebab Corp | ⚖️ moyen |
| 🚀 Fusée Lunaire | 🔥 risqué |
| 🐶 WafCoin | 💀 casino |

## Événements aléatoires

Bonnes et mauvaises nouvelles, booms et crises de secteur, krach boursier, marché haussier/baissier,
tempête de volatilité, rumeurs (vraies ou fausses, résolues quelques minutes plus tard),
dividendes, OPA, faillites (avec sauvetage possible), pump & dump du WafCoin, contrôle fiscal
du plus riche, aide d'État au plus pauvre, pause café…

La partie s'accélère vers la fin : **Heure de folie** (75 % du temps), puis **Sprint final**
(derniers 6 %), avec plus de volatilité et des événements plus fréquents.
Le menu Réglages permet aussi de déclencher un événement à la main, mettre en pause, ou rallonger la partie.

## Bon à savoir

- Garde l'appli au premier plan : l'option « Garder l'écran allumé » empêche la mise en veille.
  Si le téléphone se verrouille quand même, le marché rattrape le temps écoulé à la réouverture.
- Réglages → Exporter enregistre la partie dans un fichier (sauvegarde de secours).
- Pour tester en local sur un ordinateur : `python3 -m http.server` dans le dossier, puis http://localhost:8000.
