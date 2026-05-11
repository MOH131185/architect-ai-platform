import {
  PROJECT_TYPE_ROUTES,
  getProjectTypeSupport,
} from "../../services/project/projectTypeSupportRegistry.js";
import { generateResidentialProgramBrief } from "../../services/project/residentialProgramEngine.js";
import { generateDeterministicProgramSpaces } from "../../services/project/programmeSpaceGenerator.js";
import { runProgramPreflight } from "../../services/project/programPreflight.js";

const supportedCases = [
  ["office", "commercial", "office", 1200, 3],
  ["clinic", "healthcare", "clinic", 900, 2],
  ["education", "education", "school", 1800, 2],
  ["retail", "commercial", "retail", 800, 1],
  ["hospitality", "hospitality", "hotel", 2600, 4],
  ["industrial", "industrial", "warehouse", 2200, 1],
];

function expectValidProgramme(spaces, projectDetails, floorCount) {
  expect(spaces.length).toBeGreaterThan(3);
  spaces.forEach((space) => {
    expect(space.name).toEqual(expect.any(String));
    expect(space.area).toBeGreaterThan(0);
    expect(Number.isFinite(Number(space.levelIndex))).toBe(true);
    expect(space.levelIndex).toBeGreaterThanOrEqual(0);
    expect(space.levelIndex).toBeLessThan(floorCount);
    expect(space.type || space.spaceType || space.category).toBeTruthy();
  });
  const preflight = runProgramPreflight({
    projectDetails,
    programSpaces: spaces,
    floorCount,
  });
  expect(preflight.ok).toBe(true);
}

describe("programmeSpaceGenerator", () => {
  test.each(supportedCases)(
    "generates supported %s programme spaces with floor assignments",
    (_label, category, subType, area, floorCount) => {
      const support = getProjectTypeSupport(category, subType);
      expect(support).toEqual(
        expect.objectContaining({
          enabledInUi: true,
          route: PROJECT_TYPE_ROUTES.PROJECT_GRAPH,
        }),
      );
      const projectDetails = {
        category,
        subType,
        area,
        floorCount,
        floorCountLocked: true,
      };
      const result = generateDeterministicProgramSpaces({
        projectDetails,
        projectTypeSupport: support,
        floorCount,
        targetAreaM2: area,
      });

      expect(result.source).toBe("deterministic_project_graph_template");
      expectValidProgramme(result.spaces, projectDetails, floorCount);
    },
  );

  test("unsupported/disabled project type fails clearly", () => {
    expect(() =>
      generateDeterministicProgramSpaces({
        projectDetails: {
          category: "commercial",
          subType: "casino",
          area: 1000,
        },
        floorCount: 2,
      }),
    ).toThrow(/not enabled|Experimental\/off/i);
  });

  test("residential still uses deterministic Residential V2", () => {
    const support = getProjectTypeSupport("residential", "detached-house");
    expect(support.route).toBe(PROJECT_TYPE_ROUTES.RESIDENTIAL_V2);

    const brief = generateResidentialProgramBrief({
      subType: "detached-house",
      totalAreaM2: 180,
      levelCountOverride: 2,
    });

    expect(brief.schema_version).toBe("program-brief-v1");
    expect(brief.spaces.length).toBeGreaterThan(0);
    expect(brief.spaces[0]).toHaveProperty("name");
  });
});
