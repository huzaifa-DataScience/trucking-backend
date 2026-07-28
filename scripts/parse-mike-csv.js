/**
 * Reference Mike CSV parser — same format as repo root `mike.CSV`.
 * Frontend: copy logic into `parseMikeFile.ts` (or call ideas from this).
 *
 * Format quirks:
 * - Row 1 = metadata ("Estimate", job #, name…) — SKIP
 * - Row 2 = real headers (System-and-Type, Thickness, Size, Quantity, …)
 * - Data from row 3
 *
 * Usage: node scripts/parse-mike-csv.js mike.CSV
 */
const fs = require('fs');
const path = require('path');

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQuotes = false;
      } else cur += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') {
      row.push(cur);
      cur = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cur);
      rows.push(row);
      row = [];
      cur = '';
    } else cur += c;
  }
  if (cur.length || row.length) {
    row.push(cur);
    rows.push(row);
  }
  return rows;
}

function normHeader(h) {
  return String(h || '')
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function num(v) {
  const x = Number(String(v ?? '').replace(/,/g, '').trim());
  return Number.isFinite(x) ? x : null;
}

/**
 * @returns {{ rows: object[], meta?: { jobNumberHint: string|null, projectLabel: string|null }, error?: string }}
 */
function parseMikeCsv(text) {
  const raw = parseCsv(text.replace(/^\uFEFF/, ''));
  if (raw.length < 3) {
    return { rows: [], error: 'File too short — need metadata row + header row + data' };
  }

  // Find header row: first row that contains Size + Thickness + Quantity (case-insensitive)
  let headerIdx = -1;
  for (let i = 0; i < Math.min(5, raw.length); i++) {
    const norms = raw[i].map(normHeader);
    const hasSize = norms.some((h) => h === 'size');
    const hasThick = norms.some((h) => h === 'thickness');
    const hasQty = norms.some((h) => h === 'quantity');
    if (hasSize && hasThick && hasQty) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx < 0) {
    return {
      rows: [],
      error: 'No usable rows in file. Need size / thickness / quantity columns.',
    };
  }

  // Row(s) above header = Mike metadata: Estimate,<job#>,<title>
  let jobNumberHint = null;
  let projectLabel = null;
  for (let i = 0; i < headerIdx; i++) {
    const cells = raw[i] || [];
    const a = String(cells[0] || '').trim();
    const b = String(cells[1] || '').trim();
    const c = String(cells[2] || '').trim();
    if (/^estimate$/i.test(a) || /^\d{4,6}$/.test(b) || c) {
      if (/^\d{4,6}$/.test(b)) jobNumberHint = b;
      else if (b && !jobNumberHint) jobNumberHint = b;
      if (c) projectLabel = c;
      break;
    }
  }
  const meta = { jobNumberHint, projectLabel };

  const headers = raw[headerIdx].map(normHeader);
  const idx = (names) => {
    for (const n of names) {
      const i = headers.indexOf(n);
      if (i >= 0) return i;
    }
    return -1;
  };

  const iSys = idx(['system-and-type', 'system and type', 'systemandtype']);
  const iThick = idx(['thickness']);
  const iSize = idx(['size']);
  const iQty = idx(['quantity']);
  const iHours = idx(['hours']);
  const iMatCost = idx(['material']); // first "Material" is usually $ cost in Mike export
  // Material phrase often sits in an unnamed column after Spec (see mike.CSV col 33)
  let iPhrase = -1;
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i];
    if (!h && i > 30) {
      // blank header near end — check sample looks like material text
      iPhrase = i;
      break;
    }
  }
  // Prefer column that often holds insulation text if named oddly
  const iSpec = idx(['spec']);

  const out = [];
  for (let r = headerIdx + 1; r < raw.length; r++) {
    const cells = raw[r];
    if (!cells || cells.every((c) => !String(c || '').trim())) continue;
    const size = num(cells[iSize]);
    const thickness = num(cells[iThick]);
    const quantity = num(cells[iQty]) || 0;
    if (size == null && thickness == null) continue;
    if (!quantity && size == null) continue;

    let phrase = '';
    if (iPhrase >= 0) phrase = String(cells[iPhrase] || '').trim();
    if (!phrase && iSpec >= 0) {
      // sometimes phrase is next to Spec
      const next = String(cells[iSpec + 1] || '').trim();
      if (next && /[a-zA-Z]/.test(next) && next.length > 3) phrase = next;
    }
    phrase = phrase.replace(/"+$/g, '').trim();

    const systemAndType = iSys >= 0 ? String(cells[iSys] || '').trim() : '';
    if (!systemAndType && !phrase) continue;

    out.push({
      excelRowNumber: r + 1,
      systemAndType: systemAndType || undefined,
      thickness,
      size,
      quantity,
      hours: iHours >= 0 ? num(cells[iHours]) : null,
      materialCost: iMatCost >= 0 ? num(cells[iMatCost]) : null,
      materialPhrase: phrase || null,
    });
  }

  if (!out.length) {
    return {
      rows: [],
      meta,
      error: 'No usable rows in file. Need size / thickness / quantity columns.',
    };
  }
  return { rows: out, meta };
}

module.exports = { parseMikeCsv };

if (require.main === module) {
  const file = process.argv[2] || path.join(__dirname, '..', 'mike.CSV');
  const text = fs.readFileSync(file, 'utf8');
  const { rows, meta, error } = parseMikeCsv(text);
  if (error) {
    console.error(error);
    process.exit(1);
  }
  console.log(`OK parsed ${rows.length} rows from ${path.basename(file)}`);
  console.log('meta', meta);
  console.log('sample', JSON.stringify(rows[0], null, 2));
}
