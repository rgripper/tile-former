import { TrendingUp } from "lucide-react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { AnnualDate } from "./AnnualDateTime.ts";
import { getMeanDailyTemperature, getTemperature } from "./getTemperature.ts";
import { useMemo } from "react";
import { Temporal } from "temporal-polyfill";

const chartData = [
  { month: "January", desktop: 186 },
  { month: "February", desktop: 305 },
  { month: "March", desktop: 237 },
  { month: "April", desktop: 73 },
  { month: "May", desktop: 209 },
  { month: "June", desktop: 214 },
];

const chartConfig = {
  desktop: {
    label: "Desktop",
    color: "hsl(var(--chart-1))",
  },
} satisfies ChartConfig;

function getHourlyReadings(
  date: AnnualDate,
  coordinates: { latitude: number; longitude: number }
) {
  return Iterator.range(0, 23)
    .map((x) => ({
      hour: x,
      temperature: getTemperature(20, coordinates, {
        ...date,
        dayPart: x / 24,
      }),
    }))
    .toArray();
}

export function DailyWeather({
  date,
  latitude,
  longitude,
}: {
  date: AnnualDate;
  latitude: number;
  longitude: number;
}) {
  const hourlyReadings = useMemo(
    () => getHourlyReadings(date, { latitude, longitude }),
    [date]
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          Intraday temperature{" "}
          {Temporal.PlainDate.from({ year: 2024, month: 1, day: 1 })
            .add({
              days: date.dayOfYear,
            })
            .toLocaleString("en-GB", {
              year: "numeric",
              month: "short",
              day: "2-digit",
            })}{" "}
          {getMeanDailyTemperature({
            baselineValue: 20,
            dayOfYear: date.dayOfYear,
            daysInYear: 365,
            latitude,
            longitude,
          }).toFixed(1)}
        </CardTitle>
        <CardDescription>
          Lat: {latitude} Lon: {longitude}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig}>
          <AreaChart
            accessibilityLayer
            data={hourlyReadings}
            margin={{
              left: 12,
              right: 12,
            }}
          >
            <CartesianGrid />
            <XAxis dataKey="hour" tickMargin={8} />
            <YAxis dataKey="temperature" type="number" domain={[-20, 40]} />
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent indicator="line" />}
            />
            <Area
              dataKey="temperature"
              fill="var(--color-desktop)"
              stroke="var(--color-desktop)"
              baseValue={-20}
            />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
