# Branches et circuit de livraison

| Branche | Rôle | Où elle tourne |
|---|---|---|
| `dev` | Développement : toutes les nouvelles fonctionnalités et corrections arrivent ici | postes des développeurs (`npm run dev`) |
| `test` | Recette : version figée pour les tests des utilisateurs clés | serveur de test (`mettre-a-jour.sh test`) |
| `prod` | Production : uniquement ce qui a été validé en recette | VPS de production (`mettre-a-jour.sh prod`) |
| `main` | Historique initial, aligné sur `prod` | — |

## Circuit

```
fonctionnalité ──► dev ──(recette)──► test ──(validation)──► prod
                                                   ▲
correctif urgent ── branche « correctif/… » ───────┘ puis reporté dans test et dev
```

1. **Développer** sur `dev` (ou sur une branche `fonctionnalite/xxx` fusionnée dans `dev`).
2. **Livrer en recette** : fusionner `dev` dans `test`, puis mettre à jour le serveur de test.
   ```bash
   git checkout test && git pull && git merge --no-ff dev && git push
   ```
3. **Mettre en production** après validation : fusionner `test` dans `prod`, puis mettre à jour le VPS.
   ```bash
   git checkout prod && git pull && git merge --no-ff test && git push
   git checkout main && git merge --ff-only prod && git push
   ```
4. **Correctif urgent** : partir de `prod` (`git checkout -b correctif/xxx prod`), fusionner dans `prod`, puis reporter le correctif dans `test` et `dev`.

## Règles

- Ne jamais pousser directement sur `prod` : seulement des fusions depuis `test` (ou un correctif urgent).
- Les **migrations Prisma** suivent le même chemin. Elles s'appliquent avec `npx prisma migrate deploy` sur chaque serveur (le script de mise à jour le fait).
- Chaque environnement a **sa propre base** et **son propre `.env`** (`SESSION_SECRET` différent). Ne jamais copier la base de production vers le test sans anonymiser les données personnelles.
