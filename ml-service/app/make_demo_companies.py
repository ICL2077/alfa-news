import json
from pathlib import Path

import pandas as pd

from .bank_data import UID_COLS, _companies, bank_profile

N = 5


def _desc(bank: dict) -> str:
    parts = [f"Основной вид деятельности: {bank.get('okved') or '—'}."]
    if bank.get("region"):
        parts.append(f"Регион: {bank['region']}.")
    if bank.get("revenueRub"):
        parts.append(f"Выручка: {bank['revenueRub'] / 1e6:.0f} млн руб.")
    if bank.get("ftsCountries"):
        parts.append("Страны ФТС: " + ", ".join(bank["ftsCountries"]) + ".")
    if bank.get("keyOwnerMark"):
        parts.append("Есть ключевой собственник.")
    return " ".join(parts)


def main() -> None:
    df = _companies()
    if df.empty:
        print("нет данных банка")
        return

    candidates = df[df[UID_COLS["okved"]].notna()].copy()
    picked: list[str] = []

    def add(series, n: int = 1) -> None:
        for uid in series.head(n).tolist():
            if isinstance(uid, str) and uid and uid not in picked:
                picked.append(uid)

    if UID_COLS["fts_country"] in candidates.columns:
        fts = candidates[candidates[UID_COLS["fts_country"]].fillna("").astype(str).str.strip() != ""]
        add(fts[UID_COLS["uid"]])
    if UID_COLS["key_owner"] in candidates.columns:
        own = candidates[pd.to_numeric(candidates[UID_COLS["key_owner"]], errors="coerce") == 1]
        add(own[UID_COLS["uid"]])
    if "CL_PRODUCT_LOA_MARK" in candidates.columns:
        loa = candidates[pd.to_numeric(candidates["CL_PRODUCT_LOA_MARK"], errors="coerce") == 1]
        add(loa[UID_COLS["uid"]])

    ordered = candidates.sort_values(UID_COLS["revenue"], ascending=False)
    for uid in ordered[UID_COLS["uid"]].tolist():
        if len(picked) >= N:
            break
        if uid not in picked:
            picked.append(uid)

    out = []
    for uid in picked[:N]:
        bank = bank_profile(uid)
        if not bank:
            continue
        okved_short = (bank.get("okved") or "компания")[:60]
        out.append({
            "name": f"Клиент банка: {okved_short}",
            "description": _desc(bank),
            "bankClientId": uid,
        })

    out_path = Path("data/demo_companies.json")
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"сохранено компаний: {len(out)} -> {out_path}")


if __name__ == "__main__":
    main()