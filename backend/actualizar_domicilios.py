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
    return (b, norm(nombre))


def load_map_csv(path):
    out = {}
    warnings = []
    with open(path, newline="", encoding="utf-8", errors="replace") as f:
        for row in csv.DictReader(f):
            k = key_of(row.get("expediente"), row.get("nombre"))
            if not k:
                continue
            dom = clean_domicilio(row.get("domicilio"))
            if k in out:
                warnings.append(f"clave duplicada en CSV: expediente={k[0]} nombre={row.get('nombre')}")
                continue
            out[k] = dom
    return out, warnings


def load_map_json(path):
    out = {}
    warnings = []
    with open(path, encoding="utf-8") as f:
        for r in json.load(f):
            k = key_of(r.get("expediente"), r.get("nombre"))
            if not k:
                continue
            if k in out:
                warnings.append(f"clave duplicada en JSON: expediente={k[0]} nombre={r.get('nombre')}")
                continue
            out[k] = r.get("domicilio", "")
    return out, warnings


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv", help="Usa este CSV en lugar del JSON embebido")
    ap.add_argument("--apply", action="store_true", help="Escribe en la BD (si no, solo muestra plan)")
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

    if not args.apply:
        for k, d in list(dmap.items())[:8]:
            print(f"  {k[0]} | {k[1]!r}: {d!r}")
        print("\nMODO DRY-RUN: no se toca la BD. Agrega --apply para escribir.")
        return

    os.environ.setdefault("SECRET_KEY", "x")
    os.environ.setdefault("JWT_SECRET_KEY", "x")
    from app.core.database import SessionLocal
    from app.models.list_definition import ListRecord

    db = SessionLocal()
    try:
        recs = db.query(ListRecord).filter(ListRecord.deleted_at.is_(None)).all()
        updated = skipped_has = notfound = nomatch = 0
        for r in recs:
            d = r.data or {}
            k = key_of(d.get("expediente"), d.get("nombre"))
            if not k or k not in dmap:
                nomatch += 1
                continue
            cur = d.get("domicilio")
            if cur and str(cur).strip():
                skipped_has += 1
                continue
            r.data = dict(d)
            r.data["domicilio"] = dmap[k]
            updated += 1
        db.commit()
        print(f"Actualizados: {updated} | Ya tenian domicilio (omitidos): {skipped_has} | "
              f"Sin coincidencia en CSV: {nomatch}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
