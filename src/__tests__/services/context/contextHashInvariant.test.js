/**
 * Phase 1 amendment #6: enabling the context aggregator with metadata-only
 * provider responses MUST NOT change the compiled geometry hash. This pins the
 * "2D and 3D drawings share the same geometry hash" invariant before Phase 2
 * adds OS NGD footprints (which are also additive to non-hash fields).
 *
 * The test bypasses the full vertical slice and exercises only the steps that
 * feed into compileProject(), keeping the test cheap.
 */

import { enrichSiteContext } from "../../../services/context/contextAggregator.js";
import { __projectGraphVerticalSliceInternals } from "../../../services/project/projectGraphVerticalSliceService.js";

const {
  normalizeBrief,
  buildProgramme,
  buildSiteContext,
  buildClimatePack,
  buildLocalStylePack,
  buildProjectGeometryFromProgramme,
  syncProgrammeActuals,
  compileProject,
} = __projectGraphVerticalSliceInternals;

function metadataOnlyFetch() {
  // Returns empty-but-OK responses for every provider. This is the worst case
  // for "did anything change?" — providers report success with zero hits, so
  // every merge branch is exercised but no factual data is added.
  return jest.fn(async (url) => {
    if (typeof url !== "string") {
      return { ok: true, status: 200, json: async () => ({}) };
    }
    if (url.includes("dataset=conservation-area")) {
      return { ok: true, status: 200, json: async () => ({ entities: [] }) };
    }
    if (url.includes("dataset=listed-building")) {
      return { ok: true, status: 200, json: async () => ({ entities: [] }) };
    }
    if (url.includes("floodAreas")) {
      return { ok: true, status: 200, json: async () => ({ items: [] }) };
    }
    if (url.includes("overpass-api")) {
      return { ok: true, status: 200, json: async () => ({ elements: [] }) };
    }
    if (url.includes("api.os.uk")) {
      return { ok: true, status: 200, json: async () => ({ features: [] }) };
    }
    return { ok: true, status: 200, json: async () => ({}) };
  });
}

function buildHashFor(site, briefForFixture) {
  const programme = buildProgramme({
    brief: briefForFixture,
    programSpaces: [],
  });
  const climate = buildClimatePack(briefForFixture, site);
  const localStyle = buildLocalStylePack(briefForFixture, site, climate);
  const projectGeometry = buildProjectGeometryFromProgramme({
    brief: briefForFixture,
    site,
    programme,
    localStyle,
    climate,
  });
  const syncedProgramme = syncProgrammeActuals(programme, projectGeometry);
  const compiled = compileProject({
    projectGeometry,
    masterDNA: {
      projectName: briefForFixture.project_name,
      projectID: projectGeometry.project_id,
      styleDNA: projectGeometry.metadata.style_dna,
      rooms: syncedProgramme.spaces,
    },
    locationData: {
      address: briefForFixture.site_input?.address || "",
      coordinates: { lat: site.lat, lng: site.lon },
      climate: { type: climate.weather_source },
      localMaterials: localStyle.material_palette,
    },
  });
  return compiled.geometryHash;
}

describe("Phase 1 hash invariance: aggregator activation does not change geometryHash", () => {
  // Heavy enough we don't want a tight default timeout but light enough we
  // don't want the 7-minute slice budget either.
  jest.setTimeout(60000);

  test("metadata-only mock fetch yields the same compiled geometry hash as offline", async () => {
    const rawBrief = {
      project_name: "Hash Invariance Probe",
      building_type: "dwelling",
      site_input: {
        address: "1 Test Street, London",
        postcode: "N1 1AA",
        lat: 51.5416,
        lon: -0.1022,
      },
      target_gia_m2: 120,
      target_storeys: 2,
      client_goals: ["compact dwelling"],
      style_keywords: ["red brick", "contemporary"],
      sustainability_ambition: "low_energy",
    };
    const sitePolygon = [
      { lat: 51.54175, lng: -0.1024 },
      { lat: 51.54175, lng: -0.10195 },
      { lat: 51.54145, lng: -0.10195 },
      { lat: 51.54145, lng: -0.1024 },
    ];

    const brief = normalizeBrief(rawBrief);
    const deterministic = buildSiteContext({
      brief,
      sitePolygon,
      siteMetrics: { areaM2: 1040, orientationDeg: 8 },
      siteBoundarySanity: {
        boundaryAuthoritative: true,
        siteMetrics: { areaM2: 1040, orientationDeg: 8 },
      },
      mainEntry: null,
    });

    const offlineSite = await enrichSiteContext(deterministic, {});
    const enrichedSite = await enrichSiteContext(deterministic, {
      fetchImpl: metadataOnlyFetch(),
    });

    // Sanity: enriched run took the activated path, offline run did not.
    expect(
      enrichedSite.data_quality.find(
        (q) => q.code === "CONTEXT_PROVIDERS_OFFLINE",
      ),
    ).toBeUndefined();
    expect(
      offlineSite.data_quality.find(
        (q) => q.code === "CONTEXT_PROVIDERS_OFFLINE",
      ),
    ).toBeTruthy();

    const offlineHash = buildHashFor(offlineSite, brief);
    const enrichedHash = buildHashFor(enrichedSite, brief);

    expect(typeof offlineHash).toBe("string");
    expect(offlineHash.length).toBeGreaterThan(0);
    expect(enrichedHash).toBe(offlineHash);
  });
});
