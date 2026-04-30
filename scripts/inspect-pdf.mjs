import { readFile } from "fs/promises";
import { PDFDocument, PDFName, PDFRawStream, PDFDict } from "pdf-lib";

const path = process.argv[2];
if (!path) {
  console.error("Usage: node inspect-pdf.mjs <pdf>");
  process.exit(2);
}

const buf = await readFile(path);
const doc = await PDFDocument.load(buf);
const pages = doc.getPages();
console.log(`File:  ${path}`);
console.log(`Size:  ${buf.length} bytes`);
console.log(`Pages: ${pages.length}`);

for (let i = 0; i < pages.length; i += 1) {
  const page = pages[i];
  const { width, height } = page.getSize();
  const widthMm = (width / 72) * 25.4;
  const heightMm = (height / 72) * 25.4;
  console.log(`\nPage ${i + 1}: ${width.toFixed(2)}pt × ${height.toFixed(2)}pt = ${widthMm.toFixed(1)}mm × ${heightMm.toFixed(1)}mm`);

  const resources = page.node.lookup(PDFName.of("Resources"), PDFDict);
  if (!resources) continue;
  const xObjects = resources.lookup(PDFName.of("XObject"), PDFDict);
  if (!xObjects) continue;

  for (const [key, ref] of xObjects.entries()) {
    const obj = doc.context.lookup(ref);
    if (!(obj instanceof PDFRawStream)) continue;
    const dict = obj.dict;
    const subtype = dict.lookup(PDFName.of("Subtype"));
    if (!subtype || subtype.encodedName !== "/Image") continue;
    const w = dict.lookup(PDFName.of("Width"))?.numberValue ?? dict.lookup(PDFName.of("Width"))?.value;
    const h = dict.lookup(PDFName.of("Height"))?.numberValue ?? dict.lookup(PDFName.of("Height"))?.value;
    const filter = dict.lookup(PDFName.of("Filter"));
    const colorSpace = dict.lookup(PDFName.of("ColorSpace"));
    console.log(`  Image ${key.encodedName}:`);
    console.log(`    pixels:     ${w} × ${h}`);
    if (w && h) {
      const dpiW = (Number(w) / width) * 72;
      const dpiH = (Number(h) / height) * 72;
      console.log(`    effective:  ${dpiW.toFixed(1)} × ${dpiH.toFixed(1)} DPI`);
      console.log(`    expected:   9933 × 7016 px (300 DPI)`);
      console.log(`    matches:    ${Math.abs(Number(w) - 9933) <= 5 && Math.abs(Number(h) - 7016) <= 5 ? "YES" : "NO"}`);
    }
    console.log(`    filter:     ${filter?.encodedName || "(none)"}`);
    console.log(`    colorspace: ${colorSpace?.encodedName || "(complex)"}`);
    console.log(`    stream:     ${obj.contents.length} bytes (compressed)`);
  }
}

console.log(`\nMetadata:`);
console.log(`  Title:    ${doc.getTitle() || "-"}`);
console.log(`  Subject:  ${doc.getSubject() || "-"}`);
console.log(`  Producer: ${doc.getProducer() || "-"}`);
console.log(`  Creator:  ${doc.getCreator() || "-"}`);
