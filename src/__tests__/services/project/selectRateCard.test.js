/**
 * Phase 3 (Track 5) — selectRateCard building-type matrix.
 *
 * Locks the resolver: every supported building-type slug maps to one of
 * the three v2 rate cards, and anything unrecognised falls back to
 * uk_residential_v2 + a RATE_CARD_FALLBACK warning. The mapper is
 * substring-based (e.g. "office_studio" matches commercial) so
 * compiled-project briefs that nest the typology as a suffix still
 * resolve.
 */

import { selectRateCard } from "../../../services/project/compiledProjectExportService.js";

describe("selectRateCard", () => {
  test("residential typologies → uk_residential_v2, no fallback warning", () => {
    for (const buildingType of [
      "residential",
      "house",
      "detached",
      "semi_detached",
      "terraced_house",
      "townhouse",
      "apartment",
      "flat",
      "dwelling",
      "single_dwelling",
      "residential_extension",
    ]) {
      const { card, key, fallbackWarning } = selectRateCard(buildingType);
      expect(card.id).toBe("uk_residential_v2");
      expect(key).toBe("residential");
      expect(fallbackWarning).toBeNull();
    }
  });

  test("commercial typologies → uk_commercial_v1, no fallback warning", () => {
    for (const buildingType of [
      "office",
      "office_studio",
      "retail",
      "hospitality",
      "commercial",
      "mixed_use",
      "workplace_hub",
    ]) {
      const { card, key, fallbackWarning } = selectRateCard(buildingType);
      expect(card.id).toBe("uk_commercial_v1");
      expect(key).toBe("commercial");
      expect(fallbackWarning).toBeNull();
    }
  });

  test("education typologies → uk_education_v1, no fallback warning", () => {
    for (const buildingType of [
      "school",
      "primary_school",
      "secondary_school",
      "university",
      "education",
      "college",
      "academy",
      "nursery",
    ]) {
      const { card, key, fallbackWarning } = selectRateCard(buildingType);
      expect(card.id).toBe("uk_education_v1");
      expect(key).toBe("education");
      expect(fallbackWarning).toBeNull();
    }
  });

  test("unrecognised types fall back to uk_residential_v2 with a RATE_CARD_FALLBACK warning", () => {
    for (const buildingType of [
      "factory",
      "warehouse",
      "data_center",
      "amusement_park",
      "leisure_centre",
      "industrial_plant",
      "ferry_terminal",
      "",
      null,
      undefined,
    ]) {
      const { card, key, fallbackWarning } = selectRateCard(buildingType);
      expect(card.id).toBe("uk_residential_v2");
      expect(key).toBe("residential");
      expect(fallbackWarning).not.toBeNull();
      expect(fallbackWarning.code).toBe("RATE_CARD_FALLBACK");
      expect(fallbackWarning.message).toContain("uk_residential_v2");
    }
  });

  test("returned card always has confidenceWidths for the bucket categories", () => {
    for (const buildingType of ["residential", "office", "school", "factory"]) {
      const { card, key } = selectRateCard(buildingType);
      const widths = card.buildingTypes?.[key]?.confidenceWidths;
      expect(widths).toBeTruthy();
      expect(typeof widths.areas?.low).toBe("number");
      expect(typeof widths.areas?.high).toBe("number");
      expect(widths.areas.low).toBeLessThan(widths.areas.high);
    }
  });

  test("returned card always has a contingency policy", () => {
    for (const buildingType of ["residential", "office", "school"]) {
      const { card } = selectRateCard(buildingType);
      expect(card.contingency).toBeTruthy();
      expect(typeof card.contingency.defaultPercent).toBe("number");
      expect(card.contingency.defaultPercent).toBeGreaterThan(0);
      expect(card.contingency.defaultPercent).toBeLessThan(50);
    }
  });
});
