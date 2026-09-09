# 🔴 AfroFlix — Serveur de direct (Étape 22)

Cette étape ajoute un vrai chemin de diffusion local :

**OBS → RTMP (1935) → MediaMTX → HLS (8888) → AfroFlix**

## 1. Installer Docker Desktop

Sur Windows, installe Docker Desktop puis redémarre Windows si Docker le demande.

## 2. Démarrer AfroFlix + le serveur vidéo

Depuis le dossier du projet :

```powershell
docker compose up -d
```

Vérifie :

```powershell
docker compose ps
```

Tu dois voir `afroflix`, `nginx` et `mediamtx`.

## 3. Configurer OBS pour Chaîne 1

Dans OBS : **Paramètres → Stream / Flux**

- Service : `Personnalisé...`
- Serveur : `rtmp://localhost:1935`
- Clé de stream : `afroflix-tv`

Puis clique **Appliquer → OK**.

## 4. Lancer le direct

Dans OBS, clique **Commencer le streaming**.

MediaMTX recevra le flux sur :

`rtmp://localhost:1935/afroflix-tv`

Le flux HLS sera disponible sur :

`http://localhost:8888/afroflix-tv/index.m3u8`

Et dans AfroFlix :

`http://localhost:3000/channel.html?slug=afroflix-tv`

## 5. Important

Pour l'instant, c'est un **test local** sur ton ordinateur. Ce n'est pas encore une diffusion publique sur Internet.

Pour une vraie chaîne accessible partout, il faudra ensuite déployer MediaMTX sur un serveur avec domaine/HTTPS et prévoir la sécurité, le stockage et éventuellement un CDN.

## Chaînes supplémentaires

Les chemins préparés sont :

- `afroflix-tv`
- `afroflix-music`
- `afroflix-films`
- `afroflix-sport`
- `afroflix-culture`
- `afroflix-kids`

Chaque chaîne pourra avoir son propre OBS/source de diffusion et son propre flux.
