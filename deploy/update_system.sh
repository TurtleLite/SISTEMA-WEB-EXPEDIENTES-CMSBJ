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

# --- Autenticación sin token (SSH + Deploy Key de solo lectura) ---
# El script corre con sudo, así que la llave vive en /root/.ssh.
# Si no existe, se genera. El remote se convierte a SSH (nunca usa token personal).
ensure_ssh() {
  local key="/root/.ssh/id_ed25519"
  mkdir -p /root/.ssh && chmod 700 /root/.ssh
  if [ ! -f "$key" ]; then
    ssh-keygen -t ed25519 -C "mini-pc-cmsbj" -N "" -f "$key"
  fi
  ssh-keyscan -t ed25519,rsa github.com >> /root/.ssh/known_hosts 2>/dev/null || true
  local url
  url=$(git remote get-url origin 2>/dev/null || true)
  if [[ "$url" == https://* ]]; then
    git remote set-url origin git@github.com:TurtleLite/SISTEMA-WEB-EXPEDIENTES-CMSBJ.git
  fi
}

cd "$REPO_DIR"
OLD_HEAD=$(git rev-parse HEAD)
echo "==> Actualizando código desde GitHub (SSH, sin token)..."
ensure_ssh
if ! git fetch origin 2>/tmp/cmsbj_fetch.err; then
  echo
  echo "----------------------------------------------------------------------"
  echo "Falta registrar la llave de esta mini PC en GitHub (una sola vez):"
  echo "1) Copia la llave pública de abajo."
  echo "2) En GitHub: repo -> Settings -> Deploy keys -> Add deploy key."
  echo "   Pega la llave, título 'Mini PC CMSBJ', SIN marcar 'Allow write access'."
  echo "3) Vuelve a ejecutar:  sudo bash deploy/update_system.sh"
  echo "----------------------------------------------------------------------"
  echo
  cat /root/.ssh/id_ed25519.pub
  echo
  exit 1
fi
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

# --- Aplica script de mantenimiento de estatus (idempotente, corre en cada deploy) ---
if [ -f "$BACKEND_DIR/marcar_en_espera.sql" ]; then
  echo "==> Aplicando marcar_en_espera.sql (estatus 'En espera' para los expedientes de cargapx)..."
  DB_URL=$(grep -E '^[[:space:]]*DATABASE_URL=' "$BACKEND_DIR/.env" 2>/dev/null | head -1 | sed 's/^[[:space:]]*DATABASE_URL=//')
  if [ -n "$DB_URL" ]; then
    sudo -u postgres psql "$DB_URL" -f "$BACKEND_DIR/marcar_en_espera.sql" \
      || echo "  (aviso: no se pudo aplicar marcar_en_espera.sql)"
  else
    sudo -u postgres psql -d gestion_db -f "$BACKEND_DIR/marcar_en_espera.sql" \
      || echo "  (aviso: no se pudo aplicar marcar_en_espera.sql)"
  fi
fi

# --- Aplica script de domicilios (idempotente, corre en cada deploy) ---
if [ -f "$BACKEND_DIR/actualizar_domicilios.py" ]; then
  echo "==> Aplicando actualizar_domicilios.py (agrega domicilio a expedientes SIN OPERAR)..."
  DB_URL=$(grep -E '^[[:space:]]*DATABASE_URL=' "$BACKEND_DIR/.env" 2>/dev/null | head -1 | sed 's/^[[:space:]]*DATABASE_URL=//')
  ( cd "$BACKEND_DIR" && \
    DATABASE_URL="${DB_URL:-postgresql://gestion_user:gestion_pass@localhost:5432/gestion_db}" \
    ./venv/bin/python actualizar_domicilios.py --apply ) \
    || echo "  (aviso: no se pudo ejecutar actualizar_domicilios.py)"
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
