// Victorian public holidays.
// Official dates for 2026, 2027 and 2028 were checked against
// https://www.business.vic.gov.au/business-information/public-holidays
// on 18 November 2026. Later years are calculated and marked as not yet official.
// The AFL Grand Final Friday is never calculated. It is added only when Business Victoria has published it.
// The 2022 National Day of Mourning is an announced one-off, not part of the yearly rule.

const OFFICIAL = {
  2019: [
    ["2019-01-01", "New Year's Day"],
    ["2019-01-28", "Australia Day"],
    ["2019-03-11", "Labour Day"],
    ["2019-04-19", "Good Friday"],
    ["2019-04-20", "Saturday before Easter Sunday"],
    ["2019-04-21", "Easter Sunday"],
    ["2019-04-22", "Easter Monday"],
    ["2019-04-25", "ANZAC Day"],
    ["2019-06-10", "Queen's Birthday"],
    ["2019-09-27", "Friday before the AFL Grand Final"],
    ["2019-11-05", "Melbourne Cup"],
    ["2019-12-25", "Christmas Day"],
    ["2019-12-26", "Boxing Day"]
  ],
  2020: [
    ["2020-01-01", "New Year's Day"],
    ["2020-01-27", "Australia Day"],
    ["2020-03-09", "Labour Day"],
    ["2020-04-10", "Good Friday"],
    ["2020-04-11", "Saturday before Easter Sunday"],
    ["2020-04-12", "Easter Sunday"],
    ["2020-04-13", "Easter Monday"],
    ["2020-04-25", "ANZAC Day"],
    ["2020-06-08", "Queen's Birthday"],
    ["2020-10-23", "Friday before the AFL Grand Final"],
    ["2020-11-03", "Melbourne Cup"],
    ["2020-12-25", "Christmas Day"],
    ["2020-12-26", "Boxing Day"],
    ["2020-12-28", "Boxing Day holiday"]
  ],
  2022: [
    ["2022-01-01", "New Year's Day"],
    ["2022-01-03", "New Year's Day holiday"],
    ["2022-01-26", "Australia Day"],
    ["2022-03-14", "Labour Day"],
    ["2022-04-15", "Good Friday"],
    ["2022-04-16", "Saturday before Easter Sunday"],
    ["2022-04-17", "Easter Sunday"],
    ["2022-04-18", "Easter Monday"],
    ["2022-04-25", "ANZAC Day"],
    ["2022-06-13", "Queen's Birthday"],
    ["2022-09-22", "National Day of Mourning"],
    ["2022-09-23", "Friday before the AFL Grand Final"],
    ["2022-11-01", "Melbourne Cup"],
    ["2022-12-25", "Christmas Day"],
    ["2022-12-26", "Boxing Day"],
    ["2022-12-27", "Christmas Day holiday"]
  ],
  2023: [
    ["2023-01-01", "New Year's Day"],
    ["2023-01-02", "New Year's Day holiday"],
    ["2023-01-26", "Australia Day"],
    ["2023-03-13", "Labour Day"],
    ["2023-04-07", "Good Friday"],
    ["2023-04-08", "Saturday before Easter Sunday"],
    ["2023-04-09", "Easter Sunday"],
    ["2023-04-10", "Easter Monday"],
    ["2023-04-25", "ANZAC Day"],
    ["2023-06-12", "King's Birthday"],
    ["2023-09-29", "Friday before the AFL Grand Final"],
    ["2023-11-07", "Melbourne Cup"],
    ["2023-12-25", "Christmas Day"],
    ["2023-12-26", "Boxing Day"]
  ],
  2026: [
    ["2026-01-01", "New Year's Day"],
    ["2026-01-26", "Australia Day"],
    ["2026-03-09", "Labour Day"],
    ["2026-04-03", "Good Friday"],
    ["2026-04-04", "Saturday before Easter Sunday"],
    ["2026-04-05", "Easter Sunday"],
    ["2026-04-06", "Easter Monday"],
    ["2026-04-25", "ANZAC Day"],
    ["2026-06-08", "King's Birthday"],
    ["2026-09-25", "Friday before the AFL Grand Final"],
    ["2026-11-03", "Melbourne Cup"],
    ["2026-12-25", "Christmas Day"],
    ["2026-12-26", "Boxing Day"],
    ["2026-12-28", "Boxing Day holiday"]
  ],
  2027: [
    ["2027-01-01", "New Year's Day"],
    ["2027-01-26", "Australia Day"],
    ["2027-03-08", "Labour Day"],
    ["2027-03-26", "Good Friday"],
    ["2027-03-27", "Saturday before Easter Sunday"],
    ["2027-03-28", "Easter Sunday"],
    ["2027-03-29", "Easter Monday"],
    ["2027-04-25", "ANZAC Day"],
    ["2027-06-14", "King's Birthday"],
    ["2027-11-02", "Melbourne Cup"],
    ["2027-12-25", "Christmas Day"],
    ["2027-12-26", "Boxing Day"],
    ["2027-12-27", "Christmas Day holiday"],
    ["2027-12-28", "Boxing Day holiday"]
  ],
  2028: [
    ["2028-01-01", "New Year's Day"],
    ["2028-01-03", "New Year's Day holiday"],
    ["2028-01-26", "Australia Day"],
    ["2028-03-13", "Labour Day"],
    ["2028-04-14", "Good Friday"],
    ["2028-04-15", "Saturday before Easter Sunday"],
    ["2028-04-16", "Easter Sunday"],
    ["2028-04-17", "Easter Monday"],
    ["2028-04-25", "ANZAC Day"],
    ["2028-06-12", "King's Birthday"],
    ["2028-11-07", "Melbourne Cup"],
    ["2028-12-25", "Christmas Day"],
    ["2028-12-26", "Boxing Day"]
  ]
};

const ANNOUNCED_ONLY = new Set([
  "2019-09-27",
  "2020-10-23",
  "2022-09-22",
  "2022-09-23",
  "2023-09-29",
  "2026-09-25"
]);

export const CALCULATED_NOTE = "calculated, not yet official";

export function officialHolidays(year) {
  return OFFICIAL[year] ? OFFICIAL[year].map(row => [...row]) : null;
}

export function announcedOnly(day) {
  return ANNOUNCED_ONLY.has(day);
}

function iso(year, month, day) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function weekday(year, month, day) {
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

function addDays(day, count) {
  const [year, month, date] = day.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, date));
  next.setUTCDate(next.getUTCDate() + count);
  return next.toISOString().slice(0, 10);
}

function nthWeekday(year, month, wanted, n) {
  const first = weekday(year, month, 1);
  const shift = (wanted - first + 7) % 7;
  return iso(year, month, 1 + shift + (n - 1) * 7);
}

export function easterSunday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return iso(year, month, day);
}

export function victoriaHolidays(year) {
  const days = [];
  const push = (day, name) => days.push([day, name]);
  push(iso(year, 1, 1), "New Year's Day");
  const newYear = weekday(year, 1, 1);
  if (newYear === 6) push(iso(year, 1, 3), "New Year's Day holiday");
  if (newYear === 0) push(iso(year, 1, 2), "New Year's Day holiday");

  const australia = weekday(year, 1, 26);
  if (australia === 6) push(iso(year, 1, 28), "Australia Day");
  else if (australia === 0) push(iso(year, 1, 27), "Australia Day");
  else push(iso(year, 1, 26), "Australia Day");

  push(nthWeekday(year, 3, 1, 2), "Labour Day");

  const easter = easterSunday(year);
  push(addDays(easter, -2), "Good Friday");
  push(addDays(easter, -1), "Saturday before Easter Sunday");
  push(easter, "Easter Sunday");
  push(addDays(easter, 1), "Easter Monday");

  push(iso(year, 4, 25), "ANZAC Day");
  push(nthWeekday(year, 6, 1, 2), year >= 2023 ? "King's Birthday" : "Queen's Birthday");
  push(nthWeekday(year, 11, 2, 1), "Melbourne Cup");

  const christmas = iso(year, 12, 25);
  const boxing = iso(year, 12, 26);
  push(christmas, "Christmas Day");
  const christmasDay = weekday(year, 12, 25);
  if (christmasDay === 6) push(addDays(christmas, 2), "Christmas Day holiday");
  if (christmasDay === 0) push(addDays(christmas, 2), "Christmas Day holiday");
  push(boxing, "Boxing Day");
  const boxingDay = weekday(year, 12, 26);
  if (boxingDay === 6) push(addDays(boxing, 2), "Boxing Day holiday");
  if (boxingDay === 0) push(addDays(boxing, 2), "Boxing Day holiday");

  return days.sort((a, b) => a[0].localeCompare(b[0]));
}

export function holidaysForDatabase(now = new Date()) {
  const year = Number(new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Melbourne", year: "numeric" }).format(now));
  const rows = [];
  for (let cursor = year; cursor <= year + 3; cursor += 1) {
    const official = officialHolidays(cursor);
    if (official) {
      for (const [day, name] of official) rows.push({ day, name, note: "" });
    } else {
      for (const [day, name] of victoriaHolidays(cursor)) rows.push({ day, name, note: CALCULATED_NOTE });
    }
  }
  return rows;
}
