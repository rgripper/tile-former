import { Slider } from "@/components/ui/slider";
import { Temporal } from "temporal-polyfill";
import { useDebounce } from "@uidotdev/usehooks";
import { useEffect, useState } from "react";

export function AnnualCurveView({
  totalDays,
  day,
  onDayChange,
}: {
  totalDays: number;
  day: number;
  onDayChange: (date: number) => void;
}) {
  return (
    <div>
      <p>{day.toString()}</p>
      <Slider
        min={1}
        max={totalDays}
        defaultValue={[day]}
        onValueChange={(x) => onDayChange(x[0])}
      />
    </div>
  );
}
