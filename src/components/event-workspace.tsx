"use client";

import {
  ArrowLeftIcon,
  CaretDownIcon,
  CaretLeftIcon,
  CaretRightIcon,
  CheckIcon,
  ClockIcon,
  CopyIcon,
  HashIcon,
  UsersThreeIcon,
} from "@phosphor-icons/react";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import { readStoredIdentity } from "@/lib/browser-identity";
import {
  addDaysToDateString,
  getBeijingDateString,
  getIsoDay,
  getMondayDateString,
  isPastSlot,
  isValidEventHour,
} from "@/lib/dates";
import type {
  AvailabilitySlot,
  EventMember,
  EventWorkspaceData,
  Identity,
} from "@/lib/types";

type SlotUpdate = {
  date: string;
  startHour: number;
  available: boolean;
};

const HOURS = Array.from({ length: 14 }, (_, index) => index + 10);
const DAY_NAMES = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

function slotKey(date: string, startHour: number) {
  return `${date}:${startHour}`;
}

function formatShortDate(dateString: string) {
  const [, month, day] = dateString.split("-");
  return `${Number(month)}/${Number(day)}`;
}

function formatWeekRange(weekStart: string) {
  const end = addDaysToDateString(weekStart, 6);
  const startParts = weekStart.split("-").map(Number);
  const endParts = end.split("-").map(Number);
  return `${startParts[1]}月${startParts[2]}日 - ${endParts[1]}月${endParts[2]}日`;
}

function applyUpdates(
  availability: AvailabilitySlot[],
  memberId: string,
  updates: SlotUpdate[],
) {
  const updateMap = new Map(
    updates.map((update) => [slotKey(update.date, update.startHour), update]),
  );
  const next = availability.filter(
    (slot) =>
      slot.memberId !== memberId ||
      !updateMap.has(slotKey(slot.date, slot.startHour)),
  );

  for (const update of updates) {
    if (update.available) {
      next.push({
        memberId,
        date: update.date,
        startHour: update.startHour,
      });
    }
  }

  return next;
}

export function EventWorkspace({ code }: { code: string }) {
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [data, setData] = useState<EventWorkspaceData | null>(null);
  const [weekStart, setWeekStart] = useState(() =>
    getMondayDateString(getBeijingDateString()),
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [missingIdentity, setMissingIdentity] = useState(false);
  const [openPresetDay, setOpenPresetDay] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const loadWorkspace = useCallback(
    async (activeIdentity: Identity, requestedWeek: string, silent = false) => {
      if (!silent) setLoading(true);

      try {
        const query = new URLSearchParams({
          identityId: activeIdentity.id,
          weekStart: requestedWeek,
        });
        const response = await fetch(`/api/events/${code}?${query}`);
        const payload = (await response.json()) as EventWorkspaceData & {
          error?: string;
        };

        if (!response.ok) {
          throw new Error(payload.error ?? "无法读取事件");
        }

        setData(payload);
        if (payload.weekStart !== requestedWeek) {
          setWeekStart(payload.weekStart);
        }
        setError("");
      } catch (caught) {
        if (!silent) {
          setError(caught instanceof Error ? caught.message : "无法读取事件");
        }
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [code],
  );

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      const stored = readStoredIdentity();
      if (!stored) {
        setMissingIdentity(true);
        setLoading(false);
        return;
      }

      setIdentity(stored);
    });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!identity) return;

    const initialLoad = window.setTimeout(() => {
      void loadWorkspace(identity, weekStart);
    }, 0);
    const timer = window.setInterval(() => {
      void loadWorkspace(identity, weekStart, true);
    }, 5000);

    return () => {
      window.clearTimeout(initialLoad);
      window.clearInterval(timer);
    };
  }, [identity, loadWorkspace, weekStart]);

  const dates = useMemo(
    () => Array.from({ length: 7 }, (_, index) => addDaysToDateString(weekStart, index)),
    [weekStart],
  );

  const membersById = useMemo(
    () => new Map((data?.members ?? []).map((member) => [member.id, member])),
    [data?.members],
  );

  const membersBySlot = useMemo(() => {
    const map = new Map<string, EventMember[]>();
    for (const slot of data?.availability ?? []) {
      const member = membersById.get(slot.memberId);
      if (!member) continue;
      const key = slotKey(slot.date, slot.startHour);
      map.set(key, [...(map.get(key) ?? []), member]);
    }
    return map;
  }, [data?.availability, membersById]);

  const saveUpdates = async (updates: SlotUpdate[]) => {
    if (!identity || !data || updates.length === 0) return;

    const previous = data.availability;
    setData({
      ...data,
      availability: applyUpdates(previous, data.currentMemberId, updates),
    });
    setSaving(true);
    setError("");

    try {
      const response = await fetch(`/api/events/${code}/availability`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ identityId: identity.id, updates }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "保存失败");
    } catch (caught) {
      setData((current) =>
        current ? { ...current, availability: previous } : current,
      );
      setError(caught instanceof Error ? caught.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const toggleSlot = (date: string, startHour: number) => {
    if (!data) return;
    const selected = (membersBySlot.get(slotKey(date, startHour)) ?? []).some(
      (member) => member.id === data.currentMemberId,
    );
    void saveUpdates([{ date, startHour, available: !selected }]);
  };

  const applyPreset = (date: string, start: number, end: number) => {
    if (!data) return;
    const updates: SlotUpdate[] = [];

    for (let hour = start; hour < end; hour += 1) {
      if (!isValidEventHour(date, hour) || isPastSlot(date, hour)) continue;
      const selected = (membersBySlot.get(slotKey(date, hour)) ?? []).some(
        (member) => member.id === data.currentMemberId,
      );
      if (!selected) updates.push({ date, startHour: hour, available: true });
    }

    setOpenPresetDay(null);
    void saveUpdates(updates);
  };

  const clearDay = (date: string) => {
    if (!data) return;
    const updates = data.availability
      .filter(
        (slot) =>
          slot.memberId === data.currentMemberId &&
          slot.date === date &&
          !isPastSlot(slot.date, slot.startHour),
      )
      .map((slot) => ({
        date: slot.date,
        startHour: slot.startHour,
        available: false,
      }));

    setOpenPresetDay(null);
    void saveUpdates(updates);
  };

  if (missingIdentity) {
    return <WorkspaceMessage title="需要先输入 ID" body="回到首页输入你的 ID，才能查看或加入这个事件。" />;
  }

  if (loading) {
    return (
      <main className="min-h-[100dvh] bg-[var(--page)] p-5 sm:p-8">
        <div className="mx-auto max-w-7xl animate-pulse space-y-5">
          <div className="h-16 rounded-[18px] bg-white" />
          <div className="grid gap-5 lg:grid-cols-[230px_1fr]">
            <div className="h-72 rounded-[18px] bg-white" />
            <div className="h-[720px] rounded-[18px] bg-white" />
          </div>
        </div>
      </main>
    );
  }

  if (!data) {
    return <WorkspaceMessage title="无法打开事件" body={error || "请确认邀请码是否正确。"} />;
  }

  const lastWeekStart = addDaysToDateString(
    data.event.startDate,
    (data.event.weeksAhead - 1) * 7,
  );

  return (
    <main className="min-h-[100dvh] bg-[var(--page)] pb-12">
      <header className="border-b border-slate-200/80 bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex min-h-[72px] max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Link href="/" className="icon-button shrink-0" aria-label="返回我的事件">
              <ArrowLeftIcon size={18} weight="bold" />
            </Link>
            <div className="min-w-0">
              <h1 className="truncate text-lg font-semibold tracking-tight text-slate-950">
                {data.event.name}
              </h1>
              <p className="mt-0.5 flex items-center gap-1 text-xs font-medium text-slate-500">
                <HashIcon size={12} weight="bold" />
                {data.event.shareCode}
              </p>
            </div>
          </div>
          <button
            type="button"
            className="secondary-button shrink-0"
            onClick={async () => {
              await navigator.clipboard.writeText(window.location.href);
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1600);
            }}
          >
            {copied ? <CheckIcon size={18} weight="bold" /> : <CopyIcon size={18} weight="bold" />}
            <span className="hidden sm:inline">{copied ? "已复制" : "分享事件"}</span>
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="mb-5 flex flex-col gap-4 rounded-[18px] border border-slate-200/80 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="flex items-center gap-2 text-sm font-medium text-slate-500">
              <ClockIcon size={16} weight="bold" />
              北京时间 UTC+8
              {saving ? <span className="text-[var(--accent)]">正在保存</span> : null}
            </p>
            <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-950">
              {formatWeekRange(weekStart)}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="icon-button"
              disabled={weekStart <= data.event.startDate}
              onClick={() => setWeekStart(addDaysToDateString(weekStart, -7))}
              aria-label="上一周"
            >
              <CaretLeftIcon size={18} weight="bold" />
            </button>
            <button
              type="button"
              className="icon-button"
              disabled={weekStart >= lastWeekStart}
              onClick={() => setWeekStart(addDaysToDateString(weekStart, 7))}
              aria-label="下一周"
            >
              <CaretRightIcon size={18} weight="bold" />
            </button>
          </div>
        </div>

        {error ? <p className="form-error mb-5">{error}</p> : null}

        <div className="grid gap-5 lg:grid-cols-[230px_minmax(0,1fr)]">
          <aside className="h-fit rounded-[18px] border border-slate-200/80 bg-white p-4 lg:sticky lg:top-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                <UsersThreeIcon size={18} weight="bold" />
                参与者
              </h2>
              <span className="text-sm text-slate-400">{data.members.length}</span>
            </div>
            <div className="flex flex-wrap gap-2 lg:flex-col">
              {data.members.map((member) => (
                <div key={member.id} className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2.5">
                  <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: member.tagColor }} />
                  <span className="min-w-0 truncate text-sm font-semibold text-slate-700">{member.tagName}</span>
                  {member.isCurrent ? <span className="ml-auto text-xs font-medium text-[var(--accent)]">你</span> : null}
                </div>
              ))}
            </div>
            <p className="mt-4 text-xs leading-5 text-slate-500">
              点击格子添加或移除自己的 Tag。星期标题里可以快速选择整段时间。
            </p>
          </aside>

          <section className="overflow-hidden rounded-[18px] border border-slate-200/80 bg-white shadow-[0_14px_40px_rgba(67,83,108,0.05)]">
            <div className="overflow-x-auto">
              <div className="min-w-[910px]">
                <div className="grid grid-cols-[68px_repeat(7,minmax(118px,1fr))] border-b border-slate-200">
                  <div className="bg-slate-50/80" />
                  {dates.map((date, index) => (
                    <div key={date} className="relative border-l border-slate-200 bg-slate-50/80 px-3 py-3 text-center">
                      <button
                        type="button"
                        className="mx-auto flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-semibold text-slate-800 hover:bg-white"
                        onClick={() => setOpenPresetDay((current) => current === date ? null : date)}
                      >
                        <span>{DAY_NAMES[index]}</span>
                        <span className="font-normal text-slate-400">{formatShortDate(date)}</span>
                        <CaretDownIcon size={13} weight="bold" />
                      </button>
                      {openPresetDay === date ? (
                        <PresetMenu date={date} onApply={applyPreset} onClear={clearDay} />
                      ) : null}
                    </div>
                  ))}
                </div>

                {HOURS.map((hour) => (
                  <div key={hour} className="grid grid-cols-[68px_repeat(7,minmax(118px,1fr))] border-b border-slate-100 last:border-b-0">
                    <div className="flex min-h-[68px] items-start justify-end bg-slate-50/50 px-3 py-3 text-xs font-medium text-slate-400">
                      {String(hour).padStart(2, "0")}:00
                    </div>
                    {dates.map((date) => {
                      const valid = isValidEventHour(date, hour);
                      const past = valid && isPastSlot(date, hour);
                      const slotMembers = membersBySlot.get(slotKey(date, hour)) ?? [];
                      const ownSelected = slotMembers.some((member) => member.id === data.currentMemberId);
                      const disabled = !valid || past || data.event.status !== "active" || saving;

                      if (!valid) {
                        return <div key={date} className="min-h-[68px] border-l border-slate-100 bg-slate-50/45" />;
                      }

                      return (
                        <button
                          type="button"
                          key={date}
                          disabled={disabled}
                          onClick={() => toggleSlot(date, hour)}
                          className={`min-h-[68px] border-l border-slate-100 p-2 text-left transition-colors ${
                            past
                              ? "bg-slate-100/70 text-slate-400"
                              : ownSelected
                                ? "bg-blue-50/70 ring-1 ring-inset ring-blue-300"
                                : "bg-white hover:bg-blue-50/40"
                          }`}
                          aria-label={`${date} ${hour}:00 至 ${hour + 1}:00`}
                        >
                          <div className="flex flex-wrap gap-1">
                            {slotMembers.slice(0, 3).map((member) => (
                              <span
                                key={member.id}
                                className="max-w-full truncate rounded-md px-1.5 py-1 text-[11px] font-semibold leading-none"
                                style={{ color: member.tagColor, backgroundColor: `${member.tagColor}16` }}
                              >
                                {member.tagName}
                              </span>
                            ))}
                            {slotMembers.length > 3 ? (
                              <span className="rounded-md bg-slate-100 px-1.5 py-1 text-[11px] font-semibold leading-none text-slate-500">
                                +{slotMembers.length - 3}
                              </span>
                            ) : null}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

function PresetMenu({
  date,
  onApply,
  onClear,
}: {
  date: string;
  onApply: (date: string, start: number, end: number) => void;
  onClear: (date: string) => void;
}) {
  const weekend = getIsoDay(date) >= 6;
  const presets = weekend
    ? [
        ["上午", 10, 12],
        ["中午", 12, 14],
        ["下午", 14, 18],
        ["晚上", 18, 24],
        ["全天", 10, 24],
        ["10:00-12:00", 10, 12],
        ["12:00-14:00", 12, 14],
        ["14:00-16:00", 14, 16],
        ["16:00-18:00", 16, 18],
        ["18:00-20:00", 18, 20],
        ["20:00-22:00", 20, 22],
        ["22:00-24:00", 22, 24],
      ] as const
    : [
        ["19:00-21:00", 19, 21],
        ["20:00-22:00", 20, 22],
        ["21:00-23:00", 21, 23],
        ["全部 19:00-24:00", 19, 24],
      ] as const;

  return (
    <div className="absolute left-1/2 top-[52px] z-30 w-52 -translate-x-1/2 rounded-2xl border border-slate-200 bg-white p-2 text-left shadow-[0_18px_55px_rgba(49,65,88,0.18)]">
      <p className="px-2 pb-2 pt-1 text-xs font-semibold text-slate-400">快速选择</p>
      <div className="max-h-64 overflow-y-auto">
        {presets.map(([label, start, end]) => (
          <button key={label} type="button" className="block w-full rounded-lg px-2 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-100" onClick={() => onApply(date, start, end)}>
            {label}
          </button>
        ))}
      </div>
      <div className="mt-1 border-t border-slate-100 pt-1">
        <button type="button" className="block w-full rounded-lg px-2 py-2 text-left text-sm font-medium text-red-600 hover:bg-red-50" onClick={() => onClear(date)}>
          清除当天
        </button>
      </div>
    </div>
  );
}

function WorkspaceMessage({ title, body }: { title: string; body: string }) {
  return (
    <main className="grid min-h-[100dvh] place-items-center bg-[var(--page)] px-5">
      <section className="w-full max-w-md rounded-[22px] border border-slate-200 bg-white p-7 text-center shadow-[0_18px_60px_rgba(67,83,108,0.08)]">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-950">{title}</h1>
        <p className="mt-3 text-sm leading-6 text-slate-500">{body}</p>
        <Link href="/" className="primary-button mt-6 w-full">
          返回首页
        </Link>
      </section>
    </main>
  );
}
