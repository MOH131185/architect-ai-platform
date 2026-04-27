import SunCalc from "suncalc";

const RAD_TO_DEG = 180 / Math.PI;

const KEY_DATES = Object.freeze({
  summerSolstice: { month: 5, day: 21, label: "Summer solstice" },
  winterSolstice: { month: 11, day: 21, label: "Winter solstice" },
  springEquinox: { month: 2, day: 20, label: "Spring equinox" },
  autumnEquinox: { month: 8, day: 22, label: "Autumn equinox" },
});

function round(value, precision = 2) {
  const factor = 10 ** precision;
  return Math.round(Number(value) * factor) / factor;
}

function computeDayProfile(date, lat, lon) {
  const samples = [];
  let peak = { altitudeDeg: -90, azimuthDeg: 0, hour: null };
  for (let hour = 4; hour <= 21; hour += 1) {
    const sample = new Date(date);
    sample.setUTCHours(hour, 0, 0, 0);
    const pos = SunCalc.getPosition(sample, lat, lon);
    const altitudeDeg = pos.altitude * RAD_TO_DEG;
    // SunCalc azimuth: 0 = south, positive = west, negative = east. Convert to
    // compass-bearing convention (0 = north, 90 = east, 180 = south).
    const azimuthDeg = (pos.azimuth * RAD_TO_DEG + 180 + 360) % 360;
    if (altitudeDeg > peak.altitudeDeg) {
      peak = { altitudeDeg, azimuthDeg, hour };
    }
    samples.push({
      hour,
      altitudeDeg: round(altitudeDeg, 2),
      azimuthDeg: round(azimuthDeg, 2),
    });
  }
  return {
    samples,
    peak: {
      altitudeDeg: round(peak.altitudeDeg, 2),
      azimuthDeg: round(peak.azimuthDeg, 2),
      hour: peak.hour,
    },
  };
}

function buildKeyDate(dateInfo, year, lat, lon) {
  const date = new Date(Date.UTC(year, dateInfo.month, dateInfo.day, 12, 0, 0));
  const profile = computeDayProfile(date, lat, lon);
  const sunrise = SunCalc.getTimes(date, lat, lon).sunrise;
  const sunset = SunCalc.getTimes(date, lat, lon).sunset;
  const dayLengthHours =
    sunrise && sunset && !isNaN(sunrise.getTime()) && !isNaN(sunset.getTime())
      ? round((sunset - sunrise) / 3_600_000, 2)
      : null;
  return {
    label: dateInfo.label,
    iso_date: date.toISOString().slice(0, 10),
    peak: profile.peak,
    samples: profile.samples,
    day_length_hours: dayLengthHours,
  };
}

/**
 * computeSunPath: deterministic sun-path summary for a UK site.
 * Plan §6.3: climate must influence orientation, openings, shading.
 */
export function computeSunPath(lat, lon, { year = 2026 } = {}) {
  if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lon))) {
    throw new Error("computeSunPath requires finite lat/lon");
  }
  const numLat = Number(lat);
  const numLon = Number(lon);
  const summer = buildKeyDate(KEY_DATES.summerSolstice, year, numLat, numLon);
  const winter = buildKeyDate(KEY_DATES.winterSolstice, year, numLat, numLon);
  const spring = buildKeyDate(KEY_DATES.springEquinox, year, numLat, numLon);
  const autumn = buildKeyDate(KEY_DATES.autumnEquinox, year, numLat, numLon);

  const summerPeakAlt = summer.peak.altitudeDeg;
  const winterPeakAlt = winter.peak.altitudeDeg;
  const isNorthernHemisphere = numLat > 0;
  const recommendedFacing = isNorthernHemisphere ? "south" : "north";
  const recommendation = {
    primary_glazing_orientation: recommendedFacing,
    avoid_orientation: isNorthernHemisphere ? "west" : "east",
    summer_overheating_risk:
      summerPeakAlt > 55 ? "controlled-shading-required" : "moderate",
    winter_solar_gain_target:
      winterPeakAlt > 12 ? "passive-gain-feasible" : "passive-gain-marginal",
    rationale: [
      `Peak summer altitude ${summerPeakAlt}° at ${numLat}°N — high overhead sun favours external shading on ${recommendedFacing}-facing glass.`,
      `Peak winter altitude ${winterPeakAlt}° — orient occupied rooms to ${recommendedFacing} to capture low-angle gain.`,
      "Avoid uncontrolled west glazing to limit late-afternoon overheating risk.",
    ],
  };

  return {
    schema_version: "sun-path-v1",
    lat: round(numLat, 6),
    lon: round(numLon, 6),
    year,
    source: "suncalc-deterministic",
    summer_solstice: summer,
    winter_solstice: winter,
    spring_equinox: spring,
    autumn_equinox: autumn,
    recommendation,
  };
}

export default {
  computeSunPath,
};
