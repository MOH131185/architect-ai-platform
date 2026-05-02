import detectProjectTypeFromBrief, {
  __testing,
} from "../../utils/projectTypeAutoDetect.js";

describe("detectProjectTypeFromBrief", () => {
  test("returns null for empty input", () => {
    expect(detectProjectTypeFromBrief({})).toBeNull();
    expect(detectProjectTypeFromBrief({ customNotes: "   " })).toBeNull();
  });

  test("suggests a detached house from a clear residential brief", () => {
    const result = detectProjectTypeFromBrief({
      customNotes:
        "Modern detached family home for two adults and two children, with garden and detached garage",
    });
    expect(result).not.toBeNull();
    expect(result.category).toBe("residential");
    expect(result.subType).toBe("detached-house");
    expect(result.confidence).toBeGreaterThanOrEqual(0.5);
    expect(result.matchedKeywords).toEqual(
      expect.arrayContaining(["detached"]),
    );
  });

  test("suggests a villa for a villa brief", () => {
    const result = detectProjectTypeFromBrief({
      customNotes: "Coastal villa with infinity pool",
    });
    expect(result?.category).toBe("residential");
    expect(result?.subType).toBe("villa");
  });

  test("suggests an office for a coworking brief", () => {
    const result = detectProjectTypeFromBrief({
      customNotes: "Boutique co-working office for a small studio team",
    });
    expect(result?.category).toBe("commercial");
    expect(result?.subType).toBe("office");
  });

  test("suggests a clinic for a medical-centre brief", () => {
    const result = detectProjectTypeFromBrief({
      customNotes: "Small medical centre with two consultation rooms",
    });
    expect(result?.category).toBe("healthcare");
    expect(result?.subType).toBe("clinic");
  });

  test("suggests a school for a primary-school brief", () => {
    const result = detectProjectTypeFromBrief({
      customNotes: "Primary school for 120 pupils with a small playground",
    });
    expect(result?.category).toBe("education");
    expect(result?.subType).toBe("school");
  });

  test("suggests a warehouse for a logistics brief", () => {
    const result = detectProjectTypeFromBrief({
      customNotes:
        "Industrial warehouse for last-mile logistics with high-bay storage",
    });
    expect(result?.category).toBe("industrial");
    expect(result?.subType).toBe("warehouse");
  });

  test("suggests a church for a chapel brief", () => {
    const result = detectProjectTypeFromBrief({
      customNotes: "Small countryside church with a bell tower",
    });
    expect(result?.category).toBe("religious");
    expect(result?.subType).toBe("church");
  });

  test("returns null when the brief is genuinely ambiguous between two types", () => {
    const result = detectProjectTypeFromBrief({
      customNotes: "office hotel mixed-use plot",
    });
    // Office and hotel both score 1.0, no disambiguation possible
    expect(result).toBeNull();
  });

  test("suggests a shopping mall now that it is BETA-enabled", () => {
    const result = detectProjectTypeFromBrief({
      customNotes: "Shopping mall with food court and underground parking",
    });
    expect(result?.category).toBe("commercial");
    expect(result?.subType).toBe("shopping-mall");
  });

  test("suggests kindergarten for a nursery brief", () => {
    const result = detectProjectTypeFromBrief({
      customNotes: "Small kindergarten for 60 children with outdoor play area",
    });
    expect(result?.category).toBe("education");
    expect(result?.subType).toBe("kindergarten");
  });

  test("suggests dental for a dentist brief", () => {
    const result = detectProjectTypeFromBrief({
      customNotes: "Modern dentist surgery with three treatment rooms",
    });
    expect(result?.category).toBe("healthcare");
    expect(result?.subType).toBe("dental");
  });

  test("returns null for an unrelated brief", () => {
    const result = detectProjectTypeFromBrief({
      customNotes: "the quick brown fox jumps over the lazy dog",
    });
    expect(result).toBeNull();
  });

  test("merges title, description, and customNotes when classifying", () => {
    const result = detectProjectTypeFromBrief({
      title: "Family Home",
      description: "Detached two-storey",
      customNotes: "with a garden",
    });
    expect(result?.category).toBe("residential");
    expect(result?.subType).toBe("detached-house");
  });

  test("normaliseText handles punctuation and case", () => {
    expect(__testing.normaliseText("Co-Working OFFICE!")).toBe(
      "co-working office",
    );
  });

  test("containsKeyword matches plurals", () => {
    expect(__testing.containsKeyword("two offices opening", "office")).toBe(
      true,
    );
    expect(__testing.containsKeyword("a single villa estate", "villa")).toBe(
      true,
    );
  });

  test("containsKeyword does not match across word boundaries", () => {
    expect(__testing.containsKeyword("portfolio website", "portfolio")).toBe(
      true,
    );
    // "office" should NOT match "officer"
    expect(__testing.containsKeyword("a senior officer", "office")).toBe(false);
  });
});
