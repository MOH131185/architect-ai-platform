#!/usr/bin/env node
// Build a portfolioFiles fixture from real PDFs in D:\Training data AIARCHI\portfolio.
// Usage: node scripts/smoke/build-portfolio-fixture.mjs --count 3 --out outputs/style-pack-smoke/portfolioFiles.json [--seed <int>]

import { createRequire } from "module";
import { fileURLToPath } from "url";
import { dirname, join, basename } from "path";
import { mkdir, writeFile, readdir, readFile, stat } from "fs/promises";
import crypto from "crypto";
import {
  extractPortfolioEvidenceFromPdfText,
} from "../../src/utils/pdfToImages.js";

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const ARGS = process.argv.slice(2);
function arg(name, fallback) {
  const idx = ARGS.indexOf(name);
  if (idx === -1) return fallback;
  return ARGS[idx + 1];
}

const PORTFOLIO_DIR = "D:\\Training data AIARCHI\\portfolio";
const COUNT = Number(arg("--count", "3"));
const OUT = arg("--out", "outputs/style-pack-smoke/portfolioFiles.json");
const SEED = arg("--seed", "20260518");

// pdfjs-dist via legacy build for Node
const pdfjsLib = require("pdfjs-dist/legacy/build/pdf.mjs");

function pickN(arr, n, seedStr) {
  // Deterministic sort by sha256(seed||name) then take first n.
  return [...arr]
    .map((name) => ({
      name,
      key: crypto.createHash("sha256").update(`${seedStr}|${name}`).digest("hex"),
    }))
    .sort((a, b) => a.key.localeCompare(b.key))
    .slice(0, n)
    .map((entry) => entry.name);
}

async function extractTextFromPdf(buf) {
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(buf),
    isEvalSupported: false,
    useWorkerFetch: false,
    disableFontFace: true,
    standardFontDataUrl: null,
  });
  const pdf = await loadingTask.promise;
  const pageCount = Number(pdf.numPages || 0);
  const pageTexts = [];
  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const text = (content?.items || [])
      .map((item) => item.str || "")
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    pageTexts.push({ pageNumber, text, charCount: text.length });
  }
  return {
    pageCount,
    pageTexts,
    fullText: pageTexts.map((p) => p.text).join(" ").replace(/\s+/g, " ").trim(),
  };
}

function buildRecord(name, sizeBytes, extracted) {
  const evidence = extractPortfolioEvidenceFromPdfText(extracted.fullText);
  const textExtracted = extracted.fullText.length > 0;
  return {
    name,
    size: `${(sizeBytes / 1024 / 1024).toFixed(2)} MB`,
    type: "application/pdf",
    file: null,
    dataUrl: null,
    preview: null,
    isPdf: true,
    convertedFromPdf: false,
    thumbnails: [],
    pdf: {
      pageCount: extracted.pageCount,
      textExtracted,
      textCharCount: extracted.fullText.length,
      textSample: extracted.fullText.slice(0, 700),
      pageCharCounts: extracted.pageTexts.map((p) => p.charCount),
      sourceGaps: textExtracted
        ? []
        : [
            {
              code: "PDF_TEXT_NOT_SELECTABLE",
              severity: "warning",
              message:
                "PDF contains no selectable text; OCR is disabled so portfolio evidence is image-only.",
            },
          ],
    },
    sourceGaps: textExtracted
      ? []
      : [
          {
            code: "PDF_TEXT_NOT_SELECTABLE",
            severity: "warning",
            message:
              "PDF contains no selectable text; OCR is disabled so portfolio evidence is image-only.",
          },
        ],
    portfolioStyleEvidence: textExtracted ? evidence : null,
    text: extracted.fullText.slice(0, 5000),
    bytesOrTextDigest: crypto
      .createHash("sha256")
      .update(extracted.fullText || name)
      .digest("hex"),
  };
}

async function main() {
  const entries = (await readdir(PORTFOLIO_DIR)).filter((f) =>
    f.toLowerCase().endsWith(".pdf"),
  );
  const picks = pickN(entries, COUNT, SEED);
  console.log(`[fixture] seed=${SEED} picked ${picks.length}/${entries.length}:`);
  picks.forEach((p) => console.log(`  - ${p}`));

  const records = [];
  for (const name of picks) {
    const path = join(PORTFOLIO_DIR, name);
    const stats = await stat(path);
    const buf = await readFile(path);
    try {
      const extracted = await extractTextFromPdf(buf);
      const record = buildRecord(name, stats.size, extracted);
      records.push(record);
      console.log(
        `[fixture] ${name} pages=${extracted.pageCount} chars=${extracted.fullText.length} extracted=${record.pdf.textExtracted}`,
      );
    } catch (err) {
      console.error(`[fixture] FAILED ${name}: ${err?.message || err}`);
    }
  }

  const outDir = dirname(OUT);
  await mkdir(outDir, { recursive: true });
  await writeFile(OUT, JSON.stringify(records, null, 2), "utf8");
  console.log(`[fixture] wrote ${records.length} records to ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
