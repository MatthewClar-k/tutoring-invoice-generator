// Renders an invoice (from invoice.js buildInvoice) to a PDF Blob.
// Mirrors invoice/render.py. Uses the vendored jsPDF 2.5.2 UMD build
// (web/vendor/jspdf.umd.min.js), which exposes window.jspdf.jsPDF.

const MM = 72 / 25.4; // points per millimetre; the PDF is built in points
const ACCENT = [0x1f, 0x3a, 0x5f];
const RULE = [0xd0, 0xd7, 0xe2];
const BLACK = [0, 0, 0];
const PAGE_W = 210 * MM;
const PAGE_H = 297 * MM;
const MARGIN = 20 * MM;
const COLS = [40 * MM, 75 * MM, 20 * MM, 35 * MM];
const BODY = 9.5;
const LEAD = 14;
const PAD = 7; // top/bottom cell padding
const HPAD = 6; // reportlab's default horizontal padding

const MONTHS = ["January", "February", "March", "April", "May", "June", "July",
  "August", "September", "October", "November", "December"];

function money(currency, amount) {
  const n = Number(amount).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${currency}${n}`;
}

function fmtHours(h) {
  return String(Number(Number(h).toPrecision(12))); // like Python's {:g}
}

function longDate(d) {
  return `${String(d.getDate()).padStart(2, "0")} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export function renderPdf(invoice) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "portrait" });
  const left = MARGIN;
  const right = PAGE_W - MARGIN;
  const bottom = PAGE_H - MARGIN;
  const provider = invoice.provider || {};
  const client = invoice.client || {};
  const cur = invoice.currency;

  const font = (style, size, color) => {
    doc.setFont("helvetica", style);
    doc.setFontSize(size);
    doc.setTextColor(...color);
  };
  const line = (x1, y, x2, w, color) => {
    doc.setDrawColor(...color);
    doc.setLineWidth(w);
    doc.line(x1, y, x2, y);
  };

  doc.setProperties({
    title: `Invoice ${invoice.number}`,
    author: provider.name || "",
  });

  // ---- header: provider (left) and INVOICE block (right) ----
  let y = MARGIN;
  let py = y + 12; // baseline of 12pt name (leading 16)
  font("normal", 12, ACCENT);
  doc.text(provider.name || "", left, py);
  font("normal", BODY, BLACK);
  for (const v of [provider.email, provider.phone]) {
    if (!v) continue;
    py += LEAD;
    doc.text(v, left, py);
  }

  font("bold", 26, ACCENT);
  doc.text("INVOICE", right, y + 24, { align: "right" });
  let my = y + 26 + 4 + 11;
  font("bold", BODY, BLACK);
  doc.text(invoice.number, right, my, { align: "right" });
  font("normal", BODY, BLACK);
  my += LEAD;
  doc.text(`Issued ${longDate(invoice.issueDate)}`, right, my, { align: "right" });
  my += LEAD;
  doc.text(`For ${invoice.month.name.charAt(0).toUpperCase()}${invoice.month.name.slice(1).toLowerCase()} ${invoice.month.year}`,
    right, my, { align: "right" });

  y = Math.max(py + 4, my + 4) + 14 * MM;

  // ---- bill to ----
  font("normal", 8, ACCENT);
  doc.text("BILL TO", left, y + 8);
  y += 12 + 2;
  font("bold", BODY, BLACK);
  doc.text(client.name || "", left, y + 10);
  y += LEAD;
  if (client.address) {
    font("normal", BODY, BLACK);
    for (const l of String(client.address).split("\n")) {
      for (const w of doc.splitTextToSize(l, right - left)) {
        doc.text(w, left, y + 10);
        y += LEAD;
      }
    }
  }
  y += 10 * MM;

  // ---- table ----
  const x0 = left;
  const x1 = x0 + COLS[0];
  const x2 = x1 + COLS[1];
  const x3 = x2 + COLS[2];
  const x4 = x3 + COLS[3];

  function drawHeader() {
    font("bold", BODY, ACCENT);
    const base = y + PAD + 10;
    doc.text("Date", x0, base);
    doc.text("Description", x1 + HPAD, base);
    doc.text("Hours", x3 - HPAD, base, { align: "right" });
    doc.text("Amount", x4, base, { align: "right" });
    y += PAD * 2 + LEAD;
    line(x0, y, x4, 0.9, ACCENT);
  }

  drawHeader();

  for (const it of invoice.lineItems) {
    font("normal", BODY, BLACK);
    const desc = doc.splitTextToSize(it.description, COLS[1] - HPAD * 2);
    const h = PAD * 2 + LEAD * desc.length;
    if (y + h > bottom - (PAD * 2 + LEAD)) {
      doc.addPage();
      y = MARGIN;
      drawHeader();
      font("normal", BODY, BLACK);
    }
    const base = y + PAD + 10;
    doc.text(it.dateLabel, x0, base);
    desc.forEach((d, i) => doc.text(d, x1 + HPAD, base + i * LEAD));
    doc.text(fmtHours(it.hours), x3 - HPAD, base, { align: "right" });
    doc.text(money(cur, it.amount), x4, base, { align: "right" });
    y += h;
    line(x0, y, x4, 0.4, RULE);
  }

  // ---- total row ----
  const totalH = PAD * 2 + LEAD;
  if (y + totalH > bottom) {
    doc.addPage();
    y = MARGIN;
    drawHeader();
  }
  // replace the last thin rule with the accent rule above the total
  line(x0, y, x4, 0.9, ACCENT);
  const hours = invoice.lineItems.reduce((s, i) => s + Number(i.hours), 0);
  font("bold", BODY, BLACK);
  const base = y + PAD + 10;
  doc.text(`Total  (${fmtHours(hours)} hours @ ${money(cur, invoice.rate)}/hr)`,
    x1 + HPAD, base);
  doc.text(money(cur, invoice.total), x4, base, { align: "right" });

  return doc.output("blob");
}
