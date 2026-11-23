export function calculateWorkingDays(startDate: string, endDate: string, holidays: string[] = []) {
  const start = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return 0;

  let days = 0;
  for (const cursor = new Date(start); cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const weekday = cursor.getUTCDay();
    const isoDate = cursor.toISOString().slice(0, 10);
    if (weekday !== 0 && weekday !== 6 && !holidays.includes(isoDate)) days += 1;
  }
  return days;
}
