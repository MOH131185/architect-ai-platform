import { readFile, writeFile } from "fs/promises";
import { PDFDocument, PDFName, PDFRawStream, PDFDict } from "pdf-lib";
import sharp from "sharp";
import zlib from "zlib";

const [, , pdfPath, outPath] = process.argv;
if (!pdfPath || !outPath) {
  console.error("Usage: node extract-pdf-raster.mjs <pdf> <out.png>");
  process.exit(2);
}

const buf = await readFile(pdfPath);
const doc = await PDFDocument.load(buf);
const page = doc.getPages()[0];
const resources = page.node.lookup(PDFName.of("Resources"), PDFDict);
const xObjects = resources.lookup(PDFName.of("XObject"), PDFDict);

let imageStream = null;
for (const [, ref] of xObjects.entries()) {
  const obj = doc.context.lookup(ref);
  if (!(obj instanceof PDFRawStream)) continue;
  const subtype = obj.dict.lookup(PDFName.of("Subtype"));
  if (subtype?.encodedName === "/Image") {
    imageStream = obj;
    break;
  }
}
if (!imageStream) {
  console.error("No image XObject found");
  process.exit(3);
}

const w = imageStream.dict.lookup(PDFName.of("Width")).numberValue;
const h = imageStream.dict.lookup(PDFName.of("Height")).numberValue;
const filter = imageStream.dict.lookup(PDFName.of("Filter"))?.encodedName;
console.log(`Image ${w}×${h} (${filter})`);

let raw = Buffer.from(imageStream.contents);
if (filter === "/FlateDecode") {
  raw = zlib.inflateSync(raw);
}
console.log(`Raw bytes: ${raw.length} (expected ${w * h * 3} for RGB)`);

await sharp(raw, {
  raw: { width: w, height: h, channels: 3 },
})
  .png({ compressionLevel: 6 })
  .toFile(outPath);

console.log(`Wrote ${outPath}`);
