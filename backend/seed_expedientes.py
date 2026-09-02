"""Seed 50 expedientes de prueba con todos los campos llenos para el área de reportes."""
import random
from datetime import date, timedelta
from app.core.database import SessionLocal
from app.models.list_definition import ListDefinition, ListRecord

random.seed(42)

NOMBRES_M = ["José", "Carlos", "Luis", "Marco", "Pedro", "Jorge", "Miguel", "Roberto", "Rafael", "Óscar",
             "Manuel", "Francisco", "David", "Héctor", "Sergio", "Javier", "Raúl", "Mario", "Antonio", "Daniel",
             "Wilmer", "Nelson", "Eduardo", "René", "Santos"]
NOMBRES_F = ["María", "Ana", "Lourdes", "Karla", "Rebeca", "Sofía", "Martha", "Rosa", "Celia", "Iris",
             "Diana", "Claudia", "Yolanda", "Gloria", "Suyapa", "Wendy", "Norma", "Lesly", "Jennifer", "Patricia",
             "Bertha", "Carla", "Ileana", "Nury", "Xiomara"]
APELLIDOS = ["Prado", "Padilla", "López", "Martínez", "Hernández", "García", "Rodríguez", "Flores", "Ramírez", "Mejía",
             "Cruz", "Vargas", "Castillo", "Reyes", "Mendoza", "Aguilar", "Pineda", "Zelaya", "Suazo", "Barahona",
             "Maldonado", "Ramos", "Alvarado", "Osorio", "Benítez"]
DOMICILIOS = ["Col. El Prado, Tegucigalpa", "Barrio La Plazuela, San Pedro Sula", "Azacualpa, El Triunfo",
              "Col. Satélite, Comayagüela", "Barrio El Centro, Choluteca", "Res. Las Haciendas, La Ceiba",
              "Barrio La Guadalupe, Siguatepeque", "Col. Villa Nueva, Tegucigalpa", "Barrio El Carmen, Danlí",
              "Col. Miramontes, El Progreso", "Barrio La Merced, Comayagua", "Res. Altos de la Hacienda, San Pedro Sula",
              "Col. Los Ángeles, Juticalpa", "Barrio El Porvenir, Santa Rosa de Copán", "Col. San Miguel, La Paz",
              "Barrio El Centro, Olanchito", "Res. Brisas del Valle, Tegucigalpa", "Col. Gracias a Dios, Puerto Cortés",
              "Barrio San José, Yoro", "Col. Santa Lucía, Nacaome", "Barrio El Centro, Trujillo",
              "Col. Aurora, Tegucigalpa", "Res. Jardines del Valle, Danlí", "Barrio Concepción, Ocotepeque",
              "Col. 4 de Junio, La Esperanza"]
RESPONSABLES_M = ["Sra. María López", "Sra. Carmen Ramírez", "Sra. Juana Martínez", "Sra. Elsa Pineda", "Sra. Luisa Cruz",
                  "Sr. Pedro Aguilar", "Sra. Gladys Zelaya", "Sra. Mirna Flores", "Sra. Olga Mendoza", "Sra. Sandra Reyes"]
RESPONSABLES_F = ["Sr. José Martínez", "Sr. Francisco Cruz", "Sr. Daniel Aguilar", "Sr. Carlos Pineda", "Sr. Jorge Mejía",
                  "Sra. Gloria Suazo", "Sr. Miguel Osorio", "Sra. Iris Barahona", "Sr. Eduardo Benítez", "Sra. Nury Ramos"]
MEDICOS = ["Dra. Danelia Hernandez", "Dr. Carlos Mejía", "Dra. Ana Sofía Zelaya", "Dr. Marco Tulio Barahona",
           "Dra. Rebeca Villeda", "Dr. Jorge Maldonado", "Dra. Karla Suazo"]
PERFILES_CODIGO = ["1", "2", "3", "4"]
ESTATUS_CIRUGIA = ["En lista", "En espera", "Reprogramar", "Cancelado", "Fuera de perfil San Benito", "Operado", "No apto para cirugía", "No se presentó"]

ESPECIALIDADES = {
    "Cirugía General": {
        "diagnosticos": ["Hernia umbilical", "Apendicitis aguda", "Colelitiasis / Colecistitis", "Hernia inguinal", "Lipoma abdominal", "Hemorroides internas"],
        "edades": (18, 75), "quirurgica": True,
    },
    "Ginecología y Obstetricia": {
        "diagnosticos": ["Mioma uterino", "Quiste ovárico", "Embarazo de bajo riesgo", "Cervicitis crónica", "Menorragia"],
        "edades": (18, 50), "quirurgica": True,
    },
    "Pediatría": {
        "diagnosticos": ["Neumonía adquirida en comunidad", "Gastroenteritis aguda", "Asma bronquial", "Infección de vías urinarias", "Desnutrición leve", "Faringitis aguda"],
        "edades": (1, 14), "quirurgica": False,
    },
    "Medicina Interna": {
        "diagnosticos": ["Diabetes mellitus tipo 2", "Hipertensión arterial esencial", "Gastritis crónica", "Hipotiroidismo", "Anemia ferropénica"],
        "edades": (30, 80), "quirurgica": False,
    },
    "Cardiología": {
        "diagnosticos": ["Insuficiencia cardíaca", "Fibrilación auricular", "Hipertensión arterial severa", "Enfermedad coronaria"],
        "edades": (45, 85), "quirurgica": False,
    },
    "Ortopedia y Traumatología": {
        "diagnosticos": ["Fractura de radio distal", "Fractura de tobillo", "Lumbalgia crónica", "Osteoartritis de rodilla", "Fractura de fémur"],
        "edades": (20, 80), "quirurgica": True,
    },
    "Urología": {
        "diagnosticos": ["Litiasis renal", "Hiperplasia prostática benigna", "Infección urinaria recurrente"],
        "edades": (25, 80), "quirurgica": True,
    },
    "Dermatología": {
        "diagnosticos": ["Dermatitis atópica", "Psoriasis en placas", "Micosis cutánea", "Acné severo"],
        "edades": (10, 55), "quirurgica": False,
    },
    "Oftalmología": {
        "diagnosticos": ["Catarata senil", "Conjuntivitis bacteriana", "Miopía moderada", "Pterigión"],
        "edades": (15, 85), "quirurgica": True,
    },
    "Medicina General": {
        "diagnosticos": ["Control prenatal básico", "Faringitis aguda", "Dengue sin signos de alarma", "Parasitosis intestinal", "Infección respiratoria aguda"],
        "edades": (5, 70), "quirurgica": False,
    },
}

HISTORIAS = {
    "Hernia": "Paciente refiere masa en región umbilical/inguinal de evolución prolongada, que aumenta con esfuerzos y al estar de pie, con dolor intermitente. No ha presentado vómitos.",
    "Apendicitis": "Dolor abdominal que inició en epigastrio y migró a fosa ilíaca derecha, con náuseas, anorexia y fiebre de 38°C. Dolor aumenta con la palpación.",
    "Colelitiasis": "Dolor en hipocondrio derecho tipo cólico postprandial, con náuseas y sensación de llenura. Refiere intolerancia a comidas grasas.",
    "Mioma": "Sangrado menstrual abundante y prolongado, dolor pélvico y sensación de masa abdominal. Ciclos irregulares de varios meses de evolución.",
    "Embarazo": "Paciente en control prenatal, refiere movimientos fetales activos. Sin sangrado ni contracciones. FUM confirmada por ecografía.",
    "Neumonía": "Cuadro de tos productiva, fiebre de 39°C y dificultad respiratoria de 3 días de evolución. Auscultación con crepitantes en base derecha.",
    "Gastroenteritis": "Vómitos y diarrea acuosa de 2 días de evolución, con signos de deshidratación leve. Sin sangre en heces.",
    "Asma": "Crisis de disnea, sibilancia y tos nocturna desencadenadas por ejercicio y cambios de clima. Uso intermitente de broncodilatadores.",
    "DMT2": "Paciente con polidipsia, poliuria y pérdida de peso. Glucemia en ayunas de 180 mg/dl. Sin complicaciones conocidas.",
    "HTA": "Cefalea occipital y mareos. Presión arterial elevada en múltiples tomas. Niega retención de líquidos.",
    "Gastritis": "Dolor epigástrico urente, pirosis y dispepsia postprandial. Relacionado con consumo de café, AINES y estrés.",
    "Insuficiencia": "Disnea de esfuerzo progresiva, ortopnea y edema de miembros inferiores. Palpitaciones intermitentes.",
    "Fractura": "Dolor intenso, deformidad e impotencia funcional tras caída de su propia altura. Sin exposición del foco de fractura.",
    "Lumbalgia": "Dolor lumbar crónico irradiado a miembro inferior derecho, con parestesias. Empeora con la bipedestación prolongada.",
    "Litiasis": "Cólico renal agudo con dolor lumbar izquierdo irradiado a genitales, hematuria macroscópica y disuria.",
    "Dermatitis": "Lesiones eritematosas pruriginosas en pliegues y cara, con liquenificación. Brotes recurrentes desde la infancia.",
    "Catarata": "Disminución progresiva de la agudeza visual, visión borrosa y deslumbramiento. Sin dolor ocular.",
    "Faringitis": "Odínofagia, fiebre y eritema faríngeo con exudado. Disfagia leve.",
    "Dengue": "Fiebre de 5 días, cefalea retroorbitaria, mialgias y artralgias. Sin signos de alarma.",
    "Parasitosis": "Dolor abdominal recurrente, prurito anal nocturno y baja de peso. Presencia de parásitos en heces.",
}
HISTORIAS_KEYWORDS = {
    "Hernia": ["Hernia"], "Apendicitis": ["Apendicitis"], "Colelitiasis": ["Colelitiasis", "Colecistitis"], "Mioma": ["Mioma"],
    "Embarazo": ["Embarazo"], "Neumonía": ["Neumonía"], "Gastroenteritis": ["Gastroenteritis"], "Asma": ["Asma"],
    "DMT2": ["Diabetes"], "HTA": ["Hipertensión"], "Gastritis": ["Gastritis"], "Insuficiencia": ["Insuficiencia", "Fibrilación", "coronaria"],
    "Fractura": ["Fractura"], "Lumbalgia": ["Lumbalgia"], "Litiasis": ["Litiasis"], "Dermatitis": ["Dermatitis", "Psoriasis", "Micosis", "Acné"],
    "Catarata": ["Catarata", "Miopía", "Pterigión"], "Faringitis": ["Faringitis", "Infección respiratoria"], "Dengue": ["Dengue"],
    "Parasitosis": ["Parasitosis", "Hemorroides", "Lipoma", "Cervicitis", "Menorragia", "Cistitis", "prostática", "Conjuntivitis", "Anemia", "Hipotiroidismo", "infección de vías urinarias", "Infección urinaria", "Control prenatal"],
}
HISTORIAS_DEFAULT = "Paciente acude por cuadro clínico de evolución variable. Refiere síntomas de intensidad moderada. Sin antecedentes inmediatos de relevancia."

ENFERMEDADES_PREVIAS = ["HTA", "DMT2", "Hipotiroidismo", "Insuficiencia venosa", "Asma", "Epilepsia", "Anemia crónica",
                        "Gastritis crónica", "Tuberculosis pulmonar tratada", "Dislipidemia", "Artritis reumatoide", "Ninguna"]
CIRUGIAS_PREVIAS = ["Apendicectomía", "Colecistectomía", "Cesárea", "Hernioplastia inguinal", "Amigdalectomía",
                    "Fractura de rotula / Cirugía por hemorroides", "Salpingectomía", "Ninguna"]
ALERGIAS = ["Penicilina", "Sulfas", "Aspirina", "Polvo y ácaros", "Mariscos", "Ninguna", "Niega"]
OTROS_ANTECEDENTES = ["Niega", "Tabaquismo crónico", "Alcoholismo social", "Sedentarismo", "Café en exceso", "Niega", "Niega"]
PERFIL_ENFERMEDADES = {"HTA": ["Insuficiencia", "HTA", "coronaria"], "DMT2": ["DMT2", "Diabetes"], "Gastritis crónica": ["Gastritis"],
                       "Hipotiroidismo": ["Hipotiroidismo"], "Asma": ["Asma"], "Anemia crónica": ["Anemia"]}


def diagnostico_historia(diag):
    for key, words in HISTORIAS_KEYWORDS.items():
        if any(w in diag for w in words):
            return HISTORIAS[key]
    return HISTORIAS_DEFAULT


def examen_fisico_por_diag(diag):
    if "Hernia" in diag:
        return "Defecto herniario en región umbilical con protrusión reductible, dolorosa a la palpación."
    if "Apendicitis" in diag:
        return "Abdomen blando, doloroso en fosa ilíaca derecha, signo de McBurney positivo, Blumberg positivo."
    if "Cole" in diag:
        return "Ictericia leve en escleras, abdomen doloroso en hipocondrio derecho, signo de Murphy positivo."
    if "Mioma" in diag:
        return "Útero aumentado de tamaño, irregular, consistencia firme, anexos libres."
    if "Neumonía" in diag:
        return "Crepitantes en base pulmonar derecha, taquipnea leve, sin sibilancias."
    if "Fractura" in diag:
        return "Deformidad, edema y crepitación en sitio de fractura, neurovascular distal conservado."
    if "Litiasis" in diag:
        return "Puño percusión lumbar izquierda positiva, abdomen blando, sin signos de irritación peritoneal."
    if "Dermatitis" in diag:
        return "Lesiones eritematosas descamativas en pliegues antecubitales y cervical, con excoriaciones."
    if "Catarata" in diag:
        return "Lente cristalino opacificado, reflejo rojo disminuido, fondo de ojo no valorable."
    return "Signos vitales estables, paciente consciente y orientado, examen físico sin hallazgos patológicos relevantes."


def gen_identidad(edad, sexo, i):
    year = date.today().year - edad - random.randint(0, 1)
    dept = random.choice(["0801", "0501", "0101", "0601", "1601", "1201"])
    seq = str(random.randint(10000, 99999))
    return f"{dept}-{year}-{seq}"


def gen_tel():
    return f"{random.randint(1000, 9999)}-{random.randint(1000, 9999)}"


def gen_peso_talla(edad):
    if edad <= 2:
        peso = round(random.uniform(9, 13), 1); talla = round(random.uniform(0.70, 0.90), 2)
    elif edad <= 10:
        peso = round(random.uniform(14, 35), 1); talla = round(random.uniform(0.95, 1.40), 2)
    elif edad <= 17:
        peso = round(random.uniform(38, 70), 1); talla = round(random.uniform(1.45, 1.72), 2)
    else:
        peso = round(random.uniform(52, 110), 1); talla = round(random.uniform(1.45, 1.85), 2)
    bmi = round(peso / (talla ** 2), 1)
    return f"{peso} kg", f"{talla} mts", str(bmi)


def main():
    db = SessionLocal()
    try:
        exp = db.query(ListDefinition).filter(ListDefinition.is_system == True).first()
        if not exp:
            print("No existe la lista sistema 'Expediente Médico'")
            return
        existing = db.query(ListRecord).filter(ListRecord.list_definition_id == exp.id).count()
        print(f"Expedientes actuales: {existing}")

        especialidad_nombres = list(ESPECIALIDADES.keys())
        records = []
        for i in range(50):
            esp = random.choice(especialidad_nombres)
            cfg = ESPECIALIDADES[esp]
            sexo = random.choice(["M", "F"])
            if esp == "Ginecología y Obstetricia":
                sexo = "F"
            edad = random.randint(*cfg["edades"])
            if sexo == "F":
                nombre = random.choice(NOMBRES_F)
                responsable = random.choice(RESPONSABLES_F)
            else:
                nombre = random.choice(NOMBRES_M)
                responsable = random.choice(RESPONSABLES_M)
            apellido = random.choice(APELLIDOS)
            apellido2 = random.choice(APELLIDOS)
            diag = random.choice(cfg["diagnosticos"])
            historia = diagnostico_historia(diag)
            peso, talla, bmi = gen_peso_talla(edad)

            estatus_cirugia = random.choice(ESTATUS_CIRUGIA)
            fecha_cirugia = ""
            if estatus_cirugia in ("En espera", "Operado", "Reprogramar"):
                dias = random.randint(1, 180)
                fecha_cirugia = (date.today() - timedelta(days=dias)).isoformat()

            perfil = random.choice(PERFILES_CODIGO)
            criticidad = random.choice(["Baja", "Media", "Alta"])
            fecha_elab = (date.today() - timedelta(days=random.randint(1, 400))).isoformat()

            data = {
                "especialidad": esp.upper(),
                "criticidad": criticidad,
                "estatus": perfil,
                "nombre": nombre,
                "apellido": f"{apellido} {apellido2}",
                "sexo": sexo,
                "edad": f"{edad} a",
                "fecha_elaboracion": fecha_elab,
                "identidad": gen_identidad(edad, sexo, i),
                "persona_responsable": responsable,
                "albergue": "Si" if random.random() < 0.25 else "No",
                "perfil": perfil,
                "telefono": gen_tel(),
                "telefono2": gen_tel() if random.random() < 0.3 else "",
                "telefono3": "",
                "domicilio": random.choice(DOMICILIOS),
                "historia_enfermedad": historia,
                "enfermedades_previas": random.choice(ENFERMEDADES_PREVIAS),
                "cirugias_previas": random.choice(CIRUGIAS_PREVIAS),
                "alergias": random.choice(ALERGIAS),
                "otros_antecedentes": random.choice(OTROS_ANTECEDENTES),
                "presion_arterial": random.choice(["110/70", "120/80", "130/85", "140/90", "150/95"]),
                "fc": str(random.randint(60, 100)),
                "pulso": str(random.randint(60, 100)),
                "temperatura": str(random.choice(["36.5", "36.8", "37.0", "37.5", "38.0", "38.5"])),
                "fr": str(random.randint(14, 24)),
                "peso": peso,
                "talla": talla,
                "bmi": bmi,
                "examen_fisico": examen_fisico_por_diag(diag),
                "diagnostico": diag,
                "nombre_medico": random.choice(MEDICOS),
                "estatus_cirugia": estatus_cirugia,
                "cirujano": "",
                "fecha_cirugia": fecha_cirugia,
            }
            records.append(data)

        for data in records:
            db.add(ListRecord(list_definition_id=exp.id, data=data, created_by=exp.created_by))
        db.commit()
        from app.services.record_service import renumber_expedientes
        renumber_expedientes(db)
        total = db.query(ListRecord).filter(ListRecord.list_definition_id == exp.id).count()
        print(f"Se insertaron 50 expedientes. Total ahora: {total}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
