/**
 * Phase 5 — DWG conversion adapter.
 *
 * Locks the structured failure contract the API endpoint depends on:
 *
 *   - resolveDwgConversionCapabilities → reports available:true only when
 *     enabled + provider configured + a path/secret backs the provider.
 *   - convertDxfToDwg throws DwgConversionUnavailableError when env is
 *     missing (API maps to 503 + DWG_CONVERSION_UNAVAILABLE).
 *   - convertDxfToDwg throws DwgConversionRuntimeError with
 *     DWG_CONVERTER_NOT_INSTALLED when spawn fires ENOENT.
 *   - convertDxfToDwg throws DwgConversionRuntimeError with
 *     DWG_CONVERTER_NON_ZERO_EXIT when binary exits non-zero.
 *   - convertDxfToDwg returns the produced .dwg bytes when the binary
 *     writes a valid file and exits 0.
 *
 * The spawn primitive is faked via `spawnFn` injection so tests don't
 * depend on the real ODA File Converter being installed in CI.
 */

import { EventEmitter } from "node:events";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  convertDxfToDwg,
  resolveDwgConversionCapabilities,
  DWG_CONVERSION_UNAVAILABLE,
  DWG_CONVERTER_NOT_INSTALLED,
  DWG_CONVERTER_NON_ZERO_EXIT,
  DwgConversionUnavailableError,
  DwgConversionRuntimeError,
} from "../../../services/cad/dwgConversionAdapter.js";

function makeChild() {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = () => {};
  return child;
}

// CRA/Jest's jsdom env does NOT expose Node's setImmediate. Use a
// portable defer() so the fakes work whether or not setImmediate is
// globally available. Codex's first Phase 5 blocker was a literal
// `setImmediate is not defined` here.
const defer =
  typeof setImmediate === "function" ? setImmediate : (fn) => setTimeout(fn, 0);

const SAMPLE_DXF = `0
SECTION
2
HEADER
0
ENDSEC
0
EOF
`;

describe("resolveDwgConversionCapabilities", () => {
  test("returns unavailable when DWG_CONVERSION_ENABLED unset", () => {
    const result = resolveDwgConversionCapabilities({});
    expect(result.available).toBe(false);
    expect(result.code).toBe(DWG_CONVERSION_UNAVAILABLE);
    expect(result.reason).toMatch(/disabled/i);
  });

  test("returns unavailable when provider is set but path is missing", () => {
    const result = resolveDwgConversionCapabilities({
      DWG_CONVERSION_ENABLED: "true",
      DWG_CONVERSION_PROVIDER: "oda",
    });
    expect(result.available).toBe(false);
    expect(result.reason).toMatch(/ODA converter/i);
  });

  test("returns available when provider + path are set", () => {
    const result = resolveDwgConversionCapabilities({
      DWG_CONVERSION_ENABLED: "true",
      DWG_CONVERSION_PROVIDER: "oda",
      ODA_FILE_CONVERTER_PATH: "/fake/oda/bin",
    });
    expect(result.available).toBe(true);
    expect(result.provider).toBe("oda");
    expect(result.odaPath).toBe("/fake/oda/bin");
    expect(result.code).toBeNull();
    expect(result.docsUrl).toMatch(/opendesign\.com/);
  });
});

describe("convertDxfToDwg — env-missing path", () => {
  test("env unset ⇒ throws DwgConversionUnavailableError", async () => {
    let thrown = null;
    try {
      await convertDxfToDwg({ dxf: SAMPLE_DXF, env: {} });
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(DwgConversionUnavailableError);
    expect(thrown.code).toBe(DWG_CONVERSION_UNAVAILABLE);
    expect(thrown.details.docsUrl).toMatch(/opendesign\.com/);
  });

  test("APS configured but not implemented ⇒ Unavailable with code DWG_CONVERSION_UNAVAILABLE", async () => {
    let thrown = null;
    try {
      await convertDxfToDwg({
        dxf: SAMPLE_DXF,
        env: {
          DWG_CONVERSION_ENABLED: "true",
          DWG_CONVERSION_PROVIDER: "aps",
          AUTODESK_APS_CLIENT_ID: "abc",
          AUTODESK_APS_CLIENT_SECRET: "xyz",
        },
      });
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(DwgConversionUnavailableError);
    expect(thrown.message).toMatch(/not yet implemented/i);
  });
});

describe("convertDxfToDwg — spawn injection", () => {
  test("ENOENT from spawn ⇒ DWG_CONVERTER_NOT_INSTALLED", async () => {
    const spawnFn = () => {
      const child = makeChild();
      defer(() => {
        const err = new Error("spawn ENOENT");
        err.code = "ENOENT";
        child.emit("error", err);
      });
      return child;
    };
    let thrown = null;
    try {
      await convertDxfToDwg({
        dxf: SAMPLE_DXF,
        env: {
          DWG_CONVERSION_ENABLED: "true",
          DWG_CONVERSION_PROVIDER: "oda",
          ODA_FILE_CONVERTER_PATH: "/nope/oda",
        },
        spawnFn,
      });
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(DwgConversionRuntimeError);
    expect(thrown.code).toBe(DWG_CONVERTER_NOT_INSTALLED);
  });

  test("non-zero exit ⇒ DWG_CONVERTER_NON_ZERO_EXIT with stderr captured", async () => {
    const spawnFn = () => {
      const child = makeChild();
      defer(() => {
        child.stderr.emit("data", "boom from oda\n");
        child.emit("exit", 2, null);
      });
      return child;
    };
    let thrown = null;
    try {
      await convertDxfToDwg({
        dxf: SAMPLE_DXF,
        env: {
          DWG_CONVERSION_ENABLED: "true",
          DWG_CONVERSION_PROVIDER: "oda",
          ODA_FILE_CONVERTER_PATH: "/fake/oda",
        },
        spawnFn,
      });
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(DwgConversionRuntimeError);
    expect(thrown.code).toBe(DWG_CONVERTER_NON_ZERO_EXIT);
    expect(thrown.details.exitCode).toBe(2);
    expect(thrown.details.stderr).toMatch(/boom from oda/);
  });

  test("happy path: spawn writes .dwg in outputDir and exits 0 ⇒ DWG bytes returned", async () => {
    let capturedArgs = null;
    const spawnFn = (cmd, args) => {
      capturedArgs = { cmd, args };
      const child = makeChild();
      const [inputDir, outputDir] = args;
      defer(async () => {
        const inputs = await fs.readdir(inputDir);
        const dxfName = inputs.find((f) => f.toLowerCase().endsWith(".dxf"));
        const dwgName = dxfName
          ? dxfName.replace(/\.dxf$/i, ".dwg")
          : "out.dwg";
        await fs.writeFile(
          path.join(outputDir, dwgName),
          Buffer.concat([Buffer.from("AC1027", "ascii"), Buffer.alloc(32, 0)]),
        );
        child.emit("exit", 0, null);
      });
      return child;
    };
    const result = await convertDxfToDwg({
      dxf: SAMPLE_DXF,
      outputName: "phase5-test.dwg",
      env: {
        DWG_CONVERSION_ENABLED: "true",
        DWG_CONVERSION_PROVIDER: "oda",
        ODA_FILE_CONVERTER_PATH: "/fake/oda",
      },
      spawnFn,
    });
    expect(result.ok).toBe(true);
    expect(Buffer.isBuffer(result.dwg)).toBe(true);
    expect(result.dwg.slice(0, 6).toString("ascii")).toBe("AC1027");
    expect(result.adapterVersion).toMatch(/dwg-conversion-adapter/);
    expect(capturedArgs.cmd).toBe("/fake/oda");
    expect(capturedArgs.args.length).toBe(7);
    expect(capturedArgs.args[2]).toBe("ACAD2018");
    expect(capturedArgs.args[3]).toBe("DWG");
  });
});
