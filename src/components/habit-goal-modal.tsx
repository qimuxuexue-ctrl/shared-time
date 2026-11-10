"use client";

import {
  CheckIcon, PauseIcon, PlayIcon, TargetIcon, TrashIcon, TrophyIcon,
} from "@phosphor-icons/react";
import { useMemo, useState, type FormEvent } from "react";

import { Modal } from "@/components/modal";
import {
  HABIT_FREQUENCIES,
  type HabitGoal,
  type HabitGoalStatus,
  type HabitRecord,
} from "@/lib/habits";

function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

function targetDateLabel(targetDate: string | null, today: string) {
  if (!targetDate) return "未设置目标日期";
  const days = daysBetween(today, targetDate);
  if (days > 0) return `距离目标日期还有 ${days} 天`;
  if (days === 0) return "今天是目标日期";
  return `目标日期已过去 ${Math.abs(days)} 天`;
}

export function HabitGoalModal({ code, identityId, today, habits, goal, onClose, onChanged }: {
  code: string;
  identityId: string;
  today: string;
  habits: HabitRecord[];
  goal?: HabitGoal;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const [title, setTitle] = useState(goal?.title ?? "");
  const [description, setDescription] = useState(goal?.description ?? "");
  const [targetDate, setTargetDate] = useState(goal?.targetDate ?? "");
  const [habitIds, setHabitIds] = useState<string[]>(goal?.habitIds ?? []);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState("");
  const habitById = useMemo(() => new Map(habits.map((habit) => [habit.id, habit])), [habits]);

  const request = async (method: "POST" | "PUT" | "PATCH" | "DELETE", body: Record<string, unknown>) => {
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/events/${code}/habit-goals`, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ identityId, ...body }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "保存目标失败");
      await onChanged();
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "保存目标失败");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!title.trim()) return setError("请输入目标名称");
    if (!habitIds.length) return setError("请至少关联一个习惯");
    const saved = await request(goal ? "PUT" : "POST", {
      ...(goal ? { goalId: goal.id } : {}),
      title,
      description: description.trim() || null,
      targetDate: targetDate || null,
      habitIds,
    });
    if (saved) onClose();
  };

  const updateStatus = async (status: HabitGoalStatus) => {
    if (!goal) return;
    const saved = await request("PATCH", { goalId: goal.id, status });
    if (saved) onClose();
  };

  const remove = async () => {
    if (!goal) return;
    const saved = await request("DELETE", { goalId: goal.id });
    if (saved) onClose();
  };

  const toggleHabit = (habitId: string) => {
    setHabitIds((current) => current.includes(habitId)
      ? current.filter((id) => id !== habitId)
      : [...current, habitId]);
  };

  return <Modal title={goal ? "目标详情" : "添加目标"} size="wide" onClose={saving ? () => undefined : onClose}>
    <div className="space-y-6">
      {goal ? <section className="rounded-2xl bg-slate-50 p-4" aria-label="目标行动进度">
        <div className="flex items-start gap-3">
          <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${goal.status === "achieved" ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-700"}`}>
            {goal.status === "achieved" ? <TrophyIcon size={20} weight="fill" /> : <TargetIcon size={20} weight="bold" />}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-3">
              <div><p className="text-xs font-medium text-slate-500">{goal.status === "achieved" ? "已实现" : goal.status === "paused" ? "已暂停" : "当前行动完成度"}</p><p className="mt-0.5 text-xs text-slate-400">{targetDateLabel(goal.targetDate, today)}</p></div>
              <span className="text-2xl font-semibold tabular-nums tracking-tight text-slate-900">{goal.status === "achieved" ? 100 : goal.actionRate}%</span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-white ring-1 ring-slate-100"><div className={`h-full rounded-full transition-[width] duration-300 ${goal.status === "achieved" ? "bg-emerald-500" : "bg-blue-500"}`} style={{ width: `${goal.status === "achieved" ? 100 : goal.actionRate}%` }} /></div>
          </div>
        </div>
        {goal.progress.length ? <div className="mt-4 grid gap-2 sm:grid-cols-2">{goal.progress.map((item) => {
          const habit = habitById.get(item.habitId);
          if (!habit) return null;
          return <div key={item.habitId} className="rounded-xl bg-white px-3 py-2.5 ring-1 ring-slate-100"><div className="flex items-center justify-between gap-3"><span className="truncate text-xs font-semibold text-slate-700">{habit.title}</span><span className="shrink-0 text-xs font-semibold tabular-nums text-blue-600">{item.completed}/{item.target}</span></div><p className="mt-1 text-[11px] text-slate-400">{HABIT_FREQUENCIES.find((frequency) => frequency.value === habit.frequency)?.label}行动进度</p></div>;
        })}</div> : null}
      </section> : <p className="text-sm leading-6 text-slate-500">目标是习惯上方的一层方向。完成关联习惯后，行动完成度会自动更新。</p>}

      <form className="space-y-5" onSubmit={save}>
        <div><label htmlFor="goal-title" className="field-label">目标名称</label><input id="goal-title" className="text-input" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={60} placeholder="例如 通过日语 N2" autoFocus={!goal} /></div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div><label htmlFor="goal-target-date" className="field-label">目标日期 <span className="font-normal text-slate-400">（选填）</span></label><input id="goal-target-date" type="date" className="text-input" value={targetDate} onChange={(event) => setTargetDate(event.target.value)} /></div>
          <div><label htmlFor="goal-description" className="field-label">一句说明 <span className="font-normal text-slate-400">（选填）</span></label><input id="goal-description" className="text-input" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={160} placeholder="为什么想实现它" /></div>
        </div>
        <fieldset>
          <legend className="field-label">关联习惯</legend>
          <p className="mb-3 text-xs leading-5 text-slate-500">至少选择一项普通习惯；每项习惯会按自己的周期计算达成率。</p>
          <div className="grid gap-2 sm:grid-cols-2">{habits.map((habit) => {
            const selected = habitIds.includes(habit.id);
            return <label key={habit.id} className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-3 transition ${selected ? "border-blue-200 bg-blue-50" : "border-slate-200 bg-white hover:bg-slate-50"}`}><input type="checkbox" className="size-4 shrink-0 accent-blue-600" checked={selected} onChange={() => toggleHabit(habit.id)} /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-slate-800">{habit.title}</span><span className="mt-0.5 block text-xs text-slate-400">{HABIT_FREQUENCIES.find((frequency) => frequency.value === habit.frequency)?.label} {habit.targetCount} 次</span></span>{selected ? <CheckIcon size={16} weight="bold" className="shrink-0 text-blue-600" /> : null}</label>;
          })}</div>
        </fieldset>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <button type="submit" className="primary-button w-full" disabled={saving || !title.trim() || !habitIds.length}>{saving ? "保存中…" : goal ? "保存目标" : "创建目标"}</button>
      </form>

      {goal ? <div className="border-t border-slate-100 pt-5">
        <div className="flex flex-wrap gap-2">
          {goal.status === "active" ? <button type="button" className="secondary-button" disabled={saving} onClick={() => void updateStatus("paused")}><PauseIcon size={16} weight="bold" />暂停目标</button> : <button type="button" className="secondary-button" disabled={saving} onClick={() => void updateStatus("active")}><PlayIcon size={16} weight="fill" />{goal.status === "achieved" ? "重新开始" : "继续目标"}</button>}
          {goal.status !== "achieved" ? <button type="button" className="secondary-button border-emerald-200 text-emerald-700 hover:bg-emerald-50" disabled={saving} onClick={() => void updateStatus("achieved")}><TrophyIcon size={16} weight="fill" />标记为已实现</button> : null}
          <button type="button" className="secondary-button ml-auto text-red-600 hover:border-red-200 hover:bg-red-50" disabled={saving} onClick={() => setConfirmDelete(true)}><TrashIcon size={16} weight="bold" />删除目标</button>
        </div>
        {confirmDelete ? <div className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-red-50 px-3 py-2.5"><p className="text-xs leading-5 text-red-700">只删除目标，不会删除习惯和打卡记录。</p><div className="flex shrink-0 gap-1.5"><button type="button" className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-white" disabled={saving} onClick={() => setConfirmDelete(false)}>取消</button><button type="button" className="rounded-lg bg-red-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-red-700" disabled={saving} onClick={() => void remove()}>{saving ? "删除中" : "确认删除"}</button></div></div> : null}
      </div> : null}
    </div>
  </Modal>;
}
