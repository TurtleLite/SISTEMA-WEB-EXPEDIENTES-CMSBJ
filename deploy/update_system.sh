#!/usr/bin/env bash
#
# update_system.sh — Actualiza el sistema en la mini PC al último commit del repositorio.
#
# Qué hace y para qué sirve:
#   - Trae el último código desde GitHub (git fetch + reset --hard origin/main).
#   - Si cambió el BACKEND: instala dependencias (si requirements cambió) y reinicia
#     el servicio del backend. El backend además crea/actualiza los índices de BD al arrancar.
#   - Si cambió el FRONTEND: lo reconstruye (npm run build -> frontend/dist). El backend
#     SIRVE este SPA a través del Tailscale Funnel, así que reconstruirlo es lo que actualiza
#     la app que ven los usuarios en la URL del funnel. Como se sirve desde disco, NO hace
#     falta reiniciar el backend para reflejar el nuevo frontend.
#   - El TÚNEL (servicio tailscale-funnel) NO se reinicia: no necesita reinicio para cambios
#     de código; simplemente sigue exponiendo el backend (y su SPA) por la misma URL.
#
# Optimización de tiempo: solo reconstruye/reinicia lo que realmente cambió en el commit,
# y omite el reinicio innecesario del túnel.
#
# Uso:  sudo bash deploy/update_system.sh
#
set -euo pipefail

REPO_DIR="/opt/expedientes/SISTEMA-WEB-EXPEDIENTES-CMSBJ"
BACKEND_DIR="$REPO_DIR/backend"
FRONTEND_DIR="$REPO_DIR/frontend"
SERVICE_BACKEND="expedientes-backend"

# Evita el error "detected dubious ownership" de git cuando el repo es de otro usuario.
git config --global --add safe.directory "$REPO_DIR" 2>/dev/null || true

cd "$REPO_DIR"
OLD_HEAD=$(git rev-parse HEAD)
echo "==> Actualizando código desde GitHub..."
git fetch origin
git reset --hard origin/main
NEW_HEAD=$(git rev-parse HEAD)

if [ "$OLD_HEAD" = "$NEW_HEAD" ]; then
  echo "Ya estás en el último commit ($NEW_HEAD). Nada que actualizar."
  exit 0
fi

CHANGED=$(git diff --name-only "$OLD_HEAD" "$NEW_HEAD")
echo "==> Cambios en este update: $(echo "$CHANGED" | wc -l) archivo(s)"

# --- BACKEND ---
if echo "$CHANGED" | grep -qE '^backend/'; then
  echo "==> Backend cambió: dependencias + reinicio de $SERVICE_BACKEND"
  cd "$BACKEND_DIR"
  if echo "$CHANGED" | grep -qE '^backend/requirements\.txt$'; then
    ./venv/bin/pip install -q -r requirements.txt
  fi
  sudo systemctl restart "$SERVICE_BACKEND"
  # Espera a que el backend responda (la 1ª vez crea índices y puede tardar).
  for i in $(seq 1 60); do
    if curl -s -o /dev/null -m 2 "https://cmsbjserver.tailf34429.ts.net/health"; then
      echo "    Backend listo (intento $i)."
      break
    fi
    sleep 1
  done
else
  echo "==> Backend sin cambios: no se reinicia."
fi

# --- FRONTEND (lo que sirve el funnel) ---
if echo "$CHANGED" | grep -qE '^frontend/'; then
  echo "==> Frontend cambió: reconstruyendo SPA (se refleja en el funnel sin reiniciar backend)"
  cd "$FRONTEND_DIR"
  npm install
  npm run build
else
  echo "==> Frontend sin cambios: no se reconstruye."
fi

# --- TÚNEL (funnel) ---
echo "==> Túnel (funnel): sin acción necesaria; ya sirve el SPA actualizado."

echo
echo "Listo. Backend y SPA (funnel) actualizados al último commit ($NEW_HEAD)."
echo "App:  https://cmsbjserver.tailf34429.ts.net/#/dashboard"
