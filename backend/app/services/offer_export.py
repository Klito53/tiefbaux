from __future__ import annotations

import io
from datetime import datetime

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from ..schemas import ExportOfferMetadata, OfferLine



def _fmt_money(value: float) -> str:
    return f"{value:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")



def _fmt_qty(value: float) -> str:
    if value.is_integer():
        return str(int(value))
    return str(round(value, 3)).replace(".", ",")



def build_offer_pdf(lines: list[OfferLine], metadata: ExportOfferMetadata) -> bytes:
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=14 * mm,
        rightMargin=14 * mm,
        topMargin=16 * mm,
        bottomMargin=14 * mm,
        title="TiefbauX Angebot",
    )

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "OfferTitle",
        parent=styles["Title"],
        fontName="Helvetica-Bold",
        fontSize=22,
        leading=26,
        textColor=colors.HexColor("#0F2B46"),
        spaceAfter=8,
    )
    subtitle_style = ParagraphStyle(
        "OfferSubtitle",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=10,
        leading=14,
        textColor=colors.HexColor("#334155"),
    )
    body_style = ParagraphStyle(
        "Body",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=8.5,
        leading=11,
    )

    story = [Paragraph("TiefbauX - Angebotsentwurf", title_style)]

    customer = metadata.customer_name or "Nicht angegeben"
    project = metadata.project_name or "Nicht angegeben"
    date_str = metadata.created_at.strftime("%d.%m.%Y %H:%M")
    story.append(
        Paragraph(
            f"Kunde: {customer}<br/>Projekt: {project}<br/>Erstellt: {date_str}",
            subtitle_style,
        )
    )
    story.append(Spacer(1, 8 * mm))

    table_data = [
        [
            "Pos",
            "LV-Beschreibung",
            "Artikel",
            "Menge",
            "EP netto",
            "Gesamt netto",
        ]
    ]

    for line in lines:
        table_data.append(
            [
                line.ordnungszahl,
                Paragraph(line.description[:140], body_style),
                Paragraph(
                    f"{line.artikel_id}<br/>{line.artikelname}<br/>{line.hersteller or ''}",
                    body_style,
                ),
                f"{_fmt_qty(line.quantity)} {line.unit}",
                f"{_fmt_money(line.price_net)} EUR",
                f"{_fmt_money(line.total_net)} EUR",
            ]
        )

    table = Table(
        table_data,
        colWidths=[18 * mm, 56 * mm, 58 * mm, 22 * mm, 20 * mm, 24 * mm],
        repeatRows=1,
    )
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0F2B46")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, 0), 9),
                ("ALIGN", (3, 1), (-1, -1), "RIGHT"),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
                ("FONTSIZE", (0, 1), (-1, -1), 8),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F4F8FB")]),
                ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#94A3B8")),
                ("LEFTPADDING", (0, 0), (-1, -1), 5),
                ("RIGHTPADDING", (0, 0), (-1, -1), 5),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ]
        )
    )
    story.append(table)
    story.append(Spacer(1, 6 * mm))

    total_style = ParagraphStyle(
        "Total",
        parent=styles["Heading3"],
        fontName="Helvetica-Bold",
        fontSize=13,
        textColor=colors.HexColor("#0F2B46"),
    )
    mwst = round(metadata.total_net * 0.19, 2)
    brutto = round(metadata.total_net + mwst, 2)

    story.append(Paragraph(f"Gesamt netto: <b>{_fmt_money(metadata.total_net)} EUR</b>", total_style))
    story.append(Paragraph(f"MwSt. 19%: <b>{_fmt_money(mwst)} EUR</b>", total_style))
    story.append(Paragraph(f"Gesamt brutto: <b>{_fmt_money(brutto)} EUR</b>", total_style))

    doc.build(story)
    return buffer.getvalue()



def now_metadata(customer_name: str | None, project_name: str | None, total_net: float) -> ExportOfferMetadata:
    return ExportOfferMetadata(
        customer_name=customer_name,
        project_name=project_name,
        created_at=datetime.now(),
        total_net=round(total_net, 2),
    )
