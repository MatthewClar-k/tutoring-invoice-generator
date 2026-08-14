# Tutoring Invoice Generator

Turns a tutoring log kept in iPhone Notes into a professional PDF invoice, without
changing how sessions are recorded. Save the month's note as a `.txt` file, drag it
onto `Generate Invoice.bat`, get a PDF.

## What it does

Sessions are logged in Notes as a date and a duration, grouped by month, with a
`TOTAL:` line stating the hours, rate, and amount. This tool reads that text,
**checks the total against the sessions it parsed** (the note already carries its
own checksum), and only then renders an invoice. If anything doesn't add up, the
month is refused rather than billed incorrectly — see [Reconciliation](#reconciliation-and-refusal)
below.

## One-time setup

```bash
python -m venv .venv
.venv/Scripts/python.exe -m pip install -r requirements.txt
```

Then copy the config template and fill in your real details:

```bash
cp config.example.json config.json
```

Edit `config.json`:

```json
{
  "provider": { "name": "Your Name", "email": "you@example.com", "phone": "+27 00 000 0000" },
  "client":   { "name": "Client Name", "address": "" },
  "hourly_rate": 250,
  "currency": "R",
  "invoice_prefix": "INV"
}
```

`config.json` is gitignored — it holds real names and contact details and never
reaches GitHub.

## Daily use

1. In Notes, select the month you want to invoice and save/export it as plain text.
2. Save that text as `notes.txt` in this folder (or any `.txt` file).
3. Drag the `.txt` file onto `Generate Invoice.bat` — or double-click the `.bat`
   if the file is already named `notes.txt`.
4. A console window shows every month it read, which ones it skipped or refused
   and why, and where each PDF was written. Press any key to close it.

PDFs land in `invoices/`, named `INV-<year>-<month>_<MonthName>.pdf`. That folder
and `notes.txt` are both gitignored.

## Accepted notes format

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
```

| Line | Example | Meaning |
|---|---|---|
| Title | `TUTORING 2026` | sets the year |
| Month heading | `FEBRUARY:` | starts a new month block |
| Session | `1. 5th - 1hr` | a day and a duration |
| Total | `TOTAL: R1500 (6x250)` | stated hours, rate, and amount |
| Paid | `Paid.` | marks the month as already paid |

The parser tolerates minor variation so you don't have to change how you write
notes: list numbering can be absent or use `1.`/`1)`; the dash can be a hyphen,
en dash, or em dash; the unit can be `hr`/`hrs`/`hour`/`hours`; the ordinal
suffix (`th`/`nd`/`rd`/`st`) is optional; case and extra whitespace don't
matter; a trailing full stop is fine; the total can use thousands separators
or omit the `(NxR)` part entirely.

What it will **not** tolerate: any other line inside a month block. An
unreadable session line becomes an error naming its line number rather than
being silently skipped — silently ignoring a line is exactly how a month
would get under-billed.

## Reconciliation and refusal

Every note already states its own answer (`TOTAL: R1500 (6x250)`). Before
generating a PDF, the tool recomputes that total from the sessions it parsed
and compares:

- A session with a fractional duration, a parsed hour count that disagrees
  with the stated hours, or a computed total that disagrees with the stated
  total, is an **error** — the month is refused, no PDF is written, and the
  process exits non-zero. Other months in the same file still process normally.
- A note's stated rate differing from `config.json`'s rate is a **warning**,
  not an error: the note's own rate wins, so a mid-year rate change can't
  retroactively alter a month whose rate is already on record.
- A day appearing twice, or a month with no `TOTAL:` line at all, is a
  **warning**; the month proceeds (a missing total is explicitly marked
  UNVERIFIED in the output).

This double-net design means even if a line were somehow misread, the
checksum comparison would still catch the resulting mismatch — the program
is built to never silently produce an invoice for less than is owed.

## Flags

```
Generate Invoice.bat [notes.txt] [--month APRIL] [--all] [--force]
```

- No file argument: looks for `notes.txt` in this folder.
- `--month APRIL`: only process that month (regardless of paid status).
- `--all`: also regenerate months already marked `Paid.` (default: skipped).
- `--force`: overwrite a PDF that already exists (default: left alone).

## Gitignored by design

`config.json`, `notes.txt`, and `invoices/` are all excluded from version
control. The repository is private, but a family's name and contact details
still don't belong in git history — history is much harder to redact than a
file.
