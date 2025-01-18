type SunPosition = {
  altitude: number; // scaled to be in range of -1.0 to 1.0
  azimuth: number; // scaled to be in range of -1.0 to 1.0
};

export function calculateSunPosition({
  latitude,
  longitude,
  yearProgress,
  dayProgress,
  daysInYear,
}: {
  latitude: number;
  longitude: number;
  yearProgress: number;
  dayProgress: number;
  daysInYear: number;
}): SunPosition {
  const latRad = (latitude * Math.PI) / 180;
  const dayOfYear = Math.floor(yearProgress * daysInYear);
  const declination =
    23.45 * Math.sin((2 * Math.PI * (dayOfYear - 81)) / daysInYear);
  const declinationRad = (declination * Math.PI) / 180;
  const timeZoneOffset = Math.round(longitude / 15);
  const longitudeCorrection = ((longitude - timeZoneOffset * 15) * 4) / 60;
  const hoursFromMidnight = dayProgress * 24;
  const solarTime = hoursFromMidnight - longitudeCorrection;
  const hoursFromNoon = solarTime - 12;
  const hourAngle = hoursFromNoon * 15;
  const hourAngleRad = (hourAngle * Math.PI) / 180;

  const sinAltitude =
    Math.sin(latRad) * Math.sin(declinationRad) +
    Math.cos(latRad) * Math.cos(declinationRad) * Math.cos(hourAngleRad);
  const altitude = Math.asin(sinAltitude);

  const cosAzimuth =
    (Math.sin(declinationRad) - Math.sin(latRad) * Math.sin(altitude)) /
    (Math.cos(latRad) * Math.cos(altitude));
  let azimuth = Math.acos(Math.max(-1, Math.min(1, cosAzimuth)));

  if (hoursFromNoon > 0) {
    azimuth = 2 * Math.PI - azimuth;
  }

  return {
    altitude: altitude / (Math.PI / 2),
    azimuth: azimuth / Math.PI - 1,
  };
}
