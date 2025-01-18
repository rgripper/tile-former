import { describe, it, expect } from "vitest";
import { calculateSunPosition } from "./calculateSunPosition";

// Test location constants
const LISBON_LAT = 38.7223;
const LISBON_LON = -9.1393;
const TOLERANCE = 0.001; // For floating point comparisons
const daysInYear = 365;

describe("Sun Position Calculator", () => {
  describe("Basic Input Validation", () => {
    it("should handle equator position", () => {
      const pos = calculateSunPosition({
        latitude: 0,
        longitude: 0,
        yearProgress: 0.5,
        dayProgress: 0.5,
        daysInYear,
      });
      expect(pos.altitude).toBeLessThanOrEqual(1);
      expect(pos.altitude).toBeGreaterThanOrEqual(-1);
      expect(pos.azimuth).toBeLessThanOrEqual(1);
      expect(pos.azimuth).toBeGreaterThanOrEqual(-1);
    });

    it("should handle extreme latitudes", () => {
      const northPole = calculateSunPosition({
        latitude: 90,
        longitude: 0,
        yearProgress: 0.5,
        dayProgress: 0.5,
        daysInYear,
      });
      const southPole = calculateSunPosition({
        latitude: -90,
        longitude: 0,
        yearProgress: 0.5,
        dayProgress: 0.5,
        daysInYear,
      });

      expect(northPole.altitude).toBeLessThanOrEqual(1);
      expect(northPole.altitude).toBeGreaterThanOrEqual(-1);
      expect(southPole.altitude).toBeLessThanOrEqual(1);
      expect(southPole.altitude).toBeGreaterThanOrEqual(-1);
    });
  });

  it("should show sun at highest point at solar noon", () => {
    // Calculate longitude correction
    const timeZoneOffset = Math.round(LISBON_LON / 15);
    const longitudeCorrection =
      ((LISBON_LON - timeZoneOffset * 15) * 4) / 60 / 24; // Convert to day progress
    const solarNoon = 0.5 + longitudeCorrection;

    const noon = calculateSunPosition({
      latitude: LISBON_LAT,
      longitude: LISBON_LON,
      yearProgress: 0.5,
      dayProgress: solarNoon,
      daysInYear,
    });
    const morning = calculateSunPosition({
      latitude: LISBON_LAT,
      longitude: LISBON_LON,
      yearProgress: 0.5,
      dayProgress: solarNoon - 0.25,
      daysInYear,
    });
    const evening = calculateSunPosition({
      latitude: LISBON_LAT,
      longitude: LISBON_LON,
      yearProgress: 0.5,
      dayProgress: solarNoon + 0.25,
      daysInYear,
    });

    expect(noon.altitude).toBeGreaterThan(morning.altitude);
    expect(noon.altitude).toBeGreaterThan(evening.altitude);
  });

  it("should show symmetrical altitudes for equidistant times from solar noon", () => {
    // Calculate solar noon for Lisbon
    const timeZoneOffset = Math.round(LISBON_LON / 15);
    const longitudeCorrection =
      ((LISBON_LON - timeZoneOffset * 15) * 4) / 60 / 24; // Convert to day progress
    const solarNoon = 0.5 + longitudeCorrection;

    // Test times 3 hours before and after solar noon
    const before = solarNoon - 0.125; // 3 hours before solar noon
    const after = solarNoon + 0.125; // 3 hours after solar noon

    const morningPos = calculateSunPosition({
      latitude: LISBON_LAT,
      longitude: LISBON_LON,
      yearProgress: 0.5,
      dayProgress: before,
      daysInYear,
    });
    const eveningPos = calculateSunPosition({
      latitude: LISBON_LAT,
      longitude: LISBON_LON,
      yearProgress: 0.5,
      dayProgress: after,
      daysInYear,
    });

    expect(Math.abs(morningPos.altitude - eveningPos.altitude)).toBeLessThan(
      TOLERANCE
    );
  });
});

describe("Seasonal Tests", () => {
  it("should show higher noon altitude in summer than winter", () => {
    const timeZoneOffset = Math.round(LISBON_LON / 15);
    const longitudeCorrection =
      ((LISBON_LON - timeZoneOffset * 15) * 4) / 60 / 24;
    const solarNoon = 0.5 + longitudeCorrection;

    const summerNoon = calculateSunPosition({
      latitude: LISBON_LAT,
      longitude: LISBON_LON,
      yearProgress: 0.5,
      dayProgress: solarNoon,
      daysInYear,
    });
    const winterNoon = calculateSunPosition({
      latitude: LISBON_LAT,
      longitude: LISBON_LON,
      yearProgress: 0,
      dayProgress: solarNoon,
      daysInYear,
    });

    expect(summerNoon.altitude).toBeGreaterThan(winterNoon.altitude);
  });

  it("should show equal noon altitudes at spring and fall equinoxes", () => {
    const timeZoneOffset = Math.round(LISBON_LON / 15);
    const longitudeCorrection =
      ((LISBON_LON - timeZoneOffset * 15) * 4) / 60 / 24;
    const solarNoon = 0.5 + longitudeCorrection;

    const springNoon = calculateSunPosition({
      latitude: LISBON_LAT,
      longitude: LISBON_LON,
      yearProgress: 0.25,
      dayProgress: solarNoon,
      daysInYear,
    });
    const fallNoon = calculateSunPosition({
      latitude: LISBON_LAT,
      longitude: LISBON_LON,
      yearProgress: 0.75,
      dayProgress: solarNoon,
      daysInYear,
    });

    expect(Math.abs(springNoon.altitude - fallNoon.altitude)).toBeLessThan(
      TOLERANCE
    );
  });

  describe("Azimuth Tests", () => {
    it("should show sun due south at noon", () => {
      const noonPosition = calculateSunPosition({
        latitude: LISBON_LAT,
        longitude: LISBON_LON,
        yearProgress: 0.5,
        dayProgress: 0.5,
        daysInYear,
      });
      expect(Math.abs(noonPosition.azimuth)).toBeLessThan(TOLERANCE);
    });

    it("should show symmetrical morning and evening azimuths", () => {
      const morning = calculateSunPosition({
        latitude: LISBON_LAT,
        longitude: LISBON_LON,
        yearProgress: 0.5,
        dayProgress: 0.25,
        daysInYear,
      });
      const evening = calculateSunPosition({
        latitude: LISBON_LAT,
        longitude: LISBON_LON,
        yearProgress: 0.5,
        dayProgress: 0.75,
        daysInYear,
      });

      expect(Math.abs(morning.azimuth + evening.azimuth)).toBeLessThan(
        TOLERANCE
      );
    });
  });

  describe("Edge Cases", () => {
    it("should handle midnight", () => {
      const midnight = calculateSunPosition({
        latitude: LISBON_LAT,
        longitude: LISBON_LON,
        yearProgress: 0.5,
        dayProgress: 0,
        daysInYear,
      });
      expect(midnight.altitude).toBeLessThan(0);
    });

    it("should handle date line longitude", () => {
      const dateLine = calculateSunPosition({
        latitude: 0,
        longitude: 180,
        yearProgress: 0.5,
        dayProgress: 0.5,
        daysInYear,
      });
      const dateLineNeg = calculateSunPosition({
        latitude: 0,
        longitude: -180,
        yearProgress: 0.5,
        dayProgress: 0.5,
        daysInYear,
      });

      expect(Math.abs(dateLine.altitude - dateLineNeg.altitude)).toBeLessThan(
        TOLERANCE
      );
    });
  });

  describe("Known Positions", () => {
    // Testing against pre-calculated values for Lisbon
    it("should match known summer solstice noon position", () => {
      const pos = calculateSunPosition({
        latitude: LISBON_LAT,
        longitude: LISBON_LON,
        yearProgress: 0.5,
        dayProgress: 0.5,
        daysInYear,
      });
      expect(pos.altitude).toBeCloseTo(0.745, 2);
      expect(pos.azimuth).toBeCloseTo(0, 2);
    });

    it("should match known winter solstice noon position", () => {
      const pos = calculateSunPosition({
        latitude: LISBON_LAT,
        longitude: LISBON_LON,
        yearProgress: 0,
        dayProgress: 0.5,
        daysInYear,
      });
      expect(pos.altitude).toBeCloseTo(0.285, 2);
      expect(pos.azimuth).toBeCloseTo(0, 2);
    });
  });
});
