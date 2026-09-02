import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getCalendarReportDateRange,
  localDateEnd,
  localDateStart,
  toLocalDateInputValue,
} from './reportDateRanges';

test('this month starts on the local first day and ends today', () => {
  const range = getCalendarReportDateRange('month', new Date(2026, 8, 2, 12, 30));

  assert.equal(range.start, '2026-09-01');
  assert.equal(range.end, '2026-09-02');
  assert.equal(range.startDate.getHours(), 0);
});

test('last month crosses a year boundary correctly', () => {
  const range = getCalendarReportDateRange('lastMonth', new Date(2026, 0, 5, 12));

  assert.equal(range.start, '2025-12-01');
  assert.equal(range.end, '2025-12-31');
});

test('date input values remain full local-day boundaries', () => {
  const start = localDateStart('2026-09-01');
  const end = localDateEnd('2026-09-02');

  assert.equal(toLocalDateInputValue(start), '2026-09-01');
  assert.equal(start.getHours(), 0);
  assert.equal(toLocalDateInputValue(end), '2026-09-02');
  assert.equal(end.getHours(), 23);
  assert.equal(end.getMinutes(), 59);
  assert.equal(end.getSeconds(), 59);
  assert.equal(end.getMilliseconds(), 999);
});
