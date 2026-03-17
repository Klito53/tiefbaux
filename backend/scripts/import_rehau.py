"""Import REHAU AWADUKT HPP SN 10/16 products from the Muffenrohr price list.

The PDF has a fixed tabular structure. Since PDF table extraction is fragile,
we encode the data directly from the visually verified PDF pages.

Source: muffenrohr.de REHAU AWADUKT HPP SN 10/16 Preisliste 04/2021
"""

from __future__ import annotations

import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.database import SessionLocal
from app.models import Product
from sqlalchemy import select

# ── Constants ────────────────────────────────────────────────────────

HERSTELLER = "REHAU"
SYSTEM = "AWADUKT HPP"
WERKSTOFF = "PP"
NORM = "DIN EN 1852"
WAEHRUNG = "EUR"
KATEGORIE = "Kanalrohre"
EINSATZBEREICH = "Abwasser"
STATUS = "aktiv"

DN_SIZES = [110, 160, 200, 250, 315, 400, 500, 630]


def _art_id(rehau_nr: str) -> str:
    return f"REHAU-{rehau_nr}"


# ── Product data extracted from PDF ──────────────────────────────────

# Each entry: (rehau_article_nr, name, subcategory, dn, sn, length_mm, price_eur, unit, angle_deg, dn_abgang)

PRODUCTS: list[tuple] = []


def _add_pipe(sn: int, length_m: float, data: dict[int, tuple[str, str, float]]):
    """Add pipe products. data = {dn: (art_orange, art_blau, price_per_m)}"""
    length_mm = int(length_m * 1000)
    for dn, (art_orange, art_blau, price) in data.items():
        suffix = f"SN {sn}"
        name = f"REHAU AWADUKT HPP Kanalrohr DN{dn} SN{sn} L={length_m}m"
        total_price = round(price * length_m, 2)
        if art_orange:
            PRODUCTS.append((art_orange, f"{name} orange", "KG-Rohre", dn, sn, length_mm, total_price, "Stk", None, None))
        if art_blau:
            PRODUCTS.append((art_blau, f"{name} blau", "KG-Rohre", dn, sn, length_mm, total_price, "Stk", None, None))


# ── Rohr SN 16 ──

# 1,0m
_add_pipe(16, 1.0, {
    160: ("669198", "", 40.90),
    200: ("669201", "1073904", 56.90),
    250: ("669204", "1073905", 99.80),
    315: ("669207", "1073908", 159.00),
    400: ("669210", "1066168", 262.00),
    500: ("669213", "1073910", 440.00),
    630: ("", "1094451", 654.00),
})
# Note: DN110 not listed for SN16

# 3,0m
_add_pipe(16, 3.0, {
    160: ("669199", "", 26.70*3),
    200: ("669202", "1066165", 40.10*3),
    250: ("669205", "1073906", 67.70*3),
    315: ("669208", "1066167", 101.00*3),
    400: ("669211", "1066169", 173.00*3),
    500: ("669214", "1066171", 283.00*3),
    630: ("", "1094454", 425.00*3),
})

# 6,0m
_add_pipe(16, 6.0, {
    160: ("669200", "", 23.90*6),
    200: ("669203", "1066164", 37.20*6),
    250: ("669206", "1066166", 58.60*6),
    315: ("669209", "1073907", 90.00*6),
    400: ("669212", "1016068", 144.00*6),
    500: ("669215", "1073909", 235.00*6),
    630: ("", "1073911", 356.00*6),
})


# ── Rohr SN 10 ──

# 1,0m
_add_pipe(10, 1.0, {
    110: ("473752", "1066155", 21.50),
    160: ("266238", "519822", 37.30),
    200: ("266331", "521049", 52.10),
    250: ("390678", "521052", 91.80),
    315: ("390681", "521055", 146.00),
    400: ("568791", "1073925", 242.00),
    500: ("568792", "1073922", 406.00),
    630: ("", "1094511", 602.00),
})

# 3,0m
_add_pipe(10, 3.0, {
    110: ("473771", "1066156", 13.40*3),
    160: ("266209", "501934", 24.60*3),
    200: ("266198", "521050", 36.90*3),
    250: ("390679", "521053", 62.10*3),
    315: ("390682", "521056", 92.70*3),
    400: ("517444", "521058", 158.00*3),
    500: ("549611", "521060", 261.00*3),
    630: ("", "1094512", 388.00*3),
})

# 6,0m
_add_pipe(10, 6.0, {
    110: ("494456", "1073903", 11.60*6),
    160: ("494457", "521048", 21.80*6),
    200: ("494458", "521051", 34.40*6),
    250: ("494459", "521054", 53.60*6),
    315: ("494460", "521057", 82.00*6),
    400: ("390677", "521059", 132.00*6),
    500: ("390676", "521061", 216.00*6),
    630: ("", "1094513", 328.00*6),
})


# ── Doppelmuffe mit Anschlag ──

_doppelmuffe = {
    110: [("473798", "1094523", 11.90)],
    160: [("390719", "521072", 22.80)],
    200: [("390735", "521073", 39.70)],
    250: [("390736", "1073893", 85.80)],
    315: [("390737", "575660", 126.00)],
    400: [("", "574757", 209.00)],
    500: [("390704", "1073926", 378.00)],
    630: [("1094542", "1094543", 541.00)],
}
for dn, variants in _doppelmuffe.items():
    for art, art2, price in variants:
        if art:
            PRODUCTS.append((art, f"REHAU AWADUKT HPP Doppelmuffe DN{dn} orange", "Formstücke", dn, None, None, price, "Stk", None, None))
        if art2:
            PRODUCTS.append((art2, f"REHAU AWADUKT HPP Doppelmuffe DN{dn} blau", "Formstücke", dn, None, None, price, "Stk", None, None))


# ── Überschiebmuffe ──

_ueberschiebmuffe = {
    110: [("473797", "1094522", 11.90)],
    160: [("266242", "501943", 22.80)],
    200: [("266243", "521071", 39.70)],
    250: [("390733", "659181", 85.80)],
    315: [("390734", "659180", 126.00)],
    400: [("390739", "1073928", 209.00)],
    500: [("549640", "1073929", 378.00)],
    630: [("1094544", "1094545", 541.00)],
}
for dn, variants in _ueberschiebmuffe.items():
    for art, art2, price in variants:
        if art:
            PRODUCTS.append((art, f"REHAU AWADUKT HPP Überschiebmuffe DN{dn} orange", "Formstücke", dn, None, None, price, "Stk", None, None))
        if art2:
            PRODUCTS.append((art2, f"REHAU AWADUKT HPP Überschiebmuffe DN{dn} blau", "Formstücke", dn, None, None, price, "Stk", None, None))


# ── Abzweig 45° ──

_abzweig45 = {
    (110, 110): [("473794", "1094521", 19.20)],
    (160, 110): [("473795", "1066196", 41.10)],
    (200, 160): [("266308", "501946", 81.10)],
    (200, 200): [("266309", "521068", 116.00)],
    (250, 160): [("390690", "659182", 167.00)],
    (250, 200): [("390689", "1066188", 440.00)],
    (250, 250): [("", "", 454.00)],
    (315, 160): [("390691", "574654", 892.00)],
    (315, 200): [("390689", "1066188", 440.00)],  # already added above — skip duplicate
    (400, 160): [("", "", 977.00)],
    (400, 200): [("390715", "390697", 1529.00)],
    (500, 200): [("", "", 1764.00)],
    (630, 200): [("", "1094529", 1419.00)],
    (630, 250): [("", "1094531", 1608.00)],
    (630, 315): [("", "1094532", 1896.00)],
    (630, 400): [("", "1094533", 2282.00)],
    (630, 500): [("", "1094534", 2898.00)],
    (630, 630): [("", "1094535", 4038.00)],
}
for (dn_main, dn_abg), variants in _abzweig45.items():
    for art, art2, price in variants:
        name_base = f"REHAU AWADUKT HPP Abzweig 45° DN{dn_main}/{dn_abg}"
        if art:
            PRODUCTS.append((art, f"{name_base} orange", "Formstücke", dn_main, None, None, price, "Stk", 45, dn_abg))
        if art2:
            PRODUCTS.append((art2, f"{name_base} blau", "Formstücke", dn_main, None, None, price, "Stk", 45, dn_abg))


# ── Abzweig 87° ──

_abzweig87 = {
    (160, 110): [("", "549617", 224.00)],
    (200, 160): [("549618", "", 50.30)],
    (200, 200): [("549619", "", 112.00)],
    (250, 160): [("549621", "", 296.00)],
    (250, 200): [("549622", "", 331.00)],
    (250, 250): [("549623", "", 374.00)],
    (315, 160): [("549624", "", 376.00)],
    (315, 200): [("549625", "", 401.00)],
    (315, 250): [("549626", "", 420.00)],
    (315, 315): [("549627", "", 510.00)],
    (400, 160): [("549628", "", 444.00)],
    (400, 200): [("549630", "", 475.00)],
    (400, 250): [("549631", "", 549.00)],
    (400, 315): [("549632", "", 568.00)],
    (400, 400): [("549633", "", 777.00)],
    (500, 200): [("549634", "", 929.00)],
    (500, 250): [("549635", "", 1006.00)],
    (500, 315): [("549636", "", 1124.00)],
    (500, 400): [("549637", "", 1164.00)],
    (500, 500): [("549639", "", 1524.00)],
    (630, 200): [("", "1094536", 1418.00)],
    (630, 250): [("", "1094537", 1533.00)],
    (630, 315): [("", "1094538", 1619.00)],
    (630, 400): [("", "1094539", 1887.00)],
    (630, 500): [("", "1094540", 2290.00)],
    (630, 630): [("9000264", "", 2898.00)],
}
for (dn_main, dn_abg), variants in _abzweig87.items():
    for art, art2, price in variants:
        name_base = f"REHAU AWADUKT HPP Abzweig 87° DN{dn_main}/{dn_abg}"
        if art:
            PRODUCTS.append((art, f"{name_base} orange", "Formstücke", dn_main, None, None, price, "Stk", 87, dn_abg))
        if art2:
            PRODUCTS.append((art2, f"{name_base} blau", "Formstücke", dn_main, None, None, price, "Stk", 87, dn_abg))


# ── Reduktion ──

_reduktion = {
    (160, 110): [("473796", "", 33.90)],
    (200, 160): [("390730", "521070", 46.10)],
    (250, 200): [("390731", "", 98.10)],
    (315, 250): [("390732", "", 210.00)],
    (400, 315): [("390708", "", 315.00)],
    (500, 400): [("390703", "", 549.00)],
    (630, 500): [("", "1094541", 1202.00)],
}
for (dn_main, dn_abg), variants in _reduktion.items():
    for art, art2, price in variants:
        name_base = f"REHAU AWADUKT HPP Reduktion DN{dn_main}/{dn_abg}"
        if art:
            PRODUCTS.append((art, f"{name_base} orange", "Formstücke", dn_main, None, None, price, "Stk", None, dn_abg))
        if art2:
            PRODUCTS.append((art2, f"{name_base} blau", "Formstücke", dn_main, None, None, price, "Stk", None, dn_abg))


# ── Muffenstopfen ──

_muffenstopfen = {
    110: ("549651", 3.30),
    160: ("390685", 6.00),
    200: ("390686", 10.40),
    250: ("671782", 34.00),
    315: ("671556", 62.20),
    400: ("1094464", 77.60),
    500: ("1094514", 520.00),
    630: ("1094515", 714.00),
}
for dn, (art, price) in _muffenstopfen.items():
    PRODUCTS.append((art, f"REHAU AWADUKT HPP Muffenstopfen DN{dn}", "Formstücke", dn, None, None, price, "Stk", None, None))


# ── Bogen ──

_bogen_data = {
    # (angle, dn): [(art_orange, art_blau, price)]
    (15, 160): [("473788", "1094517", 12.80)],
    (15, 200): [("266305", "501953", 25.20)],
    (15, 250): [("266298", "521063", 39.00)],
    (15, 315): [("390720", "1066197", 92.10)],
    (15, 400): [("390723", "1066200", 147.00)],
    (15, 500): [("390710", "", 373.00)],
    (15, 630): [("390692", "1094525", 694.00)],

    (30, 160): [("473785", "1094518", 13.20)],
    (30, 200): [("266303", "501949", 27.40)],
    (30, 250): [("266296", "521064", 41.70)],
    (30, 315): [("390721", "1066198", 97.10)],
    (30, 400): [("390724", "1066201", 153.00)],
    (30, 500): [("390711", "", 392.00)],
    (30, 630): [("390693", "1094526", 734.00)],

    (45, 160): [("473789", "1094519", 14.00)],
    (45, 200): [("266302", "501947", 29.70)],
    (45, 250): [("266295", "521065", 44.00)],
    (45, 315): [("310532", "1066199", 104.00)],
    (45, 400): [("390725", "1066202", 164.00)],
    (45, 500): [("390712", "", 529.00)],
    (45, 630): [("390694", "1094527", 1157.00)],

    (88, 110): [("473791", "1094520", 15.80)],
    (88, 160): [("266300", "521062", 34.70)],
    (88, 200): [("266249", "521067", 53.40)],
    (88, 250): [("390722", "", 117.00)],
    (88, 315): [("390726", "", 181.00)],
    (88, 400): [("390707", "", 744.00)],
    (88, 500): [("390695", "", 1459.00)],
    (88, 630): [("", "1094528", 3341.00)],
}
for (angle, dn), variants in _bogen_data.items():
    for art, art2, price in variants:
        name_base = f"REHAU AWADUKT HPP Bogen {angle}° DN{dn}"
        if art:
            PRODUCTS.append((art, f"{name_base} orange", "Formstücke", dn, None, None, price, "Stk", angle, None))
        if art2:
            PRODUCTS.append((art2, f"{name_base} blau", "Formstücke", dn, None, None, price, "Stk", angle, None))


# ── Import logic ─────────────────────────────────────────────────────

def run_import():
    db = SessionLocal()
    try:
        # Check existing REHAU products
        existing = set(
            db.scalars(
                select(Product.artikel_id).where(Product.hersteller == HERSTELLER)
            ).all()
        )
        print(f"Existing REHAU products in DB: {len(existing)}")

        added = 0
        skipped = 0
        for entry in PRODUCTS:
            art_nr, name, subcategory, dn, sn, length_mm, price, unit, angle, dn_abgang = entry
            if not art_nr:
                skipped += 1
                continue

            artikel_id = _art_id(art_nr)
            if artikel_id in existing:
                skipped += 1
                continue

            # Determine SN from pipe entries or None for fittings
            sn_str = f"SN{sn}" if sn else None

            # Build description
            desc_parts = [name]
            if dn_abgang:
                desc_parts.append(f"Abgang DN{dn_abgang}")

            product = Product(
                artikel_id=artikel_id,
                hersteller=HERSTELLER,
                hersteller_artikelnr=art_nr,
                artikelname=name,
                artikelbeschreibung=" ".join(desc_parts),
                kategorie=KATEGORIE,
                unterkategorie=subcategory,
                werkstoff=WERKSTOFF,
                nennweite_dn=dn,
                laenge_mm=length_mm,
                steifigkeitsklasse_sn=sn_str,
                norm_primaer=NORM,
                system_familie=SYSTEM,
                einsatzbereich=EINSATZBEREICH,
                vk_listenpreis_netto=round(price, 2),
                waehrung=WAEHRUNG,
                preiseinheit=unit,
                status=STATUS,
            )

            # Set compatible DN for fittings
            if dn_abgang and dn_abgang != dn:
                product.kompatible_dn_anschluss = str(dn_abgang)

            db.add(product)
            existing.add(artikel_id)
            added += 1

        db.commit()
        print(f"Import complete: {added} added, {skipped} skipped")
        print(f"Total REHAU products now: {len(existing)}")

    finally:
        db.close()


if __name__ == "__main__":
    run_import()
