"use client";

import {
  ArrowLeftIcon, CalendarBlankIcon, CaretLeftIcon, CaretRightIcon,
  CheckIcon, ClockIcon, CopyIcon, HashIcon, PencilSimpleIcon,
  PlusIcon, SignOutIcon, TrashIcon,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";

import { EventPresence } from "@/components/event-presence";
import { Modal } from "@/components/modal";
import { addDaysToDateString, EVENT_TIME_ZONE_OPTIONS, getDateStringInTimeZone, getMondayDateString } from "@/lib/dates";
import type { EventTimeZone, EventWorkspaceData } from "@/lib/types";

type Frequency = "daily" | "weekly" | "half_monthly" | "monthly";
type Habit = { id: string; title: string; frequency: Frequency; targetCount: number; createdAt: string };
type Checkin = { habitId: string; date: string; count: number };

const FREQUENCIES: { value: Frequency; label: string; max: number }[] = [
  { value: "daily", label: "每天", max: 10 },
  { value: "weekly", label: "每周", max: 7 },
  { value: "half_monthly", label: "每半个月", max: 13 },
  { value: "monthly", label: "每月", max: 28 },
];
const WEEKDAYS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
const STAMPS = [
  "border-blue-200 bg-blue-50 text-blue-700 data-[done=true]:border-blue-500 data-[done=true]:bg-blue-600 data-[done=true]:text-white",
  "border-emerald-200 bg-emerald-50 text-emerald-700 data-[done=true]:border-emerald-500 data-[done=true]:bg-emerald-600 data-[done=true]:text-white",
  "border-amber-200 bg-amber-50 text-amber-700 data-[done=true]:border-amber-500 data-[done=true]:bg-amber-600 data-[done=true]:text-white",
  "border-violet-200 bg-violet-50 text-violet-700 data-[done=true]:border-violet-500 data-[done=true]:bg-violet-600 data-[done=true]:text-white",
];

function monthTitle(month: string) {
  return `${Number(month.slice(0, 4))} 年 ${Number(month.slice(5))} 月`;
}

function shiftMonth(month: string, offset: number) {
  const [year, number] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, number - 1 + offset, 1));
  return date.toISOString().slice(0, 7);
}

function periodRange(date: string, frequency: Frequency) {
  if (frequency === "daily") return [date, date];
  if (frequency === "weekly") {
    const start = getMondayDateString(date);
    return [start, addDaysToDateString(start, 6)];
  }
  const [year, month, day] = date.split("-").map(Number);
  const start = `${year}-${String(month).padStart(2, "0")}-`;
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (frequency === "half_monthly") {
    return day <= 15 ? [`${start}01`, `${start}15`] : [`${start}16`, `${start}${last}`];
  }
  return [`${start}01`, `${start}${last}`];
}

export function HabitTrackerWorkspace({ data, identityId, copied, timeZoneSaving, onCopy, onDelete, onLeave, onTimeZoneChange }: {
  data: EventWorkspaceData;
  identityId: string;
  copied: boolean;
  timeZoneSaving: boolean;
  onCopy: () => void;
  onDelete: () => void;
  onLeave: () => void;
  onTimeZoneChange: (timeZone: EventTimeZone) => void;
}) {
  const today = getDateStringInTimeZone(data.event.timeZone);
  const [month, setMonth] = useState(() => today.slice(0, 7));
  const [habits, setHabits] = useState<Habit[]>([]);
  const [checkins, setCheckins] = useState<Checkin[]>([]);
  const [draft, setDraft] = useState<Habit | "new" | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const requestId = useRef(0);
  const firstDay = getMondayDateString(`${month}-01`);
  const days = useMemo(() => Array.from({ length: 42 }, (_, index) => addDaysToDateString(firstDay, index)), [firstDay]);

  useEffect(() => {
    const currentRequest = ++requestId.current;
    const query = new URLSearchParams({ identityId, month });
    fetch(`/api/events/${data.event.shareCode}/habits?${query}`)
      .then(async (response) => {
        const payload = await response.json() as { habits?: Habit[]; checkins?: Checkin[]; error?: string };
        if (!response.ok || !payload.habits || !payload.checkins) throw new Error(payload.error ?? "读取习惯失败");
        if (currentRequest !== requestId.current) return;
        setHabits(payload.habits);
        setCheckins(payload.checkins);
        setError("");
      })
      .catch((caught: unknown) => {
        if (currentRequest === requestId.current) setError(caught instanceof Error ? caught.message : "读取习惯失败");
      })
      .finally(() => {
        if (currentRequest === requestId.current) setLoading(false);
      });
    return () => { requestId.current += 1; };
  }, [data.event.shareCode, identityId, month]);

  const countFor = (habitId: string, date: string) =>
    checkins.find((item) => item.habitId === habitId && item.date === date)?.count ?? 0;

  const progressFor = (habit: Habit) => {
    if (month !== today.slice(0, 7)) return "—";
    const [start, end] = periodRange(today, habit.frequency);
    const total = checkins.filter((item) => item.habitId === habit.id && item.date >= start && item.date <= end)
      .reduce((sum, item) => sum + (habit.frequency === "daily" ? item.count : 1), 0);
    return `${Math.min(total, habit.targetCount)}/${habit.targetCount}`;
  };

  const stamp = async (habit: Habit, date: string) => {
    if (date > today || date < data.event.startDate || savingKey) return;
    const current = countFor(habit.id, date);
    const next = current >= (habit.frequency === "daily" ? habit.targetCount : 1) ? 0 : current + 1;
    const key = `${habit.id}:${date}`;
    setSavingKey(key);
    setError("");
    try {
      const response = await fetch(`/api/events/${data.event.shareCode}/habits`, {
        method: "PATCH", headers: { "content-type": "application/json" },
        body: JSON.stringify({ identityId, habitId: habit.id, date, count: next }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "打卡失败");
      setCheckins((items) => [...items.filter((item) => item.habitId !== habit.id || item.date !== date), ...(next ? [{ habitId: habit.id, date, count: next }] : [])]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "打卡失败");
    } finally {
      setSavingKey(null);
    }
  };

  return <main className="min-h-[100dvh] bg-[var(--page)] pb-10">
    <header className="border-b border-slate-200/80 bg-white/90 backdrop-blur-xl">
      <div className="mx-auto flex min-h-[72px] max-w-[1480px] items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Link href="/" className="icon-button shrink-0" aria-label="返回我的事件"><ArrowLeftIcon size={18} weight="bold" /></Link>
          <div className="min-w-0"><h1 className="truncate text-lg font-semibold tracking-tight text-slate-950">{data.event.name}</h1><p className="mt-0.5 flex items-center gap-1 text-xs font-medium text-slate-500"><HashIcon size={12} weight="bold" />{data.event.shareCode}</p></div>
        </div>
        <EventPresence code={data.event.shareCode} identityId={identityId} />
        <div className="flex shrink-0 items-center gap-2">
          <button type="button" className="secondary-button text-red-600 hover:border-red-200 hover:bg-red-50" onClick={data.event.isCreator ? onDelete : onLeave} aria-label={data.event.isCreator ? "删除事件" : "退出事件"}>{data.event.isCreator ? <TrashIcon size={18} weight="bold" /> : <SignOutIcon size={18} weight="bold" />}<span className="hidden sm:inline">{data.event.isCreator ? "删除事件" : "退出事件"}</span></button>
          <button type="button" className="secondary-button" onClick={onCopy}>{copied ? <CheckIcon size={18} weight="bold" /> : <CopyIcon size={18} weight="bold" />}<span className="hidden sm:inline">{copied ? "已复制" : "分享事件"}</span></button>
        </div>
      </div>
    </header>

    <div className="mx-auto max-w-[1480px] space-y-5 px-4 py-6 sm:px-6">
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-[18px] border border-slate-200/80 bg-white p-4">
        <div><p className="flex items-center gap-2 text-sm font-medium text-slate-500"><ClockIcon size={16} weight="bold" />{data.event.isCreator ? <select className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-sm" value={data.event.timeZone} disabled={timeZoneSaving} onChange={(event) => onTimeZoneChange(event.target.value as EventTimeZone)} aria-label="事件时区">{EVENT_TIME_ZONE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select> : EVENT_TIME_ZONE_OPTIONS.find((option) => option.value === data.event.timeZone)?.label}</p><h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-950">你的习惯日历</h2></div>
        <p className="text-xs leading-5 text-slate-500">一个事件，多项习惯；点击日期内的 Tag 打卡。</p>
      </section>

      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <div className="grid items-start gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="rounded-[18px] border border-slate-200/80 bg-white p-4">
          <div className="flex items-center justify-between gap-2"><div><h2 className="text-sm font-semibold text-slate-800">习惯清单</h2><p className="mt-1 text-xs text-slate-400">创建后会出现在日历中</p></div><button type="button" className="icon-button" onClick={() => setDraft("new")} aria-label="新增习惯" title="新增习惯"><PlusIcon size={18} weight="bold" /></button></div>
          {habits.length ? <div className="mt-4 space-y-2">{habits.map((habit, index) => <button key={habit.id} type="button" className="group flex w-full items-center gap-2 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5 text-left transition hover:border-blue-200 hover:bg-blue-50" onClick={() => setDraft(habit)}><span className={`size-2.5 shrink-0 rounded-full ${["bg-blue-500", "bg-emerald-500", "bg-amber-500", "bg-violet-500"][index % 4]}`} /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-slate-800">{habit.title}</span><span className="text-xs text-slate-500">{FREQUENCIES.find((item) => item.value === habit.frequency)?.label} {habit.targetCount} 次</span></span><span className="text-xs font-semibold tabular-nums text-blue-600">{progressFor(habit)}</span><PencilSimpleIcon size={13} weight="bold" className="text-slate-300 group-hover:text-blue-500" /></button>)}</div> : <button type="button" className="mt-4 flex w-full items-center gap-2 rounded-xl border border-dashed border-blue-200 bg-blue-50/50 px-3 py-4 text-left text-sm font-medium text-blue-700" onClick={() => setDraft("new")}><PlusIcon size={16} weight="bold" />添加第一个习惯</button>}
          <p className="mt-4 text-xs leading-5 text-slate-400">清单可共用，打卡记录属于你自己。每天按完成次数计；其他周期按打卡天数计。</p>
        </aside>

        <section className="overflow-hidden rounded-[18px] border border-slate-200/80 bg-white" aria-label="习惯日历">
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3"><h2 className="flex items-center gap-2 text-sm font-semibold text-slate-800"><CalendarBlankIcon size={17} weight="bold" />{monthTitle(month)}</h2><div className="flex gap-2"><button type="button" className="icon-button" onClick={() => { setLoading(true); setMonth(shiftMonth(month, -1)); }} aria-label="上个月"><CaretLeftIcon size={17} weight="bold" /></button><button type="button" className="icon-button" onClick={() => { setLoading(true); setMonth(shiftMonth(month, 1)); }} aria-label="下个月"><CaretRightIcon size={17} weight="bold" /></button></div></div>
          <div className="overflow-x-auto"><div className="min-w-[700px]"><div className="grid grid-cols-7 border-b border-slate-100">{WEEKDAYS.map((day) => <span key={day} className="border-r border-slate-100 px-2 py-2 text-center text-xs font-semibold text-slate-500 last:border-r-0">{day}</span>)}</div><div className="grid grid-cols-7">{days.map((date) => {
            const muted = date.slice(0, 7) !== month;
            const disabled = date > today || date < data.event.startDate;
            return <div key={date} className={`min-h-28 border-b border-r border-slate-100 p-2 ${muted ? "bg-slate-50/70" : date === today ? "bg-blue-50/40" : "bg-white"}`}><span className={`inline-grid size-6 place-items-center rounded-lg text-xs font-semibold tabular-nums ${date === today ? "bg-blue-600 text-white" : muted ? "text-slate-400" : "text-slate-700"}`}>{Number(date.slice(8))}</span><div className="mt-1.5 flex flex-col items-start gap-1">{habits.map((habit, index) => {
              const count = countFor(habit.id, date);
              const done = count >= (habit.frequency === "daily" ? habit.targetCount : 1);
              return <button key={habit.id} type="button" disabled={loading || disabled || Boolean(savingKey)} data-done={done} className={`inline-flex max-w-full items-center gap-1 rounded-md border px-1.5 py-1 text-left text-[11px] font-semibold leading-4 transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 disabled:cursor-not-allowed disabled:opacity-40 ${STAMPS[index % STAMPS.length]}`} onClick={() => void stamp(habit, date)} aria-label={`${date} ${habit.title} ${count ? `已打卡 ${count} 次` : "未打卡"}`}><span className="truncate">{habit.title}</span>{count ? <span className="shrink-0 tabular-nums">{habit.frequency === "daily" && habit.targetCount > 1 ? `${count}/${habit.targetCount}` : <CheckIcon size={11} weight="bold" />}</span> : null}</button>;
            })}</div></div>;
          })}</div></div></div>
          {loading ? <p className="border-t border-slate-100 px-4 py-3 text-xs text-slate-400">正在加载习惯…</p> : null}
        </section>
      </div>
    </div>

    {draft ? <HabitModal code={data.event.shareCode} identityId={identityId} habit={draft === "new" ? undefined : draft} onClose={() => setDraft(null)} onSaved={(habit) => { setHabits((items) => [...items.filter((item) => item.id !== habit.id), habit].sort((a, b) => a.createdAt.localeCompare(b.createdAt))); setDraft(null); }} onDeleted={(id) => { setHabits((items) => items.filter((item) => item.id !== id)); setCheckins((items) => items.filter((item) => item.habitId !== id)); setDraft(null); }} /> : null}
  </main>;
}

function HabitModal({ code, identityId, habit, onClose, onSaved, onDeleted }: {
  code: string; identityId: string; habit?: Habit; onClose: () => void;
  onSaved: (habit: Habit) => void; onDeleted: (id: string) => void;
}) {
  const [title, setTitle] = useState(habit?.title ?? "");
  const [frequency, setFrequency] = useState<Frequency>(habit?.frequency ?? "daily");
  const [targetCount, setTargetCount] = useState(habit?.targetCount ?? 1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const max = FREQUENCIES.find((item) => item.value === frequency)?.max ?? 1;
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setSaving(true); setError("");
    try {
      const response = await fetch(`/api/events/${code}/habits`, {
        method: habit ? "PUT" : "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ identityId, habitId: habit?.id, title, frequency, targetCount }),
      });
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
    <div><span className="field-label">习惯周期</span><div className="grid grid-cols-2 gap-3"><div><label htmlFor="habit-frequency" className="mb-1 block text-xs text-slate-500">周期</label><select id="habit-frequency" className="text-input" value={frequency} onChange={(event) => { const next = event.target.value as Frequency; setFrequency(next); setTargetCount((current) => Math.min(current, FREQUENCIES.find((item) => item.value === next)?.max ?? 1)); }}>{FREQUENCIES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></div><div><label htmlFor="habit-count" className="mb-1 block text-xs text-slate-500">次数</label><select id="habit-count" className="text-input" value={targetCount} onChange={(event) => setTargetCount(Number(event.target.value))}>{Array.from({ length: max }, (_, index) => index + 1).map((count) => <option key={count} value={count}>{count} 次</option>)}</select></div></div><p className="mt-2 text-xs leading-5 text-slate-500">{frequency === "daily" ? "每天记录完成次数。" : frequency === "half_monthly" ? "每月 1–15 日、16 日至月底分别计算打卡天数。" : "在这个周期内，任意日期打卡达到目标天数即可。"}</p></div>
    {error ? <p className="form-error" role="alert">{error}</p> : null}
    {confirmDelete ? <div className="rounded-xl border border-red-100 bg-red-50 p-3"><p className="text-sm text-red-700">删除「{habit?.title}」及其全部打卡记录？</p><div className="mt-3 flex gap-2"><button type="button" className="secondary-button flex-1" onClick={() => setConfirmDelete(false)} disabled={saving}>保留</button><button type="button" className="danger-button flex-1" onClick={() => void remove()} disabled={saving}>{saving ? "正在删除" : "确认删除"}</button></div></div> : <div className={`grid gap-3 ${habit ? "grid-cols-[auto_1fr]" : "grid-cols-1"}`}>{habit ? <button type="button" className="secondary-button text-red-600" disabled={saving} onClick={() => setConfirmDelete(true)}><TrashIcon size={16} weight="bold" />删除</button> : null}<button type="submit" className="primary-button" disabled={saving || !title.trim()}>{saving ? "正在保存" : "保存习惯"}</button></div>}
  </form></Modal>;
}
