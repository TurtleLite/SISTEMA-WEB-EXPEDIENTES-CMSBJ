# Instalación en la mini PC (Linux) — Sistema de Expedientes SBJ

Guía para mover **todo el sistema** (base de datos + backend + frontend) desde la nube
(CockroachLabs + Render) a una mini PC con Linux, ejecutándolo como servicio `systemd`.

## Resumen de la arquitectura nueva

```
Mini PC (Linux, encendida siempre)
├── PostgreSQL 16        → base de datos (reemplaza CockroachLabs)
├── Backend FastAPI      → servicio systemd en el puerto 8000
│   └── frontend/ dist   → el backend sirve el frontend compilado (mismo puerto)
└── Sistema de archivos  → reports/, exports/, uploads/, backups/ en el repo
```

Un solo puerto (8000), sin nginx ni servidores web adicionales. Los equipos de la
LAN acceden a `http://IP_DE_LA_MINIPC:8000`.

## Requisitos

- Mini PC con Linux (Debian/Ubuntu, Arch/Manjaro o Fedora) y `sudo`.
- La URL de CockroachLabs (`DATABASE_URL`) para migrar los datos actuales.
- El repositorio accesible (clon por HTTPS o copiado por USB).

## 1. Instalación automática

```bash
sudo bash deploy/setup_minipc.sh
```

El script (con `sudo`) hace todo:

1. Instala PostgreSQL, Python 3, Node.js y utilidades (detecta `apt`/`pacman`/`dnf`).
2. Activa y arranca PostgreSQL, crea la base `gestion_db` y el usuario `gestion_user`.
3. Clona el repositorio en `/opt/expedientes` (o usa el que ya exista).
4. Crea el venv del backend e instala `requirements.txt`.
5. Genera `backend/.env` con `SECRET_KEY` aleatoria y `DATABASE_URL` local.
6. Compila el frontend (`npm run build` → `dist` servido por el backend).
7. Instala y arranca el servicio `expedientes-backend.service`.
8. Abre el puerto 8000 en el firewall (ufw).

Variables configurables (pasadas como entorno): `APP_DIR`, `DB_NAME`, `DB_USER`,
`DB_PASS`, `PORT`. **Cambie `DB_PASS`** (default `gestion_pass`).

> ¿Arch/CachyOS? El script lo soporta (`pacman`) y ejecuta `initdb` si es necesario.

## 2. Migrar los datos de CockroachLabs

Con el venv activado y **desde el directorio `backend`**:

```bash
cd /opt/expedientes/SISTEMA-WEB-EXPEDIENTES-CMSBJ/backend
source venv/bin/activate
python migrate_cockroach_to_postgres.py \
    --source "cockroachdb://usuario:password@host:26257/defaultdb" \
    --dest   "postgresql://gestion_user:gestion_pass@localhost:5432/gestion_db"
```

El script:

- Crea las tablas con los propios modelos del backend (`create_all`), garantizando
  que el esquema coincide exactamente con la aplicación.
- Copia todas las tablas en orden de dependencias (users, catálogos, listas,
  reportes, sesiones, auditoría...).
- Ajusta las secuencias (`setval`) para que los nuevos id no colisionen.

Verifique antes de migrar:

```bash
# El backend ya está corriendo contra PostgreSQL vacío (usuarios por defecto):
curl http://localhost:8000/health        # {"status":"ok"}
```

## 3. Verificación y primer acceso

```bash
systemctl status expedientes-backend     # activo y en ejecución
journalctl -u expedientes-backend -n 50  # logs de arranque
curl http://localhost:8000/health        # {"status":"ok"}
```

- Acceso local: `http://localhost:8000` (login `admin` / `admin123`)
- Acceso LAN: `http://IP_DE_LA_MINIPC:8000` (obtenga la IP con `hostname -I`)

En `Seguridad → Auditoría` podrá ver los registros migrados. Si los expedientes
no aparecen en la vista, renumere desde la opción correspondiente (renumeración
de expedientes, si la usa) — los datos están en `list_records`.

## 4. Operación diaria

| Acción | Comando |
|---|---|
| Ver estado | `systemctl status expedientes-backend` |
| Ver logs | `journalctl -u expedientes-backend -f` |
| Reiniciar | `sudo systemctl restart expedientes-backend` |
| Detener | `sudo systemctl stop expedientes-backend` |
| Respaldo BD | `cd backend && ./venv/bin/python backup_db.py` |
| Backup automático | cron: `0 3 * * * cd /opt/expedientes/SISTEMA-WEB-EXPEDIENTES-CMSBJ/backend && ./venv/bin/python backup_db.py` |

Los respaldos quedan en `backend/backups/` (fuera de git). Cópielos a un
almacenamiento externo (USB/Drive) como protección adicional.

## 5. Baja de los servicios en la nube (importante)

**Después de verificar la migración**, detenga los servicios en la nube para que
no sigan escribiendo en CockroachLabs (o se producirán datos duplicados):

1. Render → Web Service (backend): *Suspend* o elimínelo.
2. Render → Static Site (frontend): *Suspend* o elimínelo (opcional; puede dejarlo
   como respaldo apuntando al backend local si configura `ALLOWED_ORIGINS` y un túnel).
3. CockroachLabs → pause/delete el cluster (guardando antes un respaldo con
   `backup_db.py` contra la URL de CockroachLabs, por si acaso).
4. El workflow `.github/workflows/keep-alive.yml` dejará de ser necesario.

## 6. Opcional: acceso desde fuera de la LAN

Para consultar el sistema desde cualquier lugar de forma **segura** (recomendado
sobre abrir puertos), use un túnel:

- **Tailscale** (recomendado, simple): instale Tailscale en la mini PC y en los
  equipos autorizados; el sistema queda en `http://<nombre>:8000` sin exponer
  puertos a internet.
- **Cloudflare Tunnel**: `cloudflared tunnel --url http://localhost:8000` o un
  túnel con nombre de dominio propio; agregue la URL final a `ALLOWED_ORIGINS`
  en `backend/.env` y reinicie el servicio.

## Notas

- La app ya no usa el dialecto CockroachDB: al detectar que la URL no contiene
  `cockroachlabs`, SQLAlchemy usa el dialecto PostgreSQL estándar (psycopg2),
  sin cambios de código.
- Los índices trigram requieren la extensión `pg_trgm` (instalada por el script).
  El índice `CREATE INVERTED INDEX` de CockroachDB se omite solo en PostgreSQL
  (el backend lo intenta y registra una advertencia, sin romper el arranque).
- El frontend compilado llama a la API bajo `/api` (mismo origen): el middleware
  `api_prefix_shim` del backend lo resuelve; no se necesita `VITE_API_URL`.