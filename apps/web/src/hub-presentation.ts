/** Presentation only: no clock, metric or status invented from the reference artwork. */
export function romanNumber(value: number): string {
  if (!Number.isInteger(value) || value < 0 || value > 59) return "—";
  if (value === 0) return "N";
  const numerals = [
    [50, "L"],
    [40, "XL"],
    [10, "X"],
    [9, "IX"],
    [5, "V"],
    [4, "IV"],
    [1, "I"],
  ] as const;
  let rest = value;
  let result = "";
  for (const [amount, glyph] of numerals) {
    while (rest >= amount) {
      result += glyph;
      rest -= amount;
    }
  }
  return result;
}

export function hubClock(date: Date) {
  return {
    roman: `${romanNumber(date.getHours())} · ${romanNumber(date.getMinutes())}`,
    time: new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(date),
    date: new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(
      date,
    ),
  };
}

export function hubTime(value: string | undefined, timezone?: string): string {
  if (!value || !Number.isFinite(Date.parse(value))) return "—";
  try {
    return new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: timezone }).format(
      new Date(value),
    );
  } catch {
    return "—";
  }
}

export function hubTemperature(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value)
    ? `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 }).format(value)}°`
    : "—°";
}
