import { AnnualCurveView } from "./AnnualCurveView.tsx";
import { AnnualDateTime } from "./AnnualDateTime.ts";
import { DailyWeather } from "./DailyWeather.tsx";
import { getTemperature } from "./getTemperature.ts";

export function WeatherTool({
  dateTime,
  onDateTimeChange,
}: {
  dateTime: AnnualDateTime;
  onDateTimeChange: (dateTime: AnnualDateTime) => void;
}) {
  return (
    <div>
      <AnnualCurveView
        totalDays={dateTime.daysInYear}
        onDayChange={(day) => onDateTimeChange({ ...dateTime, dayOfYear: day })}
        day={dateTime.dayOfYear}
      />
      <DailyWeather
        date={dateTime}
        latitude={38.736946}
        longitude={-9.142685}
      />
    </div>
  );
}
