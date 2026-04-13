import fs from "fs/promises";
import path from "path";
import {
  indexPrecedents,
  searchSimilarPrecedents,
} from "../../services/retrieval/precedentSearchService.js";

const TEST_INDEX_PATH = path.resolve(
  process.cwd(),
  "data/cache/test-precedent-index.json",
);

describe("precedentSearchService", () => {
  afterEach(async () => {
    try {
      await fs.unlink(TEST_INDEX_PATH);
    } catch {
      // ignore cleanup failures
    }
  });

  test("indexes precedents and returns similarity-ranked results", async () => {
    await indexPrecedents(
      [
        {
          id: "precedent-brick",
          title: "Brick Courtyard House",
          description:
            "Contextual residential scheme with masonry and sheltered courtyard.",
          building_type: "residential",
          climate: "marine-temperate",
          style: "contextual contemporary",
          semantic_labels: ["wall", "door", "courtyard"],
          object_counts: { wall: 12, door: 6 },
        },
        {
          id: "precedent-glass",
          title: "Glass Pavilion",
          description: "Minimal lightweight pavilion with curtain wall facade.",
          building_type: "cultural",
          climate: "temperate",
          style: "minimal",
          semantic_labels: ["glass", "column"],
          object_counts: { column: 4 },
        },
      ],
      {
        append: false,
        indexPath: TEST_INDEX_PATH,
      },
    );

    const result = await searchSimilarPrecedents({
      query: "brick courtyard residential house",
      filters: { building_type: "residential", required_classes: ["wall"] },
      limit: 1,
      indexPath: TEST_INDEX_PATH,
    });

    expect(result.success).toBe(true);
    expect(result.results).toHaveLength(1);
    expect(result.results[0].id).toBe("precedent-brick");
    expect(result.results[0].match_explanation).toContain(
      "building_type:residential",
    );
    expect(result.metadata.applied_filters.building_type).toBe("residential");
  });
});
