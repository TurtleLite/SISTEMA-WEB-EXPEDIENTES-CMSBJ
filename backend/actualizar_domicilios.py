import sys, os, re, csv, json, argparse, unicodedata

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

CSV_PATH = "/home/turtlelite/Documentos/Banco de Pacientes/SIN OPERAR/__expedientes_completos.csv"
JSON_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "domicilios_sin_operar.json")

phone_re = re.compile(r"\d[\d\s,\-]{5,}\d")
sep_re = re.compile(r"[,\s;/]+")


def clean_domicilio(s):
    if not s:
        return ""
    s = phone_re.sub(" ", s)
    s = sep_re.sub(" ", s).strip()
    return s


def base_exp(s):
    if not s:
        return None
    m = re.match(r"(\d+)", str(s).strip())
    return m.group(1) if m else None


def norm(s):
    if not s:
        return ""
    s = unicodedata.normalize("NFKD", str(s)).encode("ascii", "ignore").decode()
    s = re.sub(r"[^a-z0-9 ]", "", s.lower())
    return re.sub(r"\s+", " ", s).strip()


def key_of(exp, nombre):
    b = base_exp(exp)
    if not b:
        return None
    n = norm(nombre)
    if not n:
        return None
    return (b, n)


def load_map_csv(path):
    out, warnings = {}, []
    with open(path, newline="", encoding="utf-8", errors="replace") as f:
        for row in csv.DictReader(f):
            k = key_of(row.get("expediente"), row.get("nombre"))
            if not k:
                continue
            if k in out:
                warnings.append(f"clave duplicada en CSV: {k[0]} {row.get('nombre')}")
                continue
            out[k] = clean_domicilio(row.get("domicilio"))
    return out, warnings


def load_map_json(path):
    out, warnings = {}, []
    with open(path, encoding="utf-8") as f:
        for r in json.load(f):
            k = key_of(r.get("expediente"), r.get("nombre"))
            if not k:
                continue
            if k in out:
                warnings.append(f"clave duplicada en JSON: {k[0]} {r.get('nombre')}")
                continue
            out[k] = r.get("domicilio", "")
    return out, warnings


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv", help="Usa este CSV en lugar del JSON embebido")
    ap.add_argument("--apply", action="store_true", help="Escribe en la BD (si no, solo diagnostica)")
    args = ap.parse_args()

    if args.csv:
        dmap, warns = load_map_csv(args.csv)
        src = args.csv
    else:
        dmap, warns = load_map_json(JSON_PATH)
        src = JSON_PATH
    print(f"Pares (expediente+nombre) con domicilio en {src}: {len(dmap)}")
    for w in warns:
        print("  !", w)

    os.environ.setdefault("SECRET_KEY", "x")
    os.environ.setdefault("JWT_SECRET_KEY", "x")
    from app.core.database import SessionLocal
    from app.models.list_definition import ListRecord

    db = SessionLocal()
    try:
        recs = db.query(ListRecord).filter(ListRecord.deleted_at.is_(None)).all()
        by_base = {}
        for r in recs:
            d = r.data or {}
            b = base_exp(d.get("expediente"))
            if not b:
                continue
            full = norm(f"{d.get('nombre', '')} {d.get('apellido', '')}") or norm(d.get("nombre", ""))
            by_base.setdefault(b, []).append((r, full))

        matched_name = matched_exp = ambiguous = notfound = would_update = skipped_has = 0
        for (b, n), dom in dmap.items():
            recs_b = by_base.get(b, [])
            exact = [r for r, nm in recs_b if nm == n]
            if exact:
                target = exact[0]
                matched_name += 1
            elif len(recs_b) == 1:
                target = recs_b[0][0]
                matched_exp += 1
            else:
                if recs_b:
                    ambiguous += 1
                else:
                    notfound += 1
                continue
            cur = (target.data or {}).get("domicilio")
            if cur and str(cur).strip():
                skipped_has += 1
            else:
                would_update += 1
                if args.apply:
                    target.data = dict(target.data or {})
                    target.data["domicilio"] = dom

        if args.apply:
            db.commit()
            print(">>> Cambios aplicados a la BD.")
        else:
            print(">>> DRY-RUN (no se escribió nada).")
        print(
            f"Coincidencia por nombre completo : {matched_name}\n"
            f"Coincidencia solo por expediente : {matched_exp}\n"
            f"Expediente duplicado/ambíguo      : {ambiguous}\n"
            f"Expediente no encontrado en BD    : {notfound}\n"
            f"Se actualizarían (sin domicilio)  : {would_update}\n"
            f"Ya tenían domicilio (omitidos)    : {skipped_has}"
        )
    finally:
        db.close()


if __name__ == "__main__":
    main()
