#!/usr/bin/env bash
# Durcissement du serveur contre les attaques réseau (à lancer une fois, puis après chaque modification de ces fichiers).
# Usage : sudo bash /opt/appro/deploy/durcissement.sh
# Idempotent : peut être relancé sans risque. Chaque étape est vérifiée avant d'être appliquée.
set -euo pipefail

DEPLOY="$(cd "$(dirname "$0")" && pwd)"
SITE=/etc/nginx/sites-available/appro
[ "$(id -u)" -eq 0 ] || { echo "À lancer avec sudo."; exit 1; }
[ -f "$SITE" ] || { echo "Configuration Nginx du portail introuvable : $SITE"; exit 1; }

echo "== 1/7 Nginx : limites de débit, délais, refus des robots"
cp "$DEPLOY/nginx-protection.conf" /etc/nginx/conf.d/appro-protection.conf
cp "$DEPLOY/nginx-securite.conf" /etc/nginx/snippets/appro-securite.conf
# Le site déclarait déjà « server_tokens off » : on évite le doublon avec la directive générale.
sed -i '/^\s*server_tokens off;\s*$/d' "$SITE"
# Inclusion dans chaque bloc server du portail (une seule fois)
if ! grep -q "snippets/appro-securite.conf" "$SITE"; then
  sed -i 's#^\(\s*\)server_name appro\.promofood\.cloud;#&\n\1include /etc/nginx/snippets/appro-securite.conf;#' "$SITE"
fi

echo "== 2/7 Nginx : refus des accès par adresse IP ou nom inconnu"
cp "$DEPLOY/nginx-defaut.conf" /etc/nginx/sites-available/defaut-refus
ln -sf /etc/nginx/sites-available/defaut-refus /etc/nginx/sites-enabled/defaut-refus
rm -f /etc/nginx/sites-enabled/default

if ! nginx -t 2>/dev/null; then
  # Serveur sans IPv6 par exemple : on retire le site de refus plutôt que de bloquer Nginx.
  echo "   Site de refus incompatible avec ce serveur : retiré."
  rm -f /etc/nginx/sites-enabled/defaut-refus
fi
if nginx -t; then
  systemctl reload nginx
else
  echo "Configuration Nginx invalide : rien n'est rechargé. Corrigez puis relancez."; exit 1
fi

echo "== 3/7 fail2ban : bannissement automatique des adresses agressives"
apt-get install -y -qq fail2ban >/dev/null
cp "$DEPLOY/fail2ban/appro.conf" /etc/fail2ban/jail.d/appro.conf
cp "$DEPLOY/fail2ban/appro-connexion.conf" /etc/fail2ban/filter.d/appro-connexion.conf
mkdir -p /opt/appro/logs
systemctl enable --now fail2ban >/dev/null
systemctl restart fail2ban

echo "== 4/7 Pare-feu : SSH limité aux tentatives répétées"
ufw limit OpenSSH >/dev/null
ufw --force enable >/dev/null

echo "== 5/7 Noyau : protections réseau (SYN flood, usurpation d'adresse, redirections)"
cat > /etc/sysctl.d/90-appro.conf <<'EOF'
net.ipv4.tcp_syncookies = 1
net.ipv4.conf.all.rp_filter = 1
net.ipv4.conf.default.rp_filter = 1
net.ipv4.conf.all.accept_redirects = 0
net.ipv4.conf.default.accept_redirects = 0
net.ipv6.conf.all.accept_redirects = 0
net.ipv4.conf.all.send_redirects = 0
net.ipv4.conf.all.accept_source_route = 0
net.ipv4.icmp_echo_ignore_broadcasts = 1
net.ipv4.tcp_max_syn_backlog = 4096
EOF
sysctl --system >/dev/null

echo "== 6/7 Confinement du service Node.js (systemd)"
for svc in appro appro-test; do
  [ -f "/etc/systemd/system/$svc.service" ] || continue
  mkdir -p "/etc/systemd/system/$svc.service.d"
  cp "$DEPLOY/systemd-durcissement.conf" "/etc/systemd/system/$svc.service.d/durcissement.conf"
done
systemctl daemon-reload
systemctl restart appro
repond=0
for _ in $(seq 1 30); do
  curl -fsS -o /dev/null http://127.0.0.1:3000/connexion 2>/dev/null && { repond=1; break; }
  sleep 1
done
if [ "$repond" -ne 1 ]; then
  # Retour arrière automatique : le portail doit toujours rester disponible.
  echo "   Le portail ne répond pas avec le confinement : retiré."
  rm -f /etc/systemd/system/appro.service.d/durcissement.conf /etc/systemd/system/appro-test.service.d/durcissement.conf
  systemctl daemon-reload && systemctl restart appro
fi
systemctl is-active --quiet appro-test 2>/dev/null && systemctl restart appro-test || true

echo "== 7/7 Vérification"
sleep 2
fail2ban-client status | sed 's/^/   /'
ufw status | sed 's/^/   /'
code=$(curl -s -o /dev/null -w "%{http_code}" https://appro.promofood.cloud/connexion || true)
echo "   Portail : HTTP $code (attendu : 200)"
echo "Terminé."
