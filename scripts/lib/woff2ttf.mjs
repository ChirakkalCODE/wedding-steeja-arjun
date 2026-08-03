/**
 * WOFF (version 1) → TTF, in about sixty lines and with no dependency.
 *
 * The link-preview image has to carry the couple's names in Instrument Serif,
 * and rendering text with that face means handing a real sfnt font to
 * pango/fontconfig. @fontsource ships only `.woff2` and `.woff`: woff2 uses
 * Brotli *plus* a table-transform step that would need a real library, but
 * WOFF1 is nothing more than the same sfnt tables individually zlib-deflated
 * behind a 44-byte header — which `node:zlib` already decompresses.
 *
 * So the committed `.woff` is the build input, and the `.ttf` is a temporary
 * artefact regenerated on every run. Nothing new enters package.json for one
 * image, and the OG card is guaranteed to use the same typeface as the page
 * rather than whatever serif the build machine happens to have installed.
 *
 * Format: https://www.w3.org/TR/WOFF/
 */
import { inflateSync } from 'node:zlib';

export function woffToTtf(woff) {
  if (woff.readUInt32BE(0) !== 0x774f4646) {
    throw new Error('Not a WOFF file (bad signature — a .woff2 will not work here).');
  }

  const flavor = woff.readUInt32BE(4);
  const numTables = woff.readUInt16BE(12);

  // -- Read the WOFF table directory: 20 bytes per entry, after the 44-byte header.
  const tables = [];
  for (let i = 0; i < numTables; i += 1) {
    const p = 44 + i * 20;
    const compLength = woff.readUInt32BE(p + 8);
    const origLength = woff.readUInt32BE(p + 12);
    const offset = woff.readUInt32BE(p + 4);
    const raw = woff.subarray(offset, offset + compLength);

    tables.push({
      tag: woff.readUInt32BE(p),
      checksum: woff.readUInt32BE(p + 16),
      // Equal lengths mean the table was stored uncompressed.
      data: compLength >= origLength ? raw : inflateSync(raw),
    });
  }

  // sfnt requires the table records to be sorted by tag.
  tables.sort((a, b) => a.tag - b.tag);

  // -- sfnt header: the binary-search hints are part of the spec even though
  //    every real parser ignores them.
  const entrySelector = Math.floor(Math.log2(numTables));
  const searchRange = 2 ** entrySelector * 16;

  const header = Buffer.alloc(12);
  header.writeUInt32BE(flavor, 0);
  header.writeUInt16BE(numTables, 4);
  header.writeUInt16BE(searchRange, 6);
  header.writeUInt16BE(entrySelector, 8);
  header.writeUInt16BE(numTables * 16 - searchRange, 10);

  const records = Buffer.alloc(numTables * 16);
  const chunks = [];
  // Table data starts after the header and the records, and each table must
  // begin on a 4-byte boundary.
  let offset = 12 + numTables * 16;

  tables.forEach((table, i) => {
    records.writeUInt32BE(table.tag, i * 16);
    records.writeUInt32BE(table.checksum, i * 16 + 4);
    records.writeUInt32BE(offset, i * 16 + 8);
    records.writeUInt32BE(table.data.length, i * 16 + 12);

    const padding = (4 - (table.data.length % 4)) % 4;
    chunks.push(table.data, Buffer.alloc(padding));
    offset += table.data.length + padding;
  });

  return Buffer.concat([header, records, ...chunks]);
}
