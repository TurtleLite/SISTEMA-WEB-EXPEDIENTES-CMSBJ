#!/usr/bin/env bash
#
# update_system.sh — Actualiza el sistema en la mini PC al último commit del repositorio.
#
# Qué hace (y para qué sirve):
#   1. Trae el último código desde GitHub (git fetch + reset --hard origin/main).
#      Esto deja el backend, el frontend y los índices de BD al día.
#   2. Instala las dependencias de Python del backend (por si requirements.txt cambió).
#   3. Reconstruye el frontend (npm run build -> frontend/dist).
#      El backend SIRVE este SPA a través del Tailscale Funnel, así que reconstruirlo
#      es lo que actualiza la app que ven los usuarios en la URL del funnel.
#   4. Reinicia el servicio del backend y el del funnel para aplicar los cambios.
#
# Uso:  sudo bash deploy/update_system.sh
#
set -euo pipefail

REPO_DIR="/opt/expedientes/SISTEMA-WEB-EXPEDIENTES-CMSBJ"
BACKEND_DIR="$REPO_DIR/backend"
FRONTEND_DIR="$REPO_DIR/frontend"
SERVICE_BACKEND="expedientes-backend"
SERVICE_FUNNEL="tailscale-funnel"

# Evita el error "detected dubious ownership" de git cuando el repo es de otro usuario.
git config --global --add safe.directory "$REPO_DIR" 2>/dev/null || true

echo "==> [1/4] Actualizando código desde GitHub..."
cd "$REPO_DIR"
git fetch origin
git reset --hard origin/main
echo "    Commit actual: $(git rev-parse --short HEAD)"

echo "==> [2/4] Dependencias del backend..."
cd "$BACKEND_DIR"
if [ -x ./venv/bin/pip ]; then
  ./venv/bin/pip install -q -r requirements.txt
else
  echo "    (no se encontró venv/; omitido pip install)"
fi

echo "==> [3/4] Reconstruyendo frontend (SPA servida por el funnel)..."
cd "$FRONTEND_DIR"
npm install
npm run build

echo "==> [4/4] Reiniciando servicios..."
sudo systemctl restart "$SERVICE_BACKEND"
sudo systemctl restart "$SERVICE_FUNNEL" || true

echo
echo "Listo. Backend y túnel (funnel) actualizados al último commit."
echo "Verifica:  curl -s https://cmsbjserver.tailf34429.ts.net/health"
echo "App:       https://cmsbjserver.tailf34429.ts.net/#/dashboard"
