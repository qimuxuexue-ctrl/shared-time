"use client";

import {
  ArrowLeftIcon, CaretLeftIcon, CaretRightIcon,
  CheckIcon, ClockIcon, CopyIcon, HashIcon, PencilSimpleIcon,
  PlusIcon, SignOutIcon, TrashIcon, UsersThreeIcon,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";

import {
  CALENDAR_HOUR_END, CALENDAR_HOUR_HEIGHT, CALENDAR_HOUR_START,
  DurationCalendarBlock,
} from "@/components/duration-calendar-block";
import { EventPresence } from "@/components/event-presence";
import { Modal } from "@/components/modal";
import { WeekPicker } from "@/components/week-picker";
import { addDaysToDateString, EVENT_TIME_ZONE_OPTIONS, getDateStringInTimeZone, getMondayDateString } from "@/lib/dates";
import {
  HABIT_DURATION_OPTIONS, HABIT_FREQUENCIES,
  type HabitDurationMinutes, type HabitFrequency,
} from "@/lib/habits";
import type { EventTimeZone, EventWorkspaceData } from "@/lib/types";

type Habit = {
  id: string;
  title: string;
  frequency: HabitFrequency;
  targetCount: number;
  durationMinutes: HabitDurationMinutes | null;
  createdAt: string;
};
type Checkin = { id: string; habitId: string; date: string; startHour: number | null; count: number };

const HOURS = Array.from({ length: CALENDAR_HOUR_END - CALENDAR_HOUR_START }, (_, index) => index + CALENDAR_HOUR_START);
const WEEKDAYS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
const HABIT_COLORS = [
  { dot: "bg-blue-500", idle: "border-blue-100 bg-blue-50 text-blue-800", active: "border-blue-300 bg-blue-100 text-blue-900" },
  { dot: "bg-emerald-500", idle: "border-emerald-100 bg-emerald-50 text-emerald-800", active: "border-emerald-300 bg-emerald-100 text-emerald-900" },
  { dot: "bg-amber-500", idle: "border-amber-100 bg-amber-50 text-amber-800", active: "border-amber-300 bg-amber-100 text-amber-900" },
  { dot: "bg-violet-500", idle: "border-violet-100 bg-violet-50 text-violet-800", active: "border-violet-300 bg-violet-100 text-violet-900" },
];

function periodRange(date: string, frequency: HabitFrequency) {
  if (frequency === "daily") return [date, date];
  if (frequency === "weekly") {
    const start = getMondayDateString(date);
    return [start, addDaysToDateString(start, 6)];
  }
  const [year, month, day] = date.split("-").map(Number);
  const prefix = `${year}-${String(month).padStart(2, "0")}-`;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (frequency === "half_monthly") return day <= 15 ? [`${prefix}01`, `${prefix}15`] : [`${prefix}16`, `${prefix}${lastDay}`];
  return [`${prefix}01`, `${prefix}${lastDay}`];
}

function formatShortDate(date: string) {
  const [, month, day] = date.split("-");
  return `${Number(month)}/${Number(day)}`;
}

function formatTimeRange(startHour: number, durationMinutes: number | null) {
  const minutes = startHour * 60 + (durationMinutes ?? 60);
  const end = `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  return `${String(startHour).padStart(2, "0")}:00–${end}`;
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
  const [checkins, setCheckins] = useState<Checkin[]>([]);
  const [activeHabitId, setActiveHabitId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Habit | "new" | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const requestId = useRef(0);
  const activeHabit = habits.find((habit) => habit.id === activeHabitId) ?? null;

  useEffect(() => {
    const currentRequest = ++requestId.current;
    const query = new URLSearchParams({ identityId, month: weekStart.slice(0, 7) });
    fetch(`/api/events/${data.event.shareCode}/habits?${query}`)
      .then(async (response) => {
        const payload = await response.json() as { habits?: Habit[]; checkins?: Checkin[]; error?: string };
        if (!response.ok || !payload.habits || !payload.checkins) throw new Error(payload.error ?? "读取习惯失败");
        if (currentRequest !== requestId.current) return;
        setHabits(payload.habits);
        setCheckins(payload.checkins);
        setActiveHabitId((current) => payload.habits!.some((habit) => habit.id === current) ? current : payload.habits![0]?.id ?? null);
        setError("");
      })
      .catch((caught: unknown) => {
        if (currentRequest === requestId.current) setError(caught instanceof Error ? caught.message : "读取习惯失败");
      })
      .finally(() => {
        if (currentRequest === requestId.current) setLoading(false);
      });
    return () => { requestId.current += 1; };
  }, [data.event.shareCode, identityId, weekStart]);

  const periodProgress = (habit: Habit, date = dates.includes(today) ? today : weekStart) => {
    const [start, end] = periodRange(date, habit.frequency);
    return checkins.filter((item) => item.habitId === habit.id && item.date >= start && item.date <= end)
      .reduce((sum, item) => sum + item.count, 0);
  };

  const toggleCheckin = async (habit: Habit, date: string, startHour: number) => {
    if (savingKey) return;
    const existing = checkins.find((item) => item.habitId === habit.id && item.date === date && item.startHour === startHour);
    if (!existing && periodProgress(habit, date) >= habit.targetCount) {
      setError(`「${habit.title}」这个周期已完成 ${habit.targetCount} 次`);
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
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "打卡失败");
    } finally {
      setSavingKey(null);
    }
  };

  return <main className="min-h-[100dvh] bg-[var(--page)] pb-10">
    <header className="border-b border-slate-200/80 bg-white/90 backdrop-blur-xl">
      <div className="mx-auto flex min-h-[72px] max-w-[1480px] items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-3"><Link href="/" className="icon-button shrink-0" aria-label="返回我的事件"><ArrowLeftIcon size={18} weight="bold" /></Link><div className="min-w-0"><div className="flex min-w-0 items-center gap-1"><h1 className="truncate text-lg font-semibold tracking-tight text-slate-950">{data.event.name}</h1>{data.event.isCreator ? <button type="button" className="grid size-7 shrink-0 place-items-center rounded-lg text-slate-300 transition hover:bg-slate-100 hover:text-blue-600" onClick={onEditName} aria-label="修改事件名称" title="修改事件名称"><PencilSimpleIcon size={13} weight="bold" /></button> : null}</div><p className="mt-0.5 flex items-center gap-1 text-xs font-medium text-slate-500"><HashIcon size={12} weight="bold" />{data.event.shareCode}</p></div></div>
        <EventPresence code={data.event.shareCode} identityId={identityId} />
        <div className="flex shrink-0 items-center gap-2"><button type="button" className="secondary-button text-red-600 hover:border-red-200 hover:bg-red-50" onClick={data.event.isCreator ? onDelete : onLeave}>{data.event.isCreator ? <TrashIcon size={18} weight="bold" /> : <SignOutIcon size={18} weight="bold" />}<span className="hidden sm:inline">{data.event.isCreator ? "删除事件" : "退出事件"}</span></button><button type="button" className="secondary-button" onClick={onCopy}>{copied ? <CheckIcon size={18} weight="bold" /> : <CopyIcon size={18} weight="bold" />}<span className="hidden sm:inline">{copied ? "已复制" : "分享事件"}</span></button></div>
      </div>
    </header>

    <div className="mx-auto max-w-[1480px] space-y-5 px-4 py-6 sm:px-6">
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-[18px] border border-slate-200/80 bg-white p-4">
        <div><p className="flex items-center gap-2 text-sm font-medium text-slate-500"><ClockIcon size={16} weight="bold" />{data.event.isCreator ? <select className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-sm" value={data.event.timeZone} disabled={timeZoneSaving} onChange={(event) => onTimeZoneChange(event.target.value as EventTimeZone)} aria-label="事件时区">{EVENT_TIME_ZONE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select> : EVENT_TIME_ZONE_OPTIONS.find((option) => option.value === data.event.timeZone)?.label}</p><h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-950">习惯时间表</h2></div>
        <p className="max-w-md text-xs leading-5 text-slate-500">先在左侧选择一个习惯，再点击时间格完成打卡。设置了时长的习惯会按实际长度显示。</p>
      </section>

      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <div className="grid items-start gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="space-y-4 lg:sticky lg:top-5">
          <section className="rounded-[18px] border border-slate-200/80 bg-white p-4">
            <div className="flex items-center justify-between gap-2"><div><h2 className="text-sm font-semibold text-slate-800">习惯清单</h2><p className="mt-1 text-xs text-slate-400">先选习惯，再点右侧时间</p></div><button type="button" className="icon-button" onClick={() => setDraft("new")} aria-label="新增习惯"><PlusIcon size={18} weight="bold" /></button></div>
            {habits.length ? <div className="mt-4 space-y-2">{habits.map((habit, index) => {
              const selected = habit.id === activeHabitId;
              const durationLabel = HABIT_DURATION_OPTIONS.find((option) => option.value === habit.durationMinutes)?.label;
              return <div key={habit.id} className={`flex items-center gap-1 rounded-xl border p-1 transition ${selected ? "border-blue-200 bg-blue-50" : "border-slate-100 bg-slate-50"}`}><button type="button" className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-2 text-left" onClick={() => setActiveHabitId(habit.id)} aria-pressed={selected}><span className={`size-2.5 shrink-0 rounded-full ${HABIT_COLORS[index % HABIT_COLORS.length].dot}`} /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-slate-800">{habit.title}</span><span className="text-xs text-slate-500">{HABIT_FREQUENCIES.find((item) => item.value === habit.frequency)?.label} {habit.targetCount} 次{durationLabel ? ` · ${durationLabel}` : ""}</span></span><span className="text-xs font-semibold tabular-nums text-blue-600">{Math.min(periodProgress(habit), habit.targetCount)}/{habit.targetCount}</span></button><button type="button" className="grid size-8 shrink-0 place-items-center rounded-lg text-slate-300 transition hover:bg-white hover:text-blue-500" onClick={() => setDraft(habit)} aria-label={`编辑${habit.title}`}><PencilSimpleIcon size={13} weight="bold" /></button></div>;
            })}</div> : <button type="button" className="mt-4 flex w-full items-center gap-2 rounded-xl border border-dashed border-blue-200 bg-blue-50/50 px-3 py-4 text-left text-sm font-medium text-blue-700" onClick={() => setDraft("new")}><PlusIcon size={16} weight="bold" />添加第一个习惯</button>}
            <p className="mt-4 text-xs leading-5 text-slate-400">习惯清单由成员共用；每个人只记录和查看自己的打卡时间。</p>
          </section>
          <section className="rounded-[18px] border border-slate-200/80 bg-white p-4"><div className="mb-3 flex items-center justify-between"><h2 className="flex items-center gap-2 text-sm font-semibold text-slate-800"><UsersThreeIcon size={18} weight="bold" />参与者</h2><span className="text-sm text-slate-400">{data.members.length}</span></div><div className="space-y-2">{data.members.map((member) => member.isCurrent ? <button key={member.id} type="button" className="group flex w-full min-w-0 items-center gap-2 rounded-xl bg-slate-50 px-3 py-2.5 text-left transition hover:bg-slate-100" onClick={onEditTag}><span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: member.tagColor }} /><span className="min-w-0 truncate text-sm font-semibold text-slate-700">{member.tagName}</span><span className="ml-auto text-xs font-medium text-blue-600">你</span><PencilSimpleIcon size={13} weight="bold" className="text-slate-300 group-hover:text-blue-500" /></button> : <div key={member.id} className="flex min-w-0 items-center gap-2 rounded-xl bg-slate-50 px-3 py-2.5"><span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: member.tagColor }} /><span className="truncate text-sm font-semibold text-slate-700">{member.tagName}</span></div>)}</div></section>
        </aside>

        <section className="overflow-hidden rounded-[18px] border border-slate-200/80 bg-white" aria-label="习惯周时间表">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3"><div><WeekPicker weekStart={weekStart} currentWeek={getMondayDateString(today)} onWeekChange={(nextWeek) => { setLoading(true); setWeekStart(nextWeek); }} /><p className="mt-1 text-xs text-slate-400">{activeHabit ? `当前：${activeHabit.title}` : "请先添加并选择习惯"}</p></div><div className="flex gap-2"><button type="button" className="icon-button" onClick={() => { setLoading(true); setWeekStart(addDaysToDateString(weekStart, -7)); }} aria-label="上一周"><CaretLeftIcon size={17} weight="bold" /></button><button type="button" className="icon-button" onClick={() => { setLoading(true); setWeekStart(addDaysToDateString(weekStart, 7)); }} aria-label="下一周"><CaretRightIcon size={17} weight="bold" /></button></div></div>
          <div className="overflow-x-auto"><div className="min-w-[820px]"><div className="grid grid-cols-[68px_repeat(7,minmax(96px,1fr))] border-b border-slate-200"><div />{dates.map((date, index) => <div key={date} className="border-l border-slate-200 px-2 py-3 text-center text-slate-700"><span className="text-sm font-semibold">{WEEKDAYS[index]}</span><span className="ml-1 font-normal text-slate-400">{formatShortDate(date)}</span>{date === today ? <span className="ml-1 rounded bg-blue-50 px-1 py-0.5 text-[10px] font-semibold text-blue-600">今天</span> : null}</div>)}</div>
            <div className="relative" style={{ height: HOURS.length * CALENDAR_HOUR_HEIGHT }}>
              {HOURS.map((hour) => <div key={hour} className="grid h-20 grid-cols-[68px_repeat(7,minmax(96px,1fr))]"><div className="border-b border-slate-100 px-2 pt-3 text-right text-xs tabular-nums text-slate-400">{String(hour).padStart(2, "0")}:00</div>{dates.map((date) => {
                return <button key={`${date}-${hour}`} type="button" className="h-20 border-b border-l border-slate-100 bg-white transition hover:bg-blue-50/50 disabled:cursor-wait disabled:bg-slate-50/80" disabled={loading} onClick={() => activeHabit ? void toggleCheckin(activeHabit, date, hour) : setError("请先从左侧选择一个习惯")} aria-label={`${date} ${hour}:00${activeHabit ? ` 打卡 ${activeHabit.title}` : ""}`} />;
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

    {draft ? <HabitModal code={data.event.shareCode} identityId={identityId} habit={draft === "new" ? undefined : draft} onClose={() => setDraft(null)} onSaved={(habit) => { setHabits((items) => [...items.filter((item) => item.id !== habit.id), habit].sort((a, b) => a.createdAt.localeCompare(b.createdAt))); setActiveHabitId(habit.id); setDraft(null); }} onDeleted={(id) => { setHabits((items) => items.filter((item) => item.id !== id)); setCheckins((items) => items.filter((item) => item.habitId !== id)); setActiveHabitId((current) => current === id ? null : current); setDraft(null); }} /> : null}
  </main>;
}

function HabitModal({ code, identityId, habit, onClose, onSaved, onDeleted }: {
  code: string; identityId: string; habit?: Habit; onClose: () => void;
  onSaved: (habit: Habit) => void; onDeleted: (id: string) => void;
}) {
  const [title, setTitle] = useState(habit?.title ?? "");
  const [frequency, setFrequency] = useState<HabitFrequency>(habit?.frequency ?? "daily");
  const [targetCount, setTargetCount] = useState(habit?.targetCount ?? 1);
  const [durationMinutes, setDurationMinutes] = useState<HabitDurationMinutes | null>(habit?.durationMinutes ?? null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const max = HABIT_FREQUENCIES.find((item) => item.value === frequency)?.max ?? 1;
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setSaving(true); setError("");
    try {
      const response = await fetch(`/api/events/${code}/habits`, { method: habit ? "PUT" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ identityId, habitId: habit?.id, title, frequency, targetCount, durationMinutes }) });
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
  return <Modal title={habit ? "编辑习惯" : "添加习惯"} onClose={saving ? () => undefined : onClose}><form className="space-y-5" onSubmit={save}>
    <div><label htmlFor="habit-title" className="field-label">习惯标题</label><input id="habit-title" className="text-input" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={60} placeholder="例如 背单词" autoFocus /></div>
    <div><span className="field-label">习惯周期</span><div className="grid grid-cols-2 gap-3"><div><label htmlFor="habit-frequency" className="mb-1 block text-xs text-slate-500">周期</label><select id="habit-frequency" className="text-input" value={frequency} onChange={(event) => { const next = event.target.value as HabitFrequency; setFrequency(next); setTargetCount((current) => Math.min(current, HABIT_FREQUENCIES.find((item) => item.value === next)?.max ?? 1)); }}>{HABIT_FREQUENCIES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></div><div><label htmlFor="habit-count" className="mb-1 block text-xs text-slate-500">次数</label><select id="habit-count" className="text-input" value={targetCount} onChange={(event) => setTargetCount(Number(event.target.value))}>{Array.from({ length: max }, (_, index) => index + 1).map((count) => <option key={count} value={count}>{count} 次</option>)}</select></div></div></div>
    <div><label htmlFor="habit-duration" className="field-label">每次时长 <span className="font-normal text-slate-400">（选填）</span></label><select id="habit-duration" className="text-input" value={durationMinutes ?? ""} onChange={(event) => setDurationMinutes(event.target.value ? Number(event.target.value) as HabitDurationMinutes : null)}><option value="">不设置时长</option>{HABIT_DURATION_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select><p className="mt-2 text-xs leading-5 text-slate-500">少于 1 小时按一个时间格显示；1.5 小时起会按实际长度跨格。</p></div>
    {error ? <p className="form-error" role="alert">{error}</p> : null}
    {confirmDelete ? <div className="rounded-xl border border-red-100 bg-red-50 p-3"><p className="text-sm text-red-700">删除「{habit?.title}」及其全部打卡记录？</p><div className="mt-3 flex gap-2"><button type="button" className="secondary-button flex-1" onClick={() => setConfirmDelete(false)} disabled={saving}>保留</button><button type="button" className="danger-button flex-1" onClick={() => void remove()} disabled={saving}>{saving ? "正在删除" : "确认删除"}</button></div></div> : <div className={`grid gap-3 ${habit ? "grid-cols-[auto_1fr]" : "grid-cols-1"}`}>{habit ? <button type="button" className="secondary-button text-red-600" disabled={saving} onClick={() => setConfirmDelete(true)}><TrashIcon size={16} weight="bold" />删除</button> : null}<button type="submit" className="primary-button" disabled={saving || !title.trim()}>{saving ? "正在保存" : "保存习惯"}</button></div>}
  </form></Modal>;
}
