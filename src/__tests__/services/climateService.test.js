import {
  getClimateData,
  getDefaultClimate,
} from "../../services/climateService.js";

describe("climateService", () => {
  test("returns latitude defaults when API key is missing", async () => {
    const originalPublicKey = process.env.REACT_APP_OPENWEATHER_API_KEY;
    const originalServerKey = process.env.OPENWEATHER_API_KEY;
    delete process.env.REACT_APP_OPENWEATHER_API_KEY;
    delete process.env.OPENWEATHER_API_KEY;

    const climate = await getClimateData(53.6, -0.7);

    expect(climate.climate.zone).toBe("Cfb");
    expect(climate.design_recommendations.orientation).toContain("E-W");

    process.env.REACT_APP_OPENWEATHER_API_KEY = originalPublicKey;
    process.env.OPENWEATHER_API_KEY = originalServerKey;
  });

  test("builds a structured fallback climate payload", () => {
    const climate = getDefaultClimate(33.59, -7.61);

    expect(climate.location.lat).toBeCloseTo(33.59);
    expect(climate.climate.sun_path.summer_altitude).toBeGreaterThan(70);
    expect(climate.design_recommendations.shading).toBeTruthy();
  });
});
