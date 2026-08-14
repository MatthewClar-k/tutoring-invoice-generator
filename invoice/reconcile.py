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
