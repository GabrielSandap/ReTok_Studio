# ReTok Studio

Base légère pour enregistrer une vidéo depuis la caméra de l'ordinateur avec une source audio sélectionnée parmi les entrées disponibles de la machine.

## Fonctionnalités

- Détection des caméras disponibles
- Détection des sources audio disponibles
- Aperçu caméra vertical 9:16
- Balance des blancs précise sur le rush brut avant traitement couleur, avec pipette auto sur zone blanche
- Effet miroir activable pour synchroniser l'aperçu, la pipette et l'enregistrement
- Vumètre de la source audio sélectionnée
- Enregistrement vidéo 9:16 + audio avec `MediaRecorder`
- Bibliothèque locale des takes enregistrées dans une vue SPA dédiée
- Consultation, suppression et téléchargement des vidéos
- Grille de miniatures générées localement depuis les vidéos
- Téléchargement en `.mp4` quand le navigateur supporte l'enregistrement MP4 natif

## Lancer l'app

```bash
npm install
npm run dev
```

## Notes audio

Le navigateur ne peut pas capturer directement toute la sortie système macOS comme une entrée audio standard. Pour enregistrer une app ou un son système proprement, expose cette sortie comme source d'entrée avec une interface audio, un périphérique agrégé ou un driver virtuel comme BlackHole ou Loopback, puis sélectionne cette source dans ReTok Studio.

## Notes vidéo

La bibliothèque est stockée localement dans le navigateur avec IndexedDB. Elle s'ouvre comme une vue séparée dans la même single page application. Les vidéos restent sur la machine tant que les données du site ne sont pas effacées.

Le format MP4 dépend du support natif de `MediaRecorder` dans le navigateur. Si MP4 n'est pas disponible, l'app conserve la vidéo en WebM pour éviter de créer un faux fichier `.mp4`.

Les takes sont composées en 9:16 dans un canvas avant l'enregistrement. La balance des blancs est appliquée avant le rendu Kodak. Le traitement final vise une photo jetable: rouges denses, verts vifs, bleus/cyans présents, orange chaud, grain fin, léger bloom et vignette douce.
