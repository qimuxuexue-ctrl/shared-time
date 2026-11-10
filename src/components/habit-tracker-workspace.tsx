"use client";

import {
  ArrowLeftIcon, CalendarBlankIcon, CaretLeftIcon, CaretRightIcon, ChartBarIcon,
  CheckIcon, ClockIcon, CopyIcon, FolderSimpleIcon, HashIcon, PencilSimpleIcon,
  PlusIcon, SignOutIcon, TargetIcon, TrashIcon, TrophyIcon, UsersThreeIcon,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";

import {
  CALENDAR_HOUR_END, CALENDAR_HOUR_HEIGHT, CALENDAR_HOUR_START,
  DurationCalendarBlock,
} from "@/components/duration-calendar-block";
import { CalendarHolidayLabel } from "@/components/calendar-holiday-label";
import { DatePicker } from "@/components/date-picker";
import { EventPresence } from "@/components/event-presence";
import { HabitGoalModal } from "@/components/habit-goal-modal";
import { HabitGroupManager } from "@/components/habit-group-manager";
import { HabitStatisticsModal } from "@/components/habit-statistics-modal";
import { Modal } from "@/components/modal";
import { WeekPicker } from "@/components/week-picker";
import { addDaysToDateString, EVENT_TIME_ZONE_OPTIONS, getDateStringInTimeZone, getMondayDateString } from "@/lib/dates";
import {
  getHabitPeriodRange, HABIT_DURATION_OPTIONS, HABIT_FREQUENCIES,
  type HabitCheckin, type HabitDurationMinutes, type HabitFrequency, type HabitGoal, type HabitGroup, type HabitRecord,
} from "@/lib/habits";
import type { EventTimeZone, EventWorkspaceData } from "@/lib/types";

type Habit = HabitRecord;
type Checkin = HabitCheckin;

const HOURS = Array.from({ length: CALENDAR_HOUR_END - CALENDAR_HOUR_START }, (_, index) => index + CALENDAR_HOUR_START);
const WEEKDAYS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
const HABIT_COLORS = [
  { dot: "bg-blue-500", idle: "border-blue-100 bg-blue-50 text-blue-800", active: "border-blue-300 bg-blue-100 text-blue-900" },
  { dot: "bg-emerald-500", idle: "border-emerald-100 bg-emerald-50 text-emerald-800", active: "border-emerald-300 bg-emerald-100 text-emerald-900" },
  { dot: "bg-amber-500", idle: "border-amber-100 bg-amber-50 text-amber-800", active: "border-amber-300 bg-amber-100 text-amber-900" },
  { dot: "bg-violet-500", idle: "border-violet-100 bg-violet-50 text-violet-800", active: "border-violet-300 bg-violet-100 text-violet-900" },
  { dot: "bg-rose-500", idle: "border-rose-100 bg-rose-50 text-rose-800", active: "border-rose-300 bg-rose-100 text-rose-900" },
  { dot: "bg-cyan-500", idle: "border-cyan-100 bg-cyan-50 text-cyan-800", active: "border-cyan-300 bg-cyan-100 text-cyan-900" },
  { dot: "bg-lime-500", idle: "border-lime-100 bg-lime-50 text-lime-800", active: "border-lime-300 bg-lime-100 text-lime-900" },
  { dot: "bg-indigo-500", idle: "border-indigo-100 bg-indigo-50 text-indigo-800", active: "border-indigo-300 bg-indigo-100 text-indigo-900" },
  { dot: "bg-orange-500", idle: "border-orange-100 bg-orange-50 text-orange-800", active: "border-orange-300 bg-orange-100 text-orange-900" },
  { dot: "bg-teal-500", idle: "border-teal-100 bg-teal-50 text-teal-800", active: "border-teal-300 bg-teal-100 text-teal-900" },
  { dot: "bg-fuchsia-500", idle: "border-fuchsia-100 bg-fuchsia-50 text-fuchsia-800", active: "border-fuchsia-300 bg-fuchsia-100 text-fuchsia-900" },
  { dot: "bg-sky-500", idle: "border-sky-100 bg-sky-50 text-sky-800", active: "border-sky-300 bg-sky-100 text-sky-900" },
];

function formatShortDate(date: string) {
  const [, month, day] = date.split("-");
  return `${Number(month)}/${Number(day)}`;
}

function formatTimeRange(startHour: number, durationMinutes: number | null) {
  const minutes = startHour * 60 + (durationMinutes ?? 60);
  const end = `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  return `${String(startHour).padStart(2, "0")}:00–${end}`;
}

function isHabitVisible(habit: Habit, today: string) {
  return habit.activeUntil === null || habit.activeUntil >= today;
}

async function fetchHabitGoals(code: string, identityId: string) {
  const query = new URLSearchParams({ identityId });
  const response = await fetch(`/api/events/${code}/habit-goals?${query}`);
  const payload = await response.json() as { goals?: HabitGoal[]; error?: string };
  if (!response.ok || !payload.goals) throw new Error(payload.error ?? "读取目标失败");
  return payload.goals;
}

export function HabitTrackerWorkspace({ data, identityId, copied, timeZoneSaving, onCopy, onDelete, onLeave, onEditName, onEditTag, onTimeZoneChange }: {
  data: EventWorkspaceData;
  identityId: string;
  copied: boolean;
  timeZoneSaving: boolean;
  onCopy: () => void;
  onDelete: () => void;
  onLeave: () => void;
  onEditName: () => void;
  onEditTag: () => void;
  onTimeZoneChange: (timeZone: EventTimeZone) => void;
}) {
  const today = getDateStringInTimeZone(data.event.timeZone);
  const [weekStart, setWeekStart] = useState(() => getMondayDateString(today));
  const dates = useMemo(() => Array.from({ length: 7 }, (_, index) => addDaysToDateString(weekStart, index)), [weekStart]);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [groups, setGroups] = useState<HabitGroup[]>([]);
  const [goals, setGoals] = useState<HabitGoal[]>([]);
  const [checkins, setCheckins] = useState<Checkin[]>([]);
  const [activeHabitId, setActiveHabitId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Habit | "new" | "short-term" | null>(null);
  const [statisticsOpen, setStatisticsOpen] = useState(false);
  const [groupsOpen, setGroupsOpen] = useState(false);
  const [goalDraft, setGoalDraft] = useState<HabitGoal | "new" | null>(null);
  const [loading, setLoading] = useState(true);
  const [goalsLoading, setGoalsLoading] = useState(true);
  const [goalsError, setGoalsError] = useState("");
  const [error, setError] = useState("");
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const requestId = useRef(0);
  const visibleHabits = useMemo(() => habits.filter((habit) => isHabitVisible(habit, today)), [habits, today]);
  const regularHabits = useMemo(() => visibleHabits.filter((habit) => habit.activeUntil === null), [visibleHabits]);
  const shortTermHabits = useMemo(() => visibleHabits.filter((habit) => habit.activeUntil !== null), [visibleHabits]);
  const ungroupedHabits = useMemo(() => regularHabits.filter((habit) => habit.groupId === null || !groups.some((group) => group.id === habit.groupId)), [groups, regularHabits]);
  const habitCounts = useMemo(() => Object.fromEntries(groups.map((group) => [group.id, regularHabits.filter((habit) => habit.groupId === group.id).length])), [groups, regularHabits]);
  const activeHabit = visibleHabits.find((habit) => habit.id === activeHabitId) ?? null;

  const loadGoals = useCallback(async () => {
    try {
      const nextGoals = await fetchHabitGoals(data.event.shareCode, identityId);
      setGoals(nextGoals);
      setGoalsError("");
    } catch (caught) {
      setGoalsError(caught instanceof Error ? caught.message : "读取目标失败");
    } finally {
      setGoalsLoading(false);
    }
  }, [data.event.shareCode, identityId]);

  useEffect(() => {
    let current = true;
    void fetchHabitGoals(data.event.shareCode, identityId)
      .then((nextGoals) => {
        if (!current) return;
        setGoals(nextGoals);
        setGoalsError("");
      })
      .catch((caught: unknown) => {
        if (current) setGoalsError(caught instanceof Error ? caught.message : "读取目标失败");
      })
      .finally(() => {
        if (current) setGoalsLoading(false);
      });
    return () => { current = false; };
  }, [data.event.shareCode, identityId]);

  useEffect(() => {
    const currentRequest = ++requestId.current;
    const query = new URLSearchParams({ identityId, month: weekStart.slice(0, 7) });
    fetch(`/api/events/${data.event.shareCode}/habits?${query}`)
      .then(async (response) => {
        const payload = await response.json() as { habits?: Habit[]; groups?: HabitGroup[]; checkins?: Checkin[]; error?: string };
        if (!response.ok || !payload.habits || !payload.groups || !payload.checkins) throw new Error(payload.error ?? "读取习惯失败");
        if (currentRequest !== requestId.current) return;
        setHabits(payload.habits);
        setGroups(payload.groups);
        setCheckins(payload.checkins);
        const visible = payload.habits.filter((habit) => isHabitVisible(habit, today));
        setActiveHabitId((current) => visible.some((habit) => habit.id === current) ? current : visible[0]?.id ?? null);
        setError("");
      })
      .catch((caught: unknown) => {
        if (currentRequest === requestId.current) setError(caught instanceof Error ? caught.message : "读取习惯失败");
      })
      .finally(() => {
        if (currentRequest === requestId.current) setLoading(false);
      });
    return () => { requestId.current += 1; };
  }, [data.event.shareCode, identityId, today, weekStart]);

  const periodProgress = (habit: Habit, date = dates.includes(today) ? today : weekStart) => {
    const [start, end] = getHabitPeriodRange(date, habit.frequency);
    return checkins.filter((item) => item.habitId === habit.id && item.date >= start && item.date <= end)
      .reduce((sum, item) => sum + item.count, 0);
  };

  const toggleCheckin = async (habit: Habit, date: string, startHour: number) => {
    if (savingKey) return;
    const existing = checkins.find((item) => item.habitId === habit.id && item.date === date && item.startHour === startHour);
    if (!existing && ((habit.activeFrom && date < habit.activeFrom) || (habit.activeUntil && date > habit.activeUntil))) {
      setError(`「${habit.title}」只能在 ${formatShortDate(habit.activeFrom!)}–${formatShortDate(habit.activeUntil!)} 期间打卡`);
      return;
    }
    const visualMinutes = Math.max(60, habit.durationMinutes ?? 60);
    if (!existing && startHour * 60 + visualMinutes > CALENDAR_HOUR_END * 60) {
      setError("该时长会超出当天范围，请选择更早的开始时间");
      return;
    }
    const key = `${habit.id}:${date}:${startHour}`;
    setSavingKey(key);
    setError("");
    try {
      const response = await fetch(`/api/events/${data.event.shareCode}/habits`, {
        method: "PATCH", headers: { "content-type": "application/json" },
        body: JSON.stringify({ identityId, habitId: habit.id, date, startHour, count: existing ? 0 : 1 }),
      });
      const payload = await response.json() as { id?: string; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "打卡失败");
      setCheckins((items) => existing
        ? items.filter((item) => item.id !== existing.id)
        : [...items, { id: payload.id!, habitId: habit.id, date, startHour, count: 1 }]);
      void loadGoals();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "打卡失败");
    } finally {
      setSavingKey(null);
    }
  };

  const renderHabitCards = (items: Habit[], withTopMargin = true) => <div className={`${withTopMargin ? "mt-4 " : ""}space-y-2`}>{items.map((habit) => {
    const index = habits.findIndex((item) => item.id === habit.id);
    const selected = habit.id === activeHabitId;
    const durationLabel = HABIT_DURATION_OPTIONS.find((option) => option.value === habit.durationMinutes)?.label;
    return <div key={habit.id} className={`flex items-center gap-1 rounded-xl border p-1 transition ${selected ? "border-blue-200 bg-blue-50" : "border-slate-100 bg-slate-50"}`}><button type="button" className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-2 text-left" onClick={() => setActiveHabitId(habit.id)} aria-pressed={selected}><span className={`size-2.5 shrink-0 rounded-full ${HABIT_COLORS[index % HABIT_COLORS.length].dot}`} /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-slate-800">{habit.title}</span><span className="block text-xs text-slate-500">{HABIT_FREQUENCIES.find((item) => item.value === habit.frequency)?.label} {habit.targetCount} 次{durationLabel ? ` · ${durationLabel}` : ""}</span>{habit.activeFrom && habit.activeUntil ? <span className="mt-0.5 block text-[11px] tabular-nums text-blue-500">{formatShortDate(habit.activeFrom)}–{formatShortDate(habit.activeUntil)}</span> : null}</span><span className="text-xs font-semibold tabular-nums text-blue-600">{periodProgress(habit)}/{habit.targetCount}</span></button><button type="button" className="grid size-8 shrink-0 place-items-center rounded-lg text-slate-300 transition hover:bg-white hover:text-blue-500" onClick={() => setDraft(habit)} aria-label={`编辑${habit.title}`}><PencilSimpleIcon size={13} weight="bold" /></button></div>;
  })}</div>;

  return <main className="min-h-[100dvh] bg-[var(--page)] pb-10">
    <header className="border-b border-slate-200/80 bg-white/90 backdrop-blur-xl">
      <div className="mx-auto flex min-h-[72px] max-w-[1480px] items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-3"><Link href="/" className="icon-button shrink-0" aria-label="返回我的事件"><ArrowLeftIcon size={18} weight="bold" /></Link><div className="min-w-0"><div className="flex min-w-0 items-center gap-1"><h1 className="truncate text-lg font-semibold tracking-tight text-slate-950">{data.event.name}</h1>{data.event.isCreator ? <button type="button" className="grid size-7 shrink-0 place-items-center rounded-lg text-slate-300 transition hover:bg-slate-100 hover:text-blue-600" onClick={onEditName} aria-label="修改事件名称" title="修改事件名称"><PencilSimpleIcon size={13} weight="bold" /></button> : null}</div><p className="mt-0.5 flex items-center gap-1 text-xs font-medium text-slate-500"><HashIcon size={12} weight="bold" />{data.event.shareCode}</p></div></div>
        <EventPresence code={data.event.shareCode} identityId={identityId} />
        <div className="flex shrink-0 items-center gap-2"><button type="button" className="secondary-button text-red-600 hover:border-red-200 hover:bg-red-50" onClick={data.event.isCreator ? onDelete : onLeave}>{data.event.isCreator ? <TrashIcon size={18} weight="bold" /> : <SignOutIcon size={18} weight="bold" />}<span className="hidden sm:inline">{data.event.isCreator ? "删除事件" : "退出事件"}</span></button><button type="button" className="secondary-button" onClick={onCopy}>{copied ? <CheckIcon size={18} weight="bold" /> : <CopyIcon size={18} weight="bold" />}<span className="hidden sm:inline">{copied ? "已复制" : "分享事件"}</span></button></div>
      </div>
    </header>

    <div className="mx-auto max-w-[1480px] space-y-5 px-4 py-6 sm:px-6">
      <section className="flex items-start justify-between gap-4 rounded-[18px] border border-slate-200/80 bg-white p-4">
        <div><p className="flex items-center gap-2 text-sm font-medium text-slate-500"><ClockIcon size={16} weight="bold" />{data.event.isCreator ? <select className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-sm" value={data.event.timeZone} disabled={timeZoneSaving} onChange={(event) => onTimeZoneChange(event.target.value as EventTimeZone)} aria-label="事件时区">{EVENT_TIME_ZONE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select> : EVENT_TIME_ZONE_OPTIONS.find((option) => option.value === data.event.timeZone)?.label}</p><h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-950">习惯时间表</h2><p className="mt-2 max-w-md text-xs leading-5 text-slate-500">先在左侧选择一个习惯，再点击时间格完成打卡。设置了时长的习惯会按实际长度显示。</p></div>
        <button type="button" className="secondary-button shrink-0" disabled={!habits.length} onClick={() => setStatisticsOpen(true)}><ChartBarIcon size={17} weight="bold" />统计</button>
      </section>

      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <div className="grid items-start gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="space-y-4 lg:sticky lg:top-5">
          <section className="rounded-[18px] border border-slate-200/80 bg-white p-4">
            <div className="flex items-center justify-between gap-2"><div className="min-w-0"><h2 className="text-sm font-semibold text-slate-800">习惯清单</h2><p className="mt-1 truncate text-xs text-slate-400">先选习惯，再点右侧时间</p></div><div className="flex shrink-0 gap-1.5"><button type="button" className="inline-flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-600 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 active:scale-[0.98]" onClick={() => setGroupsOpen(true)}><FolderSimpleIcon className="shrink-0" size={15} weight="bold" />分组</button><button type="button" className="icon-button" onClick={() => setDraft("new")} aria-label="新增习惯"><PlusIcon size={18} weight="bold" /></button></div></div>
            {regularHabits.length ? groups.length ? <div className="mt-4 space-y-4">
              {groups.map((group) => {
                const items = regularHabits.filter((habit) => habit.groupId === group.id);
                return <section key={group.id} aria-label={group.name}><div className="mb-2 flex items-center gap-2 px-1"><FolderSimpleIcon size={14} weight="fill" className="text-blue-400" /><h3 className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-600">{group.name}</h3><span className="text-[11px] tabular-nums text-slate-400">{items.length}</span></div>{items.length ? renderHabitCards(items, false) : <p className="rounded-xl border border-dashed border-slate-200 px-3 py-3 text-center text-xs text-slate-400">这个分组还没有习惯</p>}</section>;
              })}
              {ungroupedHabits.length ? <section aria-label="未分组"><div className="mb-2 flex items-center gap-2 px-1"><span className="size-2 rounded-full bg-slate-300" /><h3 className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-500">未分组</h3><span className="text-[11px] tabular-nums text-slate-400">{ungroupedHabits.length}</span></div>{renderHabitCards(ungroupedHabits, false)}</section> : null}
            </div> : renderHabitCards(regularHabits) : <button type="button" className="mt-4 flex w-full items-center gap-2 rounded-xl border border-dashed border-blue-200 bg-blue-50/50 px-3 py-4 text-left text-sm font-medium text-blue-700 transition hover:bg-blue-50 active:scale-[0.99]" onClick={() => setDraft("new")}><PlusIcon size={16} weight="bold" />添加第一个习惯</button>}
            <p className="mt-4 text-xs leading-5 text-slate-400">习惯清单由成员共用；每个人只记录和查看自己的打卡时间。</p>
          </section>
          <section className="rounded-[18px] border border-slate-200/80 bg-white p-4">
            <div className="flex items-center justify-between gap-2"><div className="min-w-0"><h2 className="flex items-center gap-2 text-sm font-semibold text-slate-800"><TargetIcon size={17} weight="bold" className="text-blue-600" />目标</h2><p className="mt-1 text-xs text-slate-400">让习惯指向想实现的事</p></div><button type="button" className="icon-button shrink-0" disabled={!regularHabits.length} onClick={() => setGoalDraft("new")} aria-label="添加目标" title={regularHabits.length ? "添加目标" : "添加普通习惯后即可设定目标"}><PlusIcon size={18} weight="bold" /></button></div>
            {goalsLoading ? <div className="mt-4 space-y-2" aria-label="正在读取目标"><div className="h-20 animate-pulse rounded-xl bg-slate-100" /><div className="h-2 animate-pulse rounded-full bg-slate-100" /></div> : goals.length ? <div className="mt-4 space-y-2">{goals.map((goal) => {
              const achieved = goal.status === "achieved";
              const paused = goal.status === "paused";
              return <button key={goal.id} type="button" className={`w-full rounded-xl border p-3 text-left transition hover:-translate-y-0.5 hover:shadow-[0_8px_20px_rgba(51,65,85,0.08)] active:translate-y-0 ${achieved ? "border-emerald-100 bg-emerald-50/70" : paused ? "border-slate-200 bg-slate-50" : "border-blue-100 bg-blue-50/60"}`} onClick={() => setGoalDraft(goal)}><div className="flex items-start gap-2.5"><span className={`mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg ${achieved ? "bg-emerald-100 text-emerald-700" : paused ? "bg-slate-200 text-slate-500" : "bg-white text-blue-600 ring-1 ring-blue-100"}`}>{achieved ? <TrophyIcon size={15} weight="fill" /> : <TargetIcon size={15} weight="bold" />}</span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-slate-800">{goal.title}</span><span className="mt-0.5 block text-[11px] text-slate-500">{achieved ? "已实现" : paused ? "已暂停" : goal.targetDate ? `目标日 ${formatShortDate(goal.targetDate)}` : `${goal.habitIds.length} 个关联习惯`}</span></span><span className={`shrink-0 text-sm font-semibold tabular-nums ${achieved ? "text-emerald-700" : paused ? "text-slate-400" : "text-blue-600"}`}>{achieved ? 100 : goal.actionRate}%</span></div><span className="mt-3 block h-1.5 overflow-hidden rounded-full bg-white/90 ring-1 ring-slate-100"><span className={`block h-full rounded-full ${achieved ? "bg-emerald-500" : paused ? "bg-slate-300" : "bg-blue-500"}`} style={{ width: `${achieved ? 100 : goal.actionRate}%` }} /></span></button>;
            })}</div> : regularHabits.length ? <button type="button" className="mt-4 flex w-full items-center gap-2.5 rounded-xl border border-dashed border-blue-200 bg-blue-50/50 px-3 py-4 text-left transition hover:bg-blue-50 active:scale-[0.99]" onClick={() => setGoalDraft("new")}><span className="grid size-7 shrink-0 place-items-center rounded-full bg-white text-blue-600 ring-1 ring-blue-100"><PlusIcon size={14} weight="bold" /></span><span><span className="block text-xs font-semibold text-blue-700">添加第一个目标</span><span className="mt-0.5 block text-[11px] text-blue-500">把已有习惯关联起来</span></span></button> : <p className="mt-4 rounded-xl bg-slate-50 px-3 py-4 text-xs leading-5 text-slate-400">先添加普通习惯，之后可以随时设定目标。</p>}
            {goalsError ? <p className="mt-3 text-xs leading-5 text-red-500" role="alert">{goalsError}</p> : null}
            <p className="mt-4 text-xs leading-5 text-slate-400">目标由成员共用；行动进度按你的打卡记录计算。</p>
          </section>
          <section className="rounded-[18px] border border-slate-200/80 bg-white p-4">
            <div className="flex items-center justify-between gap-2"><div><h2 className="flex items-center gap-2 text-sm font-semibold text-slate-800"><CalendarBlankIcon size={17} weight="bold" className="text-blue-600" />短期习惯</h2><p className="mt-1 text-xs text-slate-400">只在设定日期内执行</p></div><button type="button" className="icon-button" onClick={() => setDraft("short-term")} aria-label="新增短期习惯"><PlusIcon size={18} weight="bold" /></button></div>
            {shortTermHabits.length ? renderHabitCards(shortTermHabits) : <button type="button" className="mt-4 flex w-full items-center gap-2.5 rounded-xl border border-dashed border-blue-200 bg-blue-50/50 px-3 py-4 text-left transition hover:bg-blue-50 active:scale-[0.99]" onClick={() => setDraft("short-term")}><span className="grid size-7 shrink-0 place-items-center rounded-full bg-white text-blue-600 ring-1 ring-blue-100"><PlusIcon size={14} weight="bold" /></span><span><span className="block text-xs font-semibold text-blue-700">添加短期习惯</span><span className="mt-0.5 block text-[11px] text-blue-500">设定一段需要坚持的时间</span></span></button>}
            <p className="mt-4 text-xs leading-5 text-slate-400">结束日期过去后，习惯和打卡记录会自动清除。</p>
          </section>
          <section className="rounded-[18px] border border-slate-200/80 bg-white p-4"><div className="mb-3 flex items-center justify-between"><h2 className="flex items-center gap-2 text-sm font-semibold text-slate-800"><UsersThreeIcon size={18} weight="bold" />参与者</h2><span className="text-sm text-slate-400">{data.members.length}</span></div><div className="space-y-2">{data.members.map((member) => member.isCurrent ? <button key={member.id} type="button" className="group flex w-full min-w-0 items-center gap-2 rounded-xl bg-slate-50 px-3 py-2.5 text-left transition hover:bg-slate-100" onClick={onEditTag}><span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: member.tagColor }} /><span className="min-w-0 truncate text-sm font-semibold text-slate-700">{member.tagName}</span><span className="ml-auto text-xs font-medium text-blue-600">你</span><PencilSimpleIcon size={13} weight="bold" className="text-slate-300 group-hover:text-blue-500" /></button> : <div key={member.id} className="flex min-w-0 items-center gap-2 rounded-xl bg-slate-50 px-3 py-2.5"><span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: member.tagColor }} /><span className="truncate text-sm font-semibold text-slate-700">{member.tagName}</span></div>)}</div></section>
        </aside>

        <section className="overflow-hidden rounded-[18px] border border-slate-200/80 bg-white" aria-label="习惯周时间表">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3"><div><WeekPicker weekStart={weekStart} currentWeek={getMondayDateString(today)} onWeekChange={(nextWeek) => { setLoading(true); setWeekStart(nextWeek); }} /><p className="mt-1 text-xs text-slate-400">{activeHabit ? `当前：${activeHabit.title}` : "请先添加并选择习惯"}</p></div><div className="flex gap-2"><button type="button" className="icon-button" onClick={() => { setLoading(true); setWeekStart(addDaysToDateString(weekStart, -7)); }} aria-label="上一周"><CaretLeftIcon size={17} weight="bold" /></button><button type="button" className="icon-button" onClick={() => { setLoading(true); setWeekStart(addDaysToDateString(weekStart, 7)); }} aria-label="下一周"><CaretRightIcon size={17} weight="bold" /></button></div></div>
          <div className="overflow-x-auto"><div className="min-w-[820px]"><div className="grid grid-cols-[68px_repeat(7,minmax(96px,1fr))] border-b border-slate-200"><div />{dates.map((date, index) => <div key={date} className="border-l border-slate-200 px-2 py-3 text-center text-slate-700"><div><span className="text-sm font-semibold">{WEEKDAYS[index]}</span><span className="ml-1 font-normal text-slate-400">{formatShortDate(date)}</span>{date === today ? <span className="ml-1 rounded bg-blue-50 px-1 py-0.5 text-[10px] font-semibold text-blue-600">今天</span> : null}</div><CalendarHolidayLabel date={date} timeZone={data.event.timeZone} /></div>)}</div>
            <div className="relative" style={{ height: HOURS.length * CALENDAR_HOUR_HEIGHT }}>
              {HOURS.map((hour) => <div key={hour} className="grid h-20 grid-cols-[68px_repeat(7,minmax(96px,1fr))]"><div className="border-b border-slate-100 px-2 pt-3 text-right text-xs tabular-nums text-slate-400">{String(hour).padStart(2, "0")}:00</div>{dates.map((date) => {
                const outsideActiveRange = Boolean(activeHabit && ((activeHabit.activeFrom && date < activeHabit.activeFrom) || (activeHabit.activeUntil && date > activeHabit.activeUntil)));
                return <button key={`${date}-${hour}`} type="button" className="h-20 border-b border-l border-slate-100 bg-white transition hover:bg-blue-50/50 disabled:cursor-not-allowed disabled:bg-slate-50/80" disabled={loading || outsideActiveRange} onClick={() => activeHabit ? void toggleCheckin(activeHabit, date, hour) : setError("请先从左侧选择一个习惯")} aria-label={`${date} ${hour}:00${activeHabit ? outsideActiveRange ? ` 不在 ${activeHabit.title} 的执行日期内` : ` 打卡 ${activeHabit.title}` : ""}`} />;
              })}</div>)}
              {checkins.filter((item) => item.startHour !== null && dates.includes(item.date)).map((checkin) => {
                const habit = habits.find((item) => item.id === checkin.habitId);
                if (!habit || checkin.startHour === null) return null;
                const color = HABIT_COLORS[habits.findIndex((item) => item.id === habit.id) % HABIT_COLORS.length];
                const sameStart = checkins.filter((item) => item.startHour !== null && item.date === checkin.date && item.startHour === checkin.startHour);
                const laneIndex = sameStart.findIndex((item) => item.id === checkin.id);
                const isSaving = savingKey === `${habit.id}:${checkin.date}:${checkin.startHour}`;
                return <DurationCalendarBlock key={checkin.id} dayIndex={dates.indexOf(checkin.date)} startHour={checkin.startHour} durationMinutes={habit.durationMinutes ?? 60} laneIndex={laneIndex} laneCount={sameStart.length}><button type="button" className={`flex size-full min-w-0 flex-col items-start overflow-hidden rounded-lg border px-2 py-1.5 text-left shadow-[0_4px_14px_rgba(51,65,85,0.08)] transition hover:brightness-95 disabled:opacity-50 ${habit.id === activeHabitId ? color.active : color.idle}`} disabled={Boolean(savingKey)} onClick={() => void toggleCheckin(habit, checkin.date, checkin.startHour!)} title="点击撤销这次打卡"><span className="flex w-full items-center gap-1 text-xs font-semibold"><CheckIcon size={11} weight="bold" /><span className="truncate">{habit.title}</span></span><span className="mt-auto text-[10px] tabular-nums opacity-70">{isSaving ? "保存中" : formatTimeRange(checkin.startHour, habit.durationMinutes)}</span></button></DurationCalendarBlock>;
              })}
            </div>
          </div></div>
          {loading ? <p className="border-t border-slate-100 px-4 py-3 text-xs text-slate-400">正在加载习惯…</p> : null}
        </section>
      </div>
    </div>

    {statisticsOpen ? <HabitStatisticsModal code={data.event.shareCode} identityId={identityId} today={today} habits={habits} initialHabitId={activeHabitId} onClose={() => setStatisticsOpen(false)} /> : null}
    {groupsOpen ? <HabitGroupManager code={data.event.shareCode} identityId={identityId} groups={groups} habitCounts={habitCounts} onGroupsChange={setGroups} onGroupDeleted={(groupId) => setHabits((items) => items.map((habit) => habit.groupId === groupId ? { ...habit, groupId: null } : habit))} onClose={() => setGroupsOpen(false)} /> : null}
    {goalDraft ? <HabitGoalModal code={data.event.shareCode} identityId={identityId} today={today} habits={regularHabits} goal={goalDraft === "new" ? undefined : goalDraft} onChanged={loadGoals} onClose={() => setGoalDraft(null)} /> : null}
    {draft ? <HabitModal code={data.event.shareCode} identityId={identityId} today={today} mode={draft === "short-term" ? "short-term" : "regular"} habit={draft === "new" || draft === "short-term" ? undefined : draft} groups={groups} onClose={() => setDraft(null)} onSaved={(habit) => { setHabits((items) => [...items.filter((item) => item.id !== habit.id), habit].sort((a, b) => a.createdAt.localeCompare(b.createdAt))); setActiveHabitId(habit.id); void loadGoals(); setDraft(null); }} onDeleted={(id) => { setHabits((items) => items.filter((item) => item.id !== id)); setCheckins((items) => items.filter((item) => item.habitId !== id)); setActiveHabitId((current) => current === id ? null : current); void loadGoals(); setDraft(null); }} /> : null}
  </main>;
}

function HabitModal({ code, identityId, today, mode, habit, groups, onClose, onSaved, onDeleted }: {
  code: string; identityId: string; today: string; mode: "regular" | "short-term"; habit?: Habit; groups: HabitGroup[]; onClose: () => void;
  onSaved: (habit: Habit) => void; onDeleted: (id: string) => void;
}) {
  const shortTerm = Boolean(habit?.activeFrom) || mode === "short-term";
  const [title, setTitle] = useState(habit?.title ?? "");
  const [frequency, setFrequency] = useState<HabitFrequency>(habit?.frequency ?? "daily");
  const [targetCount, setTargetCount] = useState(habit?.targetCount ?? 1);
  const [durationMinutes, setDurationMinutes] = useState<HabitDurationMinutes | null>(habit?.durationMinutes ?? null);
  const [groupId, setGroupId] = useState(habit?.groupId ?? "");
  const [activeFrom, setActiveFrom] = useState(habit?.activeFrom ?? today);
  const [activeUntil, setActiveUntil] = useState(habit?.activeUntil ?? addDaysToDateString(today, 6));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const max = HABIT_FREQUENCIES.find((item) => item.value === frequency)?.max ?? 1;
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setSaving(true); setError("");
    try {
      const response = await fetch(`/api/events/${code}/habits`, { method: habit ? "PUT" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ identityId, habitId: habit?.id, title, frequency, targetCount, durationMinutes, groupId: shortTerm ? null : groupId || null, activeFrom: shortTerm ? activeFrom : null, activeUntil: shortTerm ? activeUntil : null }) });
      const payload = await response.json() as { habit?: Habit; error?: string };
      if (!response.ok || !payload.habit) throw new Error(payload.error ?? "保存习惯失败");
      onSaved(payload.habit);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "保存习惯失败"); setSaving(false); }
  };
  const remove = async () => {
    if (!habit) return;
    setSaving(true); setError("");
    try {
      const response = await fetch(`/api/events/${code}/habits`, { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ identityId, habitId: habit.id }) });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "删除习惯失败");
      onDeleted(habit.id);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "删除习惯失败"); setSaving(false); }
  };
  return <Modal title={habit ? "编辑习惯" : shortTerm ? "添加短期习惯" : "添加习惯"} onClose={saving ? () => undefined : onClose}><form className="space-y-5" onSubmit={save}>
    <div><label htmlFor="habit-title" className="field-label">习惯标题</label><input id="habit-title" className="text-input" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={60} placeholder="例如 背单词" autoFocus /></div>
    <div><span className="field-label">习惯周期</span><div className="grid grid-cols-2 gap-3"><div><label htmlFor="habit-frequency" className="mb-1 block text-xs text-slate-500">周期</label><select id="habit-frequency" className="text-input" value={frequency} onChange={(event) => { const next = event.target.value as HabitFrequency; setFrequency(next); setTargetCount((current) => Math.min(current, HABIT_FREQUENCIES.find((item) => item.value === next)?.max ?? 1)); }}>{HABIT_FREQUENCIES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></div><div><label htmlFor="habit-count" className="mb-1 block text-xs text-slate-500">次数</label><select id="habit-count" className="text-input" value={targetCount} onChange={(event) => setTargetCount(Number(event.target.value))}>{Array.from({ length: max }, (_, index) => index + 1).map((count) => <option key={count} value={count}>{count} 次</option>)}</select></div></div></div>
    {!shortTerm ? <div><label htmlFor="habit-group" className="field-label">习惯分组 <span className="font-normal text-slate-400">（选填）</span></label><select id="habit-group" className="text-input" value={groupId} onChange={(event) => setGroupId(event.target.value)}><option value="">未分组</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select><p className="mt-2 text-xs leading-5 text-slate-500">可以从左侧清单顶部的文件夹按钮新建或管理分组。</p></div> : null}
    <div><label htmlFor="habit-duration" className="field-label">每次时长 <span className="font-normal text-slate-400">（选填）</span></label><select id="habit-duration" className="text-input" value={durationMinutes ?? ""} onChange={(event) => setDurationMinutes(event.target.value ? Number(event.target.value) as HabitDurationMinutes : null)}><option value="">不设置时长</option>{HABIT_DURATION_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select><p className="mt-2 text-xs leading-5 text-slate-500">少于 1 小时按一个时间格显示；1.5 小时起会按实际长度跨格。</p></div>
    {shortTerm ? <div><span className="field-label">执行日期</span><div className="grid grid-cols-2 gap-3"><div><span className="mb-1 block text-xs text-slate-500">开始</span><DatePicker value={activeFrom} min={habit ? undefined : today} ariaLabel="短期习惯开始日期" onChange={(value) => { setActiveFrom(value); if (activeUntil < value) setActiveUntil(value); }} /></div><div><span className="mb-1 block text-xs text-slate-500">结束</span><DatePicker value={activeUntil} min={activeFrom} align="right" ariaLabel="短期习惯结束日期" onChange={setActiveUntil} /></div></div><p className="mt-2 text-xs leading-5 text-slate-500">结束日期过去后，习惯和对应打卡记录会自动清除。</p></div> : null}
    {error ? <p className="form-error" role="alert">{error}</p> : null}
    {confirmDelete ? <div className="rounded-xl border border-red-100 bg-red-50 p-3"><p className="text-sm text-red-700">删除「{habit?.title}」及其全部打卡记录？</p><div className="mt-3 flex gap-2"><button type="button" className="secondary-button flex-1" onClick={() => setConfirmDelete(false)} disabled={saving}>保留</button><button type="button" className="danger-button flex-1" onClick={() => void remove()} disabled={saving}>{saving ? "正在删除" : "确认删除"}</button></div></div> : <div className={`grid gap-3 ${habit ? "grid-cols-[auto_1fr]" : "grid-cols-1"}`}>{habit ? <button type="button" className="secondary-button text-red-600" disabled={saving} onClick={() => setConfirmDelete(true)}><TrashIcon size={16} weight="bold" />删除</button> : null}<button type="submit" className="primary-button" disabled={saving || !title.trim() || (shortTerm && (!activeFrom || !activeUntil || activeUntil < activeFrom))}>{saving ? "正在保存" : "保存习惯"}</button></div>}
  </form></Modal>;
}
