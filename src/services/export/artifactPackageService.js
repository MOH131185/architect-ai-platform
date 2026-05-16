/* global globalThis */
import {
  canonicalStringify,
  computeCDSHashSync,
} from "../validation/cdsHash.js";
import {
  DWG_CONVERSION_UNAVAILABLE,
  resolveDwgConversionCapabilities,
} from "../cad/dwgConversionAdapter.js";
import {
  buildStitchedPdfArtifact,
  PDF_STITCHING_SERVICE_VERSION,
  PDF_STITCHING_STRATEGY,
  PDF_STITCHING_FAILED,
  PDF_STITCHING_NO_INPUT_PDFS,
  PDF_STITCHING_UNAVAILABLE,
} from "./pdfStitchingService.js";

export {
  PDF_STITCHING_FAILED,
  PDF_STITCHING_NO_INPUT_PDFS,
  PDF_STITCHING_UNAVAILABLE,
} from "./pdfStitchingService.js";

// Phase 6 — Codex audit blocker #1 response. The legacy `hashBytes()`
// returns a 16-hex FNV-style fingerprint that's deterministic and cheap
// but is NOT a real SHA-256 (despite handoff.json calling it that). Add
// a real Web-Crypto-style SHA-256 helper for the handoff manifest's
// per-file index. We resolve the implementation lazily so the artifact-
// package service still works in browser and node test environments —
// node:crypto is the production path, and we fall back to a small
// pure-JS implementation when both Node's crypto module and Web Crypto
// (globalThis.crypto.subtle) are unavailable. Tests assert the real
// SHA-256 of every indexed file matches `sha256HexBytes(zipEntryBytes)`.
let __nodeCryptoModule = null;
function loadNodeCrypto() {
  if (__nodeCryptoModule) return __nodeCryptoModule;
  try {
    // Avoid bundlers complaining about Node-only imports under static
    // analysis; use a guarded eval-style require equivalent.
    if (
      typeof process !== "undefined" &&
      process.versions &&
      process.versions.node
    ) {
      __nodeCryptoModule = require("node:crypto");
    }
  } catch {
    __nodeCryptoModule = null;
  }
  return __nodeCryptoModule;
}
export function sha256HexBytes(bytes) {
  const u8 = normalizeBytes(bytes);
  if (!u8) return "";
  const nodeCrypto = loadNodeCrypto();
  if (nodeCrypto?.createHash) {
    return nodeCrypto.createHash("sha256").update(u8).digest("hex");
  }
  return sha256HexBytesPureJs(u8);
}

// Tiny pure-JS SHA-256 fallback. Used only when neither node:crypto nor
// Web Crypto's synchronous primitives are available — i.e. specialised
// runtimes where the artifact-package service still needs to compute a
// real SHA-256. Implementation is the canonical FIPS 180-4 spec.
function sha256HexBytesPureJs(bytes) {
  const K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
    0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
    0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
    0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
    0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
    0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
    0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
    0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
    0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ]);
  const H = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c,
    0x1f83d9ab, 0x5be0cd19,
  ]);
  const bitLen = bytes.length * 8;
  const padLen = (bytes.length + 9 + 63) & ~63;
  const padded = new Uint8Array(padLen);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  // big-endian 64-bit length
  for (let i = 0; i < 8; i += 1) {
    padded[padLen - 1 - i] = (bitLen / 2 ** (i * 8)) & 0xff;
  }
  const w = new Uint32Array(64);
  for (let off = 0; off < padLen; off += 64) {
    for (let i = 0; i < 16; i += 1) {
      w[i] =
        (padded[off + i * 4] << 24) |
        (padded[off + i * 4 + 1] << 16) |
        (padded[off + i * 4 + 2] << 8) |
        padded[off + i * 4 + 3];
    }
    for (let i = 16; i < 64; i += 1) {
      const s0 =
        ((w[i - 15] >>> 7) | (w[i - 15] << 25)) ^
        ((w[i - 15] >>> 18) | (w[i - 15] << 14)) ^
        (w[i - 15] >>> 3);
      const s1 =
        ((w[i - 2] >>> 17) | (w[i - 2] << 15)) ^
        ((w[i - 2] >>> 19) | (w[i - 2] << 13)) ^
        (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }
    let a = H[0],
      b = H[1],
      c = H[2],
      d = H[3];
    let e = H[4],
      f = H[5],
      g = H[6],
      h = H[7];
    for (let i = 0; i < 64; i += 1) {
      const S1 =
        ((e >>> 6) | (e << 26)) ^
        ((e >>> 11) | (e << 21)) ^
        ((e >>> 25) | (e << 7));
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + K[i] + w[i]) | 0;
      const S0 =
        ((a >>> 2) | (a << 30)) ^
        ((a >>> 13) | (a << 19)) ^
        ((a >>> 22) | (a << 10));
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) | 0;
      h = g;
      g = f;
      f = e;
      e = (d + temp1) | 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) | 0;
    }
    H[0] = (H[0] + a) | 0;
    H[1] = (H[1] + b) | 0;
    H[2] = (H[2] + c) | 0;
    H[3] = (H[3] + d) | 0;
    H[4] = (H[4] + e) | 0;
    H[5] = (H[5] + f) | 0;
    H[6] = (H[6] + g) | 0;
    H[7] = (H[7] + h) | 0;
  }
  let hex = "";
  for (let i = 0; i < 8; i += 1) {
    hex += (H[i] >>> 0).toString(16).padStart(8, "0");
  }
  return hex;
}

export const ARTIFACT_PACKAGE_SCHEMA_VERSION = "artifact-package-manifest-v1";
export const ARTIFACT_PACKAGE_SERVICE_VERSION = "artifact-package-service-v1";
export const IFC_EXPORT_UNAVAILABLE = "IFC_EXPORT_UNAVAILABLE";
export const ARTIFACT_CONTENT_UNAVAILABLE = "ARTIFACT_CONTENT_UNAVAILABLE";
export const FIXED_ZIP_MTIME_ISO = "1980-01-01T00:00:00.000Z";

export const ARTIFACT_PACKAGE_FOLDERS = Object.freeze([
  "presentation/",
  "technical/",
  "cad/",
  "bim/",
  "qa/",
  "previews/",
  "schedules/",
]);

const FIXED_DOS_TIME = 0;
const FIXED_DOS_DATE = 33;

const MIME_BY_EXTENSION = Object.freeze({
  svg: "image/svg+xml",
  pdf: "application/pdf",
  png: "image/png",
  dxf: "application/dxf",
  dwg: "application/x-dwg",
  ifc: "application/x-step",
  json: "application/json",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
});

const DEFAULT_FLAGS = Object.freeze({
  structuralEnabled: false,
  mepEnabled: false,
  detailsEnabled: false,
  dwgEnabled: false,
  ifcEnabled: false,
});

const DEFAULT_PRODUCER_VERSIONS = Object.freeze({
  artifactPackageService: ARTIFACT_PACKAGE_SERVICE_VERSION,
  manifestSchema: ARTIFACT_PACKAGE_SCHEMA_VERSION,
  zipStrategy: "store-fixed-mtime-sorted-v1",
});

function utf8Bytes(value) {
  const text = String(value ?? "");
  const Encoder = globalThis.TextEncoder;
  if (typeof Encoder === "function") {
    return new Encoder().encode(text);
  }
  const BufferCtor = globalThis.Buffer;
  if (BufferCtor?.from) {
    return new Uint8Array(BufferCtor.from(text, "utf8"));
  }
  const encoded = unescape(encodeURIComponent(text));
  const out = new Uint8Array(encoded.length);
  for (let i = 0; i < encoded.length; i += 1) {
    out[i] = encoded.charCodeAt(i);
  }
  return out;
}

function concatBytes(parts) {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function normalizeBytes(value) {
  if (value == null) return null;
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  if (typeof value === "object" && Array.isArray(value.data)) {
    return new Uint8Array(value.data);
  }
  if (typeof value === "string") {
    return value.startsWith("data:") ? dataUriToBytes(value) : utf8Bytes(value);
  }
  return utf8Bytes(canonicalStringify(value));
}

function dataUriToBytes(value) {
  const comma = value.indexOf(",");
  if (comma === -1) return utf8Bytes(value);
  const meta = value.slice(0, comma).toLowerCase();
  const payload = value.slice(comma + 1);
  if (!meta.includes(";base64")) {
    return utf8Bytes(decodeURIComponent(payload));
  }
  const BufferCtor = globalThis.Buffer;
  if (BufferCtor?.from) {
    return new Uint8Array(BufferCtor.from(payload, "base64"));
  }
  const binary = globalThis.atob(payload);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

function bytesToNodeBuffer(bytes) {
  const BufferCtor = globalThis.Buffer;
  return BufferCtor?.from ? BufferCtor.from(bytes) : bytes;
}

export function hashBytes(bytes = new Uint8Array()) {
  let h1 = 0x811c9dc5;
  let h2 = 0xcbf29ce4;
  for (const byte of bytes) {
    h1 = Math.imul(h1 ^ byte, 0x01000193);
    h2 = Math.imul(h2 ^ byte, 0x01000193);
  }
  return (
    (h1 >>> 0).toString(16).padStart(8, "0") +
    (h2 >>> 0).toString(16).padStart(8, "0")
  );
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function writeUInt16LE(buffer, offset, value) {
  buffer[offset] = value & 0xff;
  buffer[offset + 1] = (value >>> 8) & 0xff;
}

function writeUInt32LE(buffer, offset, value) {
  buffer[offset] = value & 0xff;
  buffer[offset + 1] = (value >>> 8) & 0xff;
  buffer[offset + 2] = (value >>> 16) & 0xff;
  buffer[offset + 3] = (value >>> 24) & 0xff;
}

function localFileHeader({ nameBytes, bytes, crc }) {
  const header = new Uint8Array(30 + nameBytes.length);
  writeUInt32LE(header, 0, 0x04034b50);
  writeUInt16LE(header, 4, 20);
  writeUInt16LE(header, 6, 0);
  writeUInt16LE(header, 8, 0);
  writeUInt16LE(header, 10, FIXED_DOS_TIME);
  writeUInt16LE(header, 12, FIXED_DOS_DATE);
  writeUInt32LE(header, 14, crc);
  writeUInt32LE(header, 18, bytes.length);
  writeUInt32LE(header, 22, bytes.length);
  writeUInt16LE(header, 26, nameBytes.length);
  writeUInt16LE(header, 28, 0);
  header.set(nameBytes, 30);
  return header;
}

function centralDirectoryHeader({ nameBytes, bytes, crc, offset }) {
  const header = new Uint8Array(46 + nameBytes.length);
  writeUInt32LE(header, 0, 0x02014b50);
  writeUInt16LE(header, 4, 20);
  writeUInt16LE(header, 6, 20);
  writeUInt16LE(header, 8, 0);
  writeUInt16LE(header, 10, 0);
  writeUInt16LE(header, 12, FIXED_DOS_TIME);
  writeUInt16LE(header, 14, FIXED_DOS_DATE);
  writeUInt32LE(header, 16, crc);
  writeUInt32LE(header, 20, bytes.length);
  writeUInt32LE(header, 24, bytes.length);
  writeUInt16LE(header, 28, nameBytes.length);
  writeUInt16LE(header, 30, 0);
  writeUInt16LE(header, 32, 0);
  writeUInt16LE(header, 34, 0);
  writeUInt16LE(header, 36, 0);
  writeUInt32LE(header, 38, 0);
  writeUInt32LE(header, 42, offset);
  header.set(nameBytes, 46);
  return header;
}

function endOfCentralDirectory({ entryCount, centralSize, centralOffset }) {
  const end = new Uint8Array(22);
  writeUInt32LE(end, 0, 0x06054b50);
  writeUInt16LE(end, 4, 0);
  writeUInt16LE(end, 6, 0);
  writeUInt16LE(end, 8, entryCount);
  writeUInt16LE(end, 10, entryCount);
  writeUInt32LE(end, 12, centralSize);
  writeUInt32LE(end, 16, centralOffset);
  writeUInt16LE(end, 20, 0);
  return end;
}

export function buildDeterministicZip(entries = []) {
  const normalizedEntries = normalizeZipEntries(entries);
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const entry of normalizedEntries) {
    const nameBytes = utf8Bytes(entry.fileName);
    const bytes = normalizeBytes(entry.content) || new Uint8Array();
    const checksum = crc32(bytes);
    const local = localFileHeader({ nameBytes, bytes, crc: checksum });
    localParts.push(local, bytes);
    centralParts.push(
      centralDirectoryHeader({
        nameBytes,
        bytes,
        crc: checksum,
        offset,
      }),
    );
    offset += local.length + bytes.length;
  }

  const centralOffset = offset;
  const central = concatBytes(centralParts);
  const end = endOfCentralDirectory({
    entryCount: normalizedEntries.length,
    centralSize: central.length,
    centralOffset,
  });
  return concatBytes([...localParts, central, end]);
}

function normalizeZipEntries(entries = []) {
  const byName = new Map();
  for (const entry of entries) {
    const fileName = normalizeZipPath(entry?.fileName);
    if (!fileName || byName.has(fileName)) continue;
    byName.set(fileName, {
      fileName,
      content: fileName.endsWith("/") ? new Uint8Array() : entry.content,
    });
  }
  return [...byName.values()].sort((a, b) =>
    a.fileName.localeCompare(b.fileName),
  );
}

export function listZipEntryNames(zipBytes = new Uint8Array()) {
  const bytes = normalizeBytes(zipBytes) || new Uint8Array();
  const names = [];
  let offset = 0;
  while (offset + 30 <= bytes.length) {
    const signature =
      bytes[offset] |
      (bytes[offset + 1] << 8) |
      (bytes[offset + 2] << 16) |
      (bytes[offset + 3] << 24);
    if (signature >>> 0 !== 0x04034b50) break;
    const compressedSize =
      bytes[offset + 18] |
      (bytes[offset + 19] << 8) |
      (bytes[offset + 20] << 16) |
      (bytes[offset + 21] << 24);
    const nameLength = bytes[offset + 26] | (bytes[offset + 27] << 8);
    const extraLength = bytes[offset + 28] | (bytes[offset + 29] << 8);
    const nameStart = offset + 30;
    const nameEnd = nameStart + nameLength;
    names.push(utf8Decode(bytes.slice(nameStart, nameEnd)));
    offset = nameEnd + extraLength + compressedSize;
  }
  return names;
}

function utf8Decode(bytes = new Uint8Array()) {
  const Decoder = globalThis.TextDecoder;
  if (typeof Decoder === "function") {
    return new Decoder().decode(bytes);
  }
  const BufferCtor = globalThis.Buffer;
  if (BufferCtor?.from) {
    return BufferCtor.from(bytes).toString("utf8");
  }
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return decodeURIComponent(escape(binary));
}

function normalizeZipPath(value) {
  return String(value || "")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/\/{2,}/g, "/")
    .trim();
}

function safeName(value, fallback = "artifact") {
  const cleaned = String(value || fallback)
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  return cleaned || fallback;
}

function extensionFromFileName(fileName = "") {
  const match = String(fileName).match(/\.([a-zA-Z0-9]+)$/);
  return match ? match[1].toLowerCase() : "";
}

function mimeTypeFor(fileName, fallback = "application/octet-stream") {
  return MIME_BY_EXTENSION[extensionFromFileName(fileName)] || fallback;
}

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : Object.values(value);
}

function firstValue(...values) {
  return values.find((value) => value !== undefined && value !== null);
}

function artifactContent(candidate = {}) {
  return firstValue(
    candidate.bytes,
    candidate.contentBytes,
    candidate.content,
    candidate.dataUrl,
    candidate.dataUri,
    candidate.pdfDataUrl,
    candidate.svgString,
    candidate.svg,
    candidate.dxf,
    candidate.ifc,
    candidate.workbookArray,
    candidate.json,
  );
}

function createArtifactCandidate(candidate, defaults = {}) {
  if (!candidate) return null;
  if (
    typeof candidate === "string" ||
    candidate instanceof Uint8Array ||
    candidate instanceof ArrayBuffer ||
    ArrayBuffer.isView(candidate)
  ) {
    const fileName = normalizeZipPath(defaults.fileName);
    if (!fileName) return null;
    return {
      ...defaults,
      fileName,
      content: candidate,
    };
  }
  const fileName = normalizeZipPath(candidate.fileName || defaults.fileName);
  if (!fileName) return null;
  return {
    ...defaults,
    ...candidate,
    fileName,
    content: artifactContent(candidate),
  };
}

function resolveContext(input = {}) {
  const artifacts = input.artifacts || {};
  const compiledProject = input.compiledProject || artifacts.compiledProject;
  const projectGraph = input.projectGraph || {};
  const visualManifest = input.visualManifest || artifacts.visualManifest;
  const styleBlendManifest =
    input.styleBlendManifest || artifacts.styleBlendManifest;
  const jurisdictionPack =
    input.jurisdictionPack ||
    input.jurisdiction ||
    artifacts.jurisdictionPack ||
    {};

  return {
    projectId:
      input.projectId ||
      input.project_id ||
      projectGraph.project_id ||
      projectGraph.id ||
      compiledProject?.projectId ||
      null,
    projectGraphId:
      input.projectGraphId ||
      input.project_graph_id ||
      artifacts.projectGraphId ||
      projectGraph.projectGraphId ||
      projectGraph.project_id ||
      projectGraph.id ||
      compiledProject?.projectGraphId ||
      null,
    geometryHash:
      input.geometryHash ||
      artifacts.geometryHash ||
      compiledProject?.geometryHash ||
      projectGraph.geometryHash ||
      null,
    visualManifestHash:
      input.visualManifestHash ||
      artifacts.visualManifestHash ||
      visualManifest?.manifestHash ||
      null,
    styleBlendManifestHash:
      input.styleBlendManifestHash ||
      artifacts.styleBlendManifestHash ||
      styleBlendManifest?.manifestHash ||
      null,
    jurisdictionId:
      input.jurisdictionId ||
      jurisdictionPack.jurisdictionId ||
      jurisdictionPack.id ||
      compiledProject?.jurisdictionId ||
      null,
    countryCode:
      input.countryCode ||
      jurisdictionPack.countryCode ||
      compiledProject?.countryCode ||
      null,
  };
}

function normalizeFlags(inputFlags = {}, env = undefined) {
  const dwgCapabilities = resolveDwgConversionCapabilities(env);
  const flags = {
    ...DEFAULT_FLAGS,
    ...inputFlags,
    dwgEnabled:
      inputFlags.dwgEnabled === true || dwgCapabilities.available === true,
  };
  for (const key of Object.keys(DEFAULT_FLAGS)) {
    flags[key] = flags[key] === true;
  }
  return { flags, dwgCapabilities };
}

function collectKnownArtifactCandidates(input = {}, context = {}) {
  const artifacts = input.artifacts || {};
  const projectSlug = safeName(
    input.projectName || input.projectId || context.projectGraphId || "project",
  );
  const candidates = [];

  const a1Sheet = input.a1Sheet || artifacts.a1Sheet;
  candidates.push(
    createArtifactCandidate(a1Sheet, {
      type: "a1_sheet_svg",
      fileName: `presentation/${projectSlug}-a1-sheet.svg`,
      mimeType: "image/svg+xml",
      role: "a1_sheet",
      discipline: "architecture",
      source: "ProjectGraph A1 SVG sheet artifact",
      sheetNumber: a1Sheet?.sheetNumber || "A1-001",
      content: a1Sheet?.svgString,
    }),
  );

  const a1Pdf = input.a1Pdf || artifacts.a1Pdf;
  candidates.push(
    createArtifactCandidate(a1Pdf, {
      type: "a1_sheet_pdf",
      fileName: `presentation/${projectSlug}-a1-sheet.pdf`,
      mimeType: "application/pdf",
      role: "a1_sheet",
      discipline: "architecture",
      source: "ProjectGraph A1 PDF artifact",
      sheetNumber: a1Pdf?.sheetNumber || "A1-001",
      content: a1Pdf?.dataUrl || a1Pdf?.pdfDataUrl,
    }),
  );

  const a1Png = input.a1Png || artifacts.a1Png || artifacts.renderedProof;
  candidates.push(
    createArtifactCandidate(a1Png, {
      type: "a1_sheet_png",
      fileName: `previews/${projectSlug}-a1-sheet.png`,
      mimeType: "image/png",
      role: "a1_sheet_preview",
      discipline: "preview",
      source: "ProjectGraph A1 PNG proof artifact",
      sheetNumber: a1Png?.sheetNumber || "A1-001",
      content: a1Png?.dataUrl || a1Png?.pngDataUrl,
    }),
  );

  for (const drawing of asArray(
    input.technicalDrawings || artifacts.drawings,
  )) {
    const id = safeName(
      drawing.panelType || drawing.type || drawing.artifactId || "technical",
    );
    const drawingIsPdf =
      drawing.mimeType === "application/pdf" ||
      typeof drawing.pdfDataUrl === "string" ||
      typeof drawing.pdfDataUri === "string";
    const drawingExtension = drawingIsPdf ? "pdf" : "svg";
    candidates.push(
      createArtifactCandidate(drawing, {
        type: drawing.type || "technical_drawing_svg",
        fileName: `technical/${id}.${drawingExtension}`,
        mimeType: drawingIsPdf ? "application/pdf" : "image/svg+xml",
        role: drawing.role || "technical_drawing",
        discipline: drawing.discipline || "architecture",
        source: drawing.source || "ProjectGraph technical drawing artifact",
        sheetNumber: drawing.sheetNumber || null,
      }),
    );
  }

  candidates.push(
    createArtifactCandidate(input.dxfArtifact || artifacts.dxf, {
      type: "dxf",
      fileName: `cad/${projectSlug}.dxf`,
      mimeType: "application/dxf",
      role: "cad_exchange",
      discipline: "cad",
      source: "CanonicalDrawingModel DXF export",
    }),
  );
  candidates.push(
    createArtifactCandidate(input.dwgArtifact || artifacts.dwg, {
      type: "dwg",
      fileName: `cad/${projectSlug}.dwg`,
      mimeType: "application/x-dwg",
      role: "cad_native",
      discipline: "cad",
      source: "Configured real DWG conversion output",
    }),
  );
  candidates.push(
    createArtifactCandidate(input.ifcArtifact || artifacts.ifc, {
      type: "ifc",
      fileName: `bim/${projectSlug}.ifc`,
      mimeType: "application/x-step",
      role: "bim_model",
      discipline: "bim",
      source: "Existing real IFC artifact",
    }),
  );

  for (const artifact of asArray(
    input.structuralArtifacts || artifacts.structuralArtifacts,
  )) {
    const id = safeName(
      artifact.fileStem || artifact.type || artifact.role || "structural",
    );
    candidates.push(
      createArtifactCandidate(artifact, {
        type: artifact.type || "structural_sheet",
        fileName: `technical/${id}.svg`,
        mimeType: artifact.mimeType || "image/svg+xml",
        role: artifact.role || "structural_sheet",
        discipline: "structure",
        source: artifact.source || "Opt-in structural output",
        reviewRequired: true,
        preliminary: true,
        advisory: true,
      }),
    );
  }

  for (const artifact of asArray(
    input.mepArtifacts || artifacts.mepArtifacts,
  )) {
    const id = safeName(
      artifact.fileStem || artifact.type || artifact.role || "mep",
    );
    candidates.push(
      createArtifactCandidate(artifact, {
        type: artifact.type || "mep_sheet",
        fileName: `technical/${id}.svg`,
        mimeType: artifact.mimeType || "image/svg+xml",
        role: artifact.role || "mep_sheet",
        discipline: "mep",
        source: artifact.source || "Opt-in MEP output",
        reviewRequired: true,
        preliminary: true,
        advisory: true,
      }),
    );
  }

  for (const artifact of asArray(
    input.detailArtifacts || artifacts.detailArtifacts,
  )) {
    const id = safeName(
      artifact.fileStem || artifact.type || artifact.role || "detail",
    );
    candidates.push(
      createArtifactCandidate(artifact, {
        type: artifact.type || "detail_sheet",
        fileName: `technical/${id}.svg`,
        mimeType: artifact.mimeType || "image/svg+xml",
        role: artifact.role || "construction_detail",
        discipline: "details",
        source: artifact.source || "Opt-in construction detail output",
        reviewRequired: true,
        preliminary: true,
        advisory: true,
      }),
    );
  }

  candidates.push(
    createArtifactCandidate(
      input.schedulesWorkbook || artifacts.schedulesWorkbook,
      {
        type: "schedules_workbook",
        fileName: `schedules/${projectSlug}-schedules.xlsx`,
        mimeType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        role: "schedule",
        discipline: "architecture",
        source: "Existing schedules workbook artifact",
      },
    ),
  );

  return candidates.filter(Boolean);
}

function collectExplicitArtifactCandidates(input = {}) {
  return asArray(input.existingArtifacts).map((artifact, index) =>
    createArtifactCandidate(artifact, {
      type: artifact.type || "artifact",
      fileName:
        artifact.fileName ||
        `${artifact.discipline || "technical"}/artifact-${index + 1}.bin`,
      mimeType: artifact.mimeType,
      role: artifact.role || "artifact",
      discipline: artifact.discipline || "architecture",
      source: artifact.source || "existing_artifact",
    }),
  );
}

function materializeArtifact(candidate = {}, context = {}) {
  const fileName = normalizeZipPath(candidate.fileName);
  const content = artifactContent(candidate);
  const bytes = normalizeBytes(content);
  if (!bytes) {
    return {
      gap: {
        code: ARTIFACT_CONTENT_UNAVAILABLE,
        severity: "warning",
        fileName,
        type: candidate.type || null,
        message: `Artifact ${fileName || "unknown"} was omitted because no packageable bytes were supplied.`,
      },
    };
  }
  const hash = hashBytes(bytes);
  // Phase 6 — Codex audit blocker #1. Real SHA-256 alongside the legacy
  // FNV-style fingerprint. The legacy `hash` stays put for packageHash /
  // packageId determinism + back-compat with every downstream consumer;
  // `sha256` is what handoff.json's file index advertises (and is what
  // any external verifier can compute from the ZIP entry bytes).
  const sha256 = sha256HexBytes(bytes);
  const artifactId =
    candidate.artifactId ||
    candidate.asset_id ||
    `artifact-${computeCDSHashSync({ fileName, hash }).slice(0, 12)}`;
  const entry = {
    artifactId,
    type: candidate.type || extensionFromFileName(fileName) || "artifact",
    fileName,
    mimeType: candidate.mimeType || mimeTypeFor(fileName),
    role: candidate.role || "artifact",
    discipline: candidate.discipline || "architecture",
    sheetNumber: candidate.sheetNumber || candidate.sheet_number || null,
    source: candidate.source || "existing_artifact",
    hash,
    sha256,
    byteLength: bytes.length,
    geometryHash:
      candidate.geometryHash ||
      candidate.sourceGeometryHash ||
      context.geometryHash ||
      null,
    sourceGeometryHash:
      candidate.sourceGeometryHash ||
      candidate.geometryHash ||
      context.geometryHash ||
      null,
    visualManifestHash:
      candidate.visualManifestHash || context.visualManifestHash || null,
    styleBlendManifestHash:
      candidate.styleBlendManifestHash ||
      context.styleBlendManifestHash ||
      null,
    jurisdictionId: candidate.jurisdictionId || context.jurisdictionId || null,
    reviewRequired: candidate.reviewRequired === true,
    preliminary: candidate.preliminary === true,
    advisory: candidate.advisory === true,
    sourceGap: candidate.sourceGap || null,
  };
  return {
    artifact: entry,
    zipEntry: {
      fileName,
      content: bytes,
    },
  };
}

function uniqueFileName(fileName, used) {
  const normalized = normalizeZipPath(fileName);
  if (!used.has(normalized)) {
    used.add(normalized);
    return normalized;
  }
  const ext = extensionFromFileName(normalized);
  const base = ext ? normalized.slice(0, -(ext.length + 1)) : normalized;
  let counter = 2;
  while (true) {
    const candidate = ext ? `${base}-${counter}.${ext}` : `${base}-${counter}`;
    if (!used.has(candidate)) {
      used.add(candidate);
      return candidate;
    }
    counter += 1;
  }
}

function materializeArtifacts(candidates = [], context = {}) {
  const used = new Set();
  const artifacts = [];
  const zipEntries = [];
  const sourceGaps = [];

  for (const candidate of candidates) {
    const fileName = uniqueFileName(candidate.fileName, used);
    const result = materializeArtifact({ ...candidate, fileName }, context);
    if (result.gap) {
      sourceGaps.push(result.gap);
      continue;
    }
    artifacts.push(result.artifact);
    zipEntries.push(result.zipEntry);
  }

  artifacts.sort((a, b) => a.fileName.localeCompare(b.fileName));
  zipEntries.sort((a, b) => a.fileName.localeCompare(b.fileName));
  return { artifacts, zipEntries, sourceGaps };
}

function artifactExists(artifacts, predicate) {
  return artifacts.some(predicate);
}

function buildAvailabilitySourceGaps({
  artifacts = [],
  flags = DEFAULT_FLAGS,
  dwgCapabilities = {},
} = {}) {
  const gaps = [];
  const hasDwg = artifactExists(artifacts, (artifact) =>
    artifact.fileName.toLowerCase().endsWith(".dwg"),
  );
  const hasIfc = artifactExists(artifacts, (artifact) =>
    artifact.fileName.toLowerCase().endsWith(".ifc"),
  );

  if (!hasDwg) {
    gaps.push({
      code: DWG_CONVERSION_UNAVAILABLE,
      severity: flags.dwgEnabled ? "warning" : "info",
      discipline: "cad",
      omittedByFlag: !flags.dwgEnabled,
      message:
        dwgCapabilities.reason ||
        "DWG conversion is unavailable; no fake DWG was generated.",
      details: {
        dwgEnabled: flags.dwgEnabled,
        provider: dwgCapabilities.provider || null,
      },
    });
  }

  if (!hasIfc) {
    gaps.push({
      code: IFC_EXPORT_UNAVAILABLE,
      severity: flags.ifcEnabled ? "warning" : "info",
      discipline: "bim",
      omittedByFlag: !flags.ifcEnabled,
      message: "IFC export artifact is unavailable; no fake IFC was generated.",
      details: { ifcEnabled: flags.ifcEnabled },
    });
  }

  for (const [flagKey, discipline, code] of [
    ["structuralEnabled", "structure", "STRUCTURAL_OUTPUTS_DISABLED"],
    ["mepEnabled", "mep", "MEP_OUTPUTS_DISABLED"],
    ["detailsEnabled", "details", "DETAIL_OUTPUTS_DISABLED"],
  ]) {
    const hasDiscipline = artifactExists(
      artifacts,
      (artifact) => artifact.discipline === discipline,
    );
    if (!flags[flagKey]) {
      gaps.push({
        code,
        severity: "info",
        discipline,
        omittedByFlag: true,
        message: `${discipline} outputs are disabled for this package.`,
      });
    } else if (!hasDiscipline) {
      gaps.push({
        code: code.replace("_DISABLED", "_UNAVAILABLE"),
        severity: "warning",
        discipline,
        omittedByFlag: false,
        message: `${discipline} outputs were enabled but no existing artifact was supplied.`,
      });
    }
  }

  return gaps;
}

function normalizeSourceGaps(...gapGroups) {
  const gaps = gapGroups
    .flat()
    .filter(Boolean)
    .map((gap) => ({
      code: gap.code || "SOURCE_GAP",
      severity: gap.severity || "warning",
      discipline: gap.discipline || null,
      fileName: gap.fileName || null,
      omittedByFlag: gap.omittedByFlag === true,
      message: gap.message || gap.reason || gap.code || "Source gap",
      details: gap.details || {},
    }));
  gaps.sort((a, b) =>
    [a.code, a.discipline || "", a.fileName || ""]
      .join(":")
      .localeCompare([b.code, b.discipline || "", b.fileName || ""].join(":")),
  );
  return gaps;
}

function buildQaSummary(qaReport = null, sourceGaps = []) {
  const qa = qaReport?.qa || qaReport || {};
  const issues = Array.isArray(qa.issues) ? qa.issues : [];
  const errorCount =
    Number.isFinite(Number(qa.errorCount)) && qa.errorCount != null
      ? Number(qa.errorCount)
      : issues.filter((issue) => issue.severity === "error").length;
  const warningCount =
    Number.isFinite(Number(qa.warningCount)) && qa.warningCount != null
      ? Number(qa.warningCount)
      : issues.filter((issue) => issue.severity === "warning").length;
  return {
    status: qa.status || (errorCount > 0 ? "fail" : "pass"),
    score: Number.isFinite(Number(qa.score)) ? Number(qa.score) : null,
    issueCount: issues.length,
    errorCount,
    warningCount,
    sourceGapCount: sourceGaps.length,
  };
}

function buildQaReportPayload({
  qaReport = null,
  qaSummary,
  sourceGaps,
  context,
  flags,
}) {
  const base =
    qaReport && typeof qaReport === "object"
      ? qaReport.qa || qaReport
      : { status: qaSummary.status, issues: [] };
  return {
    ...base,
    artifactPackageQa: {
      schemaVersion: "artifact-package-qa-v1",
      createdAtPolicy: "deterministic-fixed",
      fixedTimestamp: FIXED_ZIP_MTIME_ISO,
      projectId: context.projectId,
      projectGraphId: context.projectGraphId,
      geometryHash: context.geometryHash,
      visualManifestHash: context.visualManifestHash,
      styleBlendManifestHash: context.styleBlendManifestHash,
      jurisdictionId: context.jurisdictionId,
      flags,
      qaSummary,
      sourceGaps,
    },
  };
}

function buildManifestBody({
  input,
  context,
  artifacts,
  sourceGaps,
  qaSummary,
  producerVersions,
  flags,
}) {
  return {
    schemaVersion: ARTIFACT_PACKAGE_SCHEMA_VERSION,
    packageId: null,
    packageHash: null,
    createdAtPolicy: "deterministic-fixed",
    fixedTimestamp: FIXED_ZIP_MTIME_ISO,
    projectId: context.projectId,
    projectGraphId: context.projectGraphId,
    geometryHash: context.geometryHash,
    visualManifestHash: context.visualManifestHash,
    styleBlendManifestHash: context.styleBlendManifestHash,
    jurisdictionId: context.jurisdictionId,
    countryCode: context.countryCode,
    artifacts,
    sourceGaps,
    qaSummary,
    producerVersions,
    flags,
    packageNotes: input.packageNotes || [],
  };
}

export function buildArtifactPackage(input = {}) {
  const context = resolveContext(input);
  const { flags, dwgCapabilities } = normalizeFlags(input.flags, input.env);
  const candidates = [
    ...collectKnownArtifactCandidates(input, context),
    ...collectExplicitArtifactCandidates(input),
  ];
  const materialized = materializeArtifacts(candidates, context);
  const availabilityGaps = buildAvailabilitySourceGaps({
    artifacts: materialized.artifacts,
    flags,
    dwgCapabilities,
  });
  const sourceGaps = normalizeSourceGaps(
    input.sourceGaps || [],
    materialized.sourceGaps,
    availabilityGaps,
  );
  const initialQaSummary = buildQaSummary(
    input.qaReport || input.qa,
    sourceGaps,
  );
  const qaPayload = buildQaReportPayload({
    qaReport: input.qaReport || input.qa,
    qaSummary: initialQaSummary,
    sourceGaps,
    context,
    flags,
  });
  const qaMaterialized = materializeArtifact(
    {
      type: "qa_report_json",
      fileName: "qa/qa-report.json",
      mimeType: "application/json",
      role: "qa_report",
      discipline: "qa",
      source: "Artifact package QA report",
      content: `${canonicalStringify(qaPayload)}\n`,
    },
    context,
  );
  const artifacts = [...materialized.artifacts, qaMaterialized.artifact].sort(
    (a, b) => a.fileName.localeCompare(b.fileName),
  );
  const zipArtifactEntries = [
    ...materialized.zipEntries,
    qaMaterialized.zipEntry,
  ].sort((a, b) => a.fileName.localeCompare(b.fileName));
  const qaSummary = {
    ...initialQaSummary,
    packagedArtifactCount: artifacts.length,
  };
  const producerVersions = {
    ...DEFAULT_PRODUCER_VERSIONS,
    ...(input.producerVersions || {}),
  };
  const manifestBody = buildManifestBody({
    input,
    context,
    artifacts,
    sourceGaps,
    qaSummary,
    producerVersions,
    flags,
  });
  const packageId =
    input.packageId ||
    `artifact-package-${computeCDSHashSync({
      projectGraphId: context.projectGraphId,
      geometryHash: context.geometryHash,
      artifactHashes: artifacts.map((artifact) => artifact.hash),
      sourceGaps,
    }).slice(0, 12)}`;
  const manifestWithoutHash = {
    ...manifestBody,
    packageId,
  };
  const packageHash = computeCDSHashSync({
    manifest: manifestWithoutHash,
    artifactHashes: artifacts.map((artifact) => ({
      fileName: artifact.fileName,
      hash: artifact.hash,
    })),
  });
  const manifest = {
    ...manifestWithoutHash,
    packageHash,
  };
  const manifestEntry = {
    fileName: "manifest.json",
    content: `${JSON.stringify(manifest, null, 2)}\n`,
  };
  const manifestBytes = normalizeBytes(manifestEntry.content);
  const manifestHash = hashBytes(manifestBytes);
  const manifestSha256 = sha256HexBytes(manifestBytes);
  // Phase 6 — Codex audit blocker #1+#2. Callers (the handoff package
  // orchestrator) need to layer extra files (handoff.json, README.md)
  // into the deterministic ZIP WITHOUT contributing to the manifest
  // artifact list or the packageHash. That keeps the orchestrator able
  // to reference packageHash from inside the extras (no circularity).
  // extraZipEntries are appended to the ZIP, sorted alongside artifact
  // entries; they are NOT recorded in manifest.artifacts and NOT inputs
  // to packageHash. Existing callers that don't pass them see no change.
  const extraZipEntries = Array.isArray(input.extraZipEntries)
    ? input.extraZipEntries
        .filter((entry) => entry && entry.fileName)
        .map((entry) => ({
          fileName: entry.fileName,
          content: entry.content,
        }))
    : [];
  const zipEntries = normalizeZipEntries([
    ...ARTIFACT_PACKAGE_FOLDERS.map((fileName) => ({
      fileName,
      content: new Uint8Array(),
    })),
    manifestEntry,
    ...zipArtifactEntries,
    ...extraZipEntries,
  ]);
  const zipBytes = buildDeterministicZip(zipEntries);

  return {
    packageId,
    packageHash,
    manifest,
    manifestHash,
    manifestSha256,
    zipBytes,
    zipBuffer: bytesToNodeBuffer(zipBytes),
    zipHash: hashBytes(zipBytes),
    zipEntries: zipEntries.map((entry) => ({
      fileName: entry.fileName,
      byteLength: (normalizeBytes(entry.content) || new Uint8Array()).length,
    })),
    sourceGaps,
  };
}

export async function buildArtifactPackageWithPdfStitching(input = {}) {
  const context = resolveContext(input);
  const stitchedPdf = await buildStitchedPdfArtifact(input, context);
  const existingArtifacts = [
    ...asArray(input.existingArtifacts),
    ...(stitchedPdf.artifact ? [stitchedPdf.artifact] : []),
  ];
  const sourceGaps = [
    ...asArray(input.sourceGaps),
    ...asArray(stitchedPdf.sourceGaps),
  ];

  return buildArtifactPackage({
    ...input,
    existingArtifacts,
    sourceGaps,
    producerVersions: {
      ...(input.producerVersions || {}),
      pdfStitchingService: PDF_STITCHING_SERVICE_VERSION,
      pdfStitchingStrategy: PDF_STITCHING_STRATEGY,
    },
  });
}

export default {
  ARTIFACT_PACKAGE_SCHEMA_VERSION,
  ARTIFACT_PACKAGE_SERVICE_VERSION,
  ARTIFACT_PACKAGE_FOLDERS,
  DWG_CONVERSION_UNAVAILABLE,
  IFC_EXPORT_UNAVAILABLE,
  PDF_STITCHING_FAILED,
  PDF_STITCHING_NO_INPUT_PDFS,
  PDF_STITCHING_UNAVAILABLE,
  buildArtifactPackage,
  buildArtifactPackageWithPdfStitching,
  buildDeterministicZip,
  hashBytes,
  listZipEntryNames,
};
