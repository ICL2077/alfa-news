import json
import logging
import re
from collections import Counter
from functools import lru_cache
from pathlib import Path

import pandas as pd

from .settings import settings

log = logging.getLogger("bank")
BASE = Path(__file__).resolve().parent.parent

UID_COLS = {
    "uid": "SYNTHETIC_U",
    "revenue": "REVENUE_COMPANY",
    "okved_code": "MAINOKVED_CODE",
    "okved": "MAINOKVED_NAME",
    "region": "REGION",
    "city": "CITY",
    "org_type": "ORG_TYPE",
    "okfs": "OKFS_NAME",
    "age": "COMPANY_AGE_YEARS_GRADATION",
    "eco": "ECO_MARK_LABEL",
    "key_owner": "NEGATIVEMARK",                    # по кейсу: признак ключевого собственника
    "workers_fns": "AMOUNT_WORKERS_FNS_GRADATION",
    "workers_spark": "AMOUNT_WORKERS_SPARK_GRADATION",
    "cl_type": "CL_TYPE",
    "fts_flag": "FTS_FLAG",
    "fts_country": "FTS_COUNTRY_NAME",
    "factoring": "FACTORING_MARK",
    "group": "GROUP_ID",
}

PRODUCT_FLAGS = {
    "CL_PRODUCT_RKO_MARK": "расчётно-кассовое обслуживание",
    "CL_PRODUCT_LOA_MARK": "кредитные продукты",
    "CL_PRODUCT_GAR_MARK": "банковские гарантии",
    "CL_PRODUCT_LEA_MARK": "лизинг",
    "CL_PRODUCT_DEP_MARK": "депозиты",
    "CL_PRODUCT_ZPP_MARK": "зарплатный проект",
}
LOAN_PRODUCT = "кредитные продукты"

LINK_COLS = {"fid": "SYNTHETIC_F", "uid": "SYNTHETIC_U",
             "city": "CITY_NAME", "rc": "RC_NAME"}

PAYMENT_COLS = {"beneficiary": "BENEFICIARY", "payer": "PAYER",
                "amount": "PAY_AMT", "count": "PAY_CNT"}

CL_TYPE_LABELS = {
    "PROSPECT": "потенциальный клиент",
    "CLIENT": "действующий клиент",
    "CLOSE_CLIENT": "действующий клиент (активное сотрудничество)",
}

_MSC_CLUSTERS = re.compile(r'^Мск\s*"?([^"]+)"?$', re.IGNORECASE)
_SPB_CLUSTERS = re.compile(r'^Спб\s*"?([^"]+)"?$', re.IGNORECASE)
_BAD_CITIES = {"", "неопределенный город", "не определено", "не определен"}


def _abs(p):
    p = Path(p)
    return p if p.is_absolute() else BASE / p


def _file(n):
    return _abs(settings.bank_csv_dir) / n


def _str(v):
    return None if v is None or pd.isna(v) else str(v).strip() or None


def _is_on(v):
    return str(v).strip().lower() in {"1", "1.0", "true", "да", "y"}


def _money(r: float) -> str:
    if r >= 1e12:
        return f"{r / 1e12:.2f} трлн руб."
    if r >= 1e9:
        return f"{r / 1e9:.1f} млрд руб."
    return f"{r / 1e6:.0f} млн руб."


def _classify_city(raw: str) -> tuple[str, str] | None:
    if not raw:
        return None
    s = raw.strip().strip('"').strip()
    if s.lower() in _BAD_CITIES:
        return None
    m = _MSC_CLUSTERS.match(s)
    if m:
        return f"Мск {m.group(1).strip()}", "msc_cluster"
    m = _SPB_CLUSTERS.match(s)
    if m:
        return f"Спб {m.group(1).strip()}", "spb_cluster"
    return s, "city"


def reset_cache() -> None:
    _companies.cache_clear()


@lru_cache(maxsize=1)
def _companies() -> pd.DataFrame:
    path = _file(settings.bank_uid_file)
    if not path.exists():
        log.warning("CSV банка не найден: %s", path)
        return pd.DataFrame()
    df = pd.read_csv(path, sep=settings.bank_csv_sep,
                     dtype={UID_COLS["uid"]: str}, low_memory=False)
    return df.drop_duplicates(UID_COLS["uid"]).set_index(UID_COLS["uid"], drop=False)


def _geo_summary(cities: Counter, regions: Counter,
                 msc_clusters: Counter, spb_clusters: Counter) -> dict:
    total_cities = sum(cities.values())
    total_regions = sum(regions.values())

    def top(counter, n):
        total = sum(counter.values()) or 1
        return [(k, round(v / total * 100)) for k, v in counter.most_common(n) if k]

    return {
        "clientsCount": total_cities + sum(msc_clusters.values()) + sum(spb_clusters.values()),
        "topCities": [{"city": k, "sharePct": p} for k, p in top(cities, 3)],
        "topRegions": [{"rc": k, "sharePct": p} for k, p in top(regions, 5)],
        "mscClusters": [{"cluster": k, "sharePct": p} for k, p in top(msc_clusters, 3)],
        "spbClusters": [{"cluster": k, "sharePct": p} for k, p in top(spb_clusters, 3)],
    }


def _geography(uid: str) -> dict | None:
    if not settings.bank_links_enabled:
        return None
    path = _file(settings.bank_link_file)
    if not path.exists():
        return None
    stat = path.stat()
    stamp = f"{stat.st_mtime_ns}:{stat.st_size}"
    cache = _abs(settings.bank_cache_dir) / f"geo_{re.sub(r'[^\\w-]', '_', uid)}.json"
    if cache.exists():
        c = json.loads(cache.read_text(encoding="utf-8"))
        if c.get("stamp") == stamp:
            return c.get("data")

    u, city, rc = LINK_COLS["uid"], LINK_COLS["city"], LINK_COLS["rc"]
    cities, regions = Counter(), Counter()
    msc, spb = Counter(), Counter()
    for chunk in pd.read_csv(path, sep=settings.bank_csv_sep,
                             usecols=[u, city, rc],
                             dtype={u: str, city: str, rc: str},
                             chunksize=200_000, low_memory=False):
        part = chunk[chunk[u] == uid]
        if part.empty:
            continue
        for raw_city in part[city].fillna("").tolist():
            parsed = _classify_city(raw_city)
            if parsed is None:
                continue
            label, kind = parsed
            if kind == "msc_cluster":
                msc[label] += 1
            elif kind == "spb_cluster":
                spb[label] += 1
            else:
                cities[label] += 1
        regions.update(r.strip().upper() for r in part[rc].fillna("").tolist() if r)

    if not (cities or regions or msc or spb):
        data = None
    else:
        data = _geo_summary(cities, regions, msc, spb)

    cache.parent.mkdir(parents=True, exist_ok=True)
    cache.write_text(json.dumps({"stamp": stamp, "data": data}, ensure_ascii=False),
                     encoding="utf-8")
    return data


def _summarize_flows(flows: dict[str, float], counts: dict[str, int]) -> dict | None:
    total = sum(flows.values())
    if not flows or total <= 0:
        return None

    df = _companies()
    by_okved: dict[str, float] = {}
    for cp_uid, amount in flows.items():
        okved = "не определён"
        if not df.empty and cp_uid in df.index:
            okved = _str(df.at[cp_uid, UID_COLS["okved"]]) or okved
        by_okved[okved] = by_okved.get(okved, 0.0) + amount

    top = sorted(by_okved.items(), key=lambda kv: kv[1], reverse=True)[:3]
    top_partners = sorted(flows.items(), key=lambda kv: kv[1], reverse=True)[:5]
    return {
        "partners": len(flows),
        "totalRub": total,
        "topPartnerSharePct": round(max(flows.values()) / total * 100),
        "topOkved": [{"okved": k, "sharePct": round(v / total * 100)} for k, v in top],
        "topPartners": [
            {"uid": k, "rub": v, "sharePct": round(v / total * 100), "count": counts.get(k, 0)}
            for k, v in top_partners
        ],
    }


def _counterparties(uid: str) -> dict | None:
    if not settings.bank_payments_enabled:
        return None
    path = _file(settings.bank_payment_file)
    if not path.exists():
        return None
    stat = path.stat()
    stamp = f"{stat.st_mtime_ns}:{stat.st_size}"
    cache = _abs(settings.bank_cache_dir) / f"pay_{re.sub(r'[^\\w-]', '_', uid)}.json"
    if cache.exists():
        c = json.loads(cache.read_text(encoding="utf-8"))
        if c.get("stamp") == stamp:
            return c.get("data")

    b, p = PAYMENT_COLS["beneficiary"], PAYMENT_COLS["payer"]
    amt, cnt = PAYMENT_COLS["amount"], PAYMENT_COLS["count"]

    paid: dict[str, float] = {}
    received: dict[str, float] = {}
    counts_paid: dict[str, int] = {}
    counts_received: dict[str, int] = {}

    for chunk in pd.read_csv(path, sep=settings.bank_csv_sep,
                             dtype={b: str, p: str},
                             chunksize=200_000, low_memory=False):
        chunk[amt] = pd.to_numeric(chunk[amt], errors="coerce").fillna(0.0)
        chunk[cnt] = pd.to_numeric(chunk[cnt], errors="coerce").fillna(0).astype(int)

        sub = chunk[(chunk[p] == uid) & (chunk[b] != uid)]
        for cp, a in sub.groupby(b)[amt].sum().items():
            paid[cp] = paid.get(cp, 0.0) + float(a)
        for cp, c in sub.groupby(b)[cnt].sum().items():
            counts_paid[cp] = counts_paid.get(cp, 0) + int(c)

        sub = chunk[(chunk[b] == uid) & (chunk[p] != uid)]
        for cp, a in sub.groupby(p)[amt].sum().items():
            received[cp] = received.get(cp, 0.0) + float(a)
        for cp, c in sub.groupby(p)[cnt].sum().items():
            counts_received[cp] = counts_received.get(cp, 0) + int(c)

    data = {
        "paid": _summarize_flows(paid, counts_paid),
        "received": _summarize_flows(received, counts_received),
    } if (paid or received) else None

    cache.parent.mkdir(parents=True, exist_ok=True)
    cache.write_text(json.dumps({"stamp": stamp, "data": data}, ensure_ascii=False),
                     encoding="utf-8")
    return data


def bank_profile(uid: str) -> dict | None:
    df = _companies()
    if df.empty or uid not in df.index:
        return None
    row = df.loc[uid]

    def val(key):
        col = UID_COLS.get(key)
        return _str(row.get(col)) if col in df.columns else None

    def num(key):
        col = UID_COLS.get(key)
        if col not in df.columns:
            return None
        v = pd.to_numeric(row.get(col), errors="coerce")
        return None if pd.isna(v) else float(v)

    revenue = num("revenue")
    profile = {
        "clientId": uid,
        "orgType": val("org_type"),
        "ownership": val("okfs"),
        "ageGradation": val("age"),
        "ecoLabel": val("eco"),
        "keyOwnerMark": bool(num("key_owner") or 0),
        "okvedCode": val("okved_code"),
        "okved": val("okved"),
        "city": val("city"),
        "region": val("region"),
        "workersFns": val("workers_fns"),
        "workersSpark": val("workers_spark"),
        "clType": val("cl_type"),
        "clTypeLabel": CL_TYPE_LABELS.get(val("cl_type") or "", None),
        "ftsFlag": bool(num("fts_flag") or 0),
        "ftsCountries": [c.strip() for c in (val("fts_country") or "").split(",") if c.strip()],
        "factoring": bool(num("factoring") or 0),
        "groupId": val("group"),
        "revenueRub": None if revenue is None else revenue * settings.bank_revenue_unit,
        "products": [name for col, name in PRODUCT_FLAGS.items()
                     if col in df.columns and _is_on(row.get(col))],
    }
    geo = _geography(uid)
    if geo:
        profile["geography"] = geo
    cp = _counterparties(uid)
    if cp:
        profile["counterparties"] = cp
    return profile


def derive(bank: dict) -> tuple[str, list[dict]]:
    financing, sensitivities = "", []
    if LOAN_PRODUCT in bank.get("products", []):
        financing = "пользуется кредитными продуктами банка"
        sensitivities.append({
            "topic": "ключевая ставка",
            "mechanism": "У компании есть кредитные продукты в банке, поэтому стоимость "
                         "заёмных средств зависит от ключевой ставки.",
        })
    if bank.get("ftsCountries"):
        sensitivities.append({
            "topic": "внешняя торговля / санкции / валютный курс",
            "mechanism": f"У компании есть ВЭД-операции со странами: "
                         f"{', '.join(bank['ftsCountries'])}; новости об этих направлениях "
                         "и валютном курсе влияют на бизнес.",
        })
    if bank.get("keyOwnerMark"):
        sensitivities.append({
            "topic": "корпоративное управление / госзаказ",
            "mechanism": "У компании есть ключевой собственник; решения собственника и "
                         "связанные с ним новости влияют на бизнес.",
        })
    cp = bank.get("counterparties") or {}
    paid = cp.get("paid") or {}
    if paid.get("topOkved"):
        okveds = [x["okved"] for x in paid["topOkved"] if x.get("okved") != "не определён"]
        if okveds:
            sensitivities.append({
                "topic": "отрасли контрагентов",
                "mechanism": "Заметная доля платежей компании приходится на отрасли: "
                             + ", ".join(okveds) + "; новости этих отраслей влияют на бизнес.",
            })
    return financing, sensitivities


def describe(bank: dict) -> list[str]:
    lines: list[str] = []
    if bank.get("okved"):
        lines.append(f"ОКВЭД: {bank['okved']} ({bank.get('okvedCode') or '—'})")
    if bank.get("orgType") or bank.get("ownership"):
        lines.append(f"Форма: {bank.get('orgType') or '—'}, собственность: {bank.get('ownership') or '—'}")
    if bank.get("ageGradation"):
        lines.append(f"Возраст компании: {bank['ageGradation']} лет")
    if bank.get("ecoLabel"):
        lines.append(f"Стадия развития бизнеса (эконом-метка банка): {bank['ecoLabel']}")
    if bank.get("clTypeLabel"):
        lines.append(f"Статус в банке: {bank['clTypeLabel']}")
    if bank.get("city") or bank.get("region"):
        lines.append(f"Город/регион регистрации: {bank.get('city') or '—'}, {bank.get('region') or '—'}")
    if bank.get("workersFns"):
        lines.append(f"Численность (ФНС): {bank['workersFns']}")
    if bank.get("revenueRub"):
        lines.append(f"Выручка: {_money(bank['revenueRub'])}")
    if bank.get("products"):
        lines.append("Продукты банка: " + ", ".join(bank["products"]))
    if bank.get("ftsCountries"):
        lines.append("Страны ФТС (ВЭД): " + ", ".join(bank["ftsCountries"]))
    if bank.get("factoring"):
        lines.append("Использует факторинг")
    if bank.get("keyOwnerMark"):
        lines.append("Признак ключевого собственника: есть")

    cp = bank.get("counterparties") or {}
    for key, label in (("paid", "Кому платит клиент"), ("received", "Кто платит клиенту")):
        block = cp.get(key)
        if not block:
            continue
        okveds = ", ".join(f"{x['okved']} {x['sharePct']}%" for x in block["topOkved"])
        lines.append(
            f"{label}: контрагентов {block['partners']}, объём {_money(block['totalRub'])}, "
            f"доля крупнейшего {block['topPartnerSharePct']}%, топ по ОКВЭД: {okveds}"
        )

    geo = bank.get("geography") or {}
    if geo.get("clientsCount"):
        cities = ", ".join(c["city"] for c in geo.get("topCities", [])) or "—"
        clusters = ", ".join(
            c["cluster"]
            for c in (geo.get("mscClusters", []) + geo.get("spbClusters", []))
        )
        place = cities if cities != "—" else clusters or "—"
        rc = (geo.get("topRegions") or [{}])[0].get("rc", "—")
        lines.append(f"Связанное физлицо компании: {place}, регион проживания {rc}")
    return lines