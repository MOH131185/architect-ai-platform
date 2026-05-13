/**
 * Phase 3 export-fix — service-layer defence: exportService.exportSheet
 * must refuse to ship a sheet export (PNG / PDF / SVG) when the
 * final-A1 export QA gate flagged the print master as blocked. The UI
 * gate in ExportPanel disables the buttons; this assertion locks the
 * same contract at the programmatic boundary so callers downstream of
 * the panel (Save-Package races, automation scripts, regression
 * harnesses) hit the same error rather than producing a corrupt
 * print artifact.
 *
 * Engineering formats run their own readiness checks and are NOT
 * gated here.
 */

import exportService from "../../services/exportService.js";

function sheetWithQaStatus(status, extras = {}) {
  return {
    metadata: { designId: "d1", sheetType: "ARCH", versionId: "base" },
    geometryHash: "geom-1",
    artifacts: { a1Sheet: { svgString: "<svg/>" } },
    a1ExportQa:
      status === null
        ? null
        : {
            status,
            allowed: status !== "blocked",
            blockers:
              status === "blocked"
                ? [
                    {
                      code: "TEXT_TOO_SMALL",
                      message: "Title text below 2.2mm",
                    },
                    {
                      code: "HEADER_OVERLAP",
                      message: "Row 1 overlaps title bar",
                    },
                  ]
                : [],
            warnings: status === "warning" ? [{ code: "OCCUPANCY_LOW" }] : [],
          },
    ...extras,
  };
}

describe("exportService.exportSheet — A1 QA blocking (Phase 3)", () => {
  for (const fmt of ["PNG", "PDF", "SVG", "png", "pdf", "svg"]) {
    test(`refuses ${fmt} export when a1ExportQa.status === "blocked"`, async () => {
      const sheet = sheetWithQaStatus("blocked");
      await expect(
        exportService.exportSheet({ sheet, format: fmt }),
      ).rejects.toThrow(/A1 export blocked/);
    });
  }

  test("blocked-export error message includes the blocker count", async () => {
    const sheet = sheetWithQaStatus("blocked");
    await expect(
      exportService.exportSheet({ sheet, format: "PNG" }),
    ).rejects.toThrow(/2 blockers/);
  });

  test("warning status does NOT block (Phase 3 requirement)", async () => {
    const sheet = sheetWithQaStatus("warning");
    // PDF always routes server-side (see exportSheet's useServerExport
    // gate). Stubbing exportSheetServerSide proves the QA short-circuit
    // does not fire on "warning" and the call reaches the network path.
    const spy = jest
      .spyOn(exportService, "exportSheetServerSide")
      .mockResolvedValue({ success: true, format: "PDF", filename: "x.pdf" });
    try {
      const result = await exportService.exportSheet({ sheet, format: "PDF" });
      expect(result.success).toBe(true);
      expect(spy).toHaveBeenCalledTimes(1);
    } finally {
      spy.mockRestore();
    }
  });

  test("pass status does not block", async () => {
    const sheet = sheetWithQaStatus("pass");
    const spy = jest
      .spyOn(exportService, "exportSheetServerSide")
      .mockResolvedValue({ success: true, format: "PDF", filename: "x.pdf" });
    try {
      const result = await exportService.exportSheet({ sheet, format: "PDF" });
      expect(result.success).toBe(true);
    } finally {
      spy.mockRestore();
    }
  });

  test("missing a1ExportQa does not block (pre-Phase 3 designs stay compatible)", async () => {
    const sheet = sheetWithQaStatus(null);
    const spy = jest
      .spyOn(exportService, "exportSheetServerSide")
      .mockResolvedValue({ success: true, format: "PDF", filename: "x.pdf" });
    try {
      const result = await exportService.exportSheet({ sheet, format: "PDF" });
      expect(result.success).toBe(true);
    } finally {
      spy.mockRestore();
    }
  });

  test("blocked QA does NOT prevent engineering exports (DXF / IFC / JSON / XLSX)", async () => {
    // Engineering paths have their own readiness logic that does not
    // depend on the sheet-QA gate. The Phase 3 gate is scoped strictly
    // to PNG / PDF / SVG. Stubbing the DXF path proves the QA gate
    // didn't short-circuit before the engineering router.
    const sheet = sheetWithQaStatus("blocked");
    const spy = jest
      .spyOn(exportService, "exportCAD")
      .mockResolvedValue({ success: true, format: "DXF", filename: "x.dxf" });
    try {
      const result = await exportService.exportSheet({ sheet, format: "DXF" });
      expect(result.success).toBe(true);
      expect(spy).toHaveBeenCalledTimes(1);
    } finally {
      spy.mockRestore();
    }
  });
});
