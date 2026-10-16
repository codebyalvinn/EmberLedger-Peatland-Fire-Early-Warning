import type { WeatherDay } from "../types";

export const DC_RAIN_THRESHOLD_MM = 2.8;
export const DC_TROPICAL_DAY_LENGTH_FACTOR = 1.4;

export function droughtCodeRainStep(
  previousDc: number,
  precipitationMm: number,
): number {
  if (
    !Number.isFinite(previousDc) ||
    !Number.isFinite(precipitationMm) ||
    previousDc < 0 ||
    precipitationMm < 0
  ) {
    throw new Error("Drought Code inputs must be finite and non-negative");
  }
  if (precipitationMm > DC_RAIN_THRESHOLD_MM) {
    const effectiveRain = 0.83 * precipitationMm - 1.27;
    const moistureContent = 800 * Math.exp(-previousDc / 400);
    return Math.max(
      previousDc -
        400 * Math.log(1 + (3.937 * effectiveRain) / moistureContent),
      0,
    );
  }
  return previousDc;
}

export function stepDroughtCode(
  previousDc: number,
  precipitationMm: number,
  maximumTemperatureC: number,
  dayLengthFactor = DC_TROPICAL_DAY_LENGTH_FACTOR,
): number {
  if (
    !Number.isFinite(maximumTemperatureC) ||
    !Number.isFinite(dayLengthFactor)
  ) {
    throw new Error("Drought Code temperature and day-length inputs must be finite");
  }
  const dcAfterRain = droughtCodeRainStep(previousDc, precipitationMm);
  const dryingFactor = Math.max(
    0.36 * (maximumTemperatureC + 2.8) + dayLengthFactor,
    0,
  );
  return dcAfterRain + 0.5 * dryingFactor;
}

export function droughtCodeSeries(
  weather: readonly WeatherDay[],
  seedDc = 100,
  dayLengthFactor = DC_TROPICAL_DAY_LENGTH_FACTOR,
): number[] {
  if (!Number.isFinite(seedDc) || seedDc < 0) {
    throw new Error("Drought Code seed must be a finite non-negative number");
  }
  return weather.reduce<number[]>((series, day) => {
    const previousDc = series.at(-1) ?? seedDc;
    series.push(
      stepDroughtCode(
        previousDc,
        day.precipitationMm,
        day.maxTemperatureC,
        dayLengthFactor,
      ),
    );
    return series;
  }, []);
}

export function rollDroughtCode(
  currentDc: number,
  forecast: readonly WeatherDay[],
  horizonDays: number,
  dayLengthFactor = DC_TROPICAL_DAY_LENGTH_FACTOR,
): number {
  if (!Number.isInteger(horizonDays) || horizonDays < 0) {
    throw new Error("Drought Code horizon must be a non-negative integer");
  }
  return droughtCodeSeries(
    forecast.slice(0, horizonDays),
    currentDc,
    dayLengthFactor,
  ).at(-1) ?? currentDc;
}
