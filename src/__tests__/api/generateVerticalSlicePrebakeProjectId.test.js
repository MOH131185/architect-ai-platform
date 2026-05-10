/**
 * Regression: prebaked artifact package must file storage under the wizard's
 * projectId, not the slice service's auto-generated one.
 *
 * Background: PR #123 introduced server-side prebake of the deliverables ZIP
 * during /api/project/generate-vertical-slice so Save Package becomes a tiny
 * compact-ref body (~100 B) instead of re-uploading the full design bundle.
 * The prebake helper called buildPackageInput({ ...payload, ...result, ... }),
 * and `result.projectId` (auto-generated from projectGraph.project_id) won
 * over `payload.projectId`. Save Package returned 200 but the panel's
 * history filter — querying with the wizard's projectId — returned empty
 * because the storage entry was filed under the slice's id.
 *
 * Fix: explicit `resolveWizardProjectId(payload, result)` override that
 * makes the wizard / design id authoritative.
 *
 * This test pins the precedence at the helper level so a future refactor
 * of the spread order can't silently re-introduce the bug.
 */

import { __verticalSlicePrebakeInternals } from "../../../api/project/generate-vertical-slice.js";

const { resolveWizardProjectId } = __verticalSlicePrebakeInternals;

describe("generate-vertical-slice prebake — wizard projectId precedence", () => {
  test("payload.projectId wins over result.projectId", () => {
    const payload = { projectId: "design_wizard_001" };
    const result = {
      projectId: "project-graph-auto-xyz",
      projectGraph: { project_id: "project-graph-auto-xyz" },
    };
    expect(resolveWizardProjectId(payload, result)).toBe("design_wizard_001");
  });

  test("payload.designId wins over result.projectGraph.project_id", () => {
    const payload = { designId: "design_via_designId" };
    const result = {
      projectGraph: { project_id: "project-graph-auto-xyz" },
    };
    expect(resolveWizardProjectId(payload, result)).toBe("design_via_designId");
  });

  test("payload.project_id (snake_case) wins over result", () => {
    const payload = { project_id: "design_snake_001" };
    const result = { projectId: "project-graph-auto-xyz" };
    expect(resolveWizardProjectId(payload, result)).toBe("design_snake_001");
  });

  test("payload.metadata.projectId wins over result", () => {
    const payload = { metadata: { projectId: "design_meta_001" } };
    const result = { projectId: "project-graph-auto-xyz" };
    expect(resolveWizardProjectId(payload, result)).toBe("design_meta_001");
  });

  test("falls through to result.projectId when payload has none", () => {
    const payload = {};
    const result = { projectId: "project-graph-auto-xyz" };
    expect(resolveWizardProjectId(payload, result)).toBe(
      "project-graph-auto-xyz",
    );
  });

  test("falls through to result.projectGraph.project_id when payload has none and no result.projectId", () => {
    const payload = {};
    const result = { projectGraph: { project_id: "project-graph-auto-xyz" } };
    expect(resolveWizardProjectId(payload, result)).toBe(
      "project-graph-auto-xyz",
    );
  });

  test("returns null when neither payload nor result has any projectId form", () => {
    expect(resolveWizardProjectId({}, {})).toBeNull();
    expect(resolveWizardProjectId(undefined, undefined)).toBeNull();
  });

  test("ignores empty-string ids in payload (treated as falsy)", () => {
    const payload = { projectId: "", designId: "" };
    const result = { projectId: "project-graph-auto-xyz" };
    expect(resolveWizardProjectId(payload, result)).toBe(
      "project-graph-auto-xyz",
    );
  });

  test("preserves precedence priority within payload (projectId > project_id > designId > metadata.projectId)", () => {
    expect(
      resolveWizardProjectId(
        {
          projectId: "a",
          project_id: "b",
          designId: "c",
          metadata: { projectId: "d" },
        },
        { projectId: "z" },
      ),
    ).toBe("a");

    expect(
      resolveWizardProjectId(
        { project_id: "b", designId: "c", metadata: { projectId: "d" } },
        { projectId: "z" },
      ),
    ).toBe("b");

    expect(
      resolveWizardProjectId(
        { designId: "c", metadata: { projectId: "d" } },
        { projectId: "z" },
      ),
    ).toBe("c");

    expect(
      resolveWizardProjectId(
        { metadata: { projectId: "d" } },
        { projectId: "z" },
      ),
    ).toBe("d");
  });
});
