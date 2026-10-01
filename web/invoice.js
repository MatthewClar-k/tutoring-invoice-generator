// Dependency-free port of invoice/parser.py, invoice/reconcile.py and build_invoice (invoice/cli.py).
// Pure: no DOM, no I/O.

export const MONTH_NUMBERS = {
  JANUARY: 1, FEBRUARY: 2, MARCH: 3, APRIL: 4,
  MAY: 5, JUNE: 6, JULY: 7, AUGUST: 8,
  SEPTEMBER: 9, OCTOBER: 10, NOVEMBER: 11, DECEMBER: 12,
};

export const MONTH_TITLES = Object.fromEntries(
  Object.entries(MONTH_NUMBERS).map(([name, n]) => [n, name[0] + name.slice(1).toLowerCase()]),
);

const TITLE_RE = /^\s*TUTORING\s+(\d{4})\s*$/i;
const MONTH_RE = new RegExp(`^\\s*(${Object.keys(MONTH_NUMBERS).join("|")})\\s*:?\\s*$`, "i");
const PAID_RE = /^\s*paid\b\.?\s*$/i;
const SESSION_RE =
  /^\s*(?:\d{1,2}\s*[.)]\s*)?(\d{1,2})(?:st|nd|rd|th)?\s*[-–—]\s*(\d+(?:[.,]\d+)?)\s*(?:hrs?|hours?)\s*\.?\s*$/i;
const TOTAL_RE =
  /^\s*TOTAL\s*:?\s*R\s*([\d,\s]+?)(?:\s*\(\s*(\d+)\s*x\s*R?\s*([\d,\s]+?)\s*\))?\s*$/i;

// Python str.splitlines separators
const LINE_SPLIT = new RegExp("\r\n|[\n\r\v\f\x1c-\x1e\x85\u2028\u2029]");

const number = (raw) => parseInt(raw.replace(/[,\s]/g, ""), 10);

// Python's format(x, "g") for the values that occur here: 6 significant digits, no trailing zeros.
const g = (x) => String(Number(Number(x).toPrecision(6)));

export function parseNotes(text, defaultYear) {
  let year = defaultYear || new Date().getFullYear();
  const months = [];
  const problems = [];
  let current = null;

  const lines = text.split(LINE_SPLIT);
  for (let i = 0; i < lines.length; i++) {
    const lineNo = i + 1;
    const line = lines[i].trimEnd();
    if (!line.trim()) continue;
    let m;

    if ((m = TITLE_RE.exec(line))) {
      year = parseInt(m[1], 10);
      for (const month of months) month.year = year; // a late title still applies to what came before
      continue;
    }

    if ((m = MONTH_RE.exec(line))) {
      const name = m[1].toUpperCase();
      current = {
        name, number: MONTH_NUMBERS[name], year,
        sessions: [], paid: false, statedTotal: null, statedHours: null, statedRate: null,
      };
      months.push(current);
      continue;
    }

    if (current === null) {
      problems.push({
        severity: "warning", message: "Line outside any month block, ignored",
        month: null, lineNo, text: line,
      });
      continue;
    }

    if ((m = SESSION_RE.exec(line))) {
      current.sessions.push({ day: parseInt(m[1], 10), hours: parseFloat(m[2].replace(",", ".")) });
      continue;
    }

    if ((m = TOTAL_RE.exec(line))) {
      current.statedTotal = number(m[1]);
      if (m[2] !== undefined) {
        current.statedHours = parseInt(m[2], 10);
        current.statedRate = number(m[3]);
      }
      continue;
    }

    if (PAID_RE.test(line)) {
      current.paid = true;
      continue;
    }

    problems.push({
      severity: "error", message: "Unrecognised line inside a month block",
      month: current.name, lineNo, text: line,
    });
  }

  return { year, months, problems };
}

export function parsedHours(month) {
  return month.sessions.reduce((sum, s) => sum + s.hours, 0);
}

export function effectiveRate(month, configRate) {
  return month.statedRate !== null && month.statedRate !== undefined ? month.statedRate : configRate;
}

const problem = (severity, month, message) => ({
  severity, message, month: month.name, lineNo: null, text: null,
});

export function check(month, configRate) {
  const problems = [];

  for (const s of month.sessions) {
    if (s.hours !== Math.trunc(s.hours)) {
      problems.push(problem("error", month, `Day ${s.day}: ${g(s.hours)} is not a whole hour`));
    }
  }

  const hours = parsedHours(month);

  if (month.statedHours !== null && hours !== month.statedHours) {
    problems.push(problem("error", month,
      `Hour count disagrees: sessions add up to ${g(hours)}, but the note states ${month.statedHours}`));
  }

  if (month.statedTotal !== null && month.statedRate !== null) {
    const computed = hours * month.statedRate;
    if (computed !== month.statedTotal) {
      problems.push(problem("error", month,
        `Total disagrees: ${g(hours)}h x R${month.statedRate} = R${g(computed)}, ` +
        `but the note states R${month.statedTotal}`));
    }
  }

  if (month.statedRate !== null && month.statedRate !== configRate) {
    problems.push(problem("warning", month,
      `Note rate R${month.statedRate} differs from config rate R${configRate}; ` +
      `using the note's rate for this month`));
  }

  const counts = new Map();
  for (const s of month.sessions) counts.set(s.day, (counts.get(s.day) || 0) + 1);
  for (const [day, count] of [...counts].sort((a, b) => a[0] - b[0])) {
    if (count > 1) {
      problems.push(problem("warning", month, `Day ${day} appears ${count} times - check for a duplicate entry`));
    }
  }

  if (month.statedTotal === null) {
    problems.push(problem("warning", month, "No TOTAL line - this month is UNVERIFIED against a checksum"));
  }

  return problems;
}

export function monthProblems(notes, month, configRate) {
  return notes.problems.filter((p) => p.month === month.name).concat(check(month, configRate));
}

export function buildInvoice(month, config, issueDate) {
  const rate = effectiveRate(month, config.hourly_rate);
  const currency = config.currency ?? "R";
  const prefix = config.invoice_prefix ?? "INV";
  const lineItems = [...month.sessions]
    .sort((a, b) => a.day - b.day)
    .map((s) => ({
      dateLabel: `${s.day} ${MONTH_TITLES[month.number]} ${month.year}`,
      description: "Tutoring session",
      hours: s.hours,
      amount: Math.trunc(s.hours * rate),
    }));
  return {
    number: `${prefix}-${month.year}-${String(month.number).padStart(2, "0")}`,
    issueDate,
    provider: config.provider,
    client: config.client,
    month,
    rate,
    currency,
    lineItems,
    total: lineItems.reduce((sum, i) => sum + i.amount, 0),
  };
}

export function invoiceFileName(invoice) {
  return `${invoice.number}_${MONTH_TITLES[invoice.month.number]}.pdf`;
}
