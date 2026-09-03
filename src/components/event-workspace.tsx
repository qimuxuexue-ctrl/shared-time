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
  NotePencilIcon,
  PencilSimpleIcon,
  PlusIcon,
  TrashIcon,
  UsersThreeIcon,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import { DeleteEventModal } from "@/components/delete-event-modal";
import { Modal } from "@/components/modal";
import { readStoredIdentity } from "@/lib/browser-identity";
import {
  addDaysToDateString,
  getBeijingDateString,
  getMondayDateString,
  isPastSlot,
  isValidEventHour,
} from "@/lib/dates";
import { TAG_COLOR_OPTIONS } from "@/lib/tag-colors";
import type {
  AvailabilitySlot,
  EventMember,
  EventNote,
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
  const router = useRouter();
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
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [editingNote, setEditingNote] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [noteSaving, setNoteSaving] = useState(false);
  const [noteError, setNoteError] = useState("");
  const [editingMember, setEditingMember] = useState(false);
  const [memberSaving, setMemberSaving] = useState(false);
  const [memberError, setMemberError] = useState("");

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

  const ownNote = useMemo(
    () => data?.notes.find((note) => note.isCurrent) ?? null,
    [data?.notes],
  );

  const ownMember = useMemo(
    () => data?.members.find((member) => member.isCurrent) ?? null,
    [data?.members],
  );

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

  const beginNoteEditing = () => {
    setNoteDraft(ownNote?.content ?? "");
    setNoteError("");
    setEditingNote(true);
  };

  const saveNote = async () => {
    if (!identity || !data || !noteDraft.trim()) return;
    setNoteSaving(true);
    setNoteError("");

    try {
      const response = await fetch(`/api/events/${code}/notes`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          identityId: identity.id,
          content: noteDraft,
        }),
      });
      const payload = (await response.json()) as {
        note?: EventNote;
        error?: string;
      };

      if (!response.ok || !payload.note) {
        throw new Error(payload.error ?? "保存备注失败");
      }

      const savedNote = payload.note;
      setData((current) => {
        if (!current) return current;
        const hasOwnNote = current.notes.some((note) => note.isCurrent);
        return {
          ...current,
          notes: hasOwnNote
            ? current.notes.map((note) =>
                note.isCurrent ? savedNote : note,
              )
            : [...current.notes, savedNote],
        };
      });
      setEditingNote(false);
    } catch (caught) {
      setNoteError(caught instanceof Error ? caught.message : "保存备注失败");
    } finally {
      setNoteSaving(false);
    }
  };

  const saveMember = async (tagName: string, tagColor: string) => {
    if (!identity || !data) return;
    setMemberSaving(true);
    setMemberError("");

    try {
      const response = await fetch(`/api/events/${code}/member`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          identityId: identity.id,
          tagName,
          tagColor,
        }),
      });
      const payload = (await response.json()) as {
        member?: EventMember;
        error?: string;
      };

      if (!response.ok || !payload.member) {
        throw new Error(payload.error ?? "保存 Tag 失败");
      }

      const updatedMember = payload.member;
      setData((current) =>
        current
          ? {
              ...current,
              members: current.members.map((member) =>
                member.id === updatedMember.id ? updatedMember : member,
              ),
              notes: current.notes.map((note) =>
                note.memberId === updatedMember.id
                  ? {
                      ...note,
                      authorTagName: updatedMember.tagName,
                      authorTagColor: updatedMember.tagColor,
                    }
                  : note,
              ),
            }
          : current,
      );
      setEditingMember(false);
    } catch (caught) {
      setMemberError(caught instanceof Error ? caught.message : "保存 Tag 失败");
    } finally {
      setMemberSaving(false);
    }
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
          <div className="flex shrink-0 items-center gap-2">
            {data.event.isCreator ? (
              <button
                type="button"
                className="secondary-button text-red-600 hover:border-red-200 hover:bg-red-50"
                onClick={() => setShowDeleteConfirm(true)}
              >
                <TrashIcon size={18} weight="bold" />
                <span className="hidden sm:inline">删除事件</span>
              </button>
            ) : null}
            <button
              type="button"
              className="secondary-button"
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
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="mb-5 flex flex-col gap-4 rounded-[18px] border border-slate-200/80 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="flex items-center gap-2 text-sm font-medium text-slate-500">
              <ClockIcon size={16} weight="bold" />
              北京时间 UTC+8
              {saving ? <span className="text-[var(--accent)]">正在保存</span> : null}
              <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                {data.event.eventType === "one_time" ? "一次性事件" : "常驻事件"}
              </span>
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
              disabled={data.event.eventType === "one_time"}
              onClick={() => setWeekStart(addDaysToDateString(weekStart, 7))}
              aria-label="下一周"
            >
              <CaretRightIcon size={18} weight="bold" />
            </button>
          </div>
        </div>

        {error ? <p className="form-error mb-5">{error}</p> : null}

        <div className="grid gap-5 lg:grid-cols-[250px_minmax(0,1fr)]">
          <aside className="h-fit rounded-[18px] border border-slate-200/80 bg-white p-4 lg:sticky lg:top-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                <UsersThreeIcon size={18} weight="bold" />
                参与者
              </h2>
              <span className="text-sm text-slate-400">{data.members.length}</span>
            </div>
            <div className="flex flex-wrap gap-2 lg:flex-col">
              {data.members.map((member) =>
                member.isCurrent ? (
                  <button
                    key={member.id}
                    type="button"
                    className="group flex min-w-0 items-center gap-2 rounded-xl bg-slate-50 px-3 py-2.5 text-left transition hover:bg-slate-100 active:scale-[0.98] lg:w-full"
                    onClick={() => {
                      setMemberError("");
                      setEditingMember(true);
                    }}
                    aria-label={`修改自己的 Tag：${member.tagName}`}
                  >
                    <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: member.tagColor }} />
                    <span className="min-w-0 truncate text-sm font-semibold text-slate-700">{member.tagName}</span>
                    <span className="ml-auto shrink-0 text-xs font-medium text-[var(--accent)]">你</span>
                    <PencilSimpleIcon
                      size={13}
                      weight="bold"
                      className="shrink-0 text-slate-300 transition group-hover:text-slate-500"
                    />
                  </button>
                ) : (
                  <div key={member.id} className="flex min-w-0 items-center gap-2 rounded-xl bg-slate-50 px-3 py-2.5 lg:w-full">
                    <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: member.tagColor }} />
                    <span className="min-w-0 truncate text-sm font-semibold text-slate-700">{member.tagName}</span>
                  </div>
                ),
              )}
            </div>
            <p className="mt-4 text-xs leading-5 text-slate-500">
              点击自己的 Tag 可修改名称和颜色。点击时间格添加或移除 Tag，星期标题可快速选择整段时间。
            </p>

            <section className="mt-5 border-t border-slate-100 pt-5">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                  <NotePencilIcon size={18} weight="bold" />
                  备注
                </h2>
                {!ownNote && !editingNote ? (
                  <button
                    type="button"
                    className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-[var(--accent)] transition hover:bg-blue-50"
                    onClick={beginNoteEditing}
                  >
                    <PlusIcon size={13} weight="bold" />
                    添加
                  </button>
                ) : null}
              </div>

              <div className="space-y-3">
                {data.notes.length === 0 && !editingNote ? (
                  <p className="rounded-xl bg-slate-50 px-3 py-4 text-center text-xs leading-5 text-slate-400">
                    还没有备注
                  </p>
                ) : null}

                {data.notes.map((note) =>
                  note.isCurrent && editingNote ? null : (
                    <article
                      key={note.id}
                      className="rounded-xl border border-slate-200/80 bg-[#fffdfa] p-3 shadow-[0_6px_18px_rgba(67,83,108,0.05)]"
                    >
                      <div className="mb-2 flex items-center gap-2">
                        <span
                          className="size-2 shrink-0 rounded-full"
                          style={{ backgroundColor: note.authorTagColor }}
                        />
                        <span
                          className="min-w-0 truncate text-xs font-semibold"
                          style={{ color: note.authorTagColor }}
                        >
                          {note.authorTagName}
                        </span>
                      </div>
                      <p className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">
                        {note.content}
                      </p>
                      {note.isCurrent ? (
                        <div className="mt-2 flex justify-end">
                          <button
                            type="button"
                            className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-[var(--accent)]"
                            onClick={beginNoteEditing}
                          >
                            <PencilSimpleIcon size={13} weight="bold" />
                            修改
                          </button>
                        </div>
                      ) : null}
                    </article>
                  ),
                )}

                {editingNote ? (
                  <div className="rounded-xl border border-blue-200 bg-white p-3 shadow-[0_8px_24px_rgba(52,120,246,0.08)]">
                    <textarea
                      className="min-h-28 w-full resize-y rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-sm leading-6 text-slate-700 outline-none transition focus:border-[var(--accent)] focus:bg-white focus:ring-2 focus:ring-blue-100"
                      value={noteDraft}
                      onChange={(event) => setNoteDraft(event.target.value)}
                      placeholder="写下集合地点、准备事项或其他提醒…"
                      maxLength={500}
                      autoFocus
                    />
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <span className="text-[11px] tabular-nums text-slate-400">
                        {noteDraft.length}/500
                      </span>
                      <div className="flex gap-1.5">
                        <button
                          type="button"
                          className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-100"
                          onClick={() => {
                            setEditingNote(false);
                            setNoteError("");
                          }}
                          disabled={noteSaving}
                        >
                          取消
                        </button>
                        <button
                          type="button"
                          className="rounded-lg bg-[var(--accent)] px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-[#2469df] disabled:opacity-45"
                          onClick={() => void saveNote()}
                          disabled={noteSaving || !noteDraft.trim()}
                        >
                          {noteSaving ? "保存中" : "保存"}
                        </button>
                      </div>
                    </div>
                    {noteError ? (
                      <p className="mt-2 text-xs leading-5 text-red-600">{noteError}</p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </section>
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
                <div
                  className="grid grid-cols-[68px_repeat(7,minmax(118px,1fr))]"
                  aria-hidden="true"
                >
                  <div className="flex min-h-9 items-start justify-end bg-slate-50/50 px-3 pt-2 text-xs font-medium tabular-nums text-slate-400">
                    24:00
                  </div>
                  {dates.map((date) => (
                    <div
                      key={date}
                      className="min-h-9 border-l border-slate-100 bg-white"
                    />
                  ))}
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>

      {showDeleteConfirm && identity ? (
        <DeleteEventModal
          identity={identity}
          event={data.event}
          onClose={() => setShowDeleteConfirm(false)}
          onDeleted={() => router.replace("/")}
        />
      ) : null}

      {editingMember && ownMember ? (
        <TagSettingsModal
          member={ownMember}
          saving={memberSaving}
          error={memberError}
          onClose={() => {
            if (memberSaving) return;
            setEditingMember(false);
            setMemberError("");
          }}
          onSave={(tagName, tagColor) => void saveMember(tagName, tagColor)}
        />
      ) : null}
    </main>
  );
}

function TagSettingsModal({
  member,
  saving,
  error,
  onClose,
  onSave,
}: {
  member: EventMember;
  saving: boolean;
  error: string;
  onClose: () => void;
  onSave: (tagName: string, tagColor: string) => void;
}) {
  const [tagName, setTagName] = useState(member.tagName);
  const [tagColor, setTagColor] = useState(member.tagColor);
  const colorOptions: Array<{ name: string; value: string }> = TAG_COLOR_OPTIONS.some(
    (option) => option.value === member.tagColor,
  )
    ? [...TAG_COLOR_OPTIONS]
    : [{ name: "当前颜色", value: member.tagColor }, ...TAG_COLOR_OPTIONS];

  return (
    <Modal title="修改 Tag" onClose={onClose}>
      <form
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          onSave(tagName.trim(), tagColor);
        }}
      >
        <div>
          <label htmlFor="edit-tag-name" className="field-label">Tag 名称</label>
          <input
            id="edit-tag-name"
            className="text-input"
            value={tagName}
            onChange={(event) => setTagName(event.target.value)}
            autoFocus
            maxLength={24}
          />
          <p className="mt-2 text-xs leading-5 text-slate-500">
            Tag 只在当前事件中展示，不会改变你的 ID/昵称。
          </p>
        </div>

        <fieldset>
          <legend className="field-label">Tag 颜色</legend>
          <div className="grid grid-cols-5 gap-2">
            {colorOptions.map((option) => {
              const selected = tagColor.toUpperCase() === option.value.toUpperCase();
              return (
                <button
                  key={option.value}
                  type="button"
                  className={`flex min-w-0 flex-col items-center gap-2 rounded-xl border px-1 py-2.5 text-[11px] font-medium transition active:scale-[0.96] ${
                    selected
                      ? "border-slate-400 bg-slate-50 text-slate-700 shadow-[0_0_0_2px_rgba(148,163,184,0.12)]"
                      : "border-slate-200/80 bg-white text-slate-500 hover:border-slate-300 hover:bg-slate-50"
                  }`}
                  onClick={() => setTagColor(option.value)}
                  aria-label={`选择${option.name}`}
                  aria-pressed={selected}
                >
                  <span
                    className="grid size-8 place-items-center rounded-full"
                    style={{ backgroundColor: option.value }}
                  >
                    {selected ? <CheckIcon size={15} weight="bold" className="text-white" /> : null}
                  </span>
                  <span className="w-full truncate text-center">{option.name}</span>
                </button>
              );
            })}
          </div>
        </fieldset>

        {error ? <p className="form-error">{error}</p> : null}

        <button
          type="submit"
          className="primary-button w-full"
          disabled={saving || !tagName.trim()}
        >
          {saving ? "正在保存" : "保存修改"}
        </button>
      </form>
    </Modal>
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
  const presets = [
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
