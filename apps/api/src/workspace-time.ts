import type { CalendarView } from "@ida/contracts";

type ZonedDateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

export type ResolvedCalendarRange = {
  view: CalendarView;
  from: string;
  to: string;
  timezone: string;
};

export type WorkspaceDayRange = {
  from: string;
  to: string;
  timezone: string;
  workspaceDate: string;
};

function localDateParts(date: Date, timezone: string): ZonedDateParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = new Map(parts.map((part) => [part.type, part.value]));

  return {
    year: Number(values.get("year")),
    month: Number(values.get("month")),
    day: Number(values.get("day")),
    hour: Number(values.get("hour")),
    minute: Number(values.get("minute")),
    second: Number(values.get("second")),
  };
}

function zonedDateTimeToIso(parts: ZonedDateParts, timezone: string): string {
  // La date civile est composée dans le fuseau du workspace, puis convertie
  // en UTC. L'itération recalcule l'offset au voisinage d'un changement
  // d'heure afin d'éviter de dériver d'un jour pour les vues calendrier et
  // les commandes naturelles qui partagent cette même fenêtre.
  const targetAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  let instant = targetAsUtc;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const observed = localDateParts(new Date(instant), timezone);
    const observedAsUtc = Date.UTC(
      observed.year,
      observed.month - 1,
      observed.day,
      observed.hour,
      observed.minute,
      observed.second,
    );
    const nextInstant = targetAsUtc - (observedAsUtc - instant);

    if (nextInstant === instant) {
      break;
    }

    instant = nextInstant;
  }

  return new Date(instant).toISOString();
}

function addUtcDays(parts: ZonedDateParts, days: number): ZonedDateParts {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));

  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    hour: 0,
    minute: 0,
    second: 0,
  };
}

export function getWorkspaceDayRange(now: Date, timezone: string, dayOffset = 0): WorkspaceDayRange {
  if (!Number.isInteger(dayOffset)) {
    throw new RangeError("Le décalage de jour doit être un entier.");
  }

  const localNow = localDateParts(now, timezone);
  const start = addUtcDays(
    {
      year: localNow.year,
      month: localNow.month,
      day: localNow.day,
      hour: 0,
      minute: 0,
      second: 0,
    },
    dayOffset,
  );
  const end = addUtcDays(start, 1);

  return {
    from: zonedDateTimeToIso(start, timezone),
    to: zonedDateTimeToIso(end, timezone),
    timezone,
    workspaceDate: `${start.year}-${String(start.month).padStart(2, "0")}-${String(start.day).padStart(2, "0")}`,
  };
}

export function defaultCalendarRange(now: Date, timezone: string, view: CalendarView): ResolvedCalendarRange {
  if (view === "DAY") {
    return { view, ...getWorkspaceDayRange(now, timezone) };
  }

  const localNow = localDateParts(now, timezone);
  let start: ZonedDateParts = {
    year: localNow.year,
    month: localNow.month,
    day: localNow.day,
    hour: 0,
    minute: 0,
    second: 0,
  };
  let end: ZonedDateParts;

  if (view === "WEEK") {
    const weekday = new Date(Date.UTC(start.year, start.month - 1, start.day)).getUTCDay();
    start = addUtcDays(start, -((weekday + 6) % 7));
    end = addUtcDays(start, 7);
  } else {
    start = { ...start, day: 1 };
    const firstOfNextMonth = new Date(Date.UTC(start.year, start.month, 1));
    end = {
      year: firstOfNextMonth.getUTCFullYear(),
      month: firstOfNextMonth.getUTCMonth() + 1,
      day: 1,
      hour: 0,
      minute: 0,
      second: 0,
    };
  }

  return {
    view,
    from: zonedDateTimeToIso(start, timezone),
    to: zonedDateTimeToIso(end, timezone),
    timezone,
  };
}
