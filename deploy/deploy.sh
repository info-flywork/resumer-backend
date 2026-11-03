#!/usr/bin/env bash
# Sunucuda, projenin klasöründe çalıştır:  bash deploy/deploy.sh
# İlk kurulumda önce: .env dosyasını bu klasöre koy (panelden indirilen), `pm2 install pm2-logrotate` (bir kez).
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo "✗ .env yok — panelden indirdiğin .env dosyasını $(pwd)/.env olarak koy" >&2
  exit 1
fi
chmod 600 .env

NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
if [ "$NODE_MAJOR" -lt 22 ]; then
  echo "✗ Node 22+ gerekli (şu an $(node -v))" >&2
  exit 1
fi

if [ -d .git ]; then
  git pull --ff-only
fi
npm ci --omit=dev
npm run migrate
pm2 startOrReload ecosystem.config.js --update-env
pm2 save
echo "✓ yayında — kontrol: curl -s http://127.0.0.1:\$(grep ^PORT= .env | cut -d= -f2)/health"
