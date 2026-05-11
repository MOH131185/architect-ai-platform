/**
 * IFC export must never fall back to a hand-rolled fake stub when the
 * compiled project is missing. Previously exportBIM would write a
 * fabricated ISO-10303-21 blob in this case; that path has been removed.
 */

import exportService from "../../services/exportService.js";

const ORIGINAL_FETCH = global.fetch;
const ORIGINAL_CREATE_URL = URL.createObjectURL;
const ORIGINAL_REVOKE_URL = URL.revokeObjectURL;
const ORIGINAL_ANCHOR_CLICK = HTMLAnchorElement.prototype.click;

beforeEach(() => {
  URL.createObjectURL = jest.fn(() => "blob:fake");
  URL.revokeObjectURL = jest.fn();
  HTMLAnchorElement.prototype.click = jest.fn();
});

afterEach(() => {
  global.fetch = ORIGINAL_FETCH;
  URL.createObjectURL = ORIGINAL_CREATE_URL;
  URL.revokeObjectURL = ORIGINAL_REVOKE_URL;
  HTMLAnchorElement.prototype.click = ORIGINAL_ANCHOR_CLICK;
  jest.restoreAllMocks();
});

describe("exportService.exportBIM — fake-IFC fallback removed", () => {
  test("throws a clear error when compiledProject is missing", async () => {
    global.fetch = jest.fn(); // must not be called

    await expect(
      exportService.exportBIM({
        sheet: { metadata: { designId: "d", sheetId: "s" } },
        format: "IFC",
      }),
    ).rejects.toThrow(/compiled project with geometryHash/i);

    expect(global.fetch).not.toHaveBeenCalled();
    expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  test("throws a clear error when compiledProject is present but has no geometryHash", async () => {
    global.fetch = jest.fn();

    await expect(
      exportService.exportBIM({
        sheet: {
          metadata: { designId: "d", sheetId: "s" },
          compiledProject: {
            /* no geometryHash */
          },
        },
        format: "IFC",
      }),
    ).rejects.toThrow(/compiled project with geometryHash/i);

    expect(global.fetch).not.toHaveBeenCalled();
    expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled();
  });

  test("posts to /api/project/export/ifc when a real compiledProject.geometryHash is present", async () => {
    const ifcBytes = new Blob(["ISO-10303-21;\nHEADER;"], {
      type: "application/octet-stream",
    });
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => null },
      blob: jest.fn().mockResolvedValue(ifcBytes),
    });

    const result = await exportService.exportBIM({
      sheet: {
        metadata: { designId: "d", sheetId: "s" },
        compiledProject: { geometryHash: "geom-hash-real" },
      },
      format: "IFC",
    });

    expect(global.fetch).toHaveBeenCalledWith(
      "/api/project/export/ifc",
      expect.objectContaining({ method: "POST" }),
    );
    expect(result.format).toBe("IFC");
  });

  test("rejects RVT regardless of compiledProject state", async () => {
    global.fetch = jest.fn();

    await expect(
      exportService.exportBIM({
        sheet: {
          compiledProject: { geometryHash: "geom-hash-real" },
        },
        format: "RVT",
      }),
    ).rejects.toThrow(/RVT export is experimental/i);
  });
});
