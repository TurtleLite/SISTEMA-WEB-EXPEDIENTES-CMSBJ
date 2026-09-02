# Sistema Web de Gestión de Expedientes Médicos — Centro Médico San Benito José

Aplicación web para el registro y administración de expedientes de pacientes del Centro Médico San Benito José: expedientes con número manual y control de copias, criticidad clínica, domicilio desglosado por departamento/municipio/localidad, búsqueda sin distinción de tildes, reportes exportables a Excel, listado diario de cirugías y estatus quirúrgico, todo controlado por roles y con auditoría completa.

## Requisitos de Infraestructura

El sistema corre en una **mini PC local (Linux) siempre encendida** que aloja la base de datos y el backend, y se expone a internet mediante **Tailscale Funnel** (URL fija y TLS automático, sin abrir puertos). El frontend se despliega como sitio estático en Render y se comunica con el backend por esa URL. Los datos de pacientes **no salen de la mini PC**.

| Componente | Dónde corre | Costo |
|------------|-------------|-------|
| Frontend (React) | Render (Static Site) | Gratis |
| Backend (FastAPI) | Mini PC local (servicio `systemd`, puerto 8000) | — (equipo propio) |
| Base de datos | PostgreSQL local en la mini PC | — (equipo propio) |
| Exposición externa | Tailscale Funnel (URL fija HTTPS) | Gratis |

Ventajas de esta arquitectura: los datos clínicos quedan en el equipo local (privacidad y cumplimiento), no hay dependencia de una base de datos en la nube, y la URL de acceso es estable aunque cambie la IP pública.

## Stack Tecnológico

| Componente | Tecnología | Licencia |
|------------|-----------|----------|
| Frontend | React 18 + Vite 5 + TypeScript | MIT |
| Navegación e iconos | React Router 6 + lucide-react | MIT |
| Estilos | Tailwind CSS 3 | MIT |
| Cliente HTTP | Axios | MIT |
| Backend | Python + FastAPI | MIT |
| ORM | SQLAlchemy | MIT |
| Base de Datos | PostgreSQL 16 (local) | PostgreSQL License |
| Autenticación | JWT (python-jose) + passlib/bcrypt | MIT/BSD |
| Excel | openpyxl | MIT |
| PDF (manuales) | ReportLab | BSD |

## Funcionalidades principales

- **Expedientes médicos:** registro con número de expediente **numérico escrito manualmente**; si el número ya existe, se guarda como copia identificada (ej.: `23455 (1)`) previa confirmación de que es una nueva intervención del paciente.
- **IMC automático:** en la sección Signos Vitales, al escribir el peso (kg) y la talla (mts), el sistema calcula el **B.M.I.** en tiempo real (`peso / talla²`) en un campo de solo lectura. El punto decimal de la talla se inserta automáticamente (ej.: escribir `184` se muestra como `1.84 mts`).
- **Criticidad clínica** (Baja, Media o Alta) y **domicilio desglosado** por departamento, municipio y localidad (Aldea, Barrio, Colonia o Caserío).
- **Búsqueda en tiempo real, sin distinción de mayúsculas ni tildes**, sobre nombre, apellido, identidad, número de expediente, diagnóstico, especialidad y perfil (y sobre cualquier campo al buscar por campo específico). Utiliza **índices trigram (GIN + `pg_trgm`)** sobre `data->>'campo'` y un **índice GIN sobre el JSONB `data`**, por lo que escala a cientos de miles de expedientes sin degradarse. Al elegir el campo en el desplegable **o** al escribir en la barra, la tabla se filtra al instante (el cliente aplica un *debounce* de 300 ms para no disparar una petición por tecla). El desplegable de búsqueda excluye los campos `cirujano`, `fecha_cirugia` y `estatus_cirugia`.
- **Reportes** en Excel (`REPORTE_<nombre>.xlsx`) con filtros por especialidad, perfil, criticidad y estatus, vista previa con reordenamiento de filas por arrastre (la columna No se renumera según el orden) y la columna "Observación" solo en reportes.
- **Listado Diario de Cirugías:** armado por fecha, filtro por estatus, reordenamiento por arrastre dentro de cada especialidad y exportación a Excel (`LISTADO_fecha.xlsx`).
- **Estatus quirúrgico** con 8 estados (En lista, En espera, Reprogramar, Cancelado, Fuera de perfil San Benito, Operado, No apto para cirugía, No se presentó) y observaciones que quedan en el expediente. Los estatus son un **catálogo administrable** (solo Administrador) desde **Estatus de Cirugía → Gestionar estatus**, con el mismo patrón que las especialidades: crear, renombrar (actualiza todos los expedientes), eliminar con reemplazo opcional y control de nombres similares.
- **Administración:** gestión de usuarios, sesiones activas (cerrar remotamente), auditoría de actividades y catálogos de especialidades, localidades y estatus de cirugía (solo Administrador).
- **Menú uniforme para todos los usuarios:** las secciones se ven igual para todos y el sistema valida el permiso por rol al seleccionarlas (mensaje "No tienes acceso").

## Roles y Permisos

Cinco roles: **Administrador**, **Dirección**, **Dirección Médica**, **Médico** y **Carga Px**.

| Función | Administrador | Dirección | Dirección Médica | Médico | Carga Px |
|---------|:---:|:---:|:---:|:---:|:---:|
| Consultar expedientes | Sí | Sí | Sí | Sí | Sí |
| Crear expedientes | No | Sí | Sí | Sí | Sí |
| Editar expedientes propios | No | Sí | Sí | Sí | Sí |
| Editar expedientes de otros | No | Sí | Sí | No | No |
| Eliminar expedientes | No | Sí | Sí | No | No |
| Exportar expedientes a Excel | Sí | Sí | Sí | Sí | No |
| Vista previa del expediente | Sí | Sí | Sí | Sí | Sí |
| Reportes (crear, generar, descargar, eliminar) | No | Sí | Sí | No | No |
| Listado diario de cirugías (armar y guardar) | No | Sí | Sí | No | No |
| Estatus de cirugía (asignar y cambiar) | No | Sí | Sí | No | No |
| Usuarios (crear, editar, eliminar, desbloquear, restablecer) | Sí | No | No | No | No |
| Sesiones (ver y cerrar) | Sí | No | No | No | No |
| Auditoría (historial de actividades) | Sí | No | No | No | No |
| Especialidades, localidades y estatus de cirugía (crear, editar, eliminar) | Sí | No | No | No | No |
| Mi Perfil (datos y contraseña) | Sí | Sí | Sí | Sí | Sí |

El Administrador **no crea, edita ni elimina expedientes**, pero **sí los exporta a Excel**; además consulta y administra la seguridad del sistema. El Médico crea expedientes y **solo edita los que él mismo creó** (no puede eliminarlos ni cambiar el estatus de cirugía). La eliminación de expedientes queda reservada a los roles **Dirección** y **Dirección Médica**. El rol **Carga Px** es de captura de datos: crea expedientes y escribe el **Nombre del Médico a mano** (campo libre, sin autocompletar con el usuario), pero solo edita los expedientes que él mismo creó y no puede eliminar, exportar ni cambiar el estatus de cirugía.

## Usuarios por defecto

Creados por `python run_seed.py` (solo si la tabla de usuarios está vacía):

| Usuario | Contraseña | Rol |
|---------|-----------|-----|
| admin | admin123 | Administrador |
| direccion | direccion123 | Dirección |
| direccionmedica | direccionmedica123 | Dirección Médica |
| medico | medico123 | Médico |
| cargapx | cargapx123 | Carga Px |

> **Importante:** en producción estas contraseñas por defecto deben cambiarse desde **Mi Perfil** (o por el administrador desde **Usuarios → Restablecer**). La instalación actual del Centro Médico usa sus propios usuarios migrados; el usuario administrador de esa instalación es `administrador`. Si el administrador pierde su acceso, se recupera con `python reset_users.py` o modificando el hash en la base de datos.

## Estructura del Proyecto

```
SISTEMA-WEB-EXPEDIENTES-CMSBJ/
├── backend/
│   ├── app/
│   │   ├── api/          # Endpoints REST (auth, users, lists, reports, day_lists, specialties, localities, audit)
│   │   ├── core/         # Config, DB, seguridad (JWT)
│   │   ├── models/       # Modelos SQLAlchemy
│   │   ├── schemas/      # Schemas Pydantic
│   │   ├── services/     # Lógica de negocio (auth, usuarios, expedientes, auditoría, índices de rendimiento)
│   │   └── main.py       # Punto de entrada (CORS, cabeceras de seguridad, /health, creación de índices)
│   ├── exports/          # Excel de expedientes exportados
│   ├── reports/          # Reportes generados
│   ├── backups/          # Respaldos de la base de datos (archivos .sql.gz / .xlsx, en .gitignore)
│   ├── generate_docs.py  # Genera los manuales de usuario y el Acuerdo Marco (PDF)
│   ├── backup_db.py      # Respaldo de PostgreSQL a archivo
│   ├── migrate_cockroach_to_postgres.py  # Migración desde la nube (CockroachLabs → PostgreSQL local)
│   ├── run_seed.py       # Crea los usuarios por defecto
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── components/   # Componentes reutilizables (Layout, ExpedienteForm, ScrollSelect, etc.)
│   │   ├── contexts/     # Contextos (Auth, Notificaciones)
│   │   ├── pages/        # Páginas (Login, Dashboard, ListDetail, Reports, DayList, EstadoCirugia, Users, Sessions, AuditLog, Profile)
│   │   ├── services/      # Cliente de API
│   │   ├── types/        # Tipos TypeScript
│   │   ├── utils/        # Utilidades (formato de teléfono, normalización de texto)
│   │   └── constants.ts  # Constantes (roles, tipos de localidad, departamentos)
│   └── package.json
├── docs_v17/             # Manuales de usuario y Acuerdo Marco (PDF)
└── .github/workflows/    # (Obsoleto) keep-alive del backend en Render; ya no se usa
```

## Instalación y Ejecución (desarrollo local)

La base de datos es **PostgreSQL local**. Configura `backend/.env` con `DATABASE_URL`
apuntando a tu instancia de PostgreSQL:

```
DATABASE_URL=postgresql://usuario:password@localhost:5432/CMSBJ_SERVER
```

### 1. Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python run_seed.py
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

Al arrancar, el backend crea/actualiza automáticamente los índices de rendimiento
(`ensure_performance_indexes`: extensión `pg_trgm`, índices trigram por campo y GIN
sobre `data`).

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Configura la URL del backend en `frontend/.env` (desarrollo):

```
VITE_API_URL=http://localhost:8000
```

### 3. Acceso

- Frontend: http://localhost:5173
- Backend API: http://localhost:8000
- Documentación API: http://localhost:8000/docs

## Despliegue (arquitectura actual: miniPC + Render + Tailscale Funnel)

El sistema ya **no usa CockroachLabs ni un backend en Render**. La guía paso a paso de
la mini PC está en [`deploy/INSTALL_MINIPC.md`](deploy/INSTALL_MINIPC.md).

### 1. Mini PC (base de datos + backend)

- **PostgreSQL 16** aloja la base de datos localmente.
- El **backend FastAPI** corre como servicio `systemd` (`expedientes-backend.service`,
  con `Restart=always`, arranca solo con la mini PC) en el puerto `8000`.
- Se expone a internet con **Tailscale Funnel** mediante el servicio `tailscale-funnel.service`,
  que levanta el túnel en `https://cmsbjserver.tailf34429.ts.net` (HTTPS con certificado
  gestionado por Tailscale, sin abrir puertos en el router).
- Al iniciar, el backend aplica las migraciones de esquema y los índices de rendimiento.

### 2. Frontend (Render — Static Site)

1. New + → **Static Site**, conecta el repositorio `SISTEMA-WEB-EXPEDIENTES-CMSBJ`.
2. Configura:
   - **Root Directory:** `frontend`
   - **Build Command:** `npm install && npm run build`
   - **Publish Directory:** `dist`
3. Variable de entorno:
   - `VITE_API_URL` → `https://cmsbjserver.tailf34429.ts.net` (la URL del Funnel del backend)
4. Deploy. Servicio Render: `srv-d9nqs47lk1mc738ldgng`.

### 3. URLs del sistema

| Servicio | URL |
|----------|-----|
| API (backend vía Funnel) | https://cmsbjserver.tailf34429.ts.net |
| Docs API | https://cmsbjserver.tailf34429.ts.net/docs |
| Health | https://cmsbjserver.tailf34429.ts.net/health |
| Frontend (Render) | https://srv-d9nqs47lk1mc738ldgng.onrender.com |

> El backend acepta peticiones CORS solo desde los orígenes listados en `ALLOWED_ORIGINS`
> (`backend/app/main.py`). Si cambias la URL del frontend, añádela allí.

### Mantener el backend activo

El backend corre en la mini PC como servicio `systemd` y **siempre está disponible**
(no se "duerme" como los servicios gratuitos de Render). Por eso el workflow
`.github/workflows/keep-alive.yml` **ya no es necesario** y puede eliminarse.

### Actualizar el sistema

- **Backend:** en la mini PC, tras hacer `git pull` del repositorio:
  ```bash
  sudo systemctl restart expedientes-backend
  ```
  Los índices de rendimiento se recrean/actualizan solos al arrancar.
- **Frontend:** basta con empujar a `main`; Render reconstruye el sitio automáticamente.

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

## Respaldo de la base de datos

Los respaldos se guardan como **archivos** en `backend/backups/` (ya no dentro de la
base de datos, lo que eliminó el límite de 1 GB que existía antes). Se generan desde
la interfaz (**Respaldos**) o con el script `backend/backup_db.py` (PostgreSQL):

```bash
cd backend
python backup_db.py              # respaldo completo comprimido (.sql.gz) + tabla general (.xlsx)
python backup_db.py --keep 14    # conservar los últimos 14 respaldos (default: 7)
```

- **Salida:** `backend/backups/backup_YYYYMMDD_HHMMSS.sql.gz` (esquema + datos) y
  `backend/backups/tabla_general_YYYYMMDD_HHMMSS.xlsx`.
- **Conexión:** lee `DATABASE_URL` de la variable de entorno o de `backend/.env`.
- **Retención:** elimina automáticamente los respaldos más antiguos que los `--keep` últimos.
- **Restaurar:**

  ```bash
  gunzip -k backups/backup_20260101_000000.sql.gz
  psql "$DATABASE_URL" -f backups/backup_20260101_000000.sql
  ```

### Programar el respaldo diario

**Linux (cron en la mini PC):**

```cron
0 3 * * * cd /opt/expedientes/SISTEMA-WEB-EXPEDIENTES-CMSBJ/backend && ./venv/bin/python backup_db.py
```

> `backups/` está en `.gitignore`; los respaldos contienen datos de pacientes y no deben
> subirse al repositorio. Por protección adicional, copia el respaldo diario a un
> almacenamiento externo (USB, Drive, etc.). Como los datos viven en la mini PC, esta
> copia externa es la única salida de información del sistema.

## Seguridad

### Autenticación y control de acceso

- **Bloqueo de cuenta:** después de 5 intentos de contraseña fallidos, la cuenta se bloquea por 15 minutos (el administrador puede desbloquearla desde Usuarios).
- **Límite de intentos por IP:** máximo 20 intentos de inicio de sesión fallidos por IP en 15 minutos; se responde `429`.
- **Control de sesiones:** cada inicio de sesión crea una sesión rastreable (IP, navegador, dispositivo). Desde **Seguridad → Sesiones** se pueden ver todas las sesiones activas y cerrarlas remotamente. El cierre de sesión revoca el token de inmediato.
- **Registro de auditoría:** **Seguridad → Auditoría** muestra quién creó, modificó, exportó o descargó expedientes, reportes, listados y usuarios, con fecha, acción, detalle e IP.
- **Permisos por rol:** el menú es uniforme para todos los usuarios; el sistema valida el permiso de la sección al seleccionarla y muestra "No tienes acceso" si el rol no está autorizado. La eliminación de expedientes está reservada a Dirección y Dirección Médica.

### Configuración requerida en producción

- `SECRET_KEY`: obligatoria en la variable de entorno con **mínimo 32 caracteres**. El backend **no arranca** si falta o es la clave por defecto.
- `ALLOWED_ORIGINS`: opcional, lista de orígenes extra permitidos por CORS separados por comas.

### Transporte

- El acceso externo se realiza vía **Tailscale Funnel**, que termina TLS (HTTPS) con un certificado válido y no expone puertos del router.
- En el backend, cuando la petición llega por proxy con `X-Forwarded-Proto: https`, se aplican `Strict-Transport-Security` (HSTS) y redirección HTTP→HTTPS.
- Cabeceras de seguridad en todas las respuestas: `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`.
- Los errores internos ya no exponen detalles al cliente; se responde un mensaje genérico y el detalle queda en los logs del servidor.
