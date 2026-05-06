# ReTok Studio

ReTok Studio est une app web locale pour préparer, lire et enregistrer des vidéos verticales depuis la caméra de l'ordinateur avec une source audio choisie. Le projet vise un workflow simple pour créer des takes au format social, garder des notes de tournage visibles, contrôler l'image et conserver les enregistrements localement.

Le dépôt est public pour suivre l'avancement du projet, tester les nouvelles versions et installer l'app en local.

## Ce que l'app permet de faire

- Enregistrer une vidéo verticale 9:16 avec audio.
- Choisir la caméra et la source audio disponibles sur la machine.
- Prévisualiser le retour vidéo à droite par défaut, ou le basculer à gauche.
- Ajuster l'image brute : saturation, contraste, luminosité, miroir et balance des blancs.
- Utiliser une pipette pour caler la balance des blancs sur le rush brut.
- Écrire des notes de tournage dans une zone centrale type page d'édition, avec titres, sous-titres et tailles de texte.
- Sauvegarder les notes localement dans le navigateur.
- Conserver les takes dans une bibliothèque locale avec miniatures, lecture, renommage, suppression et téléchargement.
- Télécharger en MP4 quand le navigateur supporte l'enregistrement MP4 natif, sinon en WebM.

## Pour qui

ReTok Studio est pensé pour les créateurs, musiciens, streamers, monteurs et makers qui veulent enregistrer rapidement des formats verticaux depuis leur ordinateur, sans installer une suite vidéo lourde.

Quelques cas d'usage :

- enregistrer une performance face caméra ;
- lire un script, des paroles ou des notes pendant la prise ;
- capturer une source audio virtuelle comme BlackHole ou Loopback ;
- tester des rendus caméra avant montage ;
- conserver une petite bibliothèque de prises locales.

## Prérequis

- Node.js 18 ou plus récent.
- Un navigateur Chromium récent, recommandé : Google Chrome.
- Une caméra et une source audio disponibles.
- Pour capturer le son système sur macOS : un périphérique audio virtuel comme BlackHole ou Loopback.

Les APIs caméra, micro et enregistrement dépendent du navigateur. Safari et Firefox peuvent avoir des limitations différentes, notamment sur les formats de sortie.

## Installation

Clone le projet puis installe les dépendances :

```bash
git clone https://github.com/GabrielSandap/ReTok_Studio.git
cd ReTok_Studio
npm install
```

## Lancer en local

Pour utiliser caméra et micro sur la même machine, lance le serveur local :

```bash
npm run dev:local
```

Ouvre ensuite l'URL affichée par Vite, par exemple :

```text
http://localhost:5173
```

Chrome bloque caméra et micro sur une adresse réseau non sécurisée comme `http://192.168.x.x:5173`. Pour exposer l'app sur le réseau local, utilise :

```bash
npm run dev
```

Dans ce cas, il faut servir l'app en HTTPS pour que les appareils du réseau puissent accéder à la caméra et au micro.

## Build de production

```bash
npm run build
```

Pour tester le build :

```bash
npm run preview
```

## Données et confidentialité

ReTok Studio fonctionne localement dans le navigateur.

- Les vidéos sont stockées dans IndexedDB.
- Les notes et préférences sont stockées dans `localStorage`.
- Les fichiers ne sont pas envoyés à un serveur par l'app.
- Effacer les données du site dans le navigateur supprimera la bibliothèque locale et les notes.

## Audio

Le navigateur ne peut pas capturer directement toute la sortie système macOS comme une entrée audio standard. Pour enregistrer le son d'une app, d'un navigateur, d'un instrument virtuel ou d'un mix système, expose cette sortie comme source d'entrée avec :

- une interface audio ;
- un périphérique agrégé ;
- BlackHole ;
- Loopback ;
- un autre driver audio virtuel.

Sélectionne ensuite cette source dans le panneau `Sources`.

## Vidéo

Les takes sont composées dans un canvas vertical 9:16 avant enregistrement. Le rendu applique les réglages de caméra et de couleur avant la capture finale.

Le format de sortie dépend du support natif de `MediaRecorder` :

- MP4 quand le navigateur le supporte ;
- WebM en fallback.

## Structure du projet

```text
src/
  App.jsx       Interface, caméra, audio, enregistrement, bibliothèque et notes
  main.jsx      Point d'entrée React
  styles.css    Styles de l'application
```

Le projet est volontairement compact pour accélérer l'itération. Une refactorisation en modules dédiés est prévue si l'app continue de grandir.

## Scripts disponibles

```bash
npm run dev:local   # serveur Vite sur localhost
npm run dev         # serveur Vite exposé sur le réseau
npm run build       # build production
npm run preview     # prévisualisation du build
```

## État du projet

Le projet est en développement actif. Le dépôt public sert à suivre l'évolution, tester l'app, remonter des problèmes et comprendre les choix techniques.

Priorités techniques à venir :

- durcir l'éditeur de notes rich-text ;
- mieux isoler les modules caméra, audio, bibliothèque et notes ;
- ajouter des tests de non-régression ;
- améliorer les exports et les options de format ;
- documenter les workflows audio par plateforme.

## Contribuer

Les issues et suggestions sont bienvenues. Pour proposer une modification :

1. Fork le dépôt.
2. Crée une branche dédiée.
3. Lance `npm run build`.
4. Ouvre une pull request avec une description claire.

## Licence

Aucune licence open source explicite n'est encore définie. Le code est public pour consultation, suivi et installation locale. Une licence sera ajoutée quand les conditions de réutilisation seront fixées.
