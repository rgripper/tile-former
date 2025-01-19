export type AnnualDateTime = {
  dayPart: number;
} & AnnualDate;

export type AnnualDate = {
  daysInYear: number;
  dayOfYear: number;
};
