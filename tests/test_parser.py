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
