/**
 * DWG conversion adapter — Phase 5 (Track 4).
 *
 * Wraps a real spawn of the ODA File Converter binary so the server can emit
 * a DWG alongside the deterministic DXF + IFC + GLB output. When the binary
 * is missing or the conversion fails, the adapter returns a structured
 * error so the API can emit a clean 503 with a documented reason instead
 * of a generic 500.
 *
 * Authority model: DXF remains the deterministic CAD authority. DWG is a
 * convenience export that depends on a third-party converter on the host.
 * The adapter never tries to invent a DWG when the converter is missing —
 * the artifact ZIP packs a `DWG_UNAVAILABLE.txt` instead.
 *
 *   ENV REQUIRED
 *   ────────────
 *   DWG_CONVERSION_ENABLED=true
 *   DWG_CONVERSION_PROVIDER=oda   (or local_oda — both spawn the same binary)
 *   ODA_FILE_CONVERTER_PATH=/full/path/to/ODAFileConverter(.exe)
 *
 *   STRUCTURED ERROR CODES
 *   ───────────────────────
 *   DWG_CONVERSION_UNAVAILABLE       (env not configured at all)
 *   DWG_CONVERTER_NOT_INSTALLED      (configured path but spawn ENOENT)
 *   DWG_CONVERTER_NON_ZERO_EXIT      (binary ran but reported failure)
 *   DWG_CONVERTER_TIMEOUT            (binary exceeded `timeoutMs`)
 *   DWG_CONVERSION_OUTPUT_MISSING    (binary exited 0 but no .dwg produced)
 *
 * Tests live in src/__tests__/services/cad/dwgConversionAdapter.test.js.
 */

import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

export const DWG_CONVERSION_ADAPTER_VERSION = "dwg-conversion-adapter-v2";
export const DWG_CONVERSION_UNAVAILABLE = "DWG_CONVERSION_UNAVAILABLE";
export const DWG_CONVERTER_NOT_INSTALLED = "DWG_CONVERTER_NOT_INSTALLED";
export const DWG_CONVERTER_NON_ZERO_EXIT = "DWG_CONVERTER_NON_ZERO_EXIT";
export const DWG_CONVERTER_TIMEOUT = "DWG_CONVERTER_TIMEOUT";
export const DWG_CONVERSION_OUTPUT_MISSING = "DWG_CONVERSION_OUTPUT_MISSING";
export const DWG_CONVERTER_DOCS_URL =
  "https://www.opendesign.com/guestfiles/oda_file_converter";

const DEFAULT_TIMEOUT_MS = 60_000;
const SUPPORTED_PROVIDERS = Object.freeze(["oda", "aps", "local_oda"]);

function defaultEnv() {
  return typeof process !== "undefined" && process.env ? process.env : {};
}

function normalizeEnv(env) {
  if (!env || typeof env !== "object" || Array.isArray(env)) {
    return {};
  }
  return env;
}

export class DwgConversionUnavailableError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "DwgConversionUnavailableError";
    this.code = details?.code || DWG_CONVERSION_UNAVAILABLE;
    this.details = details;
  }
}

export class DwgConversionRuntimeError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "DwgConversionRuntimeError";
    this.code = details?.code || DWG_CONVERTER_NON_ZERO_EXIT;
    this.details = details;
  }
}

export function resolveDwgConversionCapabilities(env = defaultEnv()) {
  const source = normalizeEnv(env);
  const provider = String(
    source.DWG_CONVERSION_PROVIDER ||
      source.REACT_APP_DWG_CONVERSION_PROVIDER ||
      "",
  )
    .trim()
    .toLowerCase();
  const enabled =
    source.DWG_CONVERSION_ENABLED === "true" ||
    source.REACT_APP_DWG_CONVERSION_ENABLED === "true";
  const hasProvider = SUPPORTED_PROVIDERS.includes(provider);
  const odaPath =
    source.ODA_FILE_CONVERTER_PATH ||
    source.ODA_SDK_PATH ||
    source.REACT_APP_ODA_FILE_CONVERTER_PATH ||
    "";
  const hasOdaPath = Boolean(odaPath);
  const hasApsConfig = Boolean(
    source.AUTODESK_APS_CLIENT_ID && source.AUTODESK_APS_CLIENT_SECRET,
  );
  // Codex Phase 5 audit blocker #5 — honesty: APS reaches the throw in
  // convertDxfToDwg ("not yet implemented") even when the env is fully
  // configured. Reporting available:true would mis-signal readiness to
  // the export manifest and the client ExportPanel. Mark APS as NOT
  // available until the APS provider lands; ODA / local_oda are the only
  // implemented providers right now.
  const providerImplemented = provider === "oda" || provider === "local_oda";
  // APS is intentionally reported configured=false even when its
  // credentials are present (still says "provider=aps" so the reason
  // string can explain why).
  const providerConfigured = providerImplemented && hasOdaPath;
  const configured = enabled && hasProvider && providerConfigured;

  let reason = null;
  if (!configured) {
    if (!enabled) {
      reason = "DWG conversion is disabled. DXF is the guaranteed CAD output.";
    } else if (!hasProvider) {
      reason =
        "DWG_CONVERSION_PROVIDER must be one of oda or local_oda (aps is not yet implemented).";
    } else if (provider === "aps") {
      reason =
        "Autodesk APS provider is not yet implemented. Use DWG_CONVERSION_PROVIDER=oda with ODA_FILE_CONVERTER_PATH for now.";
    } else {
      reason = "ODA converter or SDK path is missing.";
    }
  }

  return {
    adapterVersion: DWG_CONVERSION_ADAPTER_VERSION,
    code: configured ? null : DWG_CONVERSION_UNAVAILABLE,
    available: configured,
    enabled,
    provider: hasProvider ? provider : null,
    providerImplemented,
    odaPath: hasOdaPath ? odaPath : null,
    supportedProviders: [...SUPPORTED_PROVIDERS],
    implementedProviders: ["oda", "local_oda"],
    docsUrl: DWG_CONVERTER_DOCS_URL,
    reason,
    // hasApsConfig is preserved for diagnostics, so callers can render
    // "credentials present but provider not implemented" if they want.
    hasApsConfig,
  };
}

function runOdaConverter({
  binaryPath,
  inputDir,
  outputDir,
  outputVersion = "ACAD2018",
  outputFormat = "DWG",
  recurse = "0",
  audit = "1",
  filter = "*.dxf",
  timeoutMs = DEFAULT_TIMEOUT_MS,
  spawnFn = spawn,
}) {
  // ODA File Converter argv shape (positional, no flags):
  //   inputDir outputDir version format recurse audit filter
  // See https://www.opendesign.com/guestfiles/oda_file_converter (CLI usage).
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawnFn(binaryPath, [
        inputDir,
        outputDir,
        outputVersion,
        outputFormat,
        recurse,
        audit,
        filter,
      ]);
    } catch (err) {
      // spawn can throw synchronously when the binary path is malformed.
      const code =
        err?.code === "ENOENT"
          ? DWG_CONVERTER_NOT_INSTALLED
          : DWG_CONVERTER_NON_ZERO_EXIT;
      reject(
        new DwgConversionRuntimeError(
          err?.message || "ODA File Converter failed to launch",
          { code, cause: err },
        ),
      );
      return;
    }

    let stderr = "";
    let stdout = "";
    let killedByTimeout = false;

    const timer = setTimeout(() => {
      killedByTimeout = true;
      try {
        child.kill();
      } catch {
        // best-effort: even if kill throws we still emit the timeout error
      }
    }, timeoutMs);

    if (child.stderr && child.stderr.on) {
      child.stderr.on("data", (chunk) => {
        stderr += String(chunk);
      });
    }
    if (child.stdout && child.stdout.on) {
      child.stdout.on("data", (chunk) => {
        stdout += String(chunk);
      });
    }
    child.on("error", (err) => {
      clearTimeout(timer);
      const code =
        err?.code === "ENOENT"
          ? DWG_CONVERTER_NOT_INSTALLED
          : DWG_CONVERTER_NON_ZERO_EXIT;
      reject(
        new DwgConversionRuntimeError(
          err?.message || "ODA File Converter spawn error",
          { code, cause: err, stdout, stderr },
        ),
      );
    });
    child.on("exit", (exitCode, signal) => {
      clearTimeout(timer);
      if (killedByTimeout) {
        reject(
          new DwgConversionRuntimeError(
            `ODA File Converter timed out after ${timeoutMs} ms`,
            { code: DWG_CONVERTER_TIMEOUT, exitCode, signal, stdout, stderr },
          ),
        );
        return;
      }
      if (exitCode === 0) {
        resolve({ exitCode, signal, stdout, stderr });
        return;
      }
      reject(
        new DwgConversionRuntimeError(
          `ODA File Converter exited with code ${exitCode}${signal ? ` (signal ${signal})` : ""}`,
          {
            code: DWG_CONVERTER_NON_ZERO_EXIT,
            exitCode,
            signal,
            stdout,
            stderr,
          },
        ),
      );
    });
  });
}

async function makeWorkingDirs() {
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "architect-ai-dwg-"));
  const inputDir = path.join(tmpRoot, "in");
  const outputDir = path.join(tmpRoot, "out");
  await fs.mkdir(inputDir, { recursive: true });
  await fs.mkdir(outputDir, { recursive: true });
  return { tmpRoot, inputDir, outputDir };
}

async function cleanupWorkingDirs(tmpRoot) {
  try {
    await fs.rm(tmpRoot, { recursive: true, force: true });
  } catch {
    // cleanup failure is non-fatal; the OS will reap /tmp eventually
  }
}

/**
 * Convert a DXF string into DWG bytes via ODA File Converter.
 *
 * @param {object} input
 * @param {string} input.dxf                  - DXF text content.
 * @param {string} [input.outputName]         - basename for the temp DXF.
 * @param {string} [input.outputVersion]      - ODA "ACAD2018" / "ACAD2013" / etc.
 * @param {number} [input.timeoutMs]
 * @param {object} [input.env]                - env override for tests.
 * @param {(cmd:string, args:string[])=>any} [input.spawnFn] - test injection.
 * @returns {Promise<{
 *   ok: true,
 *   dwg: Buffer,
 *   adapterVersion: string,
 *   stdout: string,
 *   stderr: string,
 *   inputBytes: number,
 *   outputBytes: number,
 *   tmpRoot: string,
 * }>}
 *
 * Throws DwgConversionUnavailableError when env is missing (caller maps to
 * 503 + DWG_CONVERSION_UNAVAILABLE / DWG_CONVERTER_NOT_INSTALLED) and
 * DwgConversionRuntimeError for runtime failures.
 */
export async function convertDxfToDwg({
  dxf,
  outputName = "architect-ai-output.dwg",
  outputVersion = "ACAD2018",
  timeoutMs = DEFAULT_TIMEOUT_MS,
  env = defaultEnv(),
  spawnFn,
} = {}) {
  if (!dxf || typeof dxf !== "string") {
    throw new Error("DXF content is required for DWG conversion.");
  }

  const capabilities = resolveDwgConversionCapabilities(env);
  if (!capabilities.available) {
    throw new DwgConversionUnavailableError(capabilities.reason, {
      ...capabilities,
      code: DWG_CONVERSION_UNAVAILABLE,
    });
  }

  // We only implement the ODA path here; APS is reserved for a follow-up.
  if (
    capabilities.provider !== "oda" &&
    capabilities.provider !== "local_oda"
  ) {
    throw new DwgConversionUnavailableError(
      `DWG provider "${capabilities.provider}" is not yet implemented; configure DWG_CONVERSION_PROVIDER=oda.`,
      { ...capabilities, code: DWG_CONVERSION_UNAVAILABLE },
    );
  }

  const dwgBasename = path
    .basename(outputName || "architect-ai-output.dwg")
    .replace(/\.dwg$/i, "");
  const dxfFilename = `${dwgBasename}.dxf`;
  const dwgFilename = `${dwgBasename}.dwg`;

  const { tmpRoot, inputDir, outputDir } = await makeWorkingDirs();
  const inputPath = path.join(inputDir, dxfFilename);
  const outputPath = path.join(outputDir, dwgFilename);
  await fs.writeFile(inputPath, dxf, "utf8");
  const inputBytes = Buffer.byteLength(dxf, "utf8");

  try {
    const runResult = await runOdaConverter({
      binaryPath: capabilities.odaPath,
      inputDir,
      outputDir,
      outputVersion,
      outputFormat: "DWG",
      timeoutMs,
      spawnFn,
    });
    let dwgBytes;
    try {
      dwgBytes = await fs.readFile(outputPath);
    } catch (err) {
      throw new DwgConversionRuntimeError(
        `ODA File Converter reported success but ${dwgFilename} was not written.`,
        {
          code: DWG_CONVERSION_OUTPUT_MISSING,
          cause: err,
          stdout: runResult.stdout,
          stderr: runResult.stderr,
          outputDir,
          dwgFilename,
        },
      );
    }
    return {
      ok: true,
      dwg: dwgBytes,
      adapterVersion: DWG_CONVERSION_ADAPTER_VERSION,
      stdout: runResult.stdout,
      stderr: runResult.stderr,
      inputBytes,
      outputBytes: dwgBytes.length,
      tmpRoot,
    };
  } finally {
    await cleanupWorkingDirs(tmpRoot);
  }
}

export default {
  DWG_CONVERSION_ADAPTER_VERSION,
  DWG_CONVERSION_UNAVAILABLE,
  DWG_CONVERTER_NOT_INSTALLED,
  DWG_CONVERTER_NON_ZERO_EXIT,
  DWG_CONVERTER_TIMEOUT,
  DWG_CONVERSION_OUTPUT_MISSING,
  DWG_CONVERTER_DOCS_URL,
  DwgConversionUnavailableError,
  DwgConversionRuntimeError,
  resolveDwgConversionCapabilities,
  convertDxfToDwg,
};
