// Minimal zip reader: finds the CSV inside the archive eBird emails and
// inflates it with the browser's built-in DecompressionStream. Handles stored
// and deflated entries, which covers eBird's exports; no ZIP64 or encryption.

const EOCD_SIG = 0x06054b50;
const CENTRAL_SIG = 0x02014b50;
const LOCAL_SIG = 0x04034b50;

export function isZip(bytes) {
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}

function findEndOfCentralDirectory(view) {
  // The record is 22 bytes plus an optional comment of up to 64 KB.
  const stop = Math.max(0, view.byteLength - 22 - 0xffff);
  for (let i = view.byteLength - 22; i >= stop; i--) {
    if (view.getUint32(i, true) === EOCD_SIG) return i;
  }
  throw new Error("That zip file looks damaged. Try unzipping it and dropping in the CSV instead.");
}

function listEntries(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocd = findEndOfCentralDirectory(view);
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const entries = [];
  for (let i = 0; i < count; i++) {
    if (view.getUint32(p, true) !== CENTRAL_SIG) break;
    const nameLen = view.getUint16(p + 28, true);
    entries.push({
      method: view.getUint16(p + 10, true),
      compressedSize: view.getUint32(p + 20, true),
      localOffset: view.getUint32(p + 42, true),
      name: new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + nameLen)),
    });
    p += 46 + nameLen + view.getUint16(p + 30, true) + view.getUint16(p + 32, true);
  }
  return { view, entries };
}

async function inflateRaw(data) {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error("This browser can't open zip files. Unzip it and drop in MyEBirdData.csv instead.");
  }
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// Returns the text of the eBird CSV inside the zip.
export async function csvFromZip(bytes) {
  const { view, entries } = listEntries(bytes);
  const csvs = entries.filter((e) => /\.csv$/i.test(e.name) && !e.name.startsWith('__MACOSX/'));
  const entry = csvs.find((e) => /MyEBirdData\.csv$/i.test(e.name)) || csvs[0];
  if (!entry) throw new Error("There's no CSV file inside that zip.");

  const at = entry.localOffset;
  if (view.getUint32(at, true) !== LOCAL_SIG) throw new Error('That zip file looks damaged.');
  const start = at + 30 + view.getUint16(at + 26, true) + view.getUint16(at + 28, true);
  const data = bytes.subarray(start, start + entry.compressedSize);

  let raw;
  if (entry.method === 0) raw = data;
  else if (entry.method === 8) raw = await inflateRaw(data);
  else throw new Error("That zip uses a compression type this page can't read. Try unzipping it first.");
  return new TextDecoder('utf-8').decode(raw);
}
