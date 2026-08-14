"""Command-line entry point. The only module that touches the console."""
import argparse
import json
import sys
from datetime import date
from pathlib import Path

from invoice.model import Invoice, LineItem, MONTH_NUMBERS
from invoice.parser import parse_notes
from invoice.reconcile import check, effective_rate
from invoice.render import render_pdf

ROOT = Path(__file__).resolve().parent.parent
MONTH_TITLES = {n: name.capitalize() for name, n in MONTH_NUMBERS.items()}


def load_config(path: Path) -> dict:
    if not path.exists():
        raise SystemExit(
            f"No config found at {path}.\n"
            f"Copy config.example.json to config.json and fill in your details."
        )
    return json.loads(path.read_text(encoding="utf-8"))


def build_invoice(month, config: dict, issue_date: date) -> Invoice:
    rate = effective_rate(month, config["hourly_rate"])
    currency = config.get("currency", "R")
    prefix = config.get("invoice_prefix", "INV")
    items = [
        LineItem(
            date_label=f"{s.day} {MONTH_TITLES[month.number]} {month.year}",
            description="Tutoring session",
            hours=s.hours,
            amount=int(s.hours * rate),
        )
        for s in sorted(month.sessions, key=lambda s: s.day)
    ]
    return Invoice(
        number=f"{prefix}-{month.year}-{month.number:02d}",
        issue_date=issue_date,
        provider=config["provider"],
        client=config["client"],
        month=month,
        rate=rate,
        currency=currency,
        line_items=items,
        total=sum(i.amount for i in items),
    )


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Generate PDF invoices from tutoring notes.")
    ap.add_argument("notes", nargs="?", default=None, help="path to the notes .txt")
    ap.add_argument("--month", help="only this month, e.g. APRIL")
    ap.add_argument("--all", action="store_true", help="include months marked Paid.")
    ap.add_argument("--force", action="store_true", help="overwrite existing PDFs")
    ap.add_argument("--config", default=str(ROOT / "config.json"))
    ap.add_argument("--out", default=str(ROOT / "invoices"))
    args = ap.parse_args(argv)

    notes_path = Path(args.notes) if args.notes else ROOT / "notes.txt"
    if not notes_path.exists():
        print(f"ERROR: no notes file at {notes_path}")
        return 1

    config = load_config(Path(args.config))
    notes = parse_notes(notes_path.read_text(encoding="utf-8"),
                        default_year=config.get("year"))

    print(f"\nRead {notes_path}  ({len(notes.months)} month(s), year {notes.year})\n")
    for problem in notes.problems:
        if problem.month is None:
            print(f"  note: line {problem.line_no}: ignored {problem.text!r}")

    failed = False
    wanted = args.month.upper() if args.month else None

    for month in notes.months:
        title = f"{MONTH_TITLES[month.number]} {month.year}"

        if wanted and month.name != wanted:
            continue

        print(f"{title}")
        for s in sorted(month.sessions, key=lambda s: s.day):
            print(f"    {s.day:>2} {MONTH_TITLES[month.number]:<10} {s.hours:g}h")
        print(f"    {'':>2} {'':<10} {month.parsed_hours:g}h total")

        problems = [p for p in notes.problems
                    if p.month == month.name] + check(month, config["hourly_rate"])
        for p in problems:
            where = f" (line {p.line_no}: {p.text!r})" if p.line_no else ""
            print(f"    {p.severity.upper()}: {p.message}{where}")

        if any(p.severity == "error" for p in problems):
            print("    -> REFUSED: no invoice generated for this month.\n")
            failed = True
            continue

        if month.paid and not args.all and not wanted:
            print("    -> skipped: marked Paid. (use --all to regenerate)\n")
            continue

        invoice = build_invoice(month, config, date.today())
        out_file = Path(args.out) / f"{invoice.number}_{MONTH_TITLES[month.number]}.pdf"
        if out_file.exists() and not args.force:
            print(f"    -> exists, not overwritten: {out_file.name} (use --force)\n")
            continue

        render_pdf(invoice, out_file)
        print(f"    -> {out_file}  "
              f"{invoice.currency}{invoice.total:,.2f} @ "
              f"{invoice.currency}{invoice.rate}/hr\n")

    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
