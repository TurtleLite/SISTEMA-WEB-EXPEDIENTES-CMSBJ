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


def full_name(data):
    # El sistema guarda nombre (pila) + apellido por separado;重建 nombre completo.
    return norm(f"{data.get('nombre', '')} {data.get('apellido', '')}") or norm(data.get("nombre", ""))


def load_maps(path, is_csv):
    by_key, by_base, warnings = {}, {}, []
    opener = open(path, newline="", encoding="utf-8", errors="replace") if is_csv else open(path, encoding="utf-8")
    with opener:
        rows = csv.DictReader(opener) if is_csv else json.load(opener)
        for row in rows:
            exp = row.get("expediente", "")
            nom = row.get("nombre", "")
            dom = clean_domicilio(row.get("domicilio")) if is_csv else row.get("domicilio", "")
            b = base_exp(exp)
            n = norm(nom)
            if not b or not n:
                continue
            by_key.setdefault((b, n), dom)
            by_base.setdefault(b, []).append((n, dom))
    return by_key, by_base, warnings


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv", help="Usa este CSV en lugar del JSON embebido")
    ap.add_argument("--apply", action="store_true", help="Escribe en la BD (si no, solo diagnostica)")
    args = ap.parse_args()

    is_csv = bool(args.csv)
    by_key, by_base, warns = load_maps(args.csv if is_csv else JSON_PATH, is_csv)
    print(f"Domicilios en fuente: {len(by_key)} (por nombre) / {len(by_base)} (por expediente)")
    for w in warns:
        print("  !", w)

    os.environ.setdefault("SECRET_KEY", "x")
    os.environ.setdefault("JWT_SECRET_KEY", "x")
    from app.core.database import SessionLocal
    from app.models.list_definition import ListRecord

    db = SessionLocal()
    try:
        recs = db.query(ListRecord).filter(ListRecord.deleted_at.is_(None)).all()
        by_base_rec = {}
        for r in recs:
            d = r.data or {}
            b = base_exp(d.get("expediente"))
            if not b:
                continue
            by_base_rec.setdefault(b, []).append(r)

        matched = overwrite = only_fill_empty = notfound = ambiguous = 0
        for b, recs_b in by_base_rec.items():
            entries = by_base.get(b)
            if not entries:
                continue
            # 1) coincide nombre completo
            target = None
            for r in recs_b:
                if full_name(r.data or {}) in {n for n, _ in entries}:
                    target = r
                    break
            if target is None and len(recs_b) == 1:
                target = recs_b[0]  # solo 1 registro con ese expediente -> seguro
            if target is None and len(recs_b) > 1:
                # duplicado: solo rellenar los que NO tienen domicilio, sin pisar los demas
                for r in recs_b:
                    cur = (r.data or {}).get("domicilio")
                    if not (cur and str(cur).strip()):
                        dom = entries[0][1]
                        if args.apply:
                            r.data = dict(r.data or {})
                            r.data["domicilio"] = dom
                        only_fill_empty += 1
                ambiguous += 1
                continue
            if target is None:
                notfound += 1
                continue
            dom = entries[0][1]
            cur = (target.data or {}).get("domicilio")
            if args.apply:
                target.data = dict(target.data or {})
                target.data["domicilio"] = dom
            matched += 1
            if cur and str(cur).strip():
                overwrite += 1

        if args.apply:
            db.commit()
            print(">>> Cambios aplicados a la BD.")
        else:
            print(">>> DRY-RUN (no se escribió nada).")
        print(
            f"Registros actualizados             : {matched}\n"
            f"  de ellos sobreescribieron previo : {overwrite}\n"
            f"Duplicados: rellenados solo vacíos : {only_fill_empty} (expedientes: {ambiguous})\n"
            f"Expediente no encontrado en BD     : {notfound}"
        )
    finally:
        db.close()


if __name__ == "__main__":
    main()
