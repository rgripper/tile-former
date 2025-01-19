import { AnnualDateTime } from "./AnnualDateTime.ts";
import { calculateSunPosition } from "./calculateSunPosition.ts";

type GeoCoordinates = {
  latitude: number;
  longitude: number;
};

export function getTemperature(
  baselineValue: number,
  coordinates: GeoCoordinates,
  dateTime: AnnualDateTime
): number {
  const start = getMeanDailyTemperature({
    baselineValue,
    dayOfYear:
      (dateTime.dayOfYear > 0 ? dateTime.dayOfYear : dateTime.daysInYear) - 0.5,
    daysInYear: dateTime.daysInYear,
    ...coordinates,
  });

  const end = getMeanDailyTemperature({
    baselineValue,
    dayOfYear:
      (dateTime.dayOfYear < dateTime.daysInYear - 1 ? dateTime.dayOfYear : 0) +
      0.5,
    daysInYear: dateTime.daysInYear,
    ...coordinates,
  });
  return getIntradayTemperature(
    {
      start,
      end,
      maxDelta: getDailyMaxDelta(
        dateTime.dayOfYear,
        dateTime.daysInYear,
        coordinates.latitude
      ),
    },
    getSunPositionForDate(dateTime, coordinates),
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

export function getMeanDailyTemperature({
  baselineValue,
  dayOfYear,
  daysInYear,
  latitude,
  longitude,
}: {
  baselineValue: number;
  dayOfYear: number;
  daysInYear: number;
  latitude: number;
  longitude: number;
}) {
  const TEMP_AMPLITUDE = 15; // Maximum temperature variation
  const PHASE_SHIFT = 0.5; // Shifts the sine wave to align with seasons

  // Normalize day of year to [0, 2π]
  const normalizedDay = (2 * Math.PI * dayOfYear) / daysInYear;

  // Adjust phase based on hemisphere (latitude)
  // Northern hemisphere: peak in summer (July), trough in winter (January)
  // Southern hemisphere: opposite pattern
  const isNorthernHemisphere = latitude >= 0;
  const phase = isNorthernHemisphere ? normalizedDay : normalizedDay + Math.PI;

  // Calculate temperature variation using sine wave
  const temperatureVariation = Math.sin(phase - Math.PI * PHASE_SHIFT);

  // Adjust amplitude based on latitude (stronger seasons near poles)
  const latitudeEffect = Math.abs(latitude) / 90;
  const adjustedAmplitude = TEMP_AMPLITUDE * latitudeEffect;

  // Calculate base temperature with latitude effect
  const baseTemp = baselineValue - (Math.abs(latitude) / 90) * 10;

  // Combine all effects
  return baseTemp + temperatureVariation * adjustedAmplitude;
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
  coordinates: GeoCoordinates
): number {
  return calculateSunPosition({
    dayProgress: dateTime.dayPart,
    yearProgress: dateTime.dayOfYear / dateTime.daysInYear,
    daysInYear: dateTime.daysInYear,
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
