from __future__ import annotations

from typing import Optional

from sqlalchemy import Float, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from .database import Base


class Product(Base):
    __tablename__ = "products"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    artikel_id: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    ean_gtin: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    hersteller: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    hersteller_artikelnr: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    artikelname: Mapped[str] = mapped_column(String(256), index=True)
    artikelbeschreibung: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    kategorie: Mapped[Optional[str]] = mapped_column(String(64), index=True, nullable=True)
    unterkategorie: Mapped[Optional[str]] = mapped_column(String(64), index=True, nullable=True)
    werkstoff: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    nennweite_dn: Mapped[Optional[int]] = mapped_column(Integer, index=True, nullable=True)
    nennweite_od: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    laenge_mm: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    breite_mm: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    hoehe_mm: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    wandstaerke_mm: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    gewicht_kg: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    belastungsklasse: Mapped[Optional[str]] = mapped_column(String(16), index=True, nullable=True)
    steifigkeitsklasse_sn: Mapped[Optional[str]] = mapped_column(String(16), nullable=True)
    norm_primaer: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    norm_sekundaer: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    system_familie: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    verbindungstyp: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    dichtungstyp: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    kompatible_dn_anschluss: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    kompatible_systeme: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    einsatzbereich: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    einbauort: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    ek_netto: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    vk_listenpreis_netto: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    staffelpreis_ab_10: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    staffelpreis_ab_50: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    staffelpreis_ab_100: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    waehrung: Mapped[Optional[str]] = mapped_column(String(8), nullable=True)
    preiseinheit: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    lager_rheinbach: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    lager_duesseldorf: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    lager_gesamt: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    lieferant_1_lieferzeit_tage: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    status: Mapped[Optional[str]] = mapped_column(String(32), index=True, nullable=True)
    ersatz_artikel_id: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    nachfolger_artikel_id: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)


Index("ix_products_category_dn", Product.kategorie, Product.unterkategorie, Product.nennweite_dn)
