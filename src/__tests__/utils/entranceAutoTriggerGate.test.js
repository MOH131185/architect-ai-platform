import shouldAutoTriggerEntranceDetection from "../../utils/entranceAutoTriggerGate.js";

const validPolygon = [
  { lat: 52.49, lng: -1.88 },
  { lat: 52.49, lng: -1.879 },
  { lat: 52.491, lng: -1.879 },
  { lat: 52.491, lng: -1.88 },
];

describe("shouldAutoTriggerEntranceDetection", () => {
  test("fires when polygon is ready and no detection has happened yet", () => {
    expect(
      shouldAutoTriggerEntranceDetection({
        sitePolygon: validPolygon,
        isDetectingEntrance: false,
        projectDetails: { entranceDirection: "N", entranceAutoDetected: false },
      }),
    ).toEqual({ shouldFire: true, reason: "ready" });
  });

  test("fires when entranceDirection is the empty default", () => {
    expect(
      shouldAutoTriggerEntranceDetection({
        sitePolygon: validPolygon,
        projectDetails: { entranceDirection: "", entranceAutoDetected: false },
      }).shouldFire,
    ).toBe(true);
  });

  test("holds when polygon is missing", () => {
    expect(
      shouldAutoTriggerEntranceDetection({
        sitePolygon: [],
        projectDetails: { entranceDirection: "N" },
      }),
    ).toEqual({ shouldFire: false, reason: "no_polygon", polygonLength: 0 });
  });

  test("holds when polygon has fewer than 3 vertices", () => {
    expect(
      shouldAutoTriggerEntranceDetection({
        sitePolygon: [
          { lat: 1, lng: 1 },
          { lat: 2, lng: 2 },
        ],
        projectDetails: { entranceDirection: "N" },
      }).shouldFire,
    ).toBe(false);
  });

  test("holds when detection is already in flight", () => {
    expect(
      shouldAutoTriggerEntranceDetection({
        sitePolygon: validPolygon,
        isDetectingEntrance: true,
        projectDetails: { entranceDirection: "N" },
      }),
    ).toEqual({ shouldFire: false, reason: "already_detecting" });
  });

  test("holds when an earlier auto-detect already recorded a result", () => {
    expect(
      shouldAutoTriggerEntranceDetection({
        sitePolygon: validPolygon,
        projectDetails: {
          entranceDirection: "S",
          entranceAutoDetected: true,
        },
      }),
    ).toEqual({ shouldFire: false, reason: "already_auto_detected" });
  });

  test("holds when the user has manually picked a non-default direction", () => {
    expect(
      shouldAutoTriggerEntranceDetection({
        sitePolygon: validPolygon,
        projectDetails: {
          entranceDirection: "SE",
          entranceAutoDetected: false,
        },
      }),
    ).toEqual({
      shouldFire: false,
      reason: "manual_direction_set",
      direction: "SE",
    });
  });

  test("guards against missing arguments without throwing", () => {
    expect(shouldAutoTriggerEntranceDetection()).toEqual({
      shouldFire: false,
      reason: "no_polygon",
      polygonLength: 0,
    });
  });
});
