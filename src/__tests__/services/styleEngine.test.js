import { buildStyleDNA } from "../../services/style/styleEngine.js";

describe("styleEngine", () => {
  test("builds Style DNA from portfolio and location context", async () => {
    const styleDNA = await buildStyleDNA({
      prompt: "contextual contemporary courtyard house",
      portfolioReferences: [
        {
          url: "https://example.com/portfolio-1.jpg",
          tags: ["brick", "courtyard", "contextual"],
          materials: ["brick", "timber"],
          style: "contemporary",
        },
        {
          url: "https://example.com/portfolio-2.jpg",
          tags: ["pitched roof", "masonry"],
          materials: ["brick"],
          style: "contextual",
        },
      ],
      location: {
        region: "UK",
        climate_zone: "marine-temperate",
      },
      technicalConstraints: ["pitched roof"],
      controlImages: ["https://example.com/control.png"],
    });

    expect(styleDNA.region).toBe("united_kingdom");
    expect(styleDNA.portfolio_influence.reference_count).toBe(2);
    expect(styleDNA.local_materials).toContain("brick");
    expect(styleDNA.conditioning.controlnet.enabled).toBe(true);
    expect(styleDNA.style_keywords).toContain("brick");
    expect(styleDNA.applied_rule_ids).toContain("uk-contextual-masonry");
  });
});
