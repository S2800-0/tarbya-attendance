/* Minimal .xlsx writer (multi-sheet, RTL, text-typed IDs) and reader (.xlsx / .csv),
   built on the vendored fflate. Exposes window.XLSX = { write, read, guessColumns }. */
(function () {
  "use strict";

  /* ---------------- writer ---------------- */

  const esc = (s) =>
    String(s)
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
      .replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  function colName(i) {
    let s = "";
    i++;
    while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); }
    return s;
  }

  // Styles: 0 normal · 1 title · 2 header · 3 text (keeps 14-digit IDs exact) · 4 wrap
  const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="@"/></numFmts><fonts count="3"><font><sz val="11"/><name val="Arial"/></font><font><b/><sz val="13"/><name val="Arial"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Arial"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF4F46E5"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="5"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="2" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

  /**
   * sheets: [{ name, title, headers: string[], rows: (string|number)[][], widths?: number[],
   *            textCols?: number[] (column indexes stored as text), footer?: string }]
   */
  function sheetXml(sh) {
    const textCols = new Set(sh.textCols || []);
    const rows = [];
    if (sh.title) rows.push([{ v: sh.title, s: 1 }], []);
    const headerRow = rows.length + 1;
    rows.push(sh.headers.map((h) => ({ v: h, s: 2 })));
    for (const r of sh.rows) {
      rows.push(r.map((v, ci) => {
        if (typeof v === "number" && !textCols.has(ci)) return { v, n: true };
        return { v: v == null ? "" : String(v), s: textCols.has(ci) ? 3 : 0 };
      }));
    }
    if (sh.footer) rows.push([], [{ v: sh.footer, s: 1 }]);

    const data = rows.map((row, ri) =>
      `<row r="${ri + 1}">` +
      row.map((c, ci) => {
        const ref = colName(ci) + (ri + 1);
        const st = c.s ? ` s="${c.s}"` : "";
        return c.n
          ? `<c r="${ref}"${st}><v>${c.v}</v></c>`
          : `<c r="${ref}"${st} t="inlineStr"><is><t xml:space="preserve">${esc(c.v)}</t></is></c>`;
      }).join("") +
      `</row>`).join("");

    const n = sh.headers.length;
    const widths = sh.widths || sh.headers.map(() => 18);
    const cols = widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("");
    const lastRow = headerRow + sh.rows.length;
    const merge = sh.title ? `<mergeCells count="1"><mergeCell ref="A1:${colName(n - 1)}1"/></mergeCells>` : "";
    const filter = sh.rows.length ? `<autoFilter ref="A${headerRow}:${colName(n - 1)}${lastRow}"/>` : "";
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView rightToLeft="1" workbookViewId="0"><pane ySplit="${headerRow}" topLeftCell="A${headerRow + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${cols}</cols><sheetData>${data}</sheetData>${filter}${merge}</worksheet>`;
  }

  function sheetName(s, used) {
    let name = String(s).replace(/[\[\]:*?\/\\]/g, " ").trim().slice(0, 31) || "Sheet";
    let n = 2;
    while (used.has(name)) name = `${name.slice(0, 28)} ${n++}`;
    used.add(name);
    return name;
  }

  function write(sheets) {
    const enc = (s) => fflate.strToU8(s);
    const used = new Set();
    const names = sheets.map((s) => sheetName(s.name, used));
    const files = {
      "[Content_Types].xml": enc(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`),
      "_rels/.rels": enc(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
      "xl/workbook.xml": enc(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets>${names.map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>`),
      "xl/_rels/workbook.xml.rels": enc(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`),
      "xl/styles.xml": enc(STYLES),
    };
    sheets.forEach((s, i) => { files[`xl/worksheets/sheet${i + 1}.xml`] = enc(sheetXml(s)); });
    return fflate.zipSync(files);
  }

  /* ---------------- reader ---------------- */

  function colIndex(ref) {
    const letters = String(ref).match(/^[A-Z]+/i);
    if (!letters) return -1;
    let n = 0;
    for (const ch of letters[0].toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
    return n - 1;
  }

  // Excel stores long numbers as 3.0405121700123E+13; turn them back into digits.
  function numberText(v) {
    if (/^-?\d+(\.\d+)?e[+-]?\d+$/i.test(v)) {
      const n = Number(v);
      if (Number.isFinite(n) && Math.abs(n) < 2 ** 53) return n.toFixed(0);
    }
    return v.replace(/\.0+$/, "");
  }

  function readXlsx(bytes) {
    const files = fflate.unzipSync(bytes);
    const text = (p) => (files[p] ? fflate.strFromU8(files[p]) : null);
    const parser = new DOMParser();
    const xml = (p) => { const t = text(p); return t ? parser.parseFromString(t, "application/xml") : null; };
    const byTag = (node, tag) => [...node.getElementsByTagNameNS("*", tag)];

    // First sheet: workbook → relationship → target
    const wb = xml("xl/workbook.xml");
    if (!wb) throw new Error("not-xlsx");
    const firstSheet = byTag(wb, "sheet")[0];
    const rid = firstSheet && (firstSheet.getAttribute("r:id") ||
      firstSheet.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id"));
    let target = "worksheets/sheet1.xml";
    const rels = xml("xl/_rels/workbook.xml.rels");
    if (rels && rid) {
      const rel = byTag(rels, "Relationship").find((r) => r.getAttribute("Id") === rid);
      if (rel) target = rel.getAttribute("Target");
    }
    const sheetPath = target.startsWith("/") ? target.slice(1) : "xl/" + target.replace(/^\.\//, "");

    const shared = [];
    const sst = xml("xl/sharedStrings.xml");
    if (sst) for (const si of byTag(sst, "si")) shared.push(byTag(si, "t").map((t) => t.textContent).join(""));

    const sheet = xml(sheetPath);
    if (!sheet) throw new Error("no-sheet");
    const rows = [];
    for (const row of byTag(sheet, "row")) {
      const out = [];
      let next = 0;
      for (const c of byTag(row, "c")) {
        const ref = c.getAttribute("r");
        const ci = ref ? colIndex(ref) : next;
        next = ci + 1;
        const type = c.getAttribute("t");
        let v = "";
        if (type === "s") v = shared[Number((byTag(c, "v")[0] || {}).textContent)] ?? "";
        else if (type === "inlineStr") v = byTag(c, "t").map((t) => t.textContent).join("");
        else {
          const vn = byTag(c, "v")[0];
          v = vn ? vn.textContent : "";
          if (type !== "str" && type !== "b" && v) v = numberText(v);
        }
        out[ci] = v;
      }
      rows.push(Array.from(out, (v) => (v == null ? "" : String(v).trim())));
    }
    return rows;
  }

  function readCsv(text) {
    text = text.replace(/^﻿/, "");
    const firstLine = text.split(/\r?\n/)[0] || "";
    const delim = [",", ";", "\t", "،"].reduce((best, d) =>
      firstLine.split(d).length > firstLine.split(best).length ? d : best, ",");
    const rows = [];
    let row = [], cell = "", quoted = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (quoted) {
        if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
        else if (ch === '"') quoted = false;
        else cell += ch;
      } else if (ch === '"') quoted = true;
      else if (ch === delim) { row.push(cell.trim()); cell = ""; }
      else if (ch === "\n" || ch === "\r") {
        if (ch === "\r" && text[i + 1] === "\n") i++;
        row.push(cell.trim()); rows.push(row); row = []; cell = "";
      } else cell += ch;
    }
    if (cell || row.length) { row.push(cell.trim()); rows.push(row); }
    return rows;
  }

  /** Returns { headers, rows } — the first non-empty row is the header. */
  async function read(file) {
    const buf = new Uint8Array(await file.arrayBuffer());
    const isZip = buf[0] === 0x50 && buf[1] === 0x4b;
    let rows;
    if (isZip) rows = readXlsx(buf);
    else if (/\.xls$/i.test(file.name)) throw new Error("old-xls");
    else rows = readCsv(new TextDecoder("utf-8").decode(buf));

    rows = rows.filter((r) => r.some((c) => c !== ""));
    if (!rows.length) throw new Error("empty");
    const width = Math.max(...rows.map((r) => r.length));
    const pad = (r) => Array.from({ length: width }, (_, i) => r[i] ?? "");
    const [head, ...body] = rows.map(pad);
    return { headers: head.map((h, i) => h || `عمود ${i + 1}`), rows: body };
  }

  /* ---------------- column guessing ---------------- */

  const norm = (s) => String(s).toLowerCase()
    .replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").replace(/[^\p{L}\p{N}]+/gu, " ").trim();

  const HINTS = {
    nid: ["الرقم القومي", "رقم قومي", "قومي", "national id", "national", "nid", "الرقم القومى", "بطاقه"],
    acad: ["الرقم الاكاديمي", "الرقم الجامعي", "رقم الجلوس", "الكود", "كود", "اكاديمي", "جامعي", "academic", "student id", "code", "id"],
    name: ["اسم الطالب", "الاسم", "اسم", "name", "student name", "full name"],
    year: ["الفرقه", "الفرقة", "فرقه", "المستوي", "السنه", "year", "level"],
  };

  /** Guess column indexes from header text, then from the data itself. */
  function guessColumns(headers, rows) {
    const nh = headers.map(norm);
    const pick = (field, taken) => {
      for (const hint of HINTS[field].map(norm)) {
        const i = nh.findIndex((h, idx) => !taken.has(idx) && (h === hint || h.includes(hint)));
        if (i !== -1) return i;
      }
      return -1;
    };
    const taken = new Set();
    const out = {};
    for (const f of ["nid", "name", "acad", "year"]) {
      out[f] = pick(f, taken);
      if (out[f] !== -1) taken.add(out[f]);
    }
    // Fallback: a column whose values are mostly 14 digits is the national ID.
    if (out.nid === -1) {
      const sample = rows.slice(0, 30);
      const i = headers.findIndex((_, ci) => !taken.has(ci) &&
        sample.filter((r) => /^\d{14}$/.test(NID.normalize(r[ci] || ""))).length >= Math.max(1, sample.length * 0.6));
      if (i !== -1) { out.nid = i; taken.add(i); }
    }
    if (out.name === -1) {
      const sample = rows.slice(0, 30);
      const i = headers.findIndex((_, ci) => !taken.has(ci) &&
        sample.filter((r) => /\p{L}{2,}\s+\p{L}{2,}/u.test(r[ci] || "")).length >= Math.max(1, sample.length * 0.6));
      if (i !== -1) out.name = i;
    }
    return out;
  }

  window.XLSX = { write, read, guessColumns, normHeader: norm };
})();
