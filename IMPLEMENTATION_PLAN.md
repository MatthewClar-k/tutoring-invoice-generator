# Tutoring Invoice Generator — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the tutoring log kept in iPhone Notes into a professional PDF invoice by dragging a `.txt` file onto a `.bat`, with no change to how sessions are recorded.

**Architecture:** A four-stage pipeline — parser (text → data), reconciler (verify against the checksum already present in the notes), renderer (data → PDF), CLI (orchestration). The fragile stage (text parsing) is isolated behind a pure function and tested without ever producing a PDF.

**Tech Stack:** Python 3.14.6, `reportlab` 5.0.0 (verified `py3-none-any` — pure-Python wheel, no build toolchain on Windows), `pytest`.

**Spec:** The project brief in this conversation (Notes format, decision table, module responsibilities, verification steps). It is reproduced in condensed form throughout; the decision table is authoritative where this plan is silent.

---

## Context

Matthew tutors a neighbouring family and invoices by hand: sessions are logged in iPhone Notes as a date and a duration, grouped by month, and the total is worked out mentally at R250/hr. The output is a plain text note, not something to hand a client.

The problem worth solving is not the arithmetic — it is that the record and the document are the same artifact, so producing an invoice means retyping. The insight this design rests on is that **the notes already carry their own checksum**: `TOTAL: R1500 (6x250)` states the answer alongside the working. That converts an inherently fragile text parser into one that can prove it read the note correctly. February (6h → R1500) and March (7h → R1750) both reconcile exactly against the current notes, so the existing format is already consistent enough to parse.

The intended outcome: select a month in Notes, save it as `notes.txt`, drag it onto a `.bat`, get a PDF. The design goal that outranks all others is that **the program must never silently produce an invoice for less than is owed** — under-billing is the one failure that costs real money, so an unreadable line refuses the month rather than skipping it.

### Decisions already settled

| Decision | Choice |
|---|---|
| Input | Plain `.txt` of the Notes content, in its existing format |
| Output | PDF |
| Invocation | Drag `.txt` onto `Generate Invoice.bat`, or double-click for `notes.txt` |
| Invoice fields | Invoice number + issue date, client "Bill To" block |
| Rate | R250/hr, in `config.json` |
| Clients | One |
| Durations | Whole hours only; anything else is an error, not a guess |
| `Paid.` marker | Parsed; paid months skipped by default |
| Banking details | **Excluded** (confirmed) — two-line addition later if wanted |
| Location | `C:\Users\mattc\Downloads\Vibe Coding\Tutoring Invoice Generator` (confirmed) |
| GitHub | Private repo `tutoring-invoice-generator`, pushed at end of M0 |

Also excluded (YAGNI): payment terms, VAT, multi-client machinery, a persistent JSON record store, emailing.

### Environment facts (verified, not assumed)

- `python --version` → **3.14.6**; `py` launcher also present.
- `pip install --dry-run --no-deps reportlab` → **`reportlab-5.0.0-py3-none-any.whl`**. Universal pure-Python wheel; installs on 3.14 without a compiler. This was the main technical risk and it is closed.
- `gh auth status` → logged in as **MatthewClar-k**, scopes `gist, read:org, repo`. Private repo creation will work.
- `git -C "C:\Users\mattc\Documents" rev-parse --show-toplevel` → **`C:/Users/mattc`**. The home folder is itself a git repo, so `Documents` and `Downloads` are *both* inside it. Moving to `Documents` would not have escaped this. The project therefore becomes a **nested repo**: git never descends into a directory containing its own `.git`, so the home repo sees one untracked folder and nothing more. The only hazard is `git add -A` run at the home root, which would create a gitlink; the 100+ untracked entries already sitting in that repo indicate this is not a habit.
- Project directory currently **exists and is empty**.

## Global Constraints

- Hourly rate **R250**, currency symbol **`R`**, from `config.json` — never hard-coded in logic.
- Durations are **whole hours**. A fractional duration parses successfully but fails reconciliation as an *error*.
- A month with any **error** produces no PDF, prints the offending line with its line number, and the process exits **non-zero**. Other months still generate.
- Invoice numbers are **derived, never counted**: `INV-<year>-<zero-padded month>` (e.g. `INV-2026-04`). No counter file, idempotent re-runs.
- Existing PDFs are **never overwritten** without `--force`.
- Personal data (`config.json`, `notes.txt`, `invoices/`) is **gitignored**. Only `config.example.json` and `sample_notes.txt` are committed. The repo is private, but the family's name and Matthew's contact details still do not belong in git history — that history is far harder to redact than a file.
- All paths quoted in the `.bat`: the install path contains spaces (`Vibe Coding`).
- Every module's public functions are **pure where they can be**: `parse_notes` and `check` do no file or console I/O.

## Milestone Independence

Milestones are ordered but not tightly chained. **M1, M2 and M3 each depend only on M0's data model**, so after M0 they can be executed in any order, or in parallel by separate agents. M4 needs all three. M5 needs M4.

```
M0 ──┬── M1 Parser ────┐
     ├── M2 Reconciler ┼── M4 CLI + .bat ── M5 Real-data cutover
     └── M3 Renderer ──┘
```

## File Structure

```
C:\Users\mattc\Downloads\Vibe Coding\Tutoring Invoice Generator\
├── Generate Invoice.bat      entry point for drag-and-drop
├── config.json               real details (GITIGNORED)
├── config.example.json       committed template
├── notes.txt                 real notes (GITIGNORED)
├── sample_notes.txt          committed fixture, Feb/Mar/Apr
├── pyproject.toml            pytest config (pythonpath) only
├── requirements.txt          reportlab, pytest
├── .gitignore
├── README.md
├── invoice\
│   ├── __init__.py
│   ├── model.py              dataclasses, zero logic
│   ├── parser.py             text → ParsedNotes (pure)
│   ├── reconcile.py          Month → list[Problem] (pure)
│   ├── render.py             Invoice → PDF
│   └── cli.py                orchestration, console output
├── tests\
│   ├── test_parser.py
│   ├── test_reconcile.py
│   └── test_render.py
└── invoices\                 generated output (GITIGNORED)
```

`pyproject.toml` carries `pythonpath = ["."]` so `tests/` can `import invoice.*` without an installed package, and the `.bat` runs `python -m invoice.cli` from the project root rather than `python invoice\cli.py` — the latter puts `invoice\` on `sys.path` instead of the root, and every `from invoice.model import …` would fail.

---

## Milestone 0 — Repository, skeleton, data model

**Deliverable:** A private GitHub repo containing a runnable skeleton. `pytest` collects cleanly and `python -c "import invoice.model"` succeeds.

**Files:**
- Create: `.gitignore`, `requirements.txt`, `pyproject.toml`, `sample_notes.txt`, `config.example.json`, `invoice/__init__.py`, `invoice/model.py`

> **Already done in the planning session — do not repeat:** `git init -b main`, the
> `.gitignore` below, and `gh repo create tutoring-invoice-generator --private` with the
> plan committed as `IMPLEMENTATION_PLAN.md`. Steps 1 and 2 are therefore partly complete
> and Step 8 is a plain `git push`, **not** another `gh repo create` (which would fail —
> the repo and the `origin` remote already exist). Start at Step 1's virtualenv commands.

- [x] **Step 1: Initialise the repo** — done. Still to do, the virtualenv:

```bash
cd "C:/Users/mattc/Downloads/Vibe Coding/Tutoring Invoice Generator"
python -m venv .venv
.venv/Scripts/python.exe -m pip install --upgrade pip
```

- [x] **Step 2: Write `.gitignore`** — done, committed. Reproduced here for reference:

```gitignore
.venv/
__pycache__/
*.pyc
.pytest_cache/

# Personal data — never commit
config.json
notes.txt
invoices/
```

- [x] **Step 3: Write `requirements.txt`, `pyproject.toml`, `config.example.json`**

`requirements.txt`:
```
reportlab==5.0.0
pytest==8.3.4
```

`pyproject.toml`:
```toml
[tool.pytest.ini_options]
pythonpath = ["."]
testpaths = ["tests"]
```

`config.example.json`:
```json
{
  "provider": { "name": "Your Name", "email": "you@example.com", "phone": "+27 00 000 0000" },
  "client":   { "name": "Client Name", "address": "" },
  "hourly_rate": 250,
  "currency": "R",
  "invoice_prefix": "INV"
}
```

- [x] **Step 4: Install dependencies**

```bash
.venv/Scripts/python.exe -m pip install -r requirements.txt
```
Expected: `reportlab-5.0.0-py3-none-any.whl` installs with no compilation.

- [x] **Step 5: Write `sample_notes.txt`**

Exactly the real format, including the two trailing `Paid.` markers and the unpaid April block:

```
TUTORING 2026

FEBRUARY:
 1. 5th - 1hr
 2. 11th - 1hr
 3. 18th - 1hr
 4. 22nd - 2hr
 5. 25th - 1hr
TOTAL: R1500 (6x250)
Paid.

MARCH:
 1. 1st - 2hr
 2. 4th - 1hr
 3. 7th - 2hr
 4. 12th - 1hr
 5. 22nd - 1hr
TOTAL: R1750 (7x250)
Paid.

APRIL:
 1. 15th - 1hr
 2. 22nd - 1hr
 3. 27th - 1hr
 4. 29th - 1hr
TOTAL: R1000 (4x250)
```

- [x] **Step 6: Write `invoice/__init__.py` (empty) and `invoice/model.py`**

```python
"""Data structures for the invoice pipeline. No logic lives here."""
from dataclasses import dataclass, field
from datetime import date

MONTH_NUMBERS = {
    "JANUARY": 1, "FEBRUARY": 2, "MARCH": 3, "APRIL": 4,
    "MAY": 5, "JUNE": 6, "JULY": 7, "AUGUST": 8,
    "SEPTEMBER": 9, "OCTOBER": 10, "NOVEMBER": 11, "DECEMBER": 12,
}


@dataclass(frozen=True)
class Session:
    day: int
    hours: float          # float so a fractional duration can be *reported*, not silently coerced


@dataclass(frozen=True)
class Problem:
    severity: str         # "error" blocks the month; "warning" is printed and proceeds
    message: str
    month: str | None = None
    line_no: int | None = None
    text: str | None = None


@dataclass
class Month:
    name: str             # "FEBRUARY"
    number: int           # 2
    year: int
    sessions: list[Session] = field(default_factory=list)
    paid: bool = False
    stated_total: int | None = None    # rand, from "TOTAL: R1500"
    stated_hours: int | None = None    # from "(6x250)"
    stated_rate: int | None = None     # from "(6x250)"

    @property
    def parsed_hours(self) -> float:
        return sum(s.hours for s in self.sessions)


@dataclass
class ParsedNotes:
    year: int
    months: list[Month] = field(default_factory=list)
    problems: list[Problem] = field(default_factory=list)


@dataclass(frozen=True)
class LineItem:
    date_label: str       # "5 February 2026"
    description: str      # "Tutoring session"
    hours: float
    amount: int


@dataclass
class Invoice:
    number: str           # "INV-2026-04"
    issue_date: date
    provider: dict
    client: dict
    month: Month
    rate: int
    currency: str
    line_items: list[LineItem]
    total: int
```

- [x] **Step 7: Verify the skeleton**

Run: `.venv/Scripts/python.exe -m pytest`
Expected: exits 5 / "no tests ran" — collection succeeds with no import errors.

Run: `.venv/Scripts/python.exe -c "import invoice.model; print(invoice.model.MONTH_NUMBERS['APRIL'])"`
Expected: `4`

- [x] **Step 8: Commit and push**

The repo and the `origin` remote already exist from the planning session, so this is a
plain push — do **not** run `gh repo create` again.

```bash
git add .
git commit -m "chore: project skeleton, data model, and sample notes"
git push
```

Confirm with `gh repo view tutoring-invoice-generator --json visibility` → `PRIVATE`.

---

## Milestone 1 — Parser

**Deliverable:** `parse_notes(text) -> ParsedNotes` reads the real format and every tolerated variant, and records anything it cannot read as a `Problem` rather than skipping it. Independently testable; touches no files and prints nothing.

**Files:**
- Create: `invoice/parser.py`
- Test: `tests/test_parser.py`

**Interfaces:**
- Consumes: `Session`, `Month`, `Problem`, `ParsedNotes`, `MONTH_NUMBERS` from `invoice.model`
- Produces: `parse_notes(text: str, default_year: int | None = None) -> ParsedNotes`

**Grammar and tolerances:**

| Line | Example | Yields |
|---|---|---|
| Title | `TUTORING 2026` | year |
| Month heading | `FEBRUARY:` | starts a month block |
| Session | `1. 5th - 1hr` | day 5, 1.0 hours |
| Total | `TOTAL: R1500 (6x250)` | 6 hours, R250/hr, R1500 |
| Paid | `Paid.` | paid flag |

Tolerated: list numbering absent or `1.`/`1)`; hyphen, en dash or em dash; `hr`/`hrs`/`hour`/`hours`; ordinal suffix absent; arbitrary whitespace; any case; a trailing full stop; thousands separators in the total; a `TOTAL:` line with no `(NxR)` parenthetical.

**Not** tolerated: an unrecognised line inside a month block becomes an **error** `Problem` carrying its line number and original text. Silent tolerance here is exactly how a month gets under-billed.

- [x] **Step 1: Write the failing tests**

`tests/test_parser.py`:
```python
import pytest
from invoice.parser import parse_notes
from invoice.model import Session

SAMPLE = open("sample_notes.txt", encoding="utf-8").read()


def test_parses_the_real_sample():
    notes = parse_notes(SAMPLE)
    assert notes.year == 2026
    assert [m.name for m in notes.months] == ["FEBRUARY", "MARCH", "APRIL"]
    assert notes.problems == []


def test_february_sessions_and_checksum():
    feb = parse_notes(SAMPLE).months[0]
    assert feb.number == 2
    assert feb.sessions == [
        Session(5, 1.0), Session(11, 1.0), Session(18, 1.0),
        Session(22, 2.0), Session(25, 1.0),
    ]
    assert feb.parsed_hours == 6.0
    assert (feb.stated_total, feb.stated_hours, feb.stated_rate) == (1500, 6, 250)
    assert feb.paid is True


def test_april_is_unpaid():
    april = parse_notes(SAMPLE).months[2]
    assert april.paid is False
    assert april.parsed_hours == 4.0


@pytest.mark.parametrize("line,expected", [
    ("1. 5th - 1hr",   Session(5, 1.0)),
    ("5th - 1hr",      Session(5, 1.0)),     # no list numbering
    ("5 - 1hr",        Session(5, 1.0)),     # no ordinal suffix
    ("1) 5th – 1 hrs", Session(5, 1.0)),     # en dash, ")" numbering, "hrs"
    ("5th — 2 hours",  Session(5, 2.0)),     # em dash
    ("  5TH  -  1HR ", Session(5, 1.0)),     # case and whitespace
    ("5th - 1hr.",     Session(5, 1.0)),     # trailing full stop
])
def test_session_line_tolerances(line, expected):
    notes = parse_notes(f"APRIL:\n{line}\n", default_year=2026)
    assert notes.months[0].sessions == [expected]
    assert notes.problems == []


def test_garbage_line_inside_a_month_is_an_error_not_a_skip():
    notes = parse_notes("TUTORING 2026\n\nAPRIL:\n 1. 15th - 1hr\n 2. 22nd - banana\n")
    errors = [p for p in notes.problems if p.severity == "error"]
    assert len(errors) == 1
    assert errors[0].line_no == 5
    assert "banana" in errors[0].text
    assert errors[0].month == "APRIL"
    # the readable session is still captured
    assert notes.months[0].parsed_hours == 1.0


def test_total_without_parenthetical():
    notes = parse_notes("APRIL:\n 15th - 1hr\nTOTAL: R250\n", default_year=2026)
    month = notes.months[0]
    assert month.stated_total == 250
    assert month.stated_hours is None
    assert month.stated_rate is None


def test_no_title_line_falls_back_to_default_year():
    notes = parse_notes("APRIL:\n 15th - 1hr\n", default_year=2027)
    assert notes.year == 2027
    assert notes.months[0].year == 2027


def test_empty_file_yields_no_months_and_no_crash():
    notes = parse_notes("")
    assert notes.months == []
```

- [x] **Step 2: Run the tests to verify they fail**

Run: `.venv/Scripts/python.exe -m pytest tests/test_parser.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'invoice.parser'`

- [x] **Step 3: Implement `invoice/parser.py`**

```python
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
        \s*[-\u2013\u2014]\s*         # hyphen, en dash or em dash
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
```

- [x] **Step 4: Run the tests to verify they pass**

Run: `.venv/Scripts/python.exe -m pytest tests/test_parser.py -v`
Expected: all PASS

- [x] **Step 5: Commit**

```bash
git add invoice/parser.py tests/test_parser.py
git commit -m "feat: parse Notes tutoring text into structured months and sessions"
git push
```

---

## Milestone 2 — Reconciler

**Deliverable:** `check(month, config_rate) -> list[Problem]` uses the checksum already in the notes to prove the parser read the month correctly, or refuses it. Independently testable against hand-built `Month` objects — does not need the parser.

**Files:**
- Create: `invoice/reconcile.py`
- Test: `tests/test_reconcile.py`

**Interfaces:**
- Consumes: `Month`, `Problem` from `invoice.model`
- Produces: `check(month: Month, config_rate: int) -> list[Problem]`, `effective_rate(month: Month, config_rate: int) -> int`

**Rules:**

| Condition | Severity | Rationale |
|---|---|---|
| Any session's hours not a whole number | error | Whole hours only; never guess |
| `parsed_hours != stated_hours` | error | The parser misread a line |
| `parsed_hours × stated_rate != stated_total` | error | The arithmetic in the note disagrees |
| `stated_rate != config_rate` | warning | Covers a mid-year rate rise; note's rate wins so history stays correct |
| Same day appears twice | warning | Probably a duplicate entry, possibly two real sessions |
| No `TOTAL:` line at all | warning | Reconciliation impossible; month proceeds **unverified** and says so |

- [x] **Step 1: Write the failing tests**

`tests/test_reconcile.py`:
```python
from invoice.model import Month, Session
from invoice.reconcile import check, effective_rate


def month(sessions, total=None, hours=None, rate=None, name="APRIL", number=4):
    return Month(name=name, number=number, year=2026,
                 sessions=[Session(d, h) for d, h in sessions],
                 stated_total=total, stated_hours=hours, stated_rate=rate)


def errors(problems):
    return [p for p in problems if p.severity == "error"]


def warnings(problems):
    return [p for p in problems if p.severity == "warning"]


def test_february_reconciles_clean():
    feb = month([(5, 1), (11, 1), (18, 1), (22, 2), (25, 1)],
                total=1500, hours=6, rate=250, name="FEBRUARY", number=2)
    assert check(feb, 250) == []


def test_march_reconciles_clean():
    mar = month([(1, 2), (4, 1), (7, 2), (12, 1), (22, 1)],
                total=1750, hours=7, rate=250, name="MARCH", number=3)
    assert check(mar, 250) == []


def test_wrong_stated_total_is_caught():
    bad = month([(15, 1), (22, 1)], total=9999, hours=2, rate=250)
    assert len(errors(check(bad, 250))) == 1


def test_missing_session_line_is_caught_by_the_hour_count():
    # note claims 6 hours but only 5 were parsed - the exact under-billing case
    bad = month([(5, 1), (11, 1), (18, 1), (22, 1), (25, 1)],
                total=1500, hours=6, rate=250)
    assert len(errors(check(bad, 250))) >= 1


def test_fractional_hours_are_an_error():
    bad = month([(15, 1.5)], total=375, hours=1, rate=250)
    assert any("whole hour" in p.message.lower() for p in errors(check(bad, 250)))


def test_rate_mismatch_warns_but_does_not_block():
    m = month([(15, 1)], total=250, hours=1, rate=250)
    problems = check(m, config_rate=300)
    assert errors(problems) == []
    assert len(warnings(problems)) == 1
    assert effective_rate(m, config_rate=300) == 250   # the note's rate wins


def test_missing_total_proceeds_unverified():
    m = month([(15, 1), (22, 1)])
    problems = check(m, 250)
    assert errors(problems) == []
    assert any("unverified" in p.message.lower() for p in warnings(problems))
    assert effective_rate(m, config_rate=250) == 250   # falls back to config


def test_duplicate_day_warns():
    m = month([(15, 1), (15, 1)], total=500, hours=2, rate=250)
    problems = check(m, 250)
    assert errors(problems) == []
    assert any("15" in p.message for p in warnings(problems))
```

- [x] **Step 2: Run the tests to verify they fail**

Run: `.venv/Scripts/python.exe -m pytest tests/test_reconcile.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'invoice.reconcile'`

- [x] **Step 3: Implement `invoice/reconcile.py`**

```python
"""Verify a parsed month against the checksum the notes already carry."""
from collections import Counter

from invoice.model import Month, Problem


def effective_rate(month: Month, config_rate: int) -> int:
    """The note's own rate wins, so historical invoices stay correct after a rate rise."""
    return month.stated_rate if month.stated_rate is not None else config_rate


def check(month: Month, config_rate: int) -> list[Problem]:
    problems: list[Problem] = []

    for session in month.sessions:
        if session.hours != int(session.hours):
            problems.append(Problem(
                severity="error", month=month.name,
                message=f"Day {session.day}: {session.hours} is not a whole hour",
            ))

    hours = month.parsed_hours

    if month.stated_hours is not None and hours != month.stated_hours:
        problems.append(Problem(
            severity="error", month=month.name,
            message=(f"Hour count disagrees: sessions add up to {hours:g}, "
                     f"but the note states {month.stated_hours}"),
        ))

    if month.stated_total is not None and month.stated_rate is not None:
        computed = hours * month.stated_rate
        if computed != month.stated_total:
            problems.append(Problem(
                severity="error", month=month.name,
                message=(f"Total disagrees: {hours:g}h x R{month.stated_rate} = R{computed:g}, "
                         f"but the note states R{month.stated_total}"),
            ))

    if month.stated_rate is not None and month.stated_rate != config_rate:
        problems.append(Problem(
            severity="warning", month=month.name,
            message=(f"Note rate R{month.stated_rate} differs from config rate "
                     f"R{config_rate}; using the note's rate for this month"),
        ))

    for day, count in sorted(Counter(s.day for s in month.sessions).items()):
        if count > 1:
            problems.append(Problem(
                severity="warning", month=month.name,
                message=f"Day {day} appears {count} times - check for a duplicate entry",
            ))

    if month.stated_total is None:
        problems.append(Problem(
            severity="warning", month=month.name,
            message="No TOTAL line - this month is UNVERIFIED against a checksum",
        ))

    return problems
```

- [x] **Step 4: Run the tests to verify they pass**

Run: `.venv/Scripts/python.exe -m pytest tests/test_reconcile.py -v`
Expected: all PASS

- [x] **Step 5: Commit**

```bash
git add invoice/reconcile.py tests/test_reconcile.py
git commit -m "feat: reconcile parsed months against the note's own checksum"
git push
```

---

## Milestone 3 — PDF renderer

**Deliverable:** `render_pdf(invoice, out_path)` writes a professional single-page invoice. Testable against a hand-built `Invoice`; needs neither parser nor reconciler.

reportlab is chosen over `weasyprint` (needs GTK system libraries on Windows) and headless-Chrome printing (depends on browser paths and flags that shift between versions). Verified pure-Python universal wheel.

**Files:**
- Create: `invoice/render.py`
- Test: `tests/test_render.py`

**Interfaces:**
- Consumes: `Invoice`, `LineItem` from `invoice.model`
- Produces: `render_pdf(invoice: Invoice, out_path: str | Path) -> Path`

All styling constants sit at the top of this one module so appearance is adjustable without reading logic.

- [x] **Step 1: Write the failing test**

`tests/test_render.py`:
```python
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
```

- [x] **Step 2: Run the test to verify it fails**

Run: `.venv/Scripts/python.exe -m pytest tests/test_render.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'invoice.render'`

- [x] **Step 3: Implement `invoice/render.py`**

```python
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
```

- [x] **Step 4: Run the test to verify it passes**

Run: `.venv/Scripts/python.exe -m pytest tests/test_render.py -v`
Expected: both PASS

- [x] **Step 5: Eyeball the output once**

```bash
.venv/Scripts/python.exe -c "import tests.test_render as t; from invoice.render import render_pdf; render_pdf(t.build_invoice(), 'invoices/_preview.pdf')"
start invoices\_preview.pdf
```
Confirm the layout reads as a professional document, then delete `invoices/_preview.pdf`. Adjust the constants at the top of `render.py` if anything looks off.

- [x] **Step 6: Commit**

```bash
git add invoice/render.py tests/test_render.py
git commit -m "feat: render an invoice to PDF with reportlab"
git push
```

---

## Milestone 4 — CLI, batch launcher, README

**Deliverable:** The whole thing works end-to-end from a dragged file. Depends on M1, M2 and M3.

**Files:**
- Create: `invoice/cli.py`, `Generate Invoice.bat`, `README.md`

**Interfaces:**
- Consumes: `parse_notes`, `check`, `effective_rate`, `render_pdf`, all model types
- Produces: `main(argv: list[str] | None = None) -> int` — the process exit code

**Behaviour:**
- No file argument → look for `notes.txt` beside the project root.
- Default → generate for every month **not** marked `Paid.`, printing a line for each month skipped and why.
- `--month APRIL` → just that month. `--all` → regenerate everything, paid included.
- Before writing anything, print the parsed table per month so it can be eyeballed against Notes.
- Output `invoices/INV-2026-04_April.pdf`. Never overwrite without `--force`.
- Exit code 1 if any month had an error; 0 otherwise.

- [ ] **Step 1: Implement `invoice/cli.py`**

```python
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
```

- [ ] **Step 2: Write `Generate Invoice.bat`**

```bat
@echo off
setlocal
cd /d "%~dp0"
set "PY=%~dp0.venv\Scripts\python.exe"
if not exist "%PY%" set "PY=py"
"%PY%" -m invoice.cli %*
echo.
pause
```

`cd /d "%~dp0"` makes the project root the working directory so `python -m invoice.cli` resolves the package; every path is quoted because the install path contains spaces. `pause` keeps the window open so the summary and any errors stay readable.

- [ ] **Step 3: Run end-to-end against the sample**

```bash
cp config.example.json config.json
.venv/Scripts/python.exe -m invoice.cli sample_notes.txt
```
Expected: February and March both reconcile clean and report `skipped: marked Paid.`; April generates `invoices/INV-2026-04_April.pdf` at R1000; exit code 0.

- [ ] **Step 4: Verify the refusal path**

```bash
sed 's/22nd - 2hr/22nd - banana/' sample_notes.txt > broken_notes.txt
.venv/Scripts/python.exe -m invoice.cli broken_notes.txt --all; echo "exit=$?"
rm broken_notes.txt
```
Expected: February is REFUSED with **two** errors — the parser's "Unrecognised line inside a month block" naming line 8 and `'22nd - banana'`, and the reconciler's "Hour count disagrees: sessions add up to 4, but the note states 6". No February PDF is produced and `exit=1`. March and April still process normally. This is the double-net working: even if the grammar had silently swallowed that line, the checksum would still have caught the missing two hours.

- [ ] **Step 5: Verify the rate-change path**

Temporarily set `"hourly_rate": 300` in `config.json` and re-run with `--all --force`.
Expected: **all three** months print a rate-mismatch warning and still bill at R250. Every month in the sample carries its own `(NxR)` rate, and `effective_rate` lets the note's rate win — so a config change cannot retroactively alter a month whose rate is already on record. A new month written without a `TOTAL:` line would pick up R300. Confirm April's PDF still totals R1000, then restore `"hourly_rate": 250`.

- [ ] **Step 6: Write `README.md`**

Cover: what it does; one-time setup (`python -m venv .venv`, `pip install -r requirements.txt`, copy `config.example.json` → `config.json` and fill it in); daily use (save the Notes text as `notes.txt`, drag onto `Generate Invoice.bat`); the accepted notes format with the tolerance table from M1; what the reconciler checks and why a month gets refused; the flags (`--month`, `--all`, `--force`); and a note that `config.json`, `notes.txt` and `invoices/` are gitignored deliberately.

- [ ] **Step 7: Commit**

```bash
git add invoice/cli.py "Generate Invoice.bat" README.md
git commit -m "feat: CLI, drag-and-drop launcher, and README"
git push
```

---

## Milestone 5 — Real-data cutover

**Deliverable:** A real invoice, from the real notes, through the real drag-and-drop path.

This milestone needs information the plan deliberately does not contain. **Ask Matthew for these at execution time and write them straight into `config.json` — which is gitignored, so they never reach GitHub:**
- Full name as it should appear on the invoice
- Contact email and phone
- The family's name for the "Bill To" block, and address if wanted

- [ ] **Step 1: Fill in `config.json`** with the real values (rate stays 250).

- [ ] **Step 2: Save the real Notes text** as `notes.txt` in the project root.

- [ ] **Step 3: Run the full suite** — `.venv/Scripts/python.exe -m pytest` — expect all green.

- [ ] **Step 4: Drag `notes.txt` onto `Generate Invoice.bat`.**
Expected: a console summary listing every month, paid ones skipped, unpaid ones generated, window held open by `pause`.

- [ ] **Step 5: Open the generated PDF and confirm** the real name and contact details, the invoice number (`INV-2026-<MM>`), today's issue date, the Bill To block, one dated line per session, R250/hr, and a total that matches the `TOTAL:` line in the original note.

- [ ] **Step 6: Confirm nothing personal is staged**

```bash
git status --short
git check-ignore -v config.json notes.txt invoices/
```
Expected: `config.json`, `notes.txt` and `invoices/` all report as ignored, and `git status` shows none of them.

- [ ] **Step 7: Final commit and push**

```bash
git add -A
git commit -m "docs: verified end-to-end against real notes"
git push
```

---

## Verification Summary

| # | Check | Expected |
|---|---|---|
| 1 | `pytest` | all green |
| 2 | `python -m invoice.cli sample_notes.txt` | Feb/Mar reconciled + skipped as paid; `invoices/INV-2026-04_April.pdf` written; exit 0 |
| 3 | Open that PDF | name, `INV-2026-04`, issue date, Bill To, four 1hr lines, R250/hr, total R1000 |
| 4 | Corrupt `22nd - 2hr` → `22nd - banana`, re-run | Feb refused with both a parser error (line named) and a checksum error, exit non-zero, nothing incorrect produced |
| 5 | `hourly_rate: 300`, re-run `--all --force` | all three months warn about the mismatch and hold their recorded R250; April still totals R1000 |
| 6 | Drag real `notes.txt` onto the `.bat` | same behaviour through the drag-and-drop path |
| 7 | `git check-ignore -v config.json notes.txt invoices/` | all three ignored |
| 8 | `gh repo view tutoring-invoice-generator --json visibility` | `PRIVATE` |

## Notes for the executor

- **Never soften the refusal path.** If reconciliation fails, the month produces nothing. The temptation to "just generate it anyway with a warning" defeats the entire design — an invoice for less than is owed, sent to a neighbour, is not a recoverable error.
- **Do not add tolerance to the parser to make a failing case pass.** If a real note line fails to parse, that is a signal to widen the grammar *deliberately and with a test*, not to catch the exception.
- **Keep `parse_notes` and `check` free of I/O.** Every bit of console output belongs in `cli.py`. This is what lets the fragile logic be tested exhaustively without files or PDFs.
