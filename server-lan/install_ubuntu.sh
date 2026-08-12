#!/usr/bin/env bash
# ============================================================
#  INSTALADOR DE LA MINI PC (Ubuntu Server 24.04 LTS)
#  Sistema Web de Gestión de Expedientes Médicos — Centro Médico San Benito José
#  Modo: SOLO RED LOCAL (sin nube, sin túnel, sin dominio)
#
#  Uso:  sudo bash install_ubuntu.sh
#  1) Instala Python, Node.js y PostgreSQL
#  2) Crea la base gestion_db y el usuario del sistema
#  3) Clona el repositorio y compila el frontend
#  4) Instala los servicios systemd (arranque automático + backup diario)
#  5) Muestra la URL final: http://<IP-de-la-mini>:8000
# ============================================================
set -euo pipefail

APP_DIR="/home/expedientes/app"
REPO_URL="https://github.com/TurtleLite/SISTEMA-WEB-EXPEDIENTES-CMSBJ.git"

if [ "$EUID" -ne 0 ]; then
    echo "[ERROR] Ejecuta con sudo:  sudo bash install_ubuntu.sh"
    exit 1
fi

echo "== [1/6] Actualizando el sistema e instalando dependencias =="
apt-get update -y
apt-get install -y python3 python3-venv python3-pip nodejs npm postgresql git curl
systemctl enable --now postgresql

echo "== [2/6] Creando base de datos y usuario de aplicación =="
sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='gestion_user'" | grep -q 1 \
    || sudo -u postgres psql -c "CREATE USER gestion_user WITH PASSWORD 'gestion_pass';"
sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='gestion_db'" | grep -q 1 \
    || sudo -u postgres psql -c "CREATE DATABASE gestion_db OWNER gestion_user;"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE gestion_db TO gestion_user;" 2>/dev/null || true

echo "== [3/6] Creando usuario del sistema y clonando el repositorio =="
id expedientes &>/dev/null || useradd -m -s /bin/bash expedientes
mkdir -p "$APP_DIR"
if [ ! -d "$APP_DIR/.git" ]; then
    git clone "$REPO_URL" "$APP_DIR"
else
    git -C "$APP_DIR" pull --ff-only
fi
chown -R expedientes:expedientes "$APP_DIR"

echo "== [4/6] Instalando dependencias y compilando el frontend =="
sudo -u expedientes bash -c "
    set -e
    cd '$APP_DIR/backend'
    python3 -m venv venv
    ./venv/bin/pip install --upgrade pip -q
    ./venv/bin/pip install -r requirements.txt -q
    cd '$APP_DIR/frontend'
    npm ci --no-audit --no-fund
    npm run build
"

echo "== [5/6] Configurando variables de entorno =="
ENV_FILE="$APP_DIR/backend/.env"
if [ ! -f "$ENV_FILE" ]; then
    SECRET=$(openssl rand -hex 32)
    cat > "$ENV_FILE" <<EOF
DATABASE_URL=postgresql://gestion_user:gestion_pass@localhost:5432/gestion_db
SECRET_KEY=$SECRET
ALLOWED_ORIGINS=
EOF
    chown expedientes:expedientes "$ENV_FILE"
fi

echo "== [6/6] Instalando servicios systemd =="
cp "$(dirname "$(readlink -f "$0")")/expedientes.service" /etc/systemd/system/
cp "$(dirname "$(readlink -f "$0")")/expedientes-backup.service" /etc/systemd/system/
cp "$(dirname "$(readlink -f "$0")")/expedientes-backup.timer" /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now expedientes.service
systemctl enable --now expedientes-backup.timer

IP=$(hostname -I 2>/dev/null | awk '{print $1}')
echo ""
echo "============================================================"
echo "  INSTALACION COMPLETADA"
echo "============================================================"
echo "  Accede desde cualquier equipo del consultorio:"
echo ""
echo "      http://$IP:8000"
echo ""
echo "  Usuarios por defecto: admin/admin123, direccion/direccion123,"
echo "  direccionmedica/direccionmedica123, medico/medico123"
echo ""
echo "  Backup diario automatico: 03:00 (backend/backups/)"
echo "  Servicio: systemctl status expedientes"
echo "  Logs:     journalctl -u expedientes -f"
echo "============================================================"