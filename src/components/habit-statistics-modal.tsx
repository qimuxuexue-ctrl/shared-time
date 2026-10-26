"use client";

import { ArrowDownIcon, ArrowUpIcon, ChartBarIcon } from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";

import { Modal } from "@/components/modal";
import { addDaysToDateString, getMondayDateString } from "@/lib/dates";
import type { HabitCheckin, HabitFrequency, HabitRecord } from "@/lib/habits";

type RangeKey = "week" | "four-weeks" | "three-months" | "year";
type DateRange = { from: string; to: string };
type PeriodStat = {
  key: string;
  label: string;
  start: string;
  end: string;
  actual: number;
  target: number;
  rate: number;
  ongoing: boolean;
};

const RANGE_OPTIONS: Array<{ value: RangeKey; label: string }> = [
  { value: "week", label: "本周" },
  { value: "four-weeks", label: "近 4 周" },
  { value: "three-months", label: "近 3 个月" },
  { value: "year", label: "今年" },
];

function toDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function toDateString(value: Date) {
  return value.toISOString().slice(0, 10);
}

function addMonths(value: string, amount: number) {
  const date = toDate(value);
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + amount);
  return toDateString(date);
}

function daysBetween(from: string, to: string) {
  return Math.round((toDate(to).getTime() - toDate(from).getTime()) / 86_400_000);
}

function getRanges(range: RangeKey, today: string) {
  const monthStart = `${today.slice(0, 7)}-01`;
  const current = range === "week"
    ? { from: getMondayDateString(today), to: today }
    : range === "four-weeks"
      ? { from: addDaysToDateString(getMondayDateString(today), -21), to: today }
      : range === "three-months"
        ? { from: addMonths(monthStart, -2), to: today }
        : { from: `${today.slice(0, 4)}-01-01`, to: today };
  const previousTo = addDaysToDateString(current.from, -1);
  const previous = {
    from: addDaysToDateString(previousTo, -daysBetween(current.from, current.to)),
    to: previousTo,
  };
  return { current, previous };
}

function periodRange(date: string, frequency: HabitFrequency): [string, string] {
  if (frequency === "daily") return [date, date];
  if (frequency === "weekly") {
    const start = getMondayDateString(date);
    return [start, addDaysToDateString(start, 6)];
  }
  const [year, month, day] = date.split("-").map(Number);
  const prefix = `${year}-${String(month).padStart(2, "0")}-`;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (frequency === "half_monthly") return day <= 15
    ? [`${prefix}01`, `${prefix}15`]
    : [`${prefix}16`, `${prefix}${lastDay}`];
  return [`${prefix}01`, `${prefix}${lastDay}`];
}

function formatShortDate(date: string) {
  return `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;
}

function naturalPeriodLabel(start: string, frequency: HabitFrequency) {
  if (frequency === "daily" || frequency === "weekly") return formatShortDate(start);
  const month = Number(start.slice(5, 7));
  if (frequency === "half_monthly") return `${month}月${Number(start.slice(8, 10)) === 1 ? "上" : "下"}`;
  return `${month}月`;
}

function buildNaturalPeriods(habit: HabitRecord, checkins: HabitCheckin[], range: DateRange, today: string) {
  const periods: PeriodStat[] = [];
  let cursor = range.from;
  while (cursor <= range.to) {
    const [rawStart, rawEnd] = periodRange(cursor, habit.frequency);
    const start = [rawStart, range.from, habit.activeFrom ?? rawStart].sort().at(-1)!;
    const end = [rawEnd, range.to, today, habit.activeUntil ?? rawEnd].sort()[0];
    if (start <= end) {
      const actual = checkins
        .filter((item) => item.habitId === habit.id && item.date >= start && item.date <= end)
        .reduce((sum, item) => sum + item.count, 0);
      periods.push({
        key: rawStart,
        label: naturalPeriodLabel(rawStart, habit.frequency),
        start,
        end,
        actual,
        target: habit.targetCount,
        rate: Math.min(100, Math.round((actual / habit.targetCount) * 100)),
        ongoing: rawEnd > today,
      });
    }
    cursor = addDaysToDateString(rawEnd, 1);
  }
  return periods;
}

function groupPeriods(periods: PeriodStat[], range: RangeKey, frequency: HabitFrequency) {
  const grouping = frequency === "daily" && range === "year"
    ? "month"
    : frequency === "daily" && range === "three-months"
      ? "week"
      : null;
  if (!grouping) return periods;
  const groups = new Map<string, PeriodStat[]>();
  periods.forEach((period) => {
    const key = grouping === "month" ? period.start.slice(0, 7) : getMondayDateString(period.start);
    groups.set(key, [...(groups.get(key) ?? []), period]);
  });
  return Array.from(groups.entries()).map(([key, items]) => {
    const actual = items.reduce((sum, item) => sum + item.actual, 0);
    const target = items.reduce((sum, item) => sum + item.target, 0);
    return {
      key,
      label: grouping === "month" ? `${Number(key.slice(5, 7))}月` : formatShortDate(key),
      start: items[0].start,
      end: items.at(-1)!.end,
      actual,
      target,
      rate: target ? Math.min(100, Math.round((actual / target) * 100)) : 0,
      ongoing: items.some((item) => item.ongoing),
    };
  });
}

function summarize(periods: PeriodStat[]) {
  const actual = periods.reduce((sum, item) => sum + item.actual, 0);
  const target = periods.reduce((sum, item) => sum + item.target, 0);
  return {
    actual,
    target,
    rate: target ? Math.min(100, Math.round((actual / target) * 100)) : 0,
    completed: periods.filter((item) => item.actual >= item.target).length,
  };
}

function currentStreak(periods: PeriodStat[]) {
  const ordered = [...periods].reverse();
  if (ordered[0]?.ongoing && ordered[0].actual < ordered[0].target) ordered.shift();
  let streak = 0;
  for (const period of ordered) {
    if (period.actual < period.target) break;
    streak += 1;
  }
  return streak;
}

function formatMinutes(minutes: number) {
  if (minutes < 60) return `${minutes} 分钟`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours} 小时 ${remainder} 分` : `${hours} 小时`;
}

export function HabitStatisticsModal({ code, identityId, today, habits, initialHabitId, onClose }: {
  code: string;
  identityId: string;
  today: string;
  habits: HabitRecord[];
  initialHabitId: string | null;
  onClose: () => void;
}) {
  const [habitId, setHabitId] = useState(initialHabitId ?? habits[0]?.id ?? "");
  const [range, setRange] = useState<RangeKey>("four-weeks");
  const [result, setResult] = useState<{ key: string; checkins: HabitCheckin[]; error: string }>({ key: "", checkins: [], error: "" });
  const [selectedPeriodKey, setSelectedPeriodKey] = useState<string | null>(null);
  const habit = habits.find((item) => item.id === habitId) ?? habits[0];
  const ranges = useMemo(() => getRanges(range, today), [range, today]);
  const requestKey = habit ? `${habit.id}:${ranges.previous.from}:${ranges.current.to}` : "empty";
  const loading = result.key !== requestKey;
  const checkins = result.key === requestKey ? result.checkins : [];
  const error = result.key === requestKey ? result.error : "";

  useEffect(() => {
    if (!habit) return;
    const controller = new AbortController();
    const query = new URLSearchParams({
      identityId,
      habitId: habit.id,
      from: ranges.previous.from,
      to: ranges.current.to,
    });
    fetch(`/api/events/${code}/habits?${query}`, { signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json() as { checkins?: HabitCheckin[]; error?: string };
        if (!response.ok || !payload.checkins) throw new Error(payload.error ?? "读取统计失败");
        setResult({ key: requestKey, checkins: payload.checkins, error: "" });
      })
      .catch((caught: unknown) => {
        if ((caught as { name?: string }).name !== "AbortError") setResult({ key: requestKey, checkins: [], error: caught instanceof Error ? caught.message : "读取统计失败" });
      });
    return () => controller.abort();
  }, [code, habit, identityId, ranges, requestKey]);

  const statistics = (() => {
    if (!habit || loading) return null;
    const currentNatural = buildNaturalPeriods(habit, checkins, ranges.current, today);
    const previousNatural = buildNaturalPeriods(habit, checkins, ranges.previous, ranges.previous.to);
    const chart = groupPeriods(currentNatural, range, habit.frequency);
    return {
      chart,
      currentPeriodCount: currentNatural.length,
      current: summarize(currentNatural),
      previous: summarize(previousNatural),
      streak: currentStreak([...previousNatural, ...currentNatural]),
    };
  })();

  if (!habit) return <Modal title="习惯统计" size="wide" onClose={onClose}><p className="text-sm text-slate-500">添加习惯并完成打卡后，这里会显示统计。</p></Modal>;

  const selectedPeriod = statistics?.chart.find((item) => item.key === selectedPeriodKey) ?? statistics?.chart.at(-1);
  const comparison = statistics ? statistics.current.rate - statistics.previous.rate : 0;
  const streakUnit = habit.frequency === "daily" ? "天" : habit.frequency === "weekly" ? "周" : habit.frequency === "monthly" ? "个月" : "个周期";
  const totalValue = habit.durationMinutes
    ? formatMinutes((statistics?.current.actual ?? 0) * habit.durationMinutes)
    : `${statistics?.current.actual ?? 0} 次`;

  return <Modal title="习惯统计" size="wide" onClose={onClose}>
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <div><label htmlFor="statistics-habit" className="field-label">查看习惯</label><select id="statistics-habit" className="text-input" value={habit.id} onChange={(event) => setHabitId(event.target.value)}>{habits.map((item) => <option key={item.id} value={item.id}>{item.title}{item.activeUntil ? " · 短期" : ""}</option>)}</select></div>
        <div className="grid grid-cols-4 gap-1 rounded-xl bg-slate-100 p-1" aria-label="统计范围">{RANGE_OPTIONS.map((option) => <button key={option.value} type="button" className={`rounded-lg px-2.5 py-2 text-xs font-semibold whitespace-nowrap transition ${range === option.value ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`} onClick={() => setRange(option.value)} aria-pressed={range === option.value}>{option.label}</button>)}</div>
      </div>

      <p className="text-xs leading-5 text-slate-500">这里只统计你的打卡；完成率会按照“{habit.frequency === "daily" ? "每天" : habit.frequency === "weekly" ? "每周" : habit.frequency === "half_monthly" ? "每半个月" : "每月"} {habit.targetCount} 次”的目标计算。</p>

      {error ? <p className="form-error" role="alert">{error}</p> : loading || !statistics ? <div className="space-y-4" aria-label="正在读取统计"><div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <div key={index} className="h-20 animate-pulse rounded-xl bg-slate-100" />)}</div><div className="h-56 animate-pulse rounded-2xl bg-slate-100" /></div> : <>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rounded-xl bg-slate-50 px-3 py-3"><p className="text-xs text-slate-500">完成率</p><p className="mt-1 text-xl font-semibold tabular-nums text-slate-900">{statistics.current.rate}%</p></div>
          <div className="rounded-xl bg-slate-50 px-3 py-3"><p className="text-xs text-slate-500">达标周期</p><p className="mt-1 text-xl font-semibold tabular-nums text-slate-900">{statistics.current.completed}<span className="ml-1 text-sm font-medium text-slate-400">/ {statistics.currentPeriodCount}</span></p></div>
          <div className="rounded-xl bg-slate-50 px-3 py-3"><p className="text-xs text-slate-500">连续达标</p><p className="mt-1 text-xl font-semibold tabular-nums text-slate-900">{statistics.streak}<span className="ml-1 text-sm font-medium text-slate-400">{streakUnit}</span></p></div>
          <div className="rounded-xl bg-slate-50 px-3 py-3"><p className="text-xs text-slate-500">{habit.durationMinutes ? "累计投入" : "累计打卡"}</p><p className="mt-1 text-lg font-semibold tabular-nums text-slate-900">{totalValue}</p></div>
        </div>

        <div className="flex items-center gap-2 rounded-xl bg-blue-50/70 px-3 py-2.5 text-xs text-slate-600">
          {statistics.previous.target ? comparison >= 0 ? <ArrowUpIcon size={14} weight="bold" className="text-blue-600" /> : <ArrowDownIcon size={14} weight="bold" className="text-slate-400" /> : <ChartBarIcon size={14} weight="bold" className="text-blue-600" />}
          {statistics.previous.target ? <>较上一周期<span className={`font-semibold tabular-nums ${comparison >= 0 ? "text-blue-700" : "text-slate-700"}`}>{comparison >= 0 ? "+" : ""}{comparison} 个百分点</span></> : "上一周期还没有可比较的数据"}
        </div>

        <section aria-labelledby="habit-chart-title">
          <div className="flex items-end justify-between gap-3"><div><h3 id="habit-chart-title" className="text-sm font-semibold text-slate-800">周期完成率</h3><p className="mt-1 text-xs text-slate-400">达到 100% 即完成本周期目标</p></div><span className="text-xs tabular-nums text-slate-400">{formatShortDate(ranges.current.from)}–{formatShortDate(ranges.current.to)}</span></div>
          {statistics.chart.length ? <div className="mt-4 overflow-x-auto pb-1">
            <div className="relative h-52" style={{ minWidth: statistics.chart.length > 10 ? statistics.chart.length * 38 : "100%" }}>
              <div className="absolute inset-x-0 top-2 border-t border-dashed border-blue-200"><span className="absolute -top-4 right-0 text-[10px] font-medium text-blue-400">目标 100%</span></div>
              <div className="absolute inset-x-0 bottom-6 top-2 flex items-end gap-2">{statistics.chart.map((period) => <button key={period.key} type="button" className="group flex h-full min-w-0 flex-1 items-end rounded-t-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300" onClick={() => setSelectedPeriodKey(period.key)} aria-label={`${period.label}，完成 ${period.actual}/${period.target} 次，${period.rate}%`}><span className={`block w-full rounded-t-md transition-[height,background-color] duration-200 ${period.key === selectedPeriod?.key ? "bg-blue-600" : period.rate >= 100 ? "bg-blue-500" : period.rate > 0 ? "bg-blue-300" : "bg-slate-200"} ${period.ongoing ? "opacity-70" : ""}`} style={{ height: `${Math.max(3, period.rate)}%` }} /></button>)}</div>
              <div className="absolute inset-x-0 bottom-0 flex gap-2">{statistics.chart.map((period) => <span key={period.key} className={`min-w-0 flex-1 truncate text-center text-[10px] tabular-nums ${period.key === selectedPeriod?.key ? "font-semibold text-blue-700" : "text-slate-400"}`}>{period.label}</span>)}</div>
            </div>
          </div> : <div className="mt-4 rounded-xl bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">这个时间范围内还没有可统计的周期。</div>}
          {selectedPeriod ? <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-100 px-3 py-2.5 text-xs"><span className="tabular-nums text-slate-500">{formatShortDate(selectedPeriod.start)}–{formatShortDate(selectedPeriod.end)}</span><span className="font-semibold tabular-nums text-slate-800">完成 {selectedPeriod.actual}/{selectedPeriod.target} 次 · {selectedPeriod.rate}%</span></div> : null}
        </section>
      </>}
    </div>
  </Modal>;
}
