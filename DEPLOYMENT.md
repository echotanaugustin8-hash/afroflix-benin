# AfroFlix — Étape 20 : Mise en production 🌍

Cette étape fournit une base de déploiement reproductible. Elle ne crée pas automatiquement un domaine, un compte cloud, un certificat TLS ou des clés de paiement : ces éléments doivent être fournis par l'exploitant.

## 1. Préparer le serveur
- VPS Linux récent, Node/Docker installés.
- DNS du domaine pointé vers l'IP du serveur.
- Ouvrir uniquement 80/443 au public et SSH selon besoin.

## 2. Configurer les secrets
Copier `.env.production.example` vers `.env.production` et remplacer toutes les valeurs sensibles.

Générer un secret JWT robuste, par exemple :
`openssl rand -base64 48`

Ne jamais publier `.env.production` ni le mot de passe administrateur.

## 3. Configurer le domaine
Dans `deploy/nginx.conf`, remplacer `afroflix.example.com` par le vrai domaine.

## 4. HTTPS
Obtenir un certificat TLS (par exemple Let's Encrypt) puis monter les certificats dans `deploy/certbot/conf`. Une fois le certificat actif, ajouter le bloc HTTPS Nginx et rediriger HTTP vers HTTPS.

## 5. Lancer
`docker compose up -d --build`

Tester :
`curl https://VOTRE-DOMAINE/api/health`

La réponse doit indiquer `status: ok`.

## 6. Sauvegardes
Lancer régulièrement :
`./scripts/backup.sh`

Programmer le script avec cron et, idéalement, copier les sauvegardes vers un stockage externe.

## 7. Paiements réels
Avant activation : intégrer le prestataire de paiement choisi, vérifier les webhooks signés, les montants, les statuts idempotents et les journaux. Ne jamais stocker de données de carte bancaire dans AfroFlix.

## 8. Stockage vidéo
Pour une vraie plateforme, prévoir un stockage durable et adapté aux gros fichiers (objet/S3-compatible ou équivalent), ainsi qu'un CDN et idéalement HLS/DASH. Ne pas dépendre uniquement du disque du VPS pour un catalogue important.

## 9. Checklist de lancement
- [ ] Domaine DNS configuré
- [ ] HTTPS actif
- [ ] JWT_SECRET changé
- [ ] Mot de passe admin changé
- [ ] CORS configuré sur le vrai domaine
- [ ] Sauvegardes automatiques testées
- [ ] Restauration d'une sauvegarde testée
- [ ] Paiements testés en environnement de test puis production
- [ ] Stockage vidéo durable configuré
- [ ] Monitoring/alertes configurés
- [ ] Politique de confidentialité et CGU publiées
- [ ] Tests mobile/PC effectués
- [ ] AAB Android signé et testé
