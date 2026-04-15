import logger from "../utils/logger.js";

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const climateCache = new Map();

function roundToTenth(value) {
  return Number(Number(value || 0).toFixed(1));
}

function createCacheKey(lat, lng) {
  return `${roundToTenth(lat)},${roundToTenth(lng)}`;
}

function degToRad(value) {
  return (value * Math.PI) / 180;
}

function radToDeg(value) {
  return (value * 180) / Math.PI;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function toCompass(degrees) {
  const directions = [
    "N",
    "NNE",
    "NE",
    "ENE",
    "E",
    "ESE",
    "SE",
    "SSE",
    "S",
    "SSW",
    "SW",
    "WSW",
    "W",
    "WNW",
    "NW",
    "NNW",
  ];
  return directions[Math.round((((degrees % 360) + 360) % 360) / 22.5) % 16];
}

function solarNoonAltitude(lat, declination) {
  const hourAngle = 0;
  const altitude = Math.asin(
    Math.sin(degToRad(lat)) * Math.sin(degToRad(declination)) +
      Math.cos(degToRad(lat)) *
        Math.cos(degToRad(declination)) *
        Math.cos(degToRad(hourAngle)),
  );
  return Math.round(radToDeg(altitude));
}

function sunriseAzimuth(lat, declination) {
  const latitude = degToRad(lat);
  const declinationRad = degToRad(declination);
  const cosAzimuth =
    Math.sin(declinationRad) / Math.max(Math.cos(latitude), 0.0001);
  const azimuthFromNorth = Math.acos(clamp(cosAzimuth, -1, 1));
  return Math.round(radToDeg(azimuthFromNorth));
}

function getKoppenZone(lat, lng) {
  const absLat = Math.abs(lat);

  if (absLat < 15) return "Aw";
  if (absLat < 23.5) return lng >= -20 && lng <= 55 ? "BSh" : "Aw";
  if (absLat < 35) return lng >= -10 && lng <= 45 ? "Csa" : "BSh";
  if (absLat < 45) return lng >= -15 && lng <= 40 ? "Csa" : "Cfa";
  if (absLat < 60) return "Cfb";
  if (absLat < 70) return "Dfb";
  return "ET";
}

function getZoneDefaults(zone) {
  switch (zone) {
    case "Aw":
      return { summer: 32, winter: 23, rainfall: 1100, humidity: 72 };
    case "BSh":
      return { summer: 34, winter: 14, rainfall: 320, humidity: 38 };
    case "Csa":
      return { summer: 29, winter: 11, rainfall: 480, humidity: 62 };
    case "Cfa":
      return { summer: 30, winter: 9, rainfall: 1050, humidity: 70 };
    case "Cfb":
      return { summer: 22, winter: 6, rainfall: 850, humidity: 76 };
    case "Dfb":
      return { summer: 20, winter: -6, rainfall: 620, humidity: 68 };
    default:
      return { summer: 16, winter: -10, rainfall: 450, humidity: 65 };
  }
}

function buildSeasonalClimate(zoneDefaults) {
  return {
    winter: { avgTemp: `${zoneDefaults.winter}°C` },
    summer: { avgTemp: `${zoneDefaults.summer}°C` },
  };
}

function buildDesignRecommendations(climate) {
  const recommendations = [];

  if (climate.avg_temp_c.summer > 30) {
    recommendations.push({
      key: "shading",
      value: "Deep overhangs on south and west facades (>0.8m)",
    });
    recommendations.push({
      key: "materials",
      value: "High thermal mass to damp peak daytime heat",
    });
  } else {
    recommendations.push({
      key: "shading",
      value: "Moderate external shading sized to admit winter sun",
    });
  }

  if (climate.avg_temp_c.winter < 5) {
    recommendations.push({
      key: "glazing",
      value: "Prioritise south-facing glazing with upgraded insulation",
    });
    recommendations.push({
      key: "materials",
      value: "Boost insulation continuity and reduce thermal bridging",
    });
  } else {
    recommendations.push({
      key: "glazing",
      value: "Balance south glazing with solar control on west elevations",
    });
  }

  if (climate.rainfall_mm_annual > 800) {
    recommendations.push({
      key: "roof",
      value:
        "Use steeper roof pitches, durable waterproofing, and generous drainage",
    });
  }

  if (climate.humidity_avg_pct > 70) {
    recommendations.push({
      key: "ventilation",
      value: `Plan cross-ventilation around prevailing ${climate.prevailing_wind.direction} winds`,
    });
  } else {
    recommendations.push({
      key: "ventilation",
      value: "Use mixed-mode ventilation with controlled purge openings",
    });
  }

  return {
    orientation:
      climate.zone === "Cfb" || climate.zone === "Dfb"
        ? "Long axis E-W to maximise winter solar gain"
        : "Long axis E-W for solar control",
    shading:
      recommendations.find((entry) => entry.key === "shading")?.value ||
      "Moderate external shading",
    ventilation:
      recommendations.find((entry) => entry.key === "ventilation")?.value ||
      "Cross-ventilation where site exposure allows",
    materials:
      recommendations.find((entry) => entry.key === "materials")?.value ||
      "Use robust, climate-appropriate envelope materials",
    glazing:
      recommendations.find((entry) => entry.key === "glazing")?.value ||
      "Limit west-facing glazing and control solar gain",
    roof:
      recommendations.find((entry) => entry.key === "roof")?.value ||
      "Standard roof pitch with robust rain detailing",
  };
}

export function getDefaultClimate(lat, lng) {
  const zone = getKoppenZone(lat, lng);
  const defaults = getZoneDefaults(zone);
  const summerSunriseAzimuth = sunriseAzimuth(lat, 23.44);
  const summerSunsetAzimuth = 360 - summerSunriseAzimuth;

  const climate = {
    zone,
    type: zone,
    avg_temp_c: {
      summer: defaults.summer,
      winter: defaults.winter,
    },
    seasonal: buildSeasonalClimate(defaults),
    sun_path: {
      summer_altitude: solarNoonAltitude(lat, 23.44),
      winter_altitude: solarNoonAltitude(lat, -23.44),
      sunrise_azimuth_summer: summerSunriseAzimuth,
      sunset_azimuth_summer: summerSunsetAzimuth,
    },
    prevailing_wind: {
      direction: lat >= 0 ? "SW" : "NW",
      speed_kmh: zone === "BSh" ? 18 : 12,
    },
    rainfall_mm_annual: defaults.rainfall,
    humidity_avg_pct: defaults.humidity,
  };

  return {
    location: {
      lat: Number(lat || 0),
      lng: Number(lng || 0),
      city: null,
      country: null,
    },
    climate,
    wind: climate.prevailing_wind,
    sunPath: {
      optimalOrientation: "south",
      ...climate.sun_path,
    },
    design_recommendations: buildDesignRecommendations(climate),
    designRecommendations: buildDesignRecommendations(climate),
  };
}

function getApiKey() {
  return (
    process.env.OPENWEATHER_API_KEY ||
    process.env.REACT_APP_OPENWEATHER_API_KEY ||
    ""
  );
}

async function fetchWeatherData(lat, lng, apiKey) {
  const url =
    `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lng}` +
    `&units=metric&appid=${apiKey}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `OpenWeather weather request failed with ${response.status}`,
    );
  }

  return response.json();
}

export async function getClimateData(lat, lng) {
  const resolvedLat = Number(lat);
  const resolvedLng = Number(lng);

  if (!Number.isFinite(resolvedLat) || !Number.isFinite(resolvedLng)) {
    logger.warn(
      "Invalid coordinates passed to getClimateData, using defaults",
      {
        lat,
        lng,
      },
    );
    return getDefaultClimate(0, 0);
  }

  const cacheKey = createCacheKey(resolvedLat, resolvedLng);
  const cached = climateCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.value;
  }

  const apiKey = getApiKey();
  if (!apiKey) {
    logger.warn("OPENWEATHER_API_KEY not set, using latitude-based defaults");
    const fallback = getDefaultClimate(resolvedLat, resolvedLng);
    climateCache.set(cacheKey, { timestamp: Date.now(), value: fallback });
    return fallback;
  }

  try {
    const weatherData = await fetchWeatherData(
      resolvedLat,
      resolvedLng,
      apiKey,
    );
    const zone = getKoppenZone(resolvedLat, resolvedLng);
    const defaults = getZoneDefaults(zone);
    const currentTemp = Number(weatherData?.main?.temp);
    const humidity = Number(weatherData?.main?.humidity);
    const rainfallMm =
      Number(weatherData?.rain?.["1h"]) > 0
        ? Math.round(Number(weatherData.rain["1h"]) * 365)
        : defaults.rainfall;
    const windDeg =
      Number(weatherData?.wind?.deg) || (resolvedLat >= 0 ? 225 : 315);
    const windSpeedKmh = Math.round(
      (Number(weatherData?.wind?.speed) || 0) * 3.6,
    );
    const summerSunriseAzimuth = sunriseAzimuth(resolvedLat, 23.44);
    const summerSunsetAzimuth = 360 - summerSunriseAzimuth;

    const climate = {
      zone,
      type: zone,
      avg_temp_c: {
        summer: Number.isFinite(currentTemp)
          ? Math.round((currentTemp + defaults.summer) / 2)
          : defaults.summer,
        winter: defaults.winter,
      },
      seasonal: buildSeasonalClimate(defaults),
      sun_path: {
        summer_altitude: solarNoonAltitude(resolvedLat, 23.44),
        winter_altitude: solarNoonAltitude(resolvedLat, -23.44),
        sunrise_azimuth_summer: summerSunriseAzimuth,
        sunset_azimuth_summer: summerSunsetAzimuth,
      },
      prevailing_wind: {
        direction: toCompass(windDeg),
        speed_kmh: windSpeedKmh || 12,
      },
      rainfall_mm_annual: rainfallMm,
      humidity_avg_pct: Number.isFinite(humidity)
        ? humidity
        : defaults.humidity,
    };

    const value = {
      location: {
        lat: resolvedLat,
        lng: resolvedLng,
        city: weatherData?.name || null,
        country: weatherData?.sys?.country || null,
      },
      climate,
      wind: climate.prevailing_wind,
      sunPath: {
        optimalOrientation: "south",
        ...climate.sun_path,
      },
      design_recommendations: buildDesignRecommendations(climate),
      designRecommendations: buildDesignRecommendations(climate),
    };

    climateCache.set(cacheKey, { timestamp: Date.now(), value });
    return value;
  } catch (error) {
    logger.warn("Climate API unavailable, falling back to defaults", error);
    const fallback = getDefaultClimate(resolvedLat, resolvedLng);
    climateCache.set(cacheKey, { timestamp: Date.now(), value: fallback });
    return fallback;
  }
}

export default {
  getClimateData,
  getDefaultClimate,
};
