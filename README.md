# Sistema Web de Gestión de Expedientes Médicos — Centro Médico San Benito José

Aplicación web para el registro y administración de expedientes de pacientes del Centro Médico San Benito José: expedientes con número manual y control de copias, criticidad clínica, domicilio desglosado por departamento/municipio/localidad, búsqueda sin distinción de tildes, reportes exportables a Excel, listado diario de cirugías y estatus quirúrgico, todo controlado por roles y con auditoría completa.

## Requisitos de Infraestructura

**No necesitas ningún servidor físico.** Todo corre en la nube de forma gratuita:

| Componente | Dónde corre | Costo |
|------------|-------------|-------|
| Frontend (React) | Render (Static Site) | Gratis |
| Backend (FastAPI) | Render (Web Service) | Gratis |
| Base de datos | CockroachLabs Cloud | Gratis (500MB) |

## Stack Tecnológico (100% gratuito)

| Componente | Tecnología | Licencia |
|------------|-----------|----------|
| Frontend | React 18 + Vite 5 + TypeScript | MIT |
| Navegación e iconos | React Router 6 + lucide-react | MIT |
| Estilos | Tailwind CSS 3 | MIT |
| Cliente HTTP | Axios | MIT |
| Backend | Python + FastAPI | MIT |
| ORM | SQLAlchemy | MIT |
| Base de Datos | CockroachDB (CockroachLabs Cloud) | BSL (gratuito en la nube) |
| Autenticación | JWT (python-jose) + passlib/bcrypt | MIT/BSD |
| Excel | openpyxl | MIT |
| PDF (manuales) | ReportLab | BSD |

## Funcionalidades principales

- **Expedientes médicos:** registro con número de expediente **numérico escrito manualmente**; si el número ya existe, se guarda como copia identificada (ej.: `23455 (1)`) previa confirmación de que es una nueva intervención del paciente.
- **IMC automático:** en la sección Signos Vitales, al escribir el peso (kg) y la talla (mts), el sistema calcula el **B.M.I.** en tiempo real (`peso / talla²`) en un campo de solo lectura. El punto decimal de la talla se inserta automáticamente (ej.: escribir `184` se muestra como `1.84 mts`).
- **Criticidad clínica** (Baja, Media o Alta) y **domicilio desglosado** por departamento, municipio y localidad (Aldea, Barrio, Colonia o Caserío).
- **Búsqueda automática sin distinción de mayúsculas ni tildes** en nombre, apellido, identidad, número de expediente, diagnóstico, especialidad y perfil; lista paginada de 50 en 50.
- **Reportes** en Excel (`REPORTE_<nombre>.xlsx`) con filtros por especialidad, perfil, criticidad y estatus, vista previa con reordenamiento de filas por arrastre (la columna No se renumera según el orden) y la columna "Observación" solo en reportes.
- **Listado Diario de Cirugías:** armado por fecha, filtro por estatus, reordenamiento por arrastre dentro de cada especialidad y exportación a Excel (`LISTADO_fecha.xlsx`).
- **Estatus quirúrgico** con 7 estados (En espera, Reprogramar, Cancelado, Fuera de perfil San Benito, Operado, No apto para cirugía, No se presentó) y observaciones que quedan en el expediente.
- **Administración:** gestión de usuarios, sesiones activas (cerrar remotamente), auditoría de actividades y catálogos de especialidades y localidades (solo Administrador).
- **Menú uniforme para todos los usuarios:** las secciones se ven igual para todos y el sistema valida el permiso por rol al seleccionarlas (mensaje "No tienes acceso").

## Roles y Permisos

Cuatro roles: **Administrador**, **Dirección**, **Dirección Médica** y **Médico**.

| Función | Administrador | Dirección | Dirección Médica | Médico |
|---------|:---:|:---:|:---:|:---:|
| Consultar expedientes | Sí | Sí | Sí | Sí |
| Crear expedientes | No | Sí | Sí | Sí |
| Editar expedientes propios | No | Sí | Sí | Sí |
| Editar expedientes de otros | No | Sí | Sí | No |
| Eliminar expedientes | No | Sí | Sí | No |
| Exportar expedientes a Excel | No | Sí | Sí | Sí |
| Vista previa del expediente | Sí | Sí | Sí | Sí |
| Reportes (crear, generar, descargar, eliminar) | No | Sí | Sí | No |
| Listado diario de cirugías (armar y guardar) | No | Sí | Sí | No |
| Estatus de cirugía (asignar y cambiar) | No | Sí | Sí | No |
| Usuarios (crear, editar, eliminar, desbloquear, restablecer) | Sí | No | No | No |
| Sesiones (ver y cerrar) | Sí | No | No | No |
| Auditoría (historial de actividades) | Sí | No | No | No |
| Especialidades y localidades (crear, editar, eliminar) | Sí | No | No | No |
| Mi Perfil (datos y contraseña) | Sí | Sí | Sí | Sí |

El Administrador **no crea, edita, elimina ni exporta expedientes**; únicamente los consulta y administra la seguridad del sistema. El Médico crea expedientes y **solo edita los que él mismo creó** (no puede eliminarlos ni cambiar el estatus de cirugía).

## Usuarios por defecto

Creados por `python run_seed.py` (solo si la tabla de usuarios está vacía):

| Usuario | Contraseña | Rol |
|---------|-----------|-----|
| admin | admin123 | Administrador |
| direccion | direccion123 | Dirección |
| direccionmedica | direccionmedica123 | Dirección Médica |
| medico | medico123 | Médico |

> **Importante:** en producción estas contraseñas por defecto deben cambiarse desde **Mi Perfil** (o por el administrador desde **Usuarios → Restablecer**). Si el administrador pierde su acceso, se recupera con `python reset_users.py` (restablece los usuarios por defecto) o modificando el hash en la base de datos. El usuario administrador de la instalación actual es `administrador`.

## Estructura del Proyecto

```
SISTEMA-WEB-EXPEDIENTES-CMSBJ/
├── backend/
│   ├── app/
│   │   ├── api/          # Endpoints REST (auth, users, lists, reports, day_lists, specialties, localities, audit)
│   │   ├── core/         # Config, DB, seguridad (JWT)
│   │   ├── models/       # Modelos SQLAlchemy
│   │   ├── schemas/      # Schemas Pydantic
│   │   ├── services/     # Lógica de negocio (auth, usuarios, expedientes, auditoría)
│   │   └── main.py       # Punto de entrada (CORS, HTTPS, cabeceras de seguridad, /health)
│   ├── exports/          # Excel de expedientes exportados
│   ├── reports/          # Reportes generados
│   ├── backups/          # Respaldos de la base de datos (.sql.gz, en .gitignore)
│   ├── generate_docs.py  # Genera los manuales de usuario y el Acuerdo Marco (PDF)
│   ├── backup_db.py      # Respaldo diario de la base de datos
│   ├── run_seed.py       # Crea los usuarios por defecto
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── components/   # Componentes reutilizables (Layout, ExpedienteForm, etc.)
│   │   ├── contexts/     # Contextos (Auth, Notificaciones)
│   │   ├── pages/        # Páginas (Login, Dashboard, ListDetail, Reports, DayList, EstadoCirugia, Users, Sessions, AuditLog, Profile)
│   │   ├── services/     # Cliente de API
│   │   ├── types/        # Tipos TypeScript
│   │   ├── utils/        # Utilidades (formato de teléfono, normalización de texto)
│   │   └── constants.ts  # Constantes (roles, tipos de localidad, departamentos)
│   └── package.json
├── docs_v17/             # Manuales de usuario y Acuerdo Marco (PDF)
└── .github/workflows/    # Keep-alive del backend en Render
```

## Instalación y Ejecución (desarrollo local)

La base de datos ya está en la nube (ver [Despliegue](#despliegue-100-en-la-nube)); localmente solo configuras `backend/.env` con `DATABASE_URL` apuntando al cluster de CockroachLabs.

### 1. Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python run_seed.py
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

### 3. Acceso

- Frontend: http://localhost:5173
- Backend API: http://localhost:8000
- Documentación API: http://localhost:8000/docs

## Despliegue (100% en la nube)

### 1. Base de Datos (CockroachDB en CockroachLabs Cloud)

La base de datos está alojada en la nube de **CockroachLabs** (SQL distribuido, compatible con PostgreSQL). No requiere instalación ni servidor local.

- **Cluster:** `sanbenitojose-bancodepacientes-30660` (región `aws-us-east-1`)
- **Host:** `sanbenitojose-bancodepacientes-30660.j77.aws-us-east-1.cockroachlabs.cloud:26257`
- **Base de datos:** `defaultdb`
- **Credenciales:** se configuran como variable de entorno `DATABASE_URL` con formato `cockroachdb://usuario:password@host:26257/defaultdb`
- **Nota (Render):** en `DATABASE_URL` usa `?sslmode=require`. El contenedor de Render no tiene el certificado CA de CockroachCloud y con `sslmode=verify-full` la conexión falla.

### 2. Backend (Render — Web Service)

1. Crea cuenta en https://render.com (con GitHub)
2. New + → **Web Service**
3. Conecta el repositorio `SISTEMA-WEB-EXPEDIENTES-CMSBJ`
4. Configura:
   - **Root Directory:** `backend`
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
5. Agrega variables de entorno:
   - `DATABASE_URL` → la URL de CockroachLabs (formato `cockroachdb://...`)
   - `SECRET_KEY` → una clave secreta aleatoria (mínimo 32 caracteres)
6. Deploy. La API quedará en `https://<tu-servicio>.onrender.com` (docs en `/docs`, salud en `/health`)

### 3. Frontend (Render — Static Site)

1. New + → **Static Site**
2. Conecta el repositorio `SISTEMA-WEB-EXPEDIENTES-CMSBJ`
3. Configura:
   - **Root Directory:** `frontend`
   - **Build Command:** `npm install && npm run build`
   - **Publish Directory:** `dist`
4. Agrega variable de entorno:
   - `VITE_API_URL` → `https://<tu-servicio-backend>.onrender.com`
5. Deploy. El sitio queda en `https://<tu-sitio>.onrender.com`

### Mantener el backend despierto

El workflow `.github/workflows/keep-alive.yml` hace ping a `https://expedientes-api-2dje.onrender.com/health` cada 10 minutos para evitar que el servicio gratuito de Render se duerma.

### URLs actuales del sistema

| Servicio | URL |
|----------|-----|
| Frontend | https://sistema-web-expedientes-cmsbj.onrender.com |
| Backend API | https://expedientes-api-2dje.onrender.com |
| Docs API | https://expedientes-api-2dje.onrender.com/docs |
| Health | https://expedientes-api-2dje.onrender.com/health |

> **Nota:** el backend acepta peticiones CORS solo desde los orígenes listados en `ALLOWED_ORIGINS` (backend/app/main.py). Si cambias la URL del frontend o del backend, actualízala allí.

## Documentación de usuario

Los manuales de usuario por rol y el Acuerdo Marco se generan con `backend/generate_docs.py` y quedan en `docs_v17/`:

```bash
cd backend
pip install reportlab
python generate_docs.py --out ../docs_v17
```

| Documento | Descripción |
|-----------|-------------|
| `Manual_Usuario_Direccion.pdf` | Manual del rol Dirección |
| `Manual_Usuario_Direccion_Medica.pdf` | Manual del rol Dirección Médica |
| `Manual_Usuario_Medico.pdf` | Manual del rol Médico |
| `Acuerdo_Marco_Sistema_Expedientes_SBJ.pdf` | Contrato de desarrollo, titularidad y Anexo de Protección de Datos Personales de Salud |

## Respaldo de la base de datos (Art. 15 del Acuerdo Marco)

El respaldo se realiza con el script `backend/backup_db.py` (Python puro, funciona en Windows, Linux y Render; no requiere binarios adicionales).

```bash
cd backend
python backup_db.py              # respaldo completo comprimido
python backup_db.py --keep 14    # conservar los últimos 14 respaldos (default: 7)
```

- **Salida:** `backend/backups/backup_YYYYMMDD_HHMMSS.sql.gz` (esquema + datos de todas las tablas, con `BEGIN;...COMMIT;`).
- **Conexión:** lee `DATABASE_URL` de la variable de entorno o de `backend/.env`.
- **Retención:** elimina automáticamente los respaldos más antiguos que los `--keep` últimos.
- **Restaurar** (por ejemplo en un cluster nuevo):

  ```bash
  gunzip -k backups/backup_20260101_000000.sql.gz
  psql "$DATABASE_URL" -f backups/backup_20260101_000000.sql
  ```

### Programar el respaldo diario

**Windows (Task Scheduler):**
1. `Win+R` → `taskschd.msc` → Crear tarea básica.
2. Nombre: `Respaldo SBJ` → Diaria → hora deseada (ej. 03:00).
3. Acción: Iniciar programa → `python.exe` (el de `backend\venv\Scripts\python.exe`) con argumentos `"C:\ruta\SISTEMA-WEB-EXPEDIENTES-CMSBJ\backend\backup_db.py"` y "Iniciar en" el directorio `backend`.

**Linux/Render (cron):**

```cron
0 3 * * * cd /ruta/SISTEMA-WEB-EXPEDIENTES-CMSBJ/backend && python3 backup_db.py
```

> **Nota:** `backups/` está en `.gitignore`; los respaldos contienen datos de pacientes y no deben subirse al repositorio. Para protección adicional, copia el respaldo diario a un almacenamiento externo (Google Drive, OneDrive, disco USB, etc.).

## Seguridad

### Autenticación y control de acceso

- **Bloqueo de cuenta:** después de 5 intentos de contraseña fallidos, la cuenta se bloquea por 15 minutos (el administrador puede desbloquearla desde Usuarios).
- **Límite de intentos por IP:** máximo 20 intentos de inicio de sesión fallidos por IP en 15 minutos; se responde `429`.
- **Control de sesiones:** cada inicio de sesión crea una sesión rastreable (IP, navegador, dispositivo). Desde **Seguridad → Sesiones** se pueden ver todas las sesiones activas y cerrarlas remotamente. El cierre de sesión revoca el token de inmediato.
- **Registro de auditoría:** **Seguridad → Auditoría** muestra quién creó, modificó, exportó o descargó expedientes, reportes, listados y usuarios, con fecha, acción, detalle e IP.
- **Permisos por rol:** el menú es uniforme para todos los usuarios; el sistema valida el permiso de la sección al seleccionarla y muestra "No tienes acceso" si el rol no está autorizado.

### Configuración requerida en producción

- `SECRET_KEY`: obligatoria en la variable de entorno con **mínimo 32 caracteres**. El backend **no arranca** si falta o es la clave por defecto.
- `ALLOWED_ORIGINS`: opcional, lista de orígenes extra permitidos por CORS separados por comas (por ejemplo una URL exacta de túnel como `https://mi-tunel.trycloudflare.com`). Los wildcards (`*.trycloudflare.com`) ya no están permitidos por seguridad.

### Transporte

- Redirección automática HTTP → HTTPS y cabecera `Strict-Transport-Security` (HSTS) cuando la petición llega por proxy con `X-Forwarded-Proto: https`.
- Cabeceras de seguridad en todas las respuestas: `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`.
- Los errores internos ya no exponen detalles al cliente; se responde un mensaje genérico y el detalle queda en los logs del servidor.
