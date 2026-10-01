import {
  MONTH_TITLES, parseNotes, parsedHours, effectiveRate, monthProblems,
  buildInvoice, invoiceFileName,
} from "./invoice.js";
import { renderPdf } from "./render.js";

const CONFIG_KEY = "tutoring-invoices.config";
const NOTES_KEY = "tutoring-invoices.notes";

const $ = (id) => document.getElementById(id);
const settings = $("settings");
const form = $("settings-form");
const notesEl = $("notes");
const msgEl = $("msg");
const resultsEl = $("results");

function store(key, value) {
  try { localStorage.setItem(key, value); } catch { /* storage unavailable */ }
}
function load(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

// ---- settings -------------------------------------------------------------
function readConfig() {
  const f = form.elements;
  return {
    provider: {
      name: f.provider_name.value.trim(),
      email: f.provider_email.value.trim(),
      phone: f.provider_phone.value.trim(),
    },
    client: { name: f.client_name.value.trim(), address: f.client_address.value.trim() },
    hourly_rate: Number(f.hourly_rate.value),
    currency: f.currency.value.trim() || "R",
    invoice_prefix: f.invoice_prefix.value.trim() || "INV",
  };
}

function isConfigured(c) {
  return Boolean(c.provider.name && c.client.name && c.hourly_rate > 0);
}

function applyConfig(c) {
  const f = form.elements;
  f.provider_name.value = c.provider?.name ?? "";
  f.provider_email.value = c.provider?.email ?? "";
  f.provider_phone.value = c.provider?.phone ?? "";
  f.client_name.value = c.client?.name ?? "";
  f.client_address.value = c.client?.address ?? "";
  f.hourly_rate.value = c.hourly_rate ?? "";
  f.currency.value = c.currency ?? "R";
  f.invoice_prefix.value = c.invoice_prefix ?? "INV";
}

function updateHint() {
  $("settings-hint").textContent = isConfigured(readConfig()) ? "" : "(fill in first)";
}

function initSettings() {
  const saved = load(CONFIG_KEY);
  if (saved) {
    try { applyConfig(JSON.parse(saved)); } catch { /* ignore corrupt data */ }
  }
  settings.open = !isConfigured(readConfig());
  updateHint();
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  store(CONFIG_KEY, JSON.stringify(readConfig()));
  updateHint();
  settings.open = false;
  say("Settings saved.");
  analyse();
});

// ---- notes ----------------------------------------------------------------
function say(text) { msgEl.textContent = text; }

let timer;
notesEl.addEventListener("input", () => {
  store(NOTES_KEY, notesEl.value);
  clearTimeout(timer);
  timer = setTimeout(analyse, 250);
});

$("paste").addEventListener("click", async () => {
  try {
    const text = await navigator.clipboard.readText();
    if (!text.trim()) { say("The clipboard is empty."); return; }
    notesEl.value = text;
    store(NOTES_KEY, text);
    say("");
    analyse();
  } catch {
    say("Could not read the clipboard. Long-press in the box above and choose Paste.");
    notesEl.focus();
  }
});

$("file").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  notesEl.value = await file.text();
  store(NOTES_KEY, notesEl.value);
  e.target.value = "";
  say(`Loaded ${file.name}.`);
  analyse();
});

$("clear").addEventListener("click", () => {
  notesEl.value = "";
  store(NOTES_KEY, "");
  say("");
  analyse();
});

// ---- results --------------------------------------------------------------
function el(tag, props = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "class") n.className = v;
    else if (k === "text") n.textContent = v;
    else n.setAttribute(k, v);
  }
  n.append(...kids);
  return n;
}

function money(c, n) {
  return `${c}${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function msgList(problems) {
  const ul = el("ul", { class: "msgs" });
  for (const p of problems) {
    const where = p.lineNo ? `Line ${p.lineNo}: ` : "";
    ul.append(el("li", { class: p.severity, text: `${where}${p.message}` }));
  }
  return ul;
}

let notes = null;

function analyse() {
  resultsEl.replaceChildren();
  const text = notesEl.value;
  if (!text.trim()) return;
  const config = readConfig();
  if (!isConfigured(config)) {
    resultsEl.append(el("p", { class: "note", text: "Fill in Settings above to create invoices." }));
    settings.open = true;
  }
  try {
    notes = parseNotes(text);
  } catch (err) {
    resultsEl.append(el("div", { class: "card" }, msgList([{ severity: "error", message: String(err.message || err) }])));
    return;
  }
  const loose = notes.problems.filter((p) => p.month === null);
  if (loose.length) resultsEl.append(el("div", { class: "card" }, msgList(loose)));
  if (!notes.months.length) {
    resultsEl.append(el("p", { class: "note", text: "No months found in this note." }));
    return;
  }
  for (const month of notes.months) resultsEl.append(monthCard(month, config));
}

function monthCard(month, config) {
  const title = `${MONTH_TITLES[month.number]} ${month.year}`;
  const problems = monthProblems(notes, month, config.hourly_rate);
  const refused = problems.some((p) => p.severity === "error");
  const ready = isConfigured(config);
  const rate = effectiveRate(month, config.hourly_rate);
  const hours = parsedHours(month);

  const card = el("div", { class: `card${month.paid ? " paid" : ""}` });
  const h3 = el("h3", { text: title });
  if (month.paid) h3.append(el("span", { class: "badge paid", text: "Paid" }));
  if (refused) h3.append(el("span", { class: "badge refused", text: "REFUSED" }));
  card.append(h3);

  const body = el("div");
  const list = el("ul", { class: "sessions" });
  for (const s of [...month.sessions].sort((a, b) => a.day - b.day)) {
    list.append(el("li", {},
      el("span", { text: `${s.day} ${MONTH_TITLES[month.number]}` }),
      el("span", { text: `${s.hours} hr` })));
  }
  body.append(list);
  body.append(el("p", { class: "total", text: `${hours} hours × ${money(config.currency, rate)} = ${money(config.currency, hours * rate)}` }));
  if (problems.length) body.append(msgList(problems));

  if (!refused) {
    const out = el("div", { class: "buttons" });
    const btn = el("button", {
      type: "button",
      class: month.paid ? "" : "primary",
      text: month.paid ? "Generate anyway" : "Create PDF",
    });
    if (!ready) btn.disabled = true;
    btn.addEventListener("click", () => createPdf(month, out, btn));
    out.append(btn);
    body.append(out);
  }

  if (month.paid) {
    const d = el("details", {}, el("summary", { text: "Show details" }), body);
    card.append(d);
  } else {
    card.append(body);
  }
  return card;
}

// ---- PDF creation ---------------------------------------------------------
function createPdf(month, out, btn) {
  for (const old of out.querySelectorAll(".result")) old.remove();
  const err = (text) => out.append(el("p", { class: "result msgs" }, el("span", { class: "error", text })));
  let file, name;
  try {
    // Render synchronously so navigator.share still has the user's tap activation.
    const invoice = buildInvoice(month, readConfig(), new Date());
    name = invoiceFileName(invoice);
    file = new File([renderPdf(invoice)], name, { type: "application/pdf" });
  } catch (e) {
    console.error(e);
    err(`Could not create the PDF: ${e.message || e}`);
    return;
  }

  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    navigator.share({ files: [file], title: name.replace(/\.pdf$/, "") }).catch((e) => {
      if (e && e.name === "AbortError") return; // user closed the share sheet
      console.error(e);
      offerLinks(file, out);
    });
    return;
  }
  offerLinks(file, out, true);
}

function offerLinks(file, out, autoDownload = false) {
  const url = URL.createObjectURL(file);
  const download = el("a", { class: "button", href: url, download: file.name, text: "Download" });
  const open = el("a", { class: "button", href: url, target: "_blank", rel: "noopener", text: "Open" });
  out.append(el("span", { class: "result buttons" }, download, open));
  if (autoDownload) download.click();
}

// ---- boot -----------------------------------------------------------------
initSettings();
notesEl.value = load(NOTES_KEY) || "";
analyse();

if ("serviceWorker" in navigator && location.protocol !== "file:") {
  navigator.serviceWorker.register("./sw.js").catch((e) => console.warn("Service worker not registered", e));
}
