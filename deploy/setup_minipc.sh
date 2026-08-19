#!/usr/bin/env bash
# =============================================================================
# Instalación del Sistema de Expedientes SBJ en la mini PC (Linux)
# -----------------------------------------------------------------------------
# Detecta automáticamente el gestor de paquetes (apt / pacman / dnf):
#   - Instala PostgreSQL, Python 3 + venv, Node.js y utilidades
#   - Crea la base de datos y el usuario de aplicación
#   - Instala el backend (venv + requirements)
#   - Compila el frontend (dist, servido por el propio backend en :8000)
#   - Configura el servicio systemd (arranque automático al encender)
#
# Uso:
#   sudo bash setup_minipc.sh
#
# Variables editables (pueden pasarse como entorno):
#   APP_DIR   directorio de instalación (default: /opt/expedientes)
#   DB_NAME   nombre de la base (default: gestion_db)
#   DB_USER   usuario de la base  (default: gestion_user)
#   DB_PASS   contraseña de la base (default: gestion_pass — ¡CAMBIAR!)
#   PORT      puerto HTTP (default: 8000)
# =============================================================================
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/expedientes}"
DB_NAME="${DB_NAME:-gestion_db}"
DB_USER="${DB_USER:-gestion_user}"
DB_PASS="${DB_PASS:-gestion_pass}"
PORT="${PORT:-8000}"

if [[ "$(id -u)" -ne 0 ]]; then
    echo "Ejecutar con sudo:  sudo bash setup_minipc.sh" >&2
    exit 1
fi

log()  { echo -e "\n\033[1;32m[setup]\033[0m $*"; }
fail() { echo -e "\n\033[1;31m[error]\033[0m $*" >&2; exit 1; }

# ----------------------------------------------------------------------------
log "Detectando gestor de paquetes..."
if command -v apt-get >/dev/null 2>&1; then
    PM="apt"
elif command -v pacman >/dev/null 2>&1; then
    PM="pacman"
elif command -v dnf >/dev/null 2>&1; then
    PM="dnf"
else
    fail "No se detectó apt, pacman ni dnf. Instale los paquetes manualmente."
fi
echo "    Gestor: $PM"

install_pkgs() {
    case "$PM" in
        apt)
            export DEBIAN_FRONTEND=noninteractive
            apt-get update -qq
            apt-get install -y -qq "$@" || fail "Fallo instalando paquetes"
            ;;
        pacman)
            pacman -Sy --noconfirm --needed "$@" || fail "Fallo instalando paquetes"
            ;;
        dnf)
            dnf install -y "$@" || fail "Fallo instalando paquetes"
            ;;
    esac
}

log "Instalando PostgreSQL, Python y Node.js..."
case "$PM" in
    apt)
        install_pkgs postgresql postgresql-contrib python3 python3-venv python3-pip \
                     nodejs npm openssl git curl ufw
        systemctl enable --now postgresql
        ;;
    pacman)
        install_pkgs postgresql python python-pip nodejs npm openssl git ufw
        if [[ ! -d /var/lib/postgres/data ]]; then
            install -d -o postgres -g postgres /var/lib/postgres/data
            sudo -u postgres initdb -D /var/lib/postgres/data -E UTF8 --locale=C
        fi
        systemctl enable --now postgresql
        ;;
    dnf)
        install_pkgs postgresql-server postgresql-contrib python3 python3-pip \
                     nodejs npm openssl git ufw
        if [[ ! -d /var/lib/pgsql/data/base ]]; then
            postgresql-setup --initdb || true
        fi
        systemctl enable --now postgresql
        ;;
esac

# ----------------------------------------------------------------------------
log "Creando base de datos y usuario '$DB_USER'..."
if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='$DB_USER'" | grep -q 1; then
    sudo -u postgres psql -c "CREATE ROLE $DB_USER LOGIN PASSWORD '$DB_PASS';"
fi
if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" | grep -q 1; then
    sudo -u postgres createdb -O "$DB_USER" "$DB_NAME"
fi
echo "    Base '$DB_NAME' lista"

# ----------------------------------------------------------------------------
log "Preparando directorio $APP_DIR..."
mkdir -p "$APP_DIR"
REPO="$APP_DIR/SISTEMA-WEB-EXPEDIENTES-CMSBJ"

if [[ -d "$REPO" ]]; then
    echo "    Repositorio ya existe: $REPO (se actualizará)"
    git -C "$REPO" pull --ff-only || echo "    (aviso: no se pudo hacer pull, continuando con lo existente)"
else
    echo "    Clonando repositorio..."
    git clone https://github.com/turtlelite/SISTEMA-WEB-EXPEDIENTES-CMSBJ.git "$REPO" \
        || fail "Fallo clonando el repositorio. Verifique la URL o copie el proyecto a $REPO"
fi

# ----------------------------------------------------------------------------
log "Instalando backend (venv)..."
cd "$REPO/backend"
python3 -m venv venv
./venv/bin/pip install --upgrade pip -q
./venv/bin/pip install -r requirements.txt -q || fail "Fallo instalando requirements"

if [[ ! -f .env ]]; then
    SECRET_KEY="$(openssl rand -hex 32)"
    LAN_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
    cat > .env <<EOF
DATABASE_URL=postgresql://$DB_USER:$DB_PASS@localhost:5432/$DB_NAME
SECRET_KEY=$SECRET_KEY
ALLOWED_ORIGINS=http://localhost:$PORT,http://$LAN_IP:$PORT
EOF
    chmod 600 .env
    echo "    .env generado (SECRET_KEY nueva, ALLOWED_ORIGINS con IP local $LAN_IP)"
else
    echo "    .env ya existe, no se modifica"
fi

# ----------------------------------------------------------------------------
log "Compilando frontend..."
cd "$REPO/frontend"
npm install --no-audit --no-fund
npm run build || fail "Fallo compilando el frontend"

# ----------------------------------------------------------------------------
log "Instalando servicio systemd..."
SERVICE="$REPO/deploy/expedientes-backend.service"
if [[ ! -f "$SERVICE" ]]; then
    fail "No se encontró $SERVICE"
fi
sed -e "s|/opt/expedientes|$APP_DIR|g" "$SERVICE" > /etc/systemd/system/expedientes-backend.service
systemctl daemon-reload
systemctl enable --now expedientes-backend
sleep 2
if systemctl is-active --quiet expedientes-backend; then
    echo "    Servicio expedientes-backend ACTIVO"
else
    echo "    AVISO: el servicio no arrancó; revise: journalctl -u expedientes-backend -n 50" >&2
fi

# ----------------------------------------------------------------------------
log "Configurando firewall (puerto $PORT)..."
if command -v ufw >/dev/null 2>&1; then
    ufw allow "$PORT"/tcp >/dev/null 2>&1 || true
    echo "    ufw: puerto $PORT permitido"
fi

LAN_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
cat <<EOF

==========================================================
  INSTALACIÓN COMPLETADA
==========================================================
  Acceso local:      http://localhost:$PORT
  Acceso LAN:        http://$LAN_IP:$PORT
  Base de datos:     $DB_NAME ($DB_USER@localhost:5432)
  Directorio:        $APP_DIR

  Usuarios por defecto: admin/admin123, direccion/direccion123,
  direccionmedica/direccionmedica123, medico/medico123

  Siguiente paso — migrar los datos actuales de CockroachLabs:
    cd $APP_DIR/SISTEMA-WEB-EXPEDIENTES-CMSBJ/backend
    source venv/bin/activate
    python migrate_cockroach_to_postgres.py \\
        --source "cockroachdb://usuario:password@host:26257/defaultdb" \\
        --dest   "postgresql://$DB_USER:$DB_PASS@localhost:5432/$DB_NAME"

  Logs: journalctl -u expedientes-backend -f
==========================================================
EOF