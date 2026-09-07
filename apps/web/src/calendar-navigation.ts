import {
  type EditorialCalendarRange,
  type EditorialCalendarSnapshot,
  type EditorialCalendarView,
  fetchEditorialCalendar,
} from "./api";
import { SnapshotReader } from "./snapshot-reader";

export interface CalendarRequest {
  view: EditorialCalendarView;
  anchor?: string | undefined;
}

/** Désigne un instant voisin ; le serveur calcule seul les nouvelles bornes civiles. */
export function adjacentCalendarAnchor(range: EditorialCalendarRange, direction: -1 | 1): string | undefined {
  const instant = new Date(direction === 1 ? Date.parse(range.to) : Date.parse(range.from) - 1);
  const year = instant.getUTCFullYear();
  if (!Number.isFinite(instant.valueOf()) || year < 1000 || year > 9998) return undefined;
  return instant.toISOString();
}

export function createCalendarReader(
  request: CalendarRequest,
  load: (query: CalendarRequest) => Promise<EditorialCalendarSnapshot> = fetchEditorialCalendar,
): SnapshotReader<EditorialCalendarSnapshot> {
  const query = Object.freeze({ ...request });
  return new SnapshotReader(() => load(query));
}
