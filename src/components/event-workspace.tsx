"use client";

import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CaretDownIcon,
  CaretLeftIcon,
  CaretRightIcon,
  CheckIcon,
  CheckCircleIcon,
  ClockIcon,
  CopyIcon,
  HashIcon,
  NotePencilIcon,
  PencilSimpleIcon,
  PlusIcon,
  ShareNetworkIcon,
  TrashIcon,
  UsersThreeIcon,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";

import { DeleteEventModal } from "@/components/delete-event-modal";
import { LoadingScreen } from "@/components/loading-screen";
import { Modal } from "@/components/modal";
import { readStoredIdentity, storeIdentity } from "@/lib/browser-identity";
import {
  addDaysToDateString,
  EVENT_TIME_ZONE_OPTIONS,
  getBeijingDateString,
  getDateStringInTimeZone,
  getEventTimeZoneLabel,
  getMondayDateString,
  isPastSlot,
  isValidEventHour,
} from "@/lib/dates";
import { TAG_COLOR_OPTIONS } from "@/lib/tag-colors";
import type {
  AvailabilitySlot,
  EventMember,
  EventNote,
  EventFinalTime,
  EventSummary,
  EventTimeZone,
  EventWorkspaceData,
  Identity,
} from "@/lib/types";

type SlotUpdate = {
  date: string;
  startHour: number;
  available: boolean;
};

type CandidateSlot = {
  date: string;
  startHour: number;
  members: EventMember[];
};

type RecommendationFilter = "recommended" | "everyone" | "two";

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

function formatFinalDate(dateString: string) {
  const [, month, day] = dateString.split("-").map(Number);
  const dayIndex = new Date(`${dateString}T00:00:00Z`).getUTCDay();
  const weekday = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][
    dayIndex
  ];
  return `${month}月${day}日 ${weekday}`;
}

function formatFinalTimeRange(startHour: number) {
  return `${String(startHour).padStart(2, "0")}:00–${String(startHour + 1).padStart(2, "0")}:00`;
}

function drawRoundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
  context.fill();
}

function drawWrappedText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
) {
  let line = "";
  let currentY = y;
  for (const character of text) {
    const candidate = `${line}${character}`;
    if (line && context.measureText(candidate).width > maxWidth) {
      context.fillText(line, x, currentY);
      line = character;
      currentY += lineHeight;
    } else {
      line = candidate;
    }
  }
  if (line) context.fillText(line, x, currentY);
}

async function loadCanvasImage(source: string) {
  const image = new Image();
  image.src = source;
  await image.decode();
  return image;
}

async function createResultImage(
  data: EventWorkspaceData,
  availableMembers: EventMember[],
) {
  const finalTime = data.event.finalTime;
  if (!finalTime) throw new Error("还没有确定最终时间");

  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1350;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("无法生成分享图片");

  context.fillStyle = "#f3f5f8";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#ffffff";
  drawRoundedRect(context, 70, 64, 940, 1222, 48);

  try {
    const character = await loadCanvasImage("/brand-character.png");
    context.drawImage(character, 116, 112, 118, 118);
  } catch {
    context.fillStyle = "#3478f6";
    drawRoundedRect(context, 116, 112, 112, 112, 30);
  }

  context.fillStyle = "#64748b";
  context.font = '600 30px "Microsoft YaHei", "PingFang SC", sans-serif';
  context.fillText("SHARE TIMELINE", 270, 165);
  context.font = '500 28px "Microsoft YaHei", "PingFang SC", sans-serif';
  context.fillText(`# ${data.event.shareCode}`, 270, 210);

  context.fillStyle = "#0f172a";
  context.font = '700 70px "Microsoft YaHei", "PingFang SC", sans-serif';
  drawWrappedText(context, data.event.name, 116, 350, 820, 92);

  context.fillStyle = "#64748b";
  context.font = '600 40px "Microsoft YaHei", "PingFang SC", sans-serif';
  context.fillText(formatFinalDate(finalTime.date), 116, 540);

  context.fillStyle = "#3478f6";
  context.font = '700 104px "Microsoft YaHei", "PingFang SC", sans-serif';
  context.fillText(formatFinalTimeRange(finalTime.startHour), 108, 680);

  context.fillStyle = "#475569";
  context.font = '500 34px "Microsoft YaHei", "PingFang SC", sans-serif';
  context.fillText(
    getEventTimeZoneLabel(data.event.timeZone) ?? "",
    116,
    752,
  );

  context.fillStyle = "#f8fafc";
  drawRoundedRect(context, 108, 826, 864, 304, 32);
  context.fillStyle = "#64748b";
  context.font = '600 30px "Microsoft YaHei", "PingFang SC", sans-serif';
  context.fillText(
    `可参加 ${availableMembers.length}/${data.members.length} 人`,
    150,
    892,
  );
  context.fillStyle = "#1e293b";
  context.font = '600 40px "Microsoft YaHei", "PingFang SC", sans-serif';
  drawWrappedText(
    context,
    availableMembers.map((member) => member.tagName).join("、") || "暂无成员标记有空",
    150,
    966,
    780,
    58,
  );

  context.fillStyle = "#94a3b8";
  context.font = '500 28px "Microsoft YaHei", "PingFang SC", sans-serif';
  context.fillText("最终时间由事件创建者确认", 116, 1212);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("无法生成分享图片"))),
      "image/png",
    );
  });
}

function formatNoteUpdatedAt(value: string, timeZone: EventTimeZone) {
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone,
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(value));
  const readPart = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return `更新于 ${readPart("month")}月${readPart("day")}日 ${readPart("hour")}:${readPart("minute")}`;
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
  const [timeZoneSaving, setTimeZoneSaving] = useState(false);
  const [error, setError] = useState("");
  const [missingIdentity, setMissingIdentity] = useState(false);
  const [joinRequired, setJoinRequired] = useState(false);
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
  const [recommendationFilter, setRecommendationFilter] =
    useState<RecommendationFilter>("recommended");
  const [finalCandidate, setFinalCandidate] = useState<CandidateSlot | null>(
    null,
  );
  const [finalSaving, setFinalSaving] = useState(false);
  const [showCancelFinalConfirm, setShowCancelFinalConfirm] = useState(false);
  const [sharingImage, setSharingImage] = useState(false);
  const [shareFeedback, setShareFeedback] = useState("");
  const dataRef = useRef<EventWorkspaceData | null>(null);
  const savedAvailabilityRef = useRef<AvailabilitySlot[]>([]);
  const pendingUpdatesRef = useRef(new Map<string, SlotUpdate>());
  const saveTimerRef = useRef<number | null>(null);
  const saveInFlightRef = useRef(false);
  const flushPendingUpdatesRef = useRef<() => Promise<void>>(async () => {});

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

        if (response.status === 403) {
          setJoinRequired(true);
          setError("");
          return;
        }

        if (!response.ok) {
          throw new Error(payload.error ?? "无法读取事件");
        }

        if (
          silent &&
          (saveInFlightRef.current || pendingUpdatesRef.current.size > 0)
        ) {
          return;
        }

        savedAvailabilityRef.current = payload.availability;
        const pendingUpdates = Array.from(pendingUpdatesRef.current.values());
        const nextData = pendingUpdates.length
          ? {
              ...payload,
              availability: applyUpdates(
                payload.availability,
                payload.currentMemberId,
                pendingUpdates,
              ),
            }
          : payload;
        dataRef.current = nextData;
        setData(nextData);
        setJoinRequired(false);
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

  useEffect(
    () => () => {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
      }
      if (
        pendingUpdatesRef.current.size > 0 &&
        !saveInFlightRef.current
      ) {
        void flushPendingUpdatesRef.current();
      }
    },
    [],
  );

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

  const rankedSlots = useMemo(() => {
    if (!data) return [] as CandidateSlot[];

    return dates
      .flatMap((date) =>
        HOURS.map((startHour) => ({
          date,
          startHour,
          members: membersBySlot.get(slotKey(date, startHour)) ?? [],
        })),
      )
      .filter(
        (slot) =>
          slot.members.length > 0 &&
          !isPastSlot(slot.date, slot.startHour, data.event.timeZone),
      )
      .sort(
        (first, second) =>
          second.members.length - first.members.length ||
          first.date.localeCompare(second.date) ||
          first.startHour - second.startHour,
      );
  }, [data, dates, membersBySlot]);

  const visibleRecommendations = useMemo(() => {
    if (!data) return [] as CandidateSlot[];
    const filtered =
      recommendationFilter === "everyone"
        ? rankedSlots.filter(
            (slot) => slot.members.length === data.members.length,
          )
        : recommendationFilter === "two"
          ? rankedSlots.filter((slot) => slot.members.length >= 2)
          : rankedSlots;
    return filtered.slice(0, 6);
  }, [data, rankedSlots, recommendationFilter]);

  const ownNote = useMemo(
    () => data?.notes.find((note) => note.isCurrent) ?? null,
    [data?.notes],
  );

  const ownMember = useMemo(
    () => data?.members.find((member) => member.isCurrent) ?? null,
    [data?.members],
  );

  const finalTimeMembers = useMemo(() => {
    if (!data?.event.finalTime) return [] as EventMember[];
    return (
      membersBySlot.get(
        slotKey(
          data.event.finalTime.date,
          data.event.finalTime.startHour,
        ),
      ) ?? []
    );
  }, [data, membersBySlot]);

  const flushPendingUpdates = useCallback(async () => {
    const currentData = dataRef.current;
    if (
      !identity ||
      !currentData ||
      saveInFlightRef.current ||
      pendingUpdatesRef.current.size === 0
    ) {
      return;
    }

    saveInFlightRef.current = true;
    const updates = Array.from(pendingUpdatesRef.current.values());

    try {
      const response = await fetch(`/api/events/${code}/availability`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ identityId: identity.id, updates }),
        keepalive: true,
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "保存失败");

      savedAvailabilityRef.current = applyUpdates(
        savedAvailabilityRef.current,
        currentData.currentMemberId,
        updates,
      );
      for (const update of updates) {
        const key = slotKey(update.date, update.startHour);
        const latest = pendingUpdatesRef.current.get(key);
        if (latest?.available === update.available) {
          pendingUpdatesRef.current.delete(key);
        }
      }
      setError("");
    } catch (caught) {
      for (const update of updates) {
        const key = slotKey(update.date, update.startHour);
        const latest = pendingUpdatesRef.current.get(key);
        if (latest?.available === update.available) {
          pendingUpdatesRef.current.delete(key);
        }
      }

      setData((current) => {
        if (!current) return current;
        const next = {
          ...current,
          availability: applyUpdates(
            savedAvailabilityRef.current,
            current.currentMemberId,
            Array.from(pendingUpdatesRef.current.values()),
          ),
        };
        dataRef.current = next;
        return next;
      });
      setError(caught instanceof Error ? caught.message : "保存失败");
    } finally {
      saveInFlightRef.current = false;
      if (pendingUpdatesRef.current.size > 0) {
        saveTimerRef.current = window.setTimeout(() => {
          saveTimerRef.current = null;
          void flushPendingUpdatesRef.current();
        }, 80);
      } else {
        setSaving(false);
      }
    }
  }, [code, identity]);

  useEffect(() => {
    flushPendingUpdatesRef.current = flushPendingUpdates;
  }, [flushPendingUpdates]);

  const saveUpdates = (updates: SlotUpdate[]) => {
    if (!identity || updates.length === 0) return;

    for (const update of updates) {
      pendingUpdatesRef.current.set(
        slotKey(update.date, update.startHour),
        update,
      );
    }

    setData((current) => {
      if (!current) return current;
      const next = {
        ...current,
        availability: applyUpdates(
          current.availability,
          current.currentMemberId,
          updates,
        ),
      };
      dataRef.current = next;
      return next;
    });
    setSaving(true);
    setError("");

    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null;
      void flushPendingUpdatesRef.current();
    }, 320);
  };

  const toggleSlot = (date: string, startHour: number) => {
    if (!data) return;
    const selected = (membersBySlot.get(slotKey(date, startHour)) ?? []).some(
      (member) => member.id === data.currentMemberId,
    );
    saveUpdates([{ date, startHour, available: !selected }]);
  };

  const applyPreset = (date: string, start: number, end: number) => {
    if (!data) return;
    const updates: SlotUpdate[] = [];

    for (let hour = start; hour < end; hour += 1) {
      if (
        !isValidEventHour(date, hour) ||
        isPastSlot(date, hour, data.event.timeZone)
      ) {
        continue;
      }
      const selected = (membersBySlot.get(slotKey(date, hour)) ?? []).some(
        (member) => member.id === data.currentMemberId,
      );
      if (!selected) updates.push({ date, startHour: hour, available: true });
    }

    setOpenPresetDay(null);
    saveUpdates(updates);
  };

  const clearDay = (date: string) => {
    if (!data) return;
    const updates = data.availability
      .filter(
        (slot) =>
          slot.memberId === data.currentMemberId &&
          slot.date === date &&
          !isPastSlot(slot.date, slot.startHour, data.event.timeZone),
      )
      .map((slot) => ({
        date: slot.date,
        startHour: slot.startHour,
        available: false,
      }));

    setOpenPresetDay(null);
    saveUpdates(updates);
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

  const saveTimeZone = async (timeZone: EventTimeZone) => {
    if (!identity || !data || timeZone === data.event.timeZone) return;
    setTimeZoneSaving(true);
    setError("");

    try {
      const response = await fetch(`/api/events/${code}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ identityId: identity.id, timeZone }),
      });
      const payload = (await response.json()) as {
        timeZone?: EventTimeZone;
        error?: string;
      };

      if (!response.ok || !payload.timeZone) {
        throw new Error(payload.error ?? "修改时区失败");
      }

      const currentWeekStart = getMondayDateString(
        getDateStringInTimeZone(payload.timeZone),
      );
      setWeekStart(currentWeekStart);
      await loadWorkspace(identity, currentWeekStart);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "修改时区失败");
    } finally {
      setTimeZoneSaving(false);
    }
  };

  const saveFinalTime = async () => {
    if (!identity || !data || !finalCandidate) return;
    setFinalSaving(true);
    setError("");

    try {
      const response = await fetch(`/api/events/${code}/final-time`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          identityId: identity.id,
          date: finalCandidate.date,
          startHour: finalCandidate.startHour,
        }),
      });
      const payload = (await response.json()) as {
        finalTime?: EventFinalTime;
        error?: string;
      };

      if (!response.ok || !payload.finalTime) {
        throw new Error(payload.error ?? "确认最终时间失败");
      }

      setData((current) => {
        if (!current) return current;
        const next = {
          ...current,
          event: { ...current.event, finalTime: payload.finalTime ?? null },
        };
        dataRef.current = next;
        return next;
      });
      setFinalCandidate(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "确认最终时间失败");
    } finally {
      setFinalSaving(false);
    }
  };

  const cancelFinalTime = async () => {
    if (!identity || !data?.event.finalTime) return;
    setFinalSaving(true);
    setError("");

    try {
      const response = await fetch(`/api/events/${code}/final-time`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ identityId: identity.id }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "取消最终时间失败");
      }

      setData((current) => {
        if (!current) return current;
        const next = {
          ...current,
          event: { ...current.event, finalTime: null },
        };
        dataRef.current = next;
        return next;
      });
      setShowCancelFinalConfirm(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "取消最终时间失败");
    } finally {
      setFinalSaving(false);
    }
  };

  const shareResultImage = async () => {
    if (!data?.event.finalTime) return;
    setSharingImage(true);
    setShareFeedback("");

    try {
      const blob = await createResultImage(data, finalTimeMembers);
      const safeEventName = data.event.name.replace(/[\\/:*?"<>|]/g, "-");
      const file = new File([blob], `${safeEventName}-最终时间.png`, {
        type: "image/png",
      });

      if (
        typeof navigator.share === "function" &&
        typeof navigator.canShare === "function" &&
        navigator.canShare({ files: [file] })
      ) {
        await navigator.share({
          title: `${data.event.name} · 最终时间`,
          text: `${formatFinalDate(data.event.finalTime.date)} ${formatFinalTimeRange(data.event.finalTime.startHour)}`,
          files: [file],
        });
        setShareFeedback("已打开系统分享菜单");
      } else {
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = file.name;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        setShareFeedback("当前浏览器不支持直接分享，图片已保存");
      }
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") {
        return;
      }
      setShareFeedback(
        caught instanceof Error ? caught.message : "生成分享图片失败",
      );
    } finally {
      setSharingImage(false);
    }
  };

  const joinFromSharedLink = async (displayId: string, tagName: string) => {
    let activeIdentity = identity;

    if (!activeIdentity) {
      const identityResponse = await fetch("/api/identity", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: displayId }),
      });
      const identityPayload = (await identityResponse.json()) as {
        identity?: Identity;
        events?: EventSummary[];
        error?: string;
      };

      if (!identityResponse.ok || !identityPayload.identity) {
        throw new Error(identityPayload.error ?? "无法建立这个 ID");
      }
      activeIdentity = identityPayload.identity;

      const existingMembership = identityPayload.events?.some(
        (event) => event.shareCode === code,
      );

      if (existingMembership) {
        storeIdentity(activeIdentity);
        setMissingIdentity(false);
        setJoinRequired(false);
        setLoading(true);
        setIdentity(activeIdentity);
        return;
      }

      if (!tagName.trim()) {
        throw new Error("这是你首次加入该事件，请先设置本事件的 Tag");
      }
      storeIdentity(activeIdentity);
    }

    const joinResponse = await fetch("/api/events/join", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        identityId: activeIdentity.id,
        shareCode: code,
        tagName,
      }),
    });
    const joinPayload = (await joinResponse.json()) as { error?: string };

    if (!joinResponse.ok) {
      throw new Error(joinPayload.error ?? "加入事件失败");
    }

    storeIdentity(activeIdentity);
    setMissingIdentity(false);
    setJoinRequired(false);

    if (!identity) {
      setLoading(true);
      setIdentity(activeIdentity);
      return;
    }

    await loadWorkspace(activeIdentity, weekStart);
  };

  if (missingIdentity || joinRequired) {
    return (
      <SharedLinkEntry
        code={code}
        identity={identity}
        onJoin={joinFromSharedLink}
      />
    );
  }

  if (loading) {
    return <LoadingScreen />;
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
              {data.event.isCreator ? (
                <select
                  className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-sm font-medium text-slate-600 outline-none transition hover:border-slate-300 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 disabled:cursor-wait disabled:opacity-60"
                  value={data.event.timeZone}
                  onChange={(event) =>
                    void saveTimeZone(event.target.value as EventTimeZone)
                  }
                  disabled={timeZoneSaving || saving}
                  aria-label="事件时区"
                  title="创建者可以修改事件时区"
                >
                  {EVENT_TIME_ZONE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              ) : (
                <span>{getEventTimeZoneLabel(data.event.timeZone)}</span>
              )}
              {saving ? <span className="text-[var(--accent)]">正在保存</span> : null}
              {timeZoneSaving ? (
                <span className="text-[var(--accent)]">正在切换时区</span>
              ) : null}
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

        {data.event.finalTime ? (
          <section className="mb-5 rounded-[20px] border border-blue-200/80 bg-[#eef5fc] p-5 shadow-[0_12px_36px_rgba(52,120,246,0.08)] sm:flex sm:items-center sm:justify-between sm:gap-6">
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-sm font-semibold text-blue-600">
                <CheckCircleIcon size={18} weight="fill" />
                已确定最终时间
              </p>
              <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1">
                <h2 className="text-2xl font-semibold tracking-[-0.025em] text-slate-950">
                  {formatFinalDate(data.event.finalTime.date)}
                </h2>
                <p className="text-xl font-semibold tabular-nums text-[var(--accent)]">
                  {formatFinalTimeRange(data.event.finalTime.startHour)}
                </p>
              </div>
              <p className="mt-2 text-sm text-slate-600">
                {getEventTimeZoneLabel(data.event.timeZone)} · 可参加 {finalTimeMembers.length}/{data.members.length} 人
              </p>
              {finalTimeMembers.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {finalTimeMembers.map((member) => (
                    <span
                      key={member.id}
                      className="rounded-lg bg-white/75 px-2.5 py-1 text-xs font-semibold"
                      style={{ color: member.tagColor }}
                    >
                      {member.tagName}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="mt-5 flex shrink-0 flex-wrap gap-2 sm:mt-0 sm:justify-end">
              <button
                type="button"
                className="primary-button"
                onClick={() => void shareResultImage()}
                disabled={sharingImage}
              >
                <ShareNetworkIcon size={18} weight="bold" />
                {sharingImage ? "正在生成" : "分享结果图"}
              </button>
              {data.event.isCreator ? (
                <button
                  type="button"
                  className="secondary-button text-red-600 hover:border-red-200 hover:bg-red-50"
                  onClick={() => setShowCancelFinalConfirm(true)}
                >
                  取消最终时间
                </button>
              ) : null}
              {shareFeedback ? (
                <p className="w-full text-xs leading-5 text-slate-500 sm:text-right">
                  {shareFeedback}
                </p>
              ) : null}
            </div>
          </section>
        ) : null}

        <section className="mb-5 rounded-[20px] border border-slate-200/80 bg-white p-5 shadow-[0_12px_36px_rgba(67,83,108,0.05)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold tracking-tight text-slate-950">
                推荐共同时间
              </h2>
              <p className="mt-1 text-sm leading-6 text-slate-500">
                根据当前周的空闲记录自动排序，人数相同时优先显示较早时间。
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5 rounded-xl bg-slate-100 p-1">
              {([
                ["recommended", "推荐排序"],
                ["everyone", "全员有空"],
                ["two", "至少 2 人"],
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${
                    recommendationFilter === value
                      ? "bg-white text-slate-800 shadow-sm"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                  onClick={() => setRecommendationFilter(value)}
                  disabled={value === "two" && data.members.length < 2}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {visibleRecommendations.length > 0 ? (
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {visibleRecommendations.map((slot, index) => {
                const isBest =
                  recommendationFilter === "recommended" && index === 0;
                const isFinal =
                  data.event.finalTime?.date === slot.date &&
                  data.event.finalTime.startHour === slot.startHour;
                return (
                  <article
                    key={slotKey(slot.date, slot.startHour)}
                    className={`rounded-2xl border p-4 ${
                      isFinal
                        ? "border-blue-300 bg-blue-50/70"
                        : "border-slate-200 bg-slate-50/65"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-800">
                          {formatFinalDate(slot.date)}
                        </p>
                        <p className="mt-1 text-lg font-semibold tabular-nums text-slate-950">
                          {formatFinalTimeRange(slot.startHour)}
                        </p>
                      </div>
                      <span className="rounded-lg bg-white px-2.5 py-1.5 text-xs font-semibold text-blue-600 shadow-sm">
                        {slot.members.length}/{data.members.length} 人
                      </span>
                    </div>
                    <div className="mt-3 flex min-h-6 flex-wrap gap-1.5">
                      {slot.members.slice(0, 4).map((member) => (
                        <span
                          key={member.id}
                          className="max-w-24 truncate rounded-md bg-white px-2 py-1 text-[11px] font-semibold"
                          style={{ color: member.tagColor }}
                        >
                          {member.tagName}
                        </span>
                      ))}
                      {slot.members.length > 4 ? (
                        <span className="px-1 py-1 text-[11px] font-semibold text-slate-400">
                          +{slot.members.length - 4}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-4 flex items-center justify-between gap-3">
                      <span className="text-xs font-medium text-slate-400">
                        {isFinal ? "当前最终时间" : isBest ? "当前最优" : "候选时间"}
                      </span>
                      {data.event.isCreator && !isFinal ? (
                        <button
                          type="button"
                          className="rounded-lg bg-[var(--accent)] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[#2469df] active:scale-[0.98]"
                          onClick={() => setFinalCandidate(slot)}
                        >
                          {data.event.finalTime ? "改为此时间" : "确定此时间"}
                        </button>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <p className="mt-4 rounded-xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-400">
              {recommendationFilter === "everyone"
                ? "当前周还没有所有人都有空的时间"
                : recommendationFilter === "two"
                  ? "当前周还没有至少 2 人有空的共同时间"
                  : "当前周还没有可推荐的空闲时间"}
            </p>
          )}
        </section>

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
                      <div className="mt-3 flex min-h-7 items-center justify-between gap-2">
                        <time
                          dateTime={note.updatedAt}
                          className="shrink-0 text-[10px] font-medium tabular-nums text-slate-400"
                        >
                          {formatNoteUpdatedAt(
                            note.updatedAt,
                            data.event.timeZone,
                          )}
                        </time>
                        {note.isCurrent ? (
                          <button
                            type="button"
                            className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-[var(--accent)]"
                            onClick={beginNoteEditing}
                          >
                            <PencilSimpleIcon size={13} weight="bold" />
                            修改
                          </button>
                        ) : null}
                      </div>
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
                      const past =
                        valid &&
                        isPastSlot(date, hour, data.event.timeZone);
                      const slotMembers = membersBySlot.get(slotKey(date, hour)) ?? [];
                      const ownSelected = slotMembers.some((member) => member.id === data.currentMemberId);
                      const disabled = !valid || past || data.event.status !== "active";
                      const isFinal =
                        data.event.finalTime?.date === date &&
                        data.event.finalTime.startHour === hour;

                      if (!valid) {
                        return <div key={date} className="min-h-[68px] border-l border-slate-100 bg-slate-50/45" />;
                      }

                      return (
                        <button
                          type="button"
                          key={date}
                          disabled={disabled}
                          onClick={() => toggleSlot(date, hour)}
                          className={`relative min-h-[68px] border-l border-slate-100 p-2 text-left transition-colors ${
                            isFinal
                              ? "bg-amber-50 ring-2 ring-inset ring-amber-400"
                              : past
                              ? "bg-slate-100/70 text-slate-400"
                              : ownSelected
                                ? "bg-blue-50/70 ring-1 ring-inset ring-blue-300"
                                : "bg-white hover:bg-blue-50/40"
                          }`}
                          aria-label={`${date} ${hour}:00 至 ${hour + 1}:00，${slotMembers.length}/${data.members.length} 人有空${isFinal ? "，已确定为最终时间" : ""}`}
                        >
                          <div className="flex items-start justify-between gap-1">
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
                            {slotMembers.length > 0 ? (
                              <span className={`shrink-0 rounded-md px-1.5 py-1 text-[10px] font-bold tabular-nums ${
                                isFinal
                                  ? "bg-amber-100 text-amber-700"
                                  : "bg-slate-100 text-slate-500"
                              }`}>
                                {slotMembers.length}/{data.members.length}
                              </span>
                            ) : null}
                          </div>
                          {isFinal ? (
                            <span className="absolute bottom-1.5 right-2 text-[10px] font-bold text-amber-700">
                              最终时间
                            </span>
                          ) : null}
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

      {finalCandidate ? (
        <Modal
          title={data.event.finalTime ? "修改最终时间" : "确认最终时间"}
          onClose={() => {
            if (!finalSaving) setFinalCandidate(null);
          }}
        >
          <div className="rounded-2xl bg-slate-50 p-4">
            <p className="text-sm font-semibold text-slate-700">
              {formatFinalDate(finalCandidate.date)}
            </p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-950">
              {formatFinalTimeRange(finalCandidate.startHour)}
            </p>
            <p className="mt-2 text-sm text-slate-500">
              {getEventTimeZoneLabel(data.event.timeZone)} · {finalCandidate.members.length}/{data.members.length} 人可参加
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {finalCandidate.members.map((member) => (
                <span
                  key={member.id}
                  className="rounded-lg bg-white px-2.5 py-1 text-xs font-semibold"
                  style={{ color: member.tagColor }}
                >
                  {member.tagName}
                </span>
              ))}
            </div>
          </div>
          <p className="mt-4 text-sm leading-6 text-slate-500">
            确认后会通知事件中的所有参与者。之后仍可选择其他候选时间，或取消最终时间。
          </p>
          <div className="mt-6 grid grid-cols-2 gap-3">
            <button
              type="button"
              className="secondary-button justify-center"
              onClick={() => setFinalCandidate(null)}
              disabled={finalSaving}
            >
              返回
            </button>
            <button
              type="button"
              className="primary-button justify-center"
              onClick={() => void saveFinalTime()}
              disabled={finalSaving}
            >
              {finalSaving ? "正在确认" : "确认并通知"}
            </button>
          </div>
        </Modal>
      ) : null}

      {showCancelFinalConfirm ? (
        <Modal
          title="取消最终时间？"
          onClose={() => {
            if (!finalSaving) setShowCancelFinalConfirm(false);
          }}
        >
          <p className="text-sm leading-6 text-slate-600">
            取消后，已填写的空闲时间不会被删除。所有参与者会收到最终时间已取消的通知。
          </p>
          <div className="mt-6 grid grid-cols-2 gap-3">
            <button
              type="button"
              className="secondary-button justify-center"
              onClick={() => setShowCancelFinalConfirm(false)}
              disabled={finalSaving}
            >
              保留
            </button>
            <button
              type="button"
              className="flex min-h-11 items-center justify-center rounded-xl bg-red-600 px-4 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-50"
              onClick={() => void cancelFinalTime()}
              disabled={finalSaving}
            >
              {finalSaving ? "正在取消" : "确认取消"}
            </button>
          </div>
        </Modal>
      ) : null}

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

function SharedLinkEntry({
  code,
  identity,
  onJoin,
}: {
  code: string;
  identity: Identity | null;
  onJoin: (displayId: string, tagName: string) => Promise<void>;
}) {
  const [displayId, setDisplayId] = useState(identity?.displayId ?? "");
  const [tagName, setTagName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setFormError("");

    try {
      await onJoin(displayId.trim(), tagName.trim());
    } catch (caught) {
      setFormError(
        caught instanceof Error ? caught.message : "加入事件失败，请稍后重试",
      );
      setSubmitting(false);
    }
  };

  return (
    <main className="grid min-h-[100dvh] place-items-center bg-[var(--page)] px-5 py-12">
      <section className="w-full max-w-[430px]">
        <div className="mb-6">
          <p className="mb-3 inline-flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1.5 font-mono text-xs font-semibold tracking-[0.08em] text-slate-500 shadow-[0_8px_24px_rgba(67,83,108,0.06)]">
            <HashIcon size={13} weight="bold" />
            {code}
          </p>
          <h1 className="text-3xl font-semibold tracking-[-0.035em] text-slate-950">
            加入共享事件
          </h1>
          <p className="mt-3 text-sm leading-6 text-slate-500">
            {identity
              ? `你将以 ${identity.displayId} 的身份加入，只需设置本事件中显示的 Tag。`
              : "本机没有保存身份记录。输入曾使用的 ID/昵称可以找回参与记录；如果是首次参加，请同时设置本事件的 Tag。"}
          </p>
        </div>

        <form
          onSubmit={submit}
          className="rounded-[22px] border border-slate-200/80 bg-white p-5 shadow-[0_18px_60px_rgba(67,83,108,0.08)] sm:p-6"
        >
          {!identity ? (
            <div>
              <label htmlFor="shared-link-id" className="field-label">
                你的 ID/昵称
              </label>
              <input
                id="shared-link-id"
                className="text-input"
                value={displayId}
                onChange={(event) => setDisplayId(event.target.value)}
                placeholder="例如 小王2026"
                autoComplete="username"
                autoFocus
                maxLength={24}
              />
              <p className="mt-2 text-xs leading-5 text-slate-500">
                系统会先查找已有身份；找到本事件的参与记录后会直接进入。
              </p>
            </div>
          ) : null}

          <div className={identity ? "" : "mt-5"}>
            <label htmlFor="shared-link-tag" className="field-label">
              这个事件里的 Tag{!identity ? "（首次加入时填写）" : ""}
            </label>
            <input
              id="shared-link-tag"
              className="text-input"
              value={tagName}
              onChange={(event) => setTagName(event.target.value)}
              placeholder="例如 雪雪"
              autoFocus={Boolean(identity)}
              maxLength={24}
            />
            <p className="mt-2 text-xs leading-5 text-slate-500">
              {!identity
                ? "曾经参加过本事件可留空；首次加入时，Tag 仅在当前事件中展示。"
                : "Tag 仅在当前事件中展示，加入后仍可修改名称和颜色。"}
            </p>
          </div>

          {formError ? <p className="form-error">{formError}</p> : null}

          <button
            type="submit"
            className="primary-button mt-5 w-full"
            disabled={
              submitting ||
              (!identity && displayId.trim().length < 2) ||
              (Boolean(identity) && !tagName.trim())
            }
          >
            {submitting
              ? "正在查找"
              : identity
                ? "加入并查看时间表"
                : "找回或加入事件"}
            {!submitting ? <ArrowRightIcon size={18} weight="bold" /> : null}
          </button>
        </form>

        <div className="mt-5 text-center">
          <Link
            href="/"
            className="text-sm font-medium text-slate-500 transition hover:text-slate-800"
          >
            返回首页
          </Link>
        </div>
      </section>
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
