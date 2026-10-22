#!/usr/bin/env bash
# Recharge la base de RECETTE avec une copie ANONYMISÉE de la production.
# Usage (sur le serveur, utilisateur appro) : bash /opt/appro-test/deploy/copier-prod-vers-test.sh
# - sauvegarde la production (texte) puis la restaure dans la base de test (une sauvegarde du test est faite avant) ;
# - anonymise immédiatement la base de test (deploy/anonymiser-test.sql) ;
# - les pièces jointes ne sont PAS copiées (documents internes).
set -euo pipefail
PROD=/opt/appro
TEST=/opt/appro-test

base_test=$(grep -E '^DATABASE_URL=' "$TEST/.env" | sed -E 's#.*/([^/?"]+)(\?.*)?"?$#\1#')
base_prod=$(grep -E '^DATABASE_URL=' "$PROD/.env" | sed -E 's#.*/([^/?"]+)(\?.*)?"?$#\1#')
if [[ "$base_test" != *test* || "$base_test" == "$base_prod" ]]; then
  echo "Refusé : la base de test ($base_test) doit contenir « test » et être différente de la production ($base_prod)."
  exit 1
fi

echo "== 1/3 Sauvegarde de la production"
cd "$PROD" && npm run db:backup | tail -n +1 | grep "Sauvegarde écrite"
fichier=$(ls -t "$PROD"/backups/sauvegarde-*.sql.txt | head -1)

echo "== 2/3 Restauration dans la base de test ($base_test)"
cd "$TEST" && npx prisma migrate deploy && npm run db:restore -- "$fichier" --confirmer

echo "== 3/3 Anonymisation"
npx prisma db execute --schema prisma/schema.prisma --file deploy/anonymiser-test.sql
echo "Terminé. Connexion en recette : identifiants sup01, cv01, agent01… (voir Utilisateurs), mot de passe Recette2026!"
