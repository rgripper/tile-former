import { Temporal } from "temporal-polyfill";
import { AnnualCurveView } from "./AnnualCurveView";
import { DailyWeather } from "./DailyWeather";

export function WeatherTool({
  dateTime,
  onDateTimeChange,
}: {
  dateTime: Temporal.PlainDateTime;
  onDateTimeChange: (dateTime: Temporal.PlainDateTime) => void;
}) {
  return (
    <div>
      <AnnualCurveView
        totalDays={dateTime.daysInYear}
        onDayChange={(day) =>
          onDateTimeChange(
            dateTime.withPlainDate(
              dateTime.with({ day: 1, month: 1 }).add({ days: day - 1 })
            )
          )
        }
        day={dateTime.dayOfYear}
      />

      <DailyWeather
        date={dateTime.toPlainDate()}
        latitude={38.736946}
        longitude={-9.142685}
      />
    </div>
  );
}
