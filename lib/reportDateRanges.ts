export type CalendarReportRange = 'today' | 'week' | 'month' | 'lastMonth';

const parseDateParts = (value: string) => {
  const [year, month, day] = value.split('-').map(Number);
  return { year, month, day };
};

/** Format a Date for an HTML date input without converting it to UTC. */
export const toLocalDateInputValue = (date: Date) => {
  const pad = (value: number) => value.toString().padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

/** Parse an HTML date value at the beginning of that day in the user's timezone. */
export const localDateStart = (value: string) => {
  const { year, month, day } = parseDateParts(value);
  return new Date(year, month - 1, day, 0, 0, 0, 0);
};

/** Parse an HTML date value at the end of that day in the user's timezone. */
export const localDateEnd = (value: string) => {
  const { year, month, day } = parseDateParts(value);
  return new Date(year, month - 1, day, 23, 59, 59, 999);
};

/** Calendar report presets, always bounded in local time and ending today. */
export const getCalendarReportDateRange = (
  range: CalendarReportRange,
  now = new Date(),
) => {
  let start: Date;
  let end = now;

  if (range === 'today') {
    start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  } else if (range === 'week') {
    start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
  } else if (range === 'lastMonth') {
    start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
  } else {
    start = new Date(now.getFullYear(), now.getMonth(), 1);
  }

  return {
    startDate: start,
    endDate: end,
    start: toLocalDateInputValue(start),
    end: toLocalDateInputValue(end),
  };
};
