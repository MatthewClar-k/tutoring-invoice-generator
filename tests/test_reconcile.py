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
