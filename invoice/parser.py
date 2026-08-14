"""Parse iPhone Notes tutoring text into structured data. Pure: no I/O."""
import re
from datetime import date

from invoice.model import MONTH_NUMBERS, Month, ParsedNotes, Problem, Session

TITLE_RE = re.compile(r"^\s*TUTORING\s+(\d{4})\s*$", re.IGNORECASE)
MONTH_RE = re.compile(rf"^\s*({'|'.join(MONTH_NUMBERS)})\s*:?\s*$", re.IGNORECASE)
PAID_RE = re.compile(r"^\s*paid\b\.?\s*$", re.IGNORECASE)

SESSION_RE = re.compile(
    r"""^\s*
        (?:\d{1,2}\s*[.)]\s*)?        # optional list numbering: "1." or "1)"
        (\d{1,2})(?:st|nd|rd|th)?     # day, optional ordinal suffix
        \s*[-–—]\s*         # hyphen, en dash or em dash
        (\d+(?:[.,]\d+)?)             # duration, possibly fractional
        \s*(?:hrs?|hours?)            # unit
        \s*\.?\s*$""",
    re.IGNORECASE | re.VERBOSE,
)

TOTAL_RE = re.compile(
    r"""^\s*TOTAL\s*:?\s*R\s*([\d,\s]+?)      # stated rand total
        (?:\s*\(\s*(\d+)\s*x\s*R?\s*([\d,\s]+?)\s*\))?   # optional "(6x250)"
        \s*$""",
    re.IGNORECASE | re.VERBOSE,
)


def _number(raw: str) -> int:
    """'1,500' or '1 500' -> 1500."""
    return int(raw.replace(",", "").replace(" ", ""))


def parse_notes(text: str, default_year: int | None = None) -> ParsedNotes:
    year = default_year or date.today().year
    months: list[Month] = []
    problems: list[Problem] = []
    current: Month | None = None

    for line_no, raw in enumerate(text.splitlines(), start=1):
        line = raw.rstrip()
        if not line.strip():
            continue

        if (m := TITLE_RE.match(line)):
            year = int(m.group(1))
            for month in months:          # a late title still applies to what came before
                month.year = year
            continue

        if (m := MONTH_RE.match(line)):
            name = m.group(1).upper()
            current = Month(name=name, number=MONTH_NUMBERS[name], year=year)
            months.append(current)
            continue

        if current is None:
            problems.append(Problem(
                severity="warning", message="Line outside any month block, ignored",
                line_no=line_no, text=line,
            ))
            continue

        if (m := SESSION_RE.match(line)):
            hours = float(m.group(2).replace(",", "."))
            current.sessions.append(Session(day=int(m.group(1)), hours=hours))
            continue

        if (m := TOTAL_RE.match(line)):
            current.stated_total = _number(m.group(1))
            if m.group(2) is not None:
                current.stated_hours = int(m.group(2))
                current.stated_rate = _number(m.group(3))
            continue

        if PAID_RE.match(line):
            current.paid = True
            continue

        problems.append(Problem(
            severity="error", message="Unrecognised line inside a month block",
            month=current.name, line_no=line_no, text=line,
        ))

    return ParsedNotes(year=year, months=months, problems=problems)
