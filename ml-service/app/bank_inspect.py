import pandas as pd

from .bank_data import _file, reset_cache
from .settings import settings


def _show(name: str) -> pd.DataFrame | None:
    path = _file(name)
    print(f"\n=== {name} ({path}) ===")
    if not path.exists():
        print("файла нет")
        return None
    df = pd.read_csv(path, sep=settings.bank_csv_sep, nrows=5000, low_memory=False)
    print("shape:", df.shape)
    print("колонки:", list(df.columns))
    print(df.dtypes.to_string())
    preview = list(df.columns[:10])
    print(df[preview].head(3).to_string())
    return df


def main() -> None:
    reset_cache()
    uid = _show(settings.bank_uid_file)
    pay = _show(settings.bank_payment_file)
    link = _show(settings.bank_link_file)

    if uid is not None and "REVENUE_COMPANY" in uid.columns:
        rev = pd.to_numeric(uid["REVENUE_COMPANY"], errors="coerce").dropna()
        if not rev.empty:
            print("\nREVENUE_COMPANY quantiles:")
            print(rev.quantile([0, 0.25, 0.5, 0.75, 0.99, 1.0]).to_string())
            print("медиана в млн руб. при unit=%.0f: %.1f"
                  % (settings.bank_revenue_unit, rev.median() * settings.bank_revenue_unit / 1e6))

    if uid is not None and "NEGATIVEMARK" in uid.columns:
        print("\nNEGATIVEMARK (ключевой собственник) value_counts:")
        print(uid["NEGATIVEMARK"].value_counts(dropna=False).to_string())

    if uid is not None and "FTS_COUNTRY_NAME" in uid.columns:
        fts = uid["FTS_COUNTRY_NAME"].dropna().astype(str).str.strip()
        fts = fts[fts != ""]
        print("\nFTS_COUNTRY_NAME непустых:", len(fts))
        if len(fts):
            print(fts.value_counts().head(10).to_string())

    if pay is not None and "PAY_AMT" in pay.columns:
        amt = pd.to_numeric(pay["PAY_AMT"], errors="coerce").dropna()
        print("\nPAY_AMT quantiles:")
        print(amt.quantile([0, 0.25, 0.5, 0.75, 0.99, 1.0]).to_string())
        self_pay = pay[pay["BENEFICIARY"] == pay["PAYER"]]
        print("строк с самоплатежом:", len(self_pay),
              "доля:", round(len(self_pay) / len(pay) * 100, 1), "%")

    if link is not None and "SYNTHETIC_U" in link.columns:
        vc = link["SYNTHETIC_U"].value_counts()
        print("\nстрок на UID: min / median / max =",
              int(vc.min()), float(vc.median()), int(vc.max()))
        print("уникальных UID в link:", link["SYNTHETIC_U"].nunique())
        print("уникальных FID в link:", link["SYNTHETIC_F"].nunique())


if __name__ == "__main__":
    main()