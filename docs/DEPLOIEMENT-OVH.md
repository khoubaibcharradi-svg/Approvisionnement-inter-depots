# Mise en ligne sur un VPS OVH

Ce guide installe le portail sur un **VPS OVH sous Ubuntu 24.04**, avec :
- MySQL 8 ;
- Nginx en HTTPS (certificat Let's Encrypt gratuit) ;
- un service systemd qui démarre le portail au boot et le relance en cas d'arrêt.

> **Pourquoi un VPS ?** L'hébergement web mutualisé OVH ne fait pas tourner une application Node.js en continu. Or le portail en a besoin pour le planificateur de sauvegardes, les sessions et les connexions MySQL.
> **Dimensionnement pour 60 utilisateurs** : 2 vCPU, 4 Go de RAM, 40 Go de disque.

Durée : environ 1 heure. Toutes les commandes se tapent dans un terminal SSH sur le serveur, sauf mention contraire.

---

## 1. Commander et préparer le serveur

1. Dans l'espace client OVH, commande un **VPS** sous **Ubuntu 24.04**. Tu reçois par e-mail l'adresse IP et l'accès `ubuntu`.
2. Dans ta zone DNS (domaine OVH ou autre), crée un enregistrement **A** de `appro.ton-domaine.tn` vers l'IP du VPS.
3. Connecte-toi depuis ton PC Windows (PowerShell) :
   ```powershell
   ssh ubuntu@IP_DU_VPS
   ```
4. Mets le système à jour, règle le fuseau horaire et active le pare-feu :
   ```bash
   sudo apt update && sudo apt -y upgrade
   sudo timedatectl set-timezone Africa/Tunis      # « aujourd'hui » des comptes rendus et heure des sauvegardes
   sudo apt -y install git nginx mysql-server certbot python3-certbot-nginx ufw
   sudo ufw allow OpenSSH && sudo ufw allow 'Nginx Full' && sudo ufw --force enable
   ```
   MySQL n'est **pas** ouvert sur Internet : il n'écoute qu'en local.

5. Installe Node.js 22 :
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
   sudo apt -y install nodejs
   node -v   # v22.x
   ```

## 2. Base de données MySQL

```bash
sudo mysql_secure_installation          # répondre Y partout ; ne pas autoriser root à distance
sudo mysql
```
Puis, dans MySQL (choisis un vrai mot de passe long) :
```sql
CREATE DATABASE appro CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'appro'@'localhost' IDENTIFIED BY 'MOT_DE_PASSE_MYSQL_LONG';
GRANT ALL PRIVILEGES ON appro.* TO 'appro'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

## 3. Installer le portail

```bash
sudo useradd --system --create-home --home-dir /opt/appro --shell /bin/bash appro
sudo -u appro git clone https://github.com/khoubaibcharradi-svg/Approvisionnement-inter-depots.git /opt/appro
cd /opt/appro
sudo -u appro npm ci --no-audit --no-fund
```

### Fichier `.env` de production

```bash
sudo -u appro cp .env.example .env
sudo -u appro nano .env
```
Valeurs à renseigner :
```
DATABASE_URL="mysql://appro:MOT_DE_PASSE_MYSQL_LONG@localhost:3306/appro?connection_limit=20&pool_timeout=20"
SESSION_SECRET="…"                 # générer avec : openssl rand -hex 48
SEED_MOT_DE_PASSE_INITIAL="…"      # mot de passe provisoire des comptes, changé à la 1re connexion
BACKUP_HEURE="02:00"
BACKUP_RETENTION_JOURS=90
```
Si le mot de passe MySQL contient `@ : / # ? %`, il faut les encoder dans `DATABASE_URL` : `@` devient `%40`, `#` devient `%23`, etc.

Protège le fichier : `sudo chmod 600 /opt/appro/.env`.

### Fichier de paramétrage (articles, utilisateurs)

Il n'est pas dans Git (données internes). Depuis ton PC Windows (PowerShell), envoie-le sur le serveur. **WinSCP** fait aussi l'affaire.
```powershell
scp "D:\PROMOFOOD\DEV\Appro\approvisionnement-inter-depots\prisma\data\parametrage.xlsx" ubuntu@IP_DU_VPS:/tmp/
```
Puis sur le serveur :
```bash
sudo mkdir -p /opt/appro/prisma/data && sudo mv /tmp/parametrage.xlsx /opt/appro/prisma/data/ && sudo chown -R appro:appro /opt/appro/prisma/data
```

### Base, données initiales et build

```bash
cd /opt/appro
sudo -u appro npx prisma migrate deploy
sudo -u appro npm run db:seed
sudo -u appro npm run build
```

## 4. Démarrage automatique (systemd)

```bash
sudo cp /opt/appro/deploy/appro.service /etc/systemd/system/appro.service
sudo systemctl daemon-reload
sudo systemctl enable --now appro
systemctl status appro            # « active (running) »
curl -I http://127.0.0.1:3000/connexion   # HTTP/1.1 200
```
Le portail n'écoute que sur `127.0.0.1:3000`. Seul Nginx est exposé.

Pour autoriser `deploy/mettre-a-jour.sh` à redémarrer le service sans mot de passe :
```bash
echo 'appro ALL=(root) NOPASSWD: /usr/bin/systemctl restart appro' | sudo tee /etc/sudoers.d/appro
```

## 5. Nginx et HTTPS

```bash
sudo cp /opt/appro/deploy/appro-proxy.conf /etc/nginx/snippets/appro-proxy.conf
sudo cp /opt/appro/deploy/nginx-appro.conf /etc/nginx/sites-available/appro
sudo sed -i 's/appro.exemple.tn/appro.ton-domaine.tn/' /etc/nginx/sites-available/appro
sudo ln -s /etc/nginx/sites-available/appro /etc/nginx/sites-enabled/appro
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d appro.ton-domaine.tn --redirect -m ton.email@domaine.tn --agree-tos -n
```
Le certificat se renouvelle tout seul. Le portail est alors accessible sur **https://appro.ton-domaine.tn**.

Nginx limite en plus les tentatives sur `/connexion` (10 par minute et par IP), en complément du verrouillage applicatif.

## 6. Sauvegardes : à ne pas négliger

Le portail produit chaque nuit à 02:00 une sauvegarde texte dans `/opt/appro/backups/`, conservée 90 jours. Les pièces jointes sont dans `/opt/appro/pieces-jointes/` et les journaux dans `/opt/appro/logs/`.

**Une sauvegarde restée sur le même serveur ne protège pas d'une panne.** Il faut en garder une copie ailleurs, par exemple :
- **Option simple** : depuis ton PC Windows, rapatrie régulièrement les trois dossiers avec WinSCP, ou avec une tâche planifiée :
  ```powershell
  scp -r ubuntu@IP_DU_VPS:/opt/appro/backups "D:\Sauvegardes\appro\"
  ```
- **Option OVH** : ajoute l'option **Backup automatique** du VPS (instantanés quotidiens), et/ou copie les dossiers vers **OVH Object Storage** (S3) avec `rclone` dans un cron.

Restauration : `cd /opt/appro && sudo -u appro npm run db:restore -- <fichier>.sql.txt --confirmer`.

## 7. Mettre à jour le portail

Après chaque nouvelle version poussée sur GitHub :
```bash
sudo -u appro bash /opt/appro/deploy/mettre-a-jour.sh
```
Le script enchaîne : sauvegarde de la base, récupération du code, dépendances, migrations, build, redémarrage, puis vérification.

## 8. Premiers pas après la mise en ligne

1. Connecte-toi avec `admin` et le mot de passe `SEED_MOT_DE_PASSE_INITIAL`, puis change-le.
2. Menu **Utilisateurs** : vérifie les comptes et crée les agents dépôts. Transmets à chacun son mot de passe provisoire.
3. Menus **Magasins**, **Véhicules** et **Catalogue SKU** : agences, véhicules, prix de revient.
4. **Ne charge pas les données de test** (`donnees-test-comptes-rendus.sql`) en production.

## Dépannage

| Symptôme | Commande |
|---|---|
| Le site ne répond pas | `systemctl status appro` puis `journalctl -u appro -n 100` |
| Erreur 502 Bad Gateway | le service est arrêté : `sudo systemctl restart appro` |
| Erreurs de l'application | `tail -n 50 /opt/appro/logs/erreurs-$(date +%F).log` |
| Base inaccessible | `systemctl status mysql`, puis vérifier `DATABASE_URL` dans `.env` |
| Certificat HTTPS | `sudo certbot renew --dry-run` |
