import {
  planRepair,
  runWithRepair,
  HARD_BLOCKER_CODES,
} from "../../../services/design/repairLoop.js";
import { buildArchitectureProjectVerticalSliceWithRepair } from "../../../services/project/projectGraphVerticalSliceService.js";

describe("planRepair", () => {
  test("returns null when there are no issues", () => {
    expect(planRepair({ issues: [] }, {})).toBeNull();
  });

  test("returns hard_blocker_no_repair for hash mismatch", () => {
    const plan = planRepair(
      {
        issues: [{ code: "SOURCE_MODEL_HASH_MISMATCH_2D", severity: "error" }],
      },
      { brief: { target_storeys: 2 } },
    );
    expect(plan?.strategy).toBe("hard_blocker_no_repair");
    expect(plan?.mutatedInput).toBeNull();
  });

  test("adds a storey when GIA shortfall is severe and storeys < 4", () => {
    const plan = planRepair(
      {
        issues: [
          {
            code: "PROGRAMME_AREA_OUTSIDE_TOLERANCE",
            severity: "error",
            details: { targetGia: 320, actualGia: 200 },
          },
        ],
      },
      { brief: { target_storeys: 2, target_gia_m2: 320 } },
    );
    expect(plan?.strategy).toMatch(/scale_storey_count/);
    expect(plan?.mutatedInput?.brief?.target_storeys).toBe(3);
    expect(plan?.mutatedInput?._repairReason).toMatch(/storey/i);
  });

  test("drops a storey when GIA is severely over target", () => {
    const plan = planRepair(
      {
        issues: [
          {
            code: "PROGRAMME_AREA_OUTSIDE_TOLERANCE",
            severity: "error",
            details: { targetGia: 320, actualGia: 480 },
          },
        ],
      },
      { brief: { target_storeys: 3, target_gia_m2: 320 } },
    );
    expect(plan?.mutatedInput?.brief?.target_storeys).toBe(2);
  });

  test("does not add a storey when already at the 4-storey ceiling", () => {
    const plan = planRepair(
      {
        issues: [
          {
            code: "PROGRAMME_AREA_OUTSIDE_TOLERANCE",
            severity: "error",
            details: { targetGia: 320, actualGia: 200 },
          },
        ],
      },
      { brief: { target_storeys: 4 } },
    );
    expect(plan).toBeNull();
  });

  test("HARD_BLOCKER_CODES enumerates the documented unrepairable issues", () => {
    expect(HARD_BLOCKER_CODES.has("SOURCE_MODEL_HASH_MISMATCH_2D")).toBe(true);
    expect(HARD_BLOCKER_CODES.has("A1_PDF_EXPORT_MISSING_OR_WRONG_SIZE")).toBe(
      true,
    );
    expect(HARD_BLOCKER_CODES.has("PROGRAMME_AREA_OUTSIDE_TOLERANCE")).toBe(
      false,
    );
  });
});

describe("runWithRepair", () => {
  test("returns first-success result with repair_attempts=1", async () => {
    const builder = jest.fn().mockResolvedValue({
      success: true,
      qa: { issues: [], totalScore: 100 },
    });
    const result = await runWithRepair(builder, { brief: {} });
    expect(result.success).toBe(true);
    expect(result.repair_attempts).toBe(1);
    expect(result.repair_history.length).toBe(1);
    expect(builder).toHaveBeenCalledTimes(1);
  });

  test("retries up to maxAttempts when failures are repairable", async () => {
    let call = 0;
    const builder = jest.fn().mockImplementation(async (input) => {
      call += 1;
      if (call < 3) {
        return {
          success: false,
          qa: {
            issues: [
              {
                code: "PROGRAMME_AREA_OUTSIDE_TOLERANCE",
                severity: "error",
                details: { targetGia: 320, actualGia: 200 },
              },
            ],
            totalScore: 60,
          },
        };
      }
      return {
        success: true,
        qa: { issues: [], totalScore: 100 },
        echoed_storeys: input.brief.target_storeys,
      };
    });
    const result = await runWithRepair(
      builder,
      { brief: { target_storeys: 1, target_gia_m2: 320 } },
      { maxAttempts: 3 },
    );
    expect(result.success).toBe(true);
    expect(result.repair_attempts).toBe(3);
    expect(builder).toHaveBeenCalledTimes(3);
    expect(result.echoed_storeys).toBe(3);
  });

  test("aborts immediately on a hard blocker", async () => {
    const builder = jest.fn().mockResolvedValue({
      success: false,
      qa: {
        issues: [{ code: "SOURCE_MODEL_HASH_MISMATCH_2D", severity: "error" }],
      },
    });
    const result = await runWithRepair(builder, { brief: {} });
    expect(builder).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(false);
    expect(result.repair_history[0].issueCodes).toContain(
      "SOURCE_MODEL_HASH_MISMATCH_2D",
    );
  });
});

describe("buildArchitectureProjectVerticalSliceWithRepair — integration", () => {
  beforeEach(() => {
    process.env.MODEL_SOURCE = "base";
    process.env.OPENAI_REASONING_MODEL = "gpt-5.4";
    process.env.OPENAI_FAST_MODEL = "gpt-5.4-mini";
  });

  test("Reading Room fixture passes on first attempt (no repair triggered)", async () => {
    const result = await buildArchitectureProjectVerticalSliceWithRepair({
      brief: {
        project_name: "Repair Loop Smoke",
        building_type: "community",
        site_input: { postcode: "N1 1AA", lat: 51.5416, lon: -0.1022 },
        target_gia_m2: 320,
        target_storeys: 2,
      },
    });
    expect(result.success).toBe(true);
    expect(result.repair_attempts).toBe(1);
    expect(result.repair_history[0].success).toBe(true);
  });
});
