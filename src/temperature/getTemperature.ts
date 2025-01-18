import { calculateSunPosition } from "./calculateSunPosition.ts";

type GeoCoordinates = {
  latitude: number;
  longitude: number;
};

export type AnnualDateTime = {
  dayOfYear: number;
  dayPart: number;
};

export function getTemperature(
  meanAnnualValue: number,
  coordinates: GeoCoordinates,
  dateTime: AnnualDateTime,
  daysInYear: number
): number {
  const baseDayRange = getMeanDailyTemperatureRange({
    meanAnnualValue,
    dayOfYear: dateTime.dayOfYear,
    daysInYear,
    ...coordinates,
  });
  return getIntradayTemperature(
    baseDayRange,
    getSunPositionForDate(dateTime, coordinates, daysInYear),
    1.0
  );
}

export function getIntradayTemperature(
  baseDayRange: { start: number; end: number; maxDelta: number },
  sunPosition: number, // 0.0-1.0
  partOfDay: number // 0.0-1.0
): number {
  return (
    baseDayRange.start +
    baseDayRange.maxDelta * sunPosition +
    (baseDayRange.end - baseDayRange.start) * partOfDay
  );
}

// export function getMeanDailyTemperatureRange(
//   meanAnnualValue: number,
//   dayOfYear: number,
//   daysInYear: number,
//   amplitude: number
// ): { start: number; end: number } {
//   const startAngle = (2 * Math.PI * dayOfYear) / daysInYear;
//   const endAngle = (2 * Math.PI * (dayOfYear + 1)) / daysInYear;
//   const start =
//     meanAnnualValue + amplitude * Math.sin(startAngle - Math.PI / 2);
//   const end = meanAnnualValue + amplitude * Math.sin(endAngle - Math.PI / 2);
//   return { start, end };
// }

export function getMeanDailyTemperatureRange({
  meanAnnualValue,
  dayOfYear,
  daysInYear,
  latitude,
  longitude,
}: {
  meanAnnualValue: number;
  dayOfYear: number;
  daysInYear: number;
  latitude: number;
  longitude: number; // -180 to 180
}): { start: number; end: number; maxDelta: number } {
  const startAngle = (2 * Math.PI * dayOfYear) / daysInYear;
  const endAngle = (2 * Math.PI * (dayOfYear + 1)) / daysInYear;
  const start = meanAnnualValue + Math.sin(startAngle - Math.PI / 2);
  const end = meanAnnualValue + Math.sin(endAngle - Math.PI / 2);
  return {
    start,
    end,
    maxDelta: getDailyMaxDelta(dayOfYear, daysInYear, latitude),
  };
}

function getDailyMaxDelta(
  dayOfYear: number,
  daysInYear: number,
  latitude: number
) {
  const yearProgress = dayOfYear / daysInYear;

  const seasonalPhase = 2 * Math.PI * (yearProgress - 0.5);

  // Daily variation affected by latitude and season
  const dailyVariationFactor =
    (1 - Math.abs(latitude) / 90) * (0.7 + 0.3 * Math.cos(seasonalPhase));
  const MAX_DAILY_VARIATION = 15; // Maximum daily temperature swing

  return MAX_DAILY_VARIATION * dailyVariationFactor;
}

function getSunPositionForDate( // this is left like this to try again with suncalc and compare the results
  dateTime: AnnualDateTime,
  coordinates: GeoCoordinates,
  daysInYear: number
): number {
  return calculateSunPosition({
    dayProgress: dateTime.dayPart,
    yearProgress: dateTime.dayOfYear / daysInYear,
    daysInYear,
    latitude: coordinates.latitude,
    longitude: coordinates.longitude,
  }).altitude;
}

function toDate(
  gameDateTime: AnnualDateTime,
  daysInYear: number,
  year: number
): Date {
  const startOfYear = new Date(year, 0, 1);
  const endOfYear = new Date(year + 1, 0, 1);
  const timeInYear =
    (gameDateTime.dayOfYear / daysInYear) *
    (endOfYear.getTime() - startOfYear.getTime());
  const date = new Date(startOfYear.getTime() + timeInYear);

  const secondsInDay = gameDateTime.dayPart * 86400;
  date.setHours(Math.floor(secondsInDay / 3600));
  date.setMinutes(Math.floor((secondsInDay % 3600) / 60));
  date.setSeconds(Math.floor(secondsInDay % 60));

  return date;
}
