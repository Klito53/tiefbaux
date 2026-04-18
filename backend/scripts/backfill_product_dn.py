"""Backfill nennweite_dn for products where it is NULL.

Strategy (safe, reversible):
  1) Copy nennweite_od -> nennweite_dn for plastic pipe-system products.
     For PE/PP/PVC-U pipe families the nominal call-out used in LVs is the
     outer diameter (OD) — so DN=OD is a correct identity for matching.
  2) Extract DN from explicit "DN", "DN/OD", "DN/ID", "NW", "Nennweite"
     tokens in artikelname / artikelbeschreibung. Range 20..2500.

Run from backend/:
    DRY_RUN=1 python -m scripts.backfill_product_dn   # preview only
    python -m scripts.backfill_product_dn             # apply

The script prints a per-category summary and never overwrites a DN that is
already set. A .bak snapshot of the DB is taken before applying.
"""
from __future__ import annotations

import os
import re
import shutil
import sys
from collections import defaultdict
from datetime import datetime
from pathlib import Path

from sqlalchemy import create_engine, select, update
from sqlalchemy.orm import Session

from app.config import settings
from app.models import Product


_OD_COPY_CATEGORIES = {
    "Druckrohre",
    "Wasserrohre",
    "Gasrohre",
    "Kanalrohre",
    "Regenwasser",
    "Formstücke",
    "Dichtungen & Zubehör",
    "Kabelschutz",
}

_DN_PATTERNS = (
    re.compile(r"\bDN\s*/\s*(?:ID|OD)\s*(\d{2,4})\b", re.IGNORECASE),
    re.compile(r"\bDN\s*(\d{2,4})\b", re.IGNORECASE),
    re.compile(r"\bNW\s*(\d{2,4})\b", re.IGNORECASE),
    re.compile(r"\bNennweite\s*(\d{2,4})\b", re.IGNORECASE),
)


def extract_dn(text: str | None) -> int | None:
    if not text:
        return None
    for pat in _DN_PATTERNS:
        m = pat.search(text)
        if m:
            v = int(m.group(1))
            if 20 <= v <= 2500:
                return v
    return None


def main() -> int:
    dry_run = os.getenv("DRY_RUN", "").lower() in ("1", "true", "yes")

    db_url = settings.database_url
    print(f"DB: {db_url}")
    print(f"Mode: {'DRY-RUN (no writes)' if dry_run else 'APPLY'}")

    if not dry_run and db_url.startswith("sqlite:///"):
        db_path = Path(db_url.replace("sqlite:///", ""))
        if not db_path.is_absolute():
            db_path = Path.cwd() / db_path
        if db_path.exists():
            stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            bak = db_path.with_suffix(db_path.suffix + f".backfill_dn.{stamp}.bak")
            shutil.copy2(db_path, bak)
            print(f"Backup: {bak}")

    engine = create_engine(db_url, future=True)

    od_copy = 0
    od_skipped_category = 0
    name_extract = 0
    updates: list[tuple[int, int, str]] = []  # (id, new_dn, reason)

    by_cat_od: dict[str | None, int] = defaultdict(int)
    by_cat_name: dict[str | None, int] = defaultdict(int)

    with Session(engine) as s:
        stmt = select(Product).where(Product.nennweite_dn.is_(None))
        for p in s.scalars(stmt):
            new_dn: int | None = None
            reason = ""
            if p.nennweite_od is not None and p.kategorie in _OD_COPY_CATEGORIES:
                new_dn = p.nennweite_od
                reason = "OD->DN"
                od_copy += 1
                by_cat_od[p.kategorie] += 1
            elif p.nennweite_od is not None:
                od_skipped_category += 1

            if new_dn is None:
                text = f"{p.artikelname or ''} | {p.artikelbeschreibung or ''}"
                cand = extract_dn(text)
                if cand is not None:
                    new_dn = cand
                    reason = "name-extract"
                    name_extract += 1
                    by_cat_name[p.kategorie] += 1

            if new_dn is not None:
                updates.append((p.id, new_dn, reason))

        print()
        print(f"Candidates: {len(updates)}")
        print(f"  OD->DN copy:       {od_copy}")
        print(f"  name extract:      {name_extract}")
        print(f"  OD-set skipped (category not in whitelist): {od_skipped_category}")
        print()
        print("By category (OD->DN):")
        for k, v in sorted(by_cat_od.items(), key=lambda x: -x[1]):
            print(f"  {k}: {v}")
        print()
        print("By category (name extract):")
        for k, v in sorted(by_cat_name.items(), key=lambda x: -x[1]):
            print(f"  {k}: {v}")

        print("\nSample updates:")
        for pid, dn, why in updates[:15]:
            prod = s.get(Product, pid)
            print(f"  [{why:14}] id={pid:<6} {prod.artikel_id:<14} DN={dn:<4} {prod.artikelname[:80]}")

        if dry_run:
            print("\nDRY_RUN=1 — no changes written.")
            return 0

        for pid, dn, _ in updates:
            s.execute(update(Product).where(Product.id == pid).values(nennweite_dn=dn))
        s.commit()
        print(f"\nApplied: {len(updates)} rows updated.")

    return 0


if __name__ == "__main__":
    sys.exit(main())
