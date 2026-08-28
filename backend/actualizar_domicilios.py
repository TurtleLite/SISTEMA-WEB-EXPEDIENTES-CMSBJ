import sys, os, re, json, argparse, unicodedata

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

JSON_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "domicilios_sin_operar.json")


def base_exp(s):
    if not s:
        return None
    m = re.match(r"(\d+)", str(s).strip())
    return m.group(1) if m else None


def norm_ident(s):
    return re.sub(r"\D", "", str(s or ""))


def norm_name(s):
    if not s:
        return ""
    s = unicodedata.normalize("NFKD", str(s)).encode("ascii", "ignore").decode()
    s = re.sub(r"[^a-z0-9 ]", "", s.lower())
    return re.sub(r"\s+", " ", s).strip()


def full_name(data):
    return norm_name(f"{data.get('nombre', '')} {data.get('apellido', '')}") or norm_name(data.get("nombre", ""))


def load_map(path):
    by_base, by_ident = {}, {}
    with open(path, encoding="utf-8") as f:
        for r in json.load(f):
            dom = r.get("domicilio", "")
            b = base_exp(r.get("expediente"))
            i = norm_ident(r.get("identidad"))
            nm = norm_name(f"{r.get('nombre', '')} {r.get('apellido', '')}") or norm_name(r.get("nombre", ""))
            if b:
                by_base.setdefault(b, []).append({"name": nm, "dom": dom})
            if i:
                by_ident.setdefault(i, []).append({"name": nm, "dom": dom})
    return by_base, by_ident


def choose(cands, sys_name):
    if not cands:
        return None
    same = [c for c in cands if c["name"] and c["name"] == sys_name]
    if same:
        return same[0]["dom"]
    if len(cands) == 1:
        return cands[0]["dom"]
    return None  # ambiguo: no sobreescribir para evitar colisión


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="Escribe en la BD (si no, solo diagnostica)")
    args = ap.parse_args()

    by_base, by_ident = load_map(JSON_PATH)
    print(f"Fuentes: {len(by_base)} por expediente, {len(by_ident)} por identidad")

    os.environ.setdefault("SECRET_KEY", "x")
    os.environ.setdefault("JWT_SECRET_KEY", "x")
    from app.core.database import SessionLocal
    from app.models.list_definition import ListRecord

    db = SessionLocal()
    try:
        recs = db.query(ListRecord).filter(ListRecord.deleted_at.is_(None)).all()
        matched = overwritten = kept = notfound = 0
        sample_kept = []
        for r in recs:
            d = r.data or {}
            b = base_exp(d.get("expediente"))
            i = norm_ident(d.get("identidad"))
            cands = []
            if b and b in by_base:
                cands += by_base[b]
            if i and i in by_ident:
                cands += by_ident[i]
            if not cands:
                notfound += 1
                continue
            dom = choose(cands, full_name(d))
            if dom is None:
                kept += 1
                if len(sample_kept) < 10:
                    sample_kept.append(f"{b or i}: nombre={d.get('nombre')} {d.get('apellido')}")
                continue
            cur = d.get("domicilio")
            if args.apply:
                r.data = dict(d)
                r.data["domicilio"] = dom
            matched += 1
            if cur and str(cur).strip():
                overwritten += 1

        if args.apply:
            db.commit()
            print(">>> Cambios aplicados a la BD.")
        else:
            print(">>> DRY-RUN (no se escribió nada).")
        print(
            f"Registros actualizados (domicilio puesto) : {matched}\n"
            f"  de ellos sobreescribieron previo        : {overwritten}\n"
            f"Ambiguos (no tocados, solo nombre no cuadra): {kept}\n"
            f"Sin coincidencia en fuente                : {notfound}"
        )
        if sample_kept:
            print("Muestra de ambiguos:")
            for s in sample_kept:
                print("  -", s)
    finally:
        db.close()


if __name__ == "__main__":
    main()
