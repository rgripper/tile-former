import { Temporal } from "temporal-polyfill";
import {
  getIntradayTemperature,
  getMeanDailyTemperature,
} from "./getTemperature.ts";
import { describe, it, expect } from "vitest";

describe("temperature", () => {
  it("should return the temperature for a given day and location", () => {
    const baselineValue = 17.4;

    const expectedTemperatures = [
      {
        date: "2021-01-01",
        temperature: {
          start: 16.40014816079088,
          end: 16.400592599260293,
          maxDelta: 3.418893200562668,
        },
      },
      {
        date: "2021-03-15",
        temperature: {
          start: 17.10739966436665,
          end: 17.12390302690253,
          maxDelta: 5.232204721808025,
        },
      },
      {
        date: "2021-06-15",
        temperature: {
          start: 18.359932689659743,
          end: 18.36461417569124,
          maxDelta: 8.443555357361607,
        },
      },
      {
        date: "2021-09-15",
        temperature: {
          start: 17.667814305162175,
          end: 17.65119006388482,
          maxDelta: 6.669043413124054,
        },
      },
      {
        date: "2021-12-31",
        temperature: {
          start: 16.4,
          end: 16.40014816079088,
          maxDelta: 3.4185133333333333,
        },
      },
    ];

    const LISBON_LAT = 38.7223;
    const LISBON_LON = -9.1393;

    const actualTemperatures = expectedTemperatures.map(({ date }) => {
      return {
        date,
        temperature: getMeanDailyTemperature({
          baselineValue,
          dayOfYear: Temporal.PlainDate.from(date).dayOfYear,
          daysInYear: 365,
          latitude: LISBON_LAT,
          longitude: LISBON_LON,
        }),
      };
    });

    expect(actualTemperatures).toEqual(expectedTemperatures);
  });

  it("should return the temperature for a given time, day and location", () => {
    const temperature = {
      start: 16.40014816079088,
      end: 16.400592599260293,
      maxDelta: 3.418893200562668,
    };

    const result = getIntradayTemperature(temperature, 0.5, 0.35);
    expect(result).toBe(18.10975031453651);
  });

  it("should return the temperature for a given time, day and location #2", () => {
    const temperature = {
      start: 16.40014816079088,
      end: 16.400592599260293,
      maxDelta: 3.418893200562668,
    };

    const result = getIntradayTemperature(temperature, 0.1, 0.05);
    expect(result).toBe(16.742059702770618);
  });
});
