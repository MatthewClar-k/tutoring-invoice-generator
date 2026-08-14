"""Render an Invoice to PDF. All appearance constants live at the top."""
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (Paragraph, SimpleDocTemplate, Spacer, Table,
                                TableStyle)

from invoice.model import Invoice

# ---- appearance -------------------------------------------------------------
ACCENT = colors.HexColor("#1F3A5F")
RULE = colors.HexColor("#D0D7E2")
MARGIN = 20 * mm
COL_WIDTHS = [40 * mm, 75 * mm, 20 * mm, 35 * mm]
# -----------------------------------------------------------------------------

_base = getSampleStyleSheet()
STYLES = {
    "title": ParagraphStyle("title", parent=_base["Title"], fontSize=26,
                            textColor=ACCENT, alignment=TA_RIGHT, spaceAfter=0),
    "meta": ParagraphStyle("meta", parent=_base["Normal"], fontSize=9.5,
                           alignment=TA_RIGHT, leading=14),
    "body": ParagraphStyle("body", parent=_base["Normal"], fontSize=9.5, leading=14),
    "label": ParagraphStyle("label", parent=_base["Normal"], fontSize=8,
                            textColor=ACCENT, leading=12, spaceAfter=2),
    "name": ParagraphStyle("name", parent=_base["Normal"], fontSize=12,
                           textColor=ACCENT, leading=16),
}


def _money(currency: str, amount: float) -> str:
    return f"{currency}{amount:,.2f}"


def render_pdf(invoice: Invoice, out_path: str | Path) -> Path:
    out_path = Path(out_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    doc = SimpleDocTemplate(
        str(out_path), pagesize=A4,
        leftMargin=MARGIN, rightMargin=MARGIN, topMargin=MARGIN, bottomMargin=MARGIN,
        title=f"Invoice {invoice.number}", author=invoice.provider.get("name", ""),
    )

    provider_lines = [invoice.provider.get(k, "") for k in ("email", "phone")]
    provider = [Paragraph(invoice.provider.get("name", ""), STYLES["name"])]
    provider += [Paragraph(v, STYLES["body"]) for v in provider_lines if v]

    heading = [
        Paragraph("INVOICE", STYLES["title"]),
        Spacer(1, 4),
        Paragraph(f"<b>{invoice.number}</b><br/>"
                  f"Issued {invoice.issue_date.strftime('%d %B %Y')}<br/>"
                  f"For {invoice.month.name.capitalize()} {invoice.month.year}",
                  STYLES["meta"]),
    ]

    header = Table([[provider, heading]], colWidths=[95 * mm, 75 * mm])
    header.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
    ]))

    bill_to = [Paragraph("BILL TO", STYLES["label"]),
               Paragraph(f"<b>{invoice.client.get('name', '')}</b>", STYLES["body"])]
    if invoice.client.get("address"):
        bill_to.append(Paragraph(invoice.client["address"].replace("\n", "<br/>"),
                                 STYLES["body"]))

    rows = [["Date", "Description", "Hours", "Amount"]]
    rows += [[i.date_label, i.description, f"{i.hours:g}",
              _money(invoice.currency, i.amount)] for i in invoice.line_items]
    rows.append(["", f"Total  ({invoice.month.parsed_hours:g} hours "
                     f"@ {_money(invoice.currency, invoice.rate)}/hr)",
                 "", _money(invoice.currency, invoice.total)])

    table = Table(rows, colWidths=COL_WIDTHS, repeatRows=1)
    table.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("TEXTCOLOR", (0, 0), (-1, 0), ACCENT),
        ("FONTSIZE", (0, 0), (-1, -1), 9.5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("LINEBELOW", (0, 0), (-1, 0), 0.9, ACCENT),
        ("LINEBELOW", (0, 1), (-1, -3), 0.4, RULE),
        ("LINEABOVE", (0, -1), (-1, -1), 0.9, ACCENT),
        ("ALIGN", (2, 0), (-1, -1), "RIGHT"),
        ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
        ("LEFTPADDING", (0, 0), (0, -1), 0),
        ("RIGHTPADDING", (-1, 0), (-1, -1), 0),
    ]))

    doc.build([header, Spacer(1, 14 * mm), *bill_to, Spacer(1, 10 * mm), table])
    return out_path
