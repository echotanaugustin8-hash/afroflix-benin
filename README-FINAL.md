# AfroFlix Bénin — Version 1.0 finale

Cette archive rassemble le projet construit jusqu'aux étapes 1 à 25.

## Ce qui est inclus
- Accueil AfroFlix et catalogue vidéo
- Films, vidéos, photos/contenus et recherche
- Comptes, profils, créateurs et espace créateur
- Favoris, notifications et recommandations
- Premium et monétisation créateurs
- Administration
- Sécurité de base et protections HTTP
- Chaînes TV et programmes TV (EPG)
- Lecteur HLS pour le direct
- Architecture OBS → RTMP/MediaMTX → HLS → AfroFlix
- Préparation Android / Android TV avec Capacitor
- Docker + Nginx + sauvegarde
- Endpoint `/api/health`

## Démarrage local
1. Copier `.env.example` en `.env` si nécessaire.
2. Pour le serveur web simple : `npm install` puis `npm start`.
3. Pour le direct TV avec Docker : installer Docker Desktop, puis `docker compose up -d`.
4. Ouvrir `http://localhost:3000`.

## Direct TV local
- RTMP OBS : `rtmp://localhost:1935`
- Clé exemple : `afroflix-tv`
- HLS : `http://localhost:8888/afroflix-tv/index.m3u8`
- Page : `http://localhost:3000/channel.html?slug=afroflix-tv`

Le direct local n'est pas encore un service public Internet. Pour la mise en ligne, il faut un serveur/VPS, un vrai domaine, HTTPS, une configuration RTMP sécurisée et idéalement un CDN.

## Production
- Copier `.env.production.example` vers `.env.production`.
- Générer un `JWT_SECRET` aléatoire d'au moins 32 caractères.
- Changer les identifiants administrateur.
- Remplacer `afroflix.example.com` par le domaine réel dans Nginx.
- Configurer les certificats TLS/HTTPS.
- Vérifier les sauvegardes de `/app/data` et `/app/uploads`.
- Ne jamais publier les secrets dans le ZIP ou dans Git.

## Important
Cette version est la première version complète du projet, mais le passage à une plateforme publique à grande échelle nécessite encore infrastructure, hébergement, stockage vidéo, CDN, paiements et tests de charge.
