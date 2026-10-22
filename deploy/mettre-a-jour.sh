#!/usr/bin/env bash
# Mise à jour du portail en production : sauvegarde, récupération du code, migration, build, redémarrage.
# Usage (sur le serveur, utilisateur appro) : bash /opt/appro/deploy/mettre-a-jour.sh
set -euo pipefail
cd /opt/appro

echo "== 1/5 Sauvegarde de la base avant mise à jour"
npm run db:backup

echo "== 2/5 Récupération du code"
git fetch origin main
git reset --hard origin/main

echo "== 3/5 Dépendances"
npm ci --no-audit --no-fund
npx prisma generate

echo "== 4/5 Migrations de la base"
npx prisma migrate deploy

echo "== 5/5 Build et redémarrage"
npm run build
sudo systemctl restart appro
sleep 5
systemctl --no-pager --lines=5 status appro
curl -fsS -o /dev/null -w "Réponse HTTP locale : %{http_code}\n" http://127.0.0.1:3000/connexion
