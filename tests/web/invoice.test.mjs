import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  MONTH_NUMBERS, MONTH_TITLES, parseNotes, parsedHours, effectiveRate,
  check, monthProblems, buildInvoice, invoiceFileName,
} from "../../web/invoice.js";

const SAMPLE = readFileSync(fileURLToPath(new URL("../../sample_notes.txt", import.meta.url)), "utf-8");
const S = (day, hours) => ({ day, hours });

// ---- parser ----
test("parses the real sample", () => {
  const notes = parseNotes(SAMPLE);
  assert.equal(notes.year, 2026);
  assert.deepEqual(notes.months.map((m) => m.name), ["FEBRUARY", "MARCH", "APRIL"]);
  assert.deepEqual(notes.problems, []);
});

test("parity: sample months, hours, totals", () => {
  const [feb, mar, apr] = parseNotes(SAMPLE).months;
  assert.deepEqual([feb.number, parsedHours(feb), feb.statedTotal, feb.statedHours, feb.statedRate, feb.paid],
    [2, 6, 1500, 6, 250, true]);
  assert.deepEqual([mar.number, parsedHours(mar), mar.statedTotal, mar.statedHours, mar.statedRate, mar.paid],
    [3, 7, 1750, 7, 250, true]);
  assert.deepEqual([apr.number, parsedHours(apr), apr.statedTotal, apr.statedHours, apr.statedRate, apr.paid],
    [4, 4, 1000, 4, 250, false]);
  for (const m of [feb, mar, apr]) assert.equal(m.year, 2026);
});

test("february sessions and checksum", () => {
  const feb = parseNotes(SAMPLE).months[0];
  assert.deepEqual(feb.sessions, [S(5, 1), S(11, 1), S(18, 1), S(22, 2), S(25, 1)]);
  assert.equal(parsedHours(feb), 6);
  assert.equal(feb.paid, true);
});

test("april is unpaid", () => {
  const april = parseNotes(SAMPLE).months[2];
  assert.equal(april.paid, false);
  assert.equal(parsedHours(april), 4);
});

for (const [line, expected] of [
  ["1. 5th - 1hr", S(5, 1)],
  ["5th - 1hr", S(5, 1)],
  ["5 - 1hr", S(5, 1)],
  ["1) 5th – 1 hrs", S(5, 1)],
  ["5th — 2 hours", S(5, 2)],
  ["  5TH  -  1HR ", S(5, 1)],
  ["5th - 1hr.", S(5, 1)],
  ["5th - 1,5hr", S(5, 1.5)],
]) {
  test(`session line tolerance: ${JSON.stringify(line)}`, () => {
    const notes = parseNotes(`APRIL:\n${line}\n`, 2026);
    assert.deepEqual(notes.months[0].sessions, [expected]);
    assert.deepEqual(notes.problems, []);
  });
}

test("garbage line inside a month is an error, not a skip", () => {
  const notes = parseNotes("TUTORING 2026\n\nAPRIL:\n 1. 15th - 1hr\n 2. 22nd - banana\n");
  const errors = notes.problems.filter((p) => p.severity === "error");
  assert.equal(errors.length, 1);
  assert.equal(errors[0].lineNo, 5);
  assert.ok(errors[0].text.includes("banana"));
  assert.equal(errors[0].month, "APRIL");
  assert.equal(errors[0].message, "Unrecognised line inside a month block");
  assert.equal(parsedHours(notes.months[0]), 1);
});

test("total without parenthetical", () => {
  const m = parseNotes("APRIL:\n 15th - 1hr\nTOTAL: R250\n", 2026).months[0];
  assert.equal(m.statedTotal, 250);
  assert.equal(m.statedHours, null);
  assert.equal(m.statedRate, null);
});

test("thousands separators in totals", () => {
  const m = parseNotes("APRIL:\nTOTAL: R1,500 (6x250)\n", 2026).months[0];
  assert.equal(m.statedTotal, 1500);
  const m2 = parseNotes("APRIL:\nTOTAL R1 500 (6 x R250)\n", 2026).months[0];
  assert.deepEqual([m2.statedTotal, m2.statedHours, m2.statedRate], [1500, 6, 250]);
});

test("no title line falls back to default year", () => {
  const notes = parseNotes("APRIL:\n 15th - 1hr\n", 2027);
  assert.equal(notes.year, 2027);
  assert.equal(notes.months[0].year, 2027);
});

test("late title re-applies year to earlier months", () => {
  const notes = parseNotes("APRIL:\n 15th - 1hr\nTUTORING 2025\n", 2027);
  assert.equal(notes.year, 2025);
  assert.equal(notes.months[0].year, 2025);
});

test("line outside any month is a warning", () => {
  const notes = parseNotes("hello\nAPRIL\n");
  assert.deepEqual(notes.problems, [
    { severity: "warning", message: "Line outside any month block, ignored", month: null, lineNo: 1, text: "hello" },
  ]);
  assert.equal(notes.months[0].name, "APRIL");
});

test("empty file yields no months and no crash", () => {
  assert.deepEqual(parseNotes("").months, []);
});

test("default year falls back to current year", () => {
  assert.equal(parseNotes("").year, new Date().getFullYear());
});

test("month tables", () => {
  assert.equal(MONTH_NUMBERS.APRIL, 4);
  assert.equal(MONTH_TITLES[4], "April");
  assert.equal(MONTH_TITLES[12], "December");
});

// ---- reconcile ----
const month = (sessions, { total = null, hours = null, rate = null, name = "APRIL", number = 4 } = {}) => ({
  name, number, year: 2026, paid: false,
  sessions: sessions.map(([day, h]) => S(day, h)),
  statedTotal: total, statedHours: hours, statedRate: rate,
});
const errors = (ps) => ps.filter((p) => p.severity === "error");
const warnings = (ps) => ps.filter((p) => p.severity === "warning");

test("february reconciles clean", () => {
  const feb = month([[5, 1], [11, 1], [18, 1], [22, 2], [25, 1]],
    { total: 1500, hours: 6, rate: 250, name: "FEBRUARY", number: 2 });
  assert.deepEqual(check(feb, 250), []);
});

test("march reconciles clean", () => {
  const mar = month([[1, 2], [4, 1], [7, 2], [12, 1], [22, 1]],
    { total: 1750, hours: 7, rate: 250, name: "MARCH", number: 3 });
  assert.deepEqual(check(mar, 250), []);
});

test("wrong stated total is caught", () => {
  const bad = month([[15, 1], [22, 1]], { total: 9999, hours: 2, rate: 250 });
  const errs = errors(check(bad, 250));
  assert.equal(errs.length, 1);
  assert.equal(errs[0].message, "Total disagrees: 2h x R250 = R500, but the note states R9999");
});

test("missing session line is caught by the hour count", () => {
  const bad = month([[5, 1], [11, 1], [18, 1], [22, 1], [25, 1]], { total: 1500, hours: 6, rate: 250 });
  const errs = errors(check(bad, 250));
  assert.ok(errs.length >= 1);
  assert.equal(errs[0].message, "Hour count disagrees: sessions add up to 5, but the note states 6");
});

test("fractional hours are an error", () => {
  const bad = month([[15, 1.5]], { total: 375, hours: 1, rate: 250 });
  const errs = errors(check(bad, 250));
  assert.ok(errs.some((p) => p.message === "Day 15: 1.5 is not a whole hour"));
});

test("rate mismatch warns but does not block", () => {
  const m = month([[15, 1]], { total: 250, hours: 1, rate: 250 });
  const ps = check(m, 300);
  assert.deepEqual(errors(ps), []);
  assert.equal(warnings(ps).length, 1);
  assert.equal(warnings(ps)[0].message,
    "Note rate R250 differs from config rate R300; using the note's rate for this month");
  assert.equal(effectiveRate(m, 300), 250);
});

test("missing total proceeds unverified", () => {
  const m = month([[15, 1], [22, 1]]);
  const ps = check(m, 250);
  assert.deepEqual(errors(ps), []);
  assert.ok(warnings(ps).some((p) => p.message.toLowerCase().includes("unverified")));
  assert.equal(effectiveRate(m, 250), 250);
});

test("duplicate day warns", () => {
  const m = month([[15, 1], [15, 1]], { total: 500, hours: 2, rate: 250 });
  const ps = check(m, 250);
  assert.deepEqual(errors(ps), []);
  assert.ok(warnings(ps).some((p) => p.message === "Day 15 appears 2 times - check for a duplicate entry"));
});

test("monthProblems combines parse problems and check", () => {
  const notes = parseNotes("APRIL:\n 15th - 1hr\n nonsense\n", 2026);
  const ps = monthProblems(notes, notes.months[0], 250);
  assert.equal(ps[0].severity, "error");
  assert.equal(ps[0].lineNo, 3);
  assert.ok(ps.some((p) => p.message.includes("UNVERIFIED")));
});

// ---- invoice ----
const CONFIG = {
  provider: { name: "Me", email: "me@example.com", phone: "1" },
  client: { name: "Client", address: "" },
  hourly_rate: 250, currency: "R", invoice_prefix: "INV",
};

test("buildInvoice for sample April", () => {
  const apr = parseNotes(SAMPLE).months[2];
  const date = new Date(2026, 4, 1);
  const inv = buildInvoice(apr, CONFIG, date);
  assert.equal(inv.number, "INV-2026-04");
  assert.equal(inv.issueDate, date);
  assert.equal(inv.rate, 250);
  assert.equal(inv.currency, "R");
  assert.equal(inv.total, 1000);
  assert.equal(inv.provider, CONFIG.provider);
  assert.equal(inv.client, CONFIG.client);
  assert.deepEqual(inv.lineItems[0],
    { dateLabel: "15 April 2026", description: "Tutoring session", hours: 1, amount: 250 });
  assert.equal(inv.lineItems.length, 4);
  assert.equal(invoiceFileName(inv), "INV-2026-04_April.pdf");
});

test("buildInvoice sorts by day, uses note rate, defaults currency and prefix", () => {
  const m = month([[22, 1], [5, 2]], { total: 600, hours: 3, rate: 200 });
  const { currency: _c, invoice_prefix: _p, ...bare } = CONFIG;
  const inv = buildInvoice(m, bare, new Date());
  assert.deepEqual(inv.lineItems.map((i) => i.dateLabel), ["5 April 2026", "22 April 2026"]);
  assert.equal(inv.rate, 200);
  assert.equal(inv.total, 600);
  assert.equal(inv.currency, "R");
  assert.equal(inv.number, "INV-2026-04");
});

test("buildInvoice honours custom prefix and truncates fractional amounts", () => {
  const m = month([[3, 1.5]], { name: "FEBRUARY", number: 2 });
  const inv = buildInvoice(m, { ...CONFIG, invoice_prefix: "TUT", currency: "$", hourly_rate: 251 }, new Date());
  assert.equal(inv.number, "TUT-2026-02");
  assert.equal(inv.lineItems[0].amount, 376);
  assert.equal(invoiceFileName(inv), "TUT-2026-02_February.pdf");
});
