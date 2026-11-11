#!/usr/bin/env bash
# Tarik perubahan dari git lalu bangun ulang stack Barva.
# Pemakaian: ./deploy/deploy.sh   (dijalankan dari checkout mana pun di repo)
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_DIR="$REPO_DIR/deploy/docker"

cd "$REPO_DIR"

echo "==> Menarik perubahan (fast-forward saja)"
git pull --ff-only

echo "==> Membangun image"
cd "$COMPOSE_DIR"
docker compose build

echo "==> Menaikkan stack"
docker compose up -d --remove-orphans

# nginx menyimpan IP upstream saat start. Bila hanya backend/frontend yang
# di-recreate, alamat lamanya bisa dipakai terus dan menghasilkan 502.
echo "==> Memuat ulang nginx"
docker compose exec -T nas-nginx nginx -s reload

echo "==> Menunggu backend sehat"
for _ in $(seq 1 30); do
  status="$(docker inspect --format '{{.State.Health.Status}}' nas-backend 2>/dev/null || echo unknown)"
  if [ "$status" = "healthy" ]; then
    echo "OK: nas-backend sehat"
    exit 0
  fi
  sleep 2
done

echo "GAGAL: nas-backend tidak sehat setelah 60 detik." >&2
echo "Periksa: docker compose -f $COMPOSE_DIR/docker-compose.yml logs nas-backend" >&2
exit 1
