from app.core.database import SessionLocal, engine, Base
from app.models.user import User
from app.core.security import hash_password

Base.metadata.create_all(bind=engine)


def seed():
    db = SessionLocal()
    try:
        existing = db.query(User).filter(User.username == "admin").first()
        if existing:
            print("El usuario admin ya existe")
            return

        admin = User(
            username="admin",
            telefono="2201-1100",
            full_name="Administrador",
            hashed_password=hash_password("admin123"),
            role="admin",
            is_active=True,
        )
        db.add(admin)

        direccion = User(
            username="direccion",
            telefono="2201-1101",
            full_name="Director General",
            hashed_password=hash_password("direccion123"),
            role="direccion",
            is_active=True,
        )
        db.add(direccion)

        direccion_medica = User(
            username="direccionmedica",
            telefono="2201-1102",
            full_name="Dirección Médica",
            hashed_password=hash_password("direccionmedica123"),
            role="direccion_medica",
            is_active=True,
        )
        db.add(direccion_medica)

        medico = User(
            username="medico",
            telefono="2201-1103",
            full_name="Dr. Médico",
            hashed_password=hash_password("medico123"),
            role="medico",
            is_active=True,
        )
        db.add(medico)

        carga_px = User(
            username="cargapx",
            telefono="2201-1104",
            full_name="Carga Px",
            hashed_password=hash_password("cargapx123"),
            role="carga_px",
            is_active=True,
        )
        db.add(carga_px)

        oftalmologia = User(
            username="oftalmologia",
            telefono="2201-1105",
            full_name="Oftalmología",
            hashed_password=hash_password("oftalmologia123"),
            role="oftalmologia",
            is_active=True,
        )
        db.add(oftalmologia)

        db.commit()
        print("Usuarios creados correctamente:")
        print("  admin / admin123")
        print("  direccion / direccion123")
        print("  direccionmedica / direccionmedica123")
        print("  medico / medico123")
        print("  cargapx / cargapx123")
        print("  ofthalmologia / ofthalmologia123")
    except Exception as e:
        print(f"Error: {e}")
        db.rollback()
    finally:
        db.close()
