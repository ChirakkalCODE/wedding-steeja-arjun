/**
 * CSV export, generated in the browser from the rows already on screen.
 *
 * Pure and separate from the UI because two of the three rules below are the
 * kind that are quietly wrong for months: a spreadsheet opens the file, shows
 * something plausible, and nobody checks it against the source until the
 * caterer has been told the wrong number.
 *
 *  1. A BOM. Excel on Windows still guesses the encoding of a .csv, and without
 *     U+FEFF in front it guesses the system codepage — which turns Malayalam
 *     names into boxes and Zürich into ZÃ¼rich. Every other reader ignores a
 *     BOM, so it costs nothing to be explicit.
 *
 *  2. Formula-injection protection. A cell beginning `=`, `+`, `-` or `@` is
 *     executed as a formula by Excel, Sheets and LibreOffice — so a guest whose
 *     message begins `=HYPERLINK(...)` becomes a live payload the moment the
 *     couple opens the export. Prefixing a single quote makes it text. This
 *     matters here specifically *because* `message` is free text a stranger
 *     typed into a form on the internet.
 *
 *  3. CRLF line endings, per RFC 4180 — the one thing Excel is strict about.
 */
import type { Rsvp } from '../supabase';

/** Excel's set, plus tab and CR which can be used to lead into the same trick. */
const RISKY_PREFIX = /^[=+\-@\t\r]/;

/**
 * One cell. Order matters: the anti-injection quote has to go on before the
 * value is wrapped for quoting, or it ends up outside the quotes and back in
 * the formula.
 */
function cell(value: unknown): string {
  if (value === null || value === undefined) return '';
  let text = String(value);

  if (RISKY_PREFIX.test(text)) text = `'${text}`;

  /* Quote only when required, and double any embedded quote. A field is left
     bare otherwise, which keeps the file readable in a text editor. */
  if (/[",\r\n]/.test(text)) text = `"${text.replace(/"/g, '""')}"`;

  return text;
}

const row = (cells: readonly unknown[]) => cells.map(cell).join(',');

/** `Anna (adult); Tom (child)` — one cell, so the column count stays fixed. */
function companionsCell(rsvp: Rsvp): string {
  return (rsvp.companions ?? [])
    .map((c) => `${c.name} (${c.type})`)
    .join('; ');
}

const COLUMNS = [
  'first_name',
  'last_name',
  'phone',
  'attending_mass',
  'attending_reception',
  'party_size',
  'companions',
  'message',
  'admin_note',
  'created_at',
] as const;

export function toCsv(rows: readonly Rsvp[]): string {
  const lines = [row(COLUMNS)];

  for (const r of rows) {
    lines.push(
      row([
        r.first_name,
        r.last_name,
        /* Leading `+` of an E.164 number is exactly the injection shape rule 2
           guards against, so every phone in the file arrives with a leading
           apostrophe — `'+919847012345`. It is not additionally wrapped in
           quotes, because it contains no comma, quote or newline for rule 3 to
           react to. Both facts are correct and neither is a bug to "fix" later:
           the apostrophe is what makes a spreadsheet read it as a phone number
           rather than as a subtraction. */
        r.phone,
        r.attending_mass ? 'yes' : 'no',
        r.attending_reception ? 'yes' : 'no',
        r.party_size,
        companionsCell(r),
        r.message,
        r.admin_note,
        r.created_at,
      ]),
    );
  }

  return `﻿${lines.join('\r\n')}\r\n`;
}

/** Local date, so the filename matches the day the couple pressed the button. */
export function csvFilename(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `rsvps-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.csv`;
}

/** Hands the file to the browser. Revokes the object URL so it is not leaked. */
export function downloadCsv(rows: readonly Rsvp[], now: Date = new Date()): void {
  const blob = new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = csvFilename(now);
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
