from datetime import date

from invoice.model import Invoice, LineItem, Month, Session
from invoice.render import render_pdf


def build_invoice():
    month = Month(name="APRIL", number=4, year=2026,
                  sessions=[Session(d, 1) for d in (15, 22, 27, 29)],
                  stated_total=1000, stated_hours=4, stated_rate=250)
    items = [LineItem(f"{d} April 2026", "Tutoring session", 1, 250)
             for d in (15, 22, 27, 29)]
    return Invoice(
        number="INV-2026-04", issue_date=date(2026, 5, 1),
        provider={"name": "Test Tutor", "email": "t@example.com", "phone": "+27 00 000 0000"},
        client={"name": "Test Family", "address": "12 Example Road"},
        month=month, rate=250, currency="R", line_items=items, total=1000,
    )


def test_render_writes_a_real_pdf(tmp_path):
    out = render_pdf(build_invoice(), tmp_path / "INV-2026-04_April.pdf")
    assert out.exists()
    data = out.read_bytes()
    assert data.startswith(b"%PDF-")
    assert len(data) > 1000


def test_render_creates_missing_parent_directory(tmp_path):
    out = render_pdf(build_invoice(), tmp_path / "nested" / "out.pdf")
    assert out.exists()
