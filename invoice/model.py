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
