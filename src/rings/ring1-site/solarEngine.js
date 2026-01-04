import SunCalc from 'suncalc';

const DEG_PER_RAD = 180 / Math.PI;

const DEFAULT_SUN_PATH = {
  latitude: 0,
  longitude: 0,
  hemisphere: 'northern',
  winterSolstice: { azimuth: 180, altitude: 15 },
  summerSolstice: { azimuth: 180, altitude: 75 },
  equinox: { azimuth: 180, altitude: 45 },
  summer: { azimuth: 180, altitude: 75 },
  winter: { azimuth: 180, altitude: 15 },
  optimalOrientation: 180,
  principalFacadeAngle: 180
};

function toDegrees(radians) {
  return radians * DEG_PER_RAD;
}

function normalizeAzimuth(degrees) {
  let az = degrees % 360;
  if (az < 0) {
    az += 360;
  }
  return parseFloat(az.toFixed(2));
}

function toSunAngles(lat, lng, date) {
  try {
    const position = SunCalc.getPosition(date, lat, lng);
    const azimuth = normalizeAzimuth(180 + toDegrees(position.azimuth));
    const altitude = parseFloat(toDegrees(position.altitude).toFixed(2));
    return { azimuth, altitude };
  } catch (error) {
    console.warn('[solarEngine] Failed to compute sun position', error);
    return { azimuth: 180, altitude: 45 };
  }
}

export function getOptimalOrientation(lat = 0) {
  const hemisphere = lat >= 0 ? 'northern' : 'southern';
  return hemisphere === 'northern' ? 180 : 0;
}

export function computeSunPath(lat, lng, options = {}) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return DEFAULT_SUN_PATH;
  }

  const targetYear = options.year || new Date().getUTCFullYear();
  const winterSolstice = new Date(Date.UTC(targetYear, 11, 21, 12, 0, 0));
  const summerSolstice = new Date(Date.UTC(targetYear, 5, 21, 12, 0, 0));
  const springEquinox = new Date(Date.UTC(targetYear, 2, 20, 12, 0, 0));

  const winter = toSunAngles(lat, lng, winterSolstice);
  const summer = toSunAngles(lat, lng, summerSolstice);
  const equinox = toSunAngles(lat, lng, springEquinox);
  const hemisphere = lat >= 0 ? 'northern' : 'southern';

  const optimalOrientation = options.preferredOrientationDeg ?? getOptimalOrientation(lat);
  const principalFacadeAngle = options.principalFacadeAngle ?? optimalOrientation;

  return {
    latitude: lat,
    longitude: lng,
    hemisphere,
    winterSolstice: winter,
    summerSolstice: summer,
    equinox,
    summer: { ...summer },
    winter: { ...winter },
    optimalOrientation,
    principalFacadeAngle
  };
}

export function deriveFacadeOrientation({ solar, streetContext }) {
  if (streetContext?.roadOrientation !== undefined) {
    return streetContext.roadOrientation;
  }

  if (!solar) {
    return DEFAULT_SUN_PATH.principalFacadeAngle;
  }

  return solar.principalFacadeAngle ?? solar.optimalOrientation ?? DEFAULT_SUN_PATH.principalFacadeAngle;
}

