import type { EventTimeZone } from "@/lib/types";

type HolidayCalendar = Record<string, string>;

function toDateString(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function shiftDate(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function addRange(calendar: HolidayCalendar, start: string, end: string, label: string) {
  for (let date = start; date <= end; date = shiftDate(date, 1)) calendar[date] = label;
}

// Annual schedules: https://www.gov.cn/zhengce/content/202511/content_7047090.htm
const CHINA_HOLIDAYS: HolidayCalendar = (() => {
  const calendar: HolidayCalendar = {};

  calendar["2024-01-01"] = "元旦";
  addRange(calendar, "2024-02-10", "2024-02-17", "春节");
  addRange(calendar, "2024-04-04", "2024-04-06", "清明节");
  addRange(calendar, "2024-05-01", "2024-05-05", "劳动节");
  addRange(calendar, "2024-06-08", "2024-06-10", "端午节");
  addRange(calendar, "2024-09-15", "2024-09-17", "中秋节");
  addRange(calendar, "2024-10-01", "2024-10-07", "国庆节");

  calendar["2025-01-01"] = "元旦";
  addRange(calendar, "2025-01-28", "2025-02-04", "春节");
  addRange(calendar, "2025-04-04", "2025-04-06", "清明节");
  addRange(calendar, "2025-05-01", "2025-05-05", "劳动节");
  addRange(calendar, "2025-05-31", "2025-06-02", "端午节");
  addRange(calendar, "2025-10-01", "2025-10-08", "国庆 / 中秋");

  addRange(calendar, "2026-01-01", "2026-01-03", "元旦");
  addRange(calendar, "2026-02-15", "2026-02-23", "春节");
  addRange(calendar, "2026-04-04", "2026-04-06", "清明节");
  addRange(calendar, "2026-05-01", "2026-05-05", "劳动节");
  addRange(calendar, "2026-06-19", "2026-06-21", "端午节");
  addRange(calendar, "2026-09-25", "2026-09-27", "中秋节");
  addRange(calendar, "2026-10-01", "2026-10-07", "国庆节");

  return calendar;
})();

function nthMonday(year: number, month: number, occurrence: number) {
  const firstDay = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const firstMonday = 1 + ((8 - firstDay) % 7);
  return firstMonday + (occurrence - 1) * 7;
}

function japaneseEquinoxDay(year: number, season: "spring" | "autumn") {
  const base = season === "spring" ? 20.8431 : 23.2488;
  return Math.floor(base + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
}

// Holiday rules: https://www8.cao.go.jp/chosei/shukujitsu/gaiyou.html
function buildJapanHolidays(year: number) {
  if (year < 2000 || year > 2099) return {};
  const calendar: HolidayCalendar = {};
  const add = (month: number, day: number, label: string) => { calendar[toDateString(year, month, day)] = label; };

  add(1, 1, "元旦");
  add(1, nthMonday(year, 1, 2), "成人日");
  add(2, 11, "建国纪念日");
  if (year >= 2020) add(2, 23, "天皇诞生日");
  add(3, japaneseEquinoxDay(year, "spring"), "春分日");
  add(4, 29, "昭和日");
  add(5, 3, "宪法纪念日");
  add(5, 4, "绿之日");
  add(5, 5, "儿童节");

  if (year === 2020) {
    add(7, 23, "海之日");
    add(7, 24, "体育日");
    add(8, 10, "山之日");
  } else if (year === 2021) {
    add(7, 22, "海之日");
    add(7, 23, "体育日");
    add(8, 8, "山之日");
  } else {
    add(7, nthMonday(year, 7, 3), "海之日");
    add(8, 11, "山之日");
    add(10, nthMonday(year, 10, 2), "体育日");
  }

  add(9, nthMonday(year, 9, 3), "敬老日");
  add(9, japaneseEquinoxDay(year, "autumn"), "秋分日");
  add(11, 3, "文化日");
  add(11, 23, "勤劳感谢日");

  const yearStart = `${year}-01-02`;
  const yearEnd = `${year}-12-30`;
  for (let date = yearStart; date <= yearEnd; date = shiftDate(date, 1)) {
    if (!calendar[date] && calendar[shiftDate(date, -1)] && calendar[shiftDate(date, 1)]) {
      calendar[date] = "国民休息日";
    }
  }

  Object.keys(calendar).forEach((date) => {
    if (new Date(`${date}T00:00:00Z`).getUTCDay() !== 0) return;
    let substitute = shiftDate(date, 1);
    while (calendar[substitute]) substitute = shiftDate(substitute, 1);
    calendar[substitute] = "补休";
  });

  return calendar;
}

const japanByYear = new Map<number, HolidayCalendar>();

export function getHolidayLabel(date: string, timeZone: EventTimeZone) {
  if (timeZone === "Asia/Shanghai") return CHINA_HOLIDAYS[date] ?? null;
  if (timeZone !== "Asia/Tokyo") return null;
  const year = Number(date.slice(0, 4));
  const calendar = japanByYear.get(year) ?? buildJapanHolidays(year);
  japanByYear.set(year, calendar);
  return calendar[date] ?? null;
}
