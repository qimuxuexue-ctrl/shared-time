"use client";

import {
  ArrowLeftIcon,
  ArrowSquareOutIcon,
  BedIcon,
  CaretLeftIcon,
  CaretRightIcon,
  CheckIcon,
  ClockIcon,
  CopyIcon,
  HashIcon,
  LockSimpleIcon,
  MapPinIcon,
  NavigationArrowIcon,
  PencilSimpleIcon,
  PlusIcon,
  QuestionMarkIcon,
  SignOutIcon,
  TrashIcon,
  UsersThreeIcon,
} from "@phosphor-icons/react";
import Link from "next/link";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { EventPresence } from "@/components/event-presence";
import { Modal } from "@/components/modal";
import { TravelItineraryModal } from "@/components/travel-itinerary-modal";
import { TravelJourneyModal } from "@/components/travel-journey-modal";
import { TravelPlanGuide } from "@/components/travel-plan-guide";
import { TravelRouteMap } from "@/components/travel-route-map";
import { TravelStayModal } from "@/components/travel-stay-modal";
import { TravelTransportModal } from "@/components/travel-transport-modal";
import {
  addDaysToDateString,
  EVENT_TIME_ZONE_OPTIONS,
  getEventTimeZoneLabel,
  getMondayDateString,
} from "@/lib/dates";
import type {
  EventTimeZone,
  EventWorkspaceData,
  TravelItineraryItem,
  TravelJourney,
  TravelStay,
} from "@/lib/types";

const HOURS = Array.from({ length: 14 }, (_, index) => index + 10);
const DAY_NAMES = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

type DragTarget = { date: string; startHour: number };

type DragCandidate = {
  item: TravelItineraryItem;
  pointerId: number;
  pointerType: string;
  startX: number;
  startY: number;
  active: boolean;
  timer: number | null;
};

function formatShortDate(dateString: string) {
  const [, month, day] = dateString.split("-");
  return `${Number(month)}/${Number(day)}`;
}

function formatRange(startDate: string, endDate: string) {
  const [startYear, startMonth, startDay] = startDate.split("-").map(Number);
  const [endYear, endMonth, endDay] = endDate.split("-").map(Number);
  return startYear === endYear
    ? `${startYear}年 ${startMonth}月${startDay}日 – ${endMonth}月${endDay}日`
    : `${startYear}年${startMonth}月${startDay}日 – ${endYear}年${endMonth}月${endDay}日`;
}

function getTripDayNumber(startDate: string, date: string) {
  const start = Date.parse(`${startDate}T00:00:00Z`);
  const current = Date.parse(`${date}T00:00:00Z`);
  return Math.floor((current - start) / 86_400_000) + 1;
}

export function TravelPlanWorkspace({
  data,
  identityId,
  weekStart,
  copied,
  timeZoneSaving,
  travelDatesSaving,
  onWeekChange,
  onCopy,
  onDelete,
  onLeave,
  onEditTag,
  onTimeZoneChange,
  onTravelDatesChange,
  onItineraryChange,
  onStaysChange,
  onJourneysChange,
}: {
  data: EventWorkspaceData;
  identityId: string;
  weekStart: string;
  copied: boolean;
  timeZoneSaving: boolean;
  travelDatesSaving: boolean;
  onWeekChange: (weekStart: string) => void;
  onCopy: () => void;
  onDelete: () => void;
  onLeave: () => void;
  onEditTag: () => void;
  onTimeZoneChange: (timeZone: EventTimeZone) => void;
  onTravelDatesChange: (startDate: string, endDate: string) => Promise<void>;
  onItineraryChange: (items: TravelItineraryItem[]) => void;
  onStaysChange: (stays: TravelStay[]) => void;
  onJourneysChange: (journeys: TravelJourney[]) => void;
}) {
  const endDate = data.event.endDate ?? data.event.startDate;
  const firstWeek = getMondayDateString(data.event.startDate);
  const lastWeek = getMondayDateString(endDate);
  const dates = Array.from({ length: 7 }, (_, index) =>
    addDaysToDateString(weekStart, index),
  );
  const [draft, setDraft] = useState<TravelItineraryItem | { date: string; startHour: number } | null>(null);
  const [transportItemId, setTransportItemId] = useState<string | null>(null);
  const [stayDraft, setStayDraft] = useState<TravelStay | "new" | null>(null);
  const [journeyDirection, setJourneyDirection] = useState<"outbound" | "return" | null>(null);
  const [editingDates, setEditingDates] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [focusedItemId, setFocusedItemId] = useState<string | null>(null);
  const [mapMode, setMapMode] = useState<"point" | "route">("point");
  const [routeDate, setRouteDate] = useState<string | null>(null);
  const [dragPreview, setDragPreview] = useState<{ item: TravelItineraryItem; x: number; y: number } | null>(null);
  const [dragTarget, setDragTarget] = useState<DragTarget | null>(null);
  const [movingItemId, setMovingItemId] = useState<string | null>(null);
  const [moveError, setMoveError] = useState("");
  const dragCandidateRef = useRef<DragCandidate | null>(null);
  const dragTargetRef = useRef<DragTarget | null>(null);
  const suppressClickRef = useRef(false);
  const sortedItems = useMemo(
    () => [...data.itinerary].sort((a, b) => a.date.localeCompare(b.date) || a.startHour - b.startHour),
    [data.itinerary],
  );
  const focusedItem = sortedItems.find((item) => item.id === focusedItemId) ?? sortedItems[0];
  const itineraryDates = useMemo(
    () => Array.from(new Set(sortedItems.map((item) => item.date))),
    [sortedItems],
  );
  const activeRouteDate = routeDate && itineraryDates.includes(routeDate)
    ? routeDate
    : focusedItem?.date ?? itineraryDates[0] ?? null;
  const routeItems = useMemo(
    () => activeRouteDate ? sortedItems.filter((item) => item.date === activeRouteDate) : [],
    [activeRouteDate, sortedItems],
  );
  const mapQuery = encodeURIComponent(
    focusedItem ? `${focusedItem.latitude},${focusedItem.longitude}` : data.event.name,
  );

  const focusItem = (item: TravelItineraryItem) => {
    setFocusedItemId(item.id);
    if (mapMode === "route") setRouteDate(item.date);
    const itemWeek = getMondayDateString(item.date);
    if (itemWeek !== weekStart) onWeekChange(itemWeek);
  };

  useEffect(() => () => {
    const candidate = dragCandidateRef.current;
    if (candidate?.timer) window.clearTimeout(candidate.timer);
  }, []);

  const activateDrag = (candidate: DragCandidate, x: number, y: number) => {
    candidate.active = true;
    setDragPreview({ item: candidate.item, x, y });
  };

  const startDragging = (event: ReactPointerEvent<HTMLButtonElement>, item: TravelItineraryItem) => {
    if (movingItemId || (event.pointerType === "mouse" && event.button !== 0)) return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const candidate: DragCandidate = {
      item,
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      startX: event.clientX,
      startY: event.clientY,
      active: false,
      timer: null,
    };
    if (event.pointerType !== "mouse") {
      candidate.timer = window.setTimeout(() => activateDrag(candidate, event.clientX, event.clientY), 320);
    }
    dragCandidateRef.current = candidate;
  };

  const updateDragTarget = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const candidate = dragCandidateRef.current;
    if (!candidate || candidate.pointerId !== event.pointerId) return;
    const distance = Math.hypot(event.clientX - candidate.startX, event.clientY - candidate.startY);
    if (!candidate.active && candidate.pointerType === "mouse" && distance > 4) {
      activateDrag(candidate, event.clientX, event.clientY);
    }
    if (!candidate.active) return;
    event.preventDefault();
    event.stopPropagation();
    setDragPreview({ item: candidate.item, x: event.clientX, y: event.clientY });

    const cell = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-trip-date][data-trip-hour]");
    const startHour = Number(cell?.dataset.tripHour);
    const duration = candidate.item.endHour - candidate.item.startHour;
    const nextTarget = cell
      && cell.dataset.tripLocked !== "true"
      && Number.isInteger(startHour)
      && startHour + duration <= 24
      ? { date: cell.dataset.tripDate!, startHour }
      : null;
    dragTargetRef.current = nextTarget;
    setDragTarget(nextTarget);
  };

  const moveItem = async (item: TravelItineraryItem, target: DragTarget) => {
    if (item.date === target.date && item.startHour === target.startHour) return;
    const duration = item.endHour - item.startHour;
    setMovingItemId(item.id);
    setMoveError("");
    try {
      const response = await fetch(`/api/events/${data.event.shareCode}/itinerary`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          identityId,
          itemId: item.id,
          date: target.date,
          startHour: target.startHour,
          endHour: target.startHour + duration,
        }),
      });
      const payload = (await response.json()) as { date?: string; startHour?: number; endHour?: number; error?: string };
      if (!response.ok || !payload.date || payload.startHour === undefined || payload.endHour === undefined) {
        throw new Error(payload.error ?? "移动行程失败");
      }
      onItineraryChange(data.itinerary.map((current) => current.id === item.id ? {
        ...current,
        date: payload.date!,
        startHour: payload.startHour!,
        endHour: payload.endHour!,
      } : current));
      setFocusedItemId(item.id);
    } catch (caught) {
      setMoveError(caught instanceof Error ? caught.message : "移动行程失败");
    } finally {
      setMovingItemId(null);
    }
  };

  const finishDragging = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const candidate = dragCandidateRef.current;
    if (!candidate || candidate.pointerId !== event.pointerId) return;
    if (candidate.timer) window.clearTimeout(candidate.timer);
    if (candidate.active) {
      event.preventDefault();
      event.stopPropagation();
      suppressClickRef.current = true;
      const target = dragTargetRef.current;
      if (target) void moveItem(candidate.item, target);
      window.setTimeout(() => { suppressClickRef.current = false; }, 0);
    }
    dragCandidateRef.current = null;
    dragTargetRef.current = null;
    setDragPreview(null);
    setDragTarget(null);
  };

  const cancelDragging = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const candidate = dragCandidateRef.current;
    if (!candidate || candidate.pointerId !== event.pointerId) return;
    if (candidate.timer) window.clearTimeout(candidate.timer);
    dragCandidateRef.current = null;
    dragTargetRef.current = null;
    setDragPreview(null);
    setDragTarget(null);
  };

  return (
    <main className="min-h-[100dvh] bg-[var(--page)] pb-10">
      <header className="border-b border-slate-200/80 bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex min-h-[72px] max-w-[1480px] items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Link href="/" className="icon-button shrink-0" aria-label="返回我的事件">
              <ArrowLeftIcon size={18} weight="bold" />
            </Link>
            <div className="min-w-0">
              <h1 className="truncate text-lg font-semibold tracking-tight text-slate-950">{data.event.name}</h1>
              <p className="mt-0.5 flex items-center gap-1 text-xs font-medium text-slate-500">
                <HashIcon size={12} weight="bold" />{data.event.shareCode}
              </p>
            </div>
          </div>
          <EventPresence code={data.event.shareCode} identityId={identityId} />
          <div className="flex shrink-0 items-center gap-2">
            <button type="button" className="icon-button" onClick={() => setGuideOpen(true)} aria-label="打开 Travel plan 使用指南" title="使用指南">
              <QuestionMarkIcon size={18} weight="bold" />
            </button>
            <button type="button" className={`secondary-button ${data.event.isCreator ? "text-red-600 hover:border-red-200 hover:bg-red-50" : "text-slate-500 hover:border-red-200 hover:bg-red-50 hover:text-red-600"}`} onClick={data.event.isCreator ? onDelete : onLeave}>
              {data.event.isCreator ? <TrashIcon size={18} weight="bold" /> : <SignOutIcon size={18} weight="bold" />}
              <span className="hidden sm:inline">{data.event.isCreator ? "删除事件" : "退出事件"}</span>
            </button>
            <button type="button" className="secondary-button" onClick={onCopy}>
              {copied ? <CheckIcon size={18} weight="bold" /> : <CopyIcon size={18} weight="bold" />}
              <span className="hidden sm:inline">{copied ? "已复制" : "分享事件"}</span>
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1480px] px-4 py-6 sm:px-6">
        <section className="mb-5 flex flex-col gap-4 rounded-[18px] border border-slate-200/80 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-500">
              <ClockIcon size={16} weight="bold" />
              {data.event.isCreator ? (
                <select className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-sm font-medium text-slate-600 outline-none" value={data.event.timeZone} disabled={timeZoneSaving} onChange={(event) => onTimeZoneChange(event.target.value as EventTimeZone)} aria-label="事件时区">
                  {EVENT_TIME_ZONE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              ) : <span>{getEventTimeZoneLabel(data.event.timeZone)}</span>}
              <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">Travel plan</span>
            </div>
            <div className="mt-1 flex items-center gap-2">
              <h2 className="text-xl font-semibold tracking-tight text-slate-950">{formatRange(data.event.startDate, endDate)}</h2>
              {data.event.isCreator ? (
                <button type="button" className="grid size-8 shrink-0 place-items-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700" onClick={() => setEditingDates(true)} aria-label="修改旅行日期" title="修改旅行日期">
                  <PencilSimpleIcon size={15} weight="bold" />
                </button>
              ) : null}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" className="icon-button" disabled={weekStart <= firstWeek} onClick={() => onWeekChange(addDaysToDateString(weekStart, -7))} aria-label="上一周"><CaretLeftIcon size={18} weight="bold" /></button>
            <button type="button" className="icon-button" disabled={weekStart >= lastWeek} onClick={() => onWeekChange(addDaysToDateString(weekStart, 7))} aria-label="下一周"><CaretRightIcon size={18} weight="bold" /></button>
          </div>
        </section>

        <section className="mb-5 overflow-hidden rounded-[18px] border border-slate-200/80 bg-white">
          <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-800"><BedIcon size={18} weight="bold" />住宿安排</h2>
              <p className="mt-1 text-xs text-slate-400">集中记录酒店、民宿和入住日期。</p>
            </div>
            <button type="button" className="secondary-button self-start sm:self-auto" onClick={() => setStayDraft("new")}><PlusIcon size={17} weight="bold" />添加住宿</button>
          </div>
          {data.stays.length ? (
            <div className="flex snap-x gap-3 overflow-x-auto px-4 py-4">
              {data.stays.map((stay, index) => (
                <article key={stay.id} className="group min-w-[250px] max-w-[330px] flex-1 snap-start rounded-2xl border border-blue-100 bg-[#f5f9fe] p-4 text-left transition hover:border-blue-200 hover:bg-[#eef5fc]">
                  <div className="flex items-start justify-between gap-3">
                    <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-white text-blue-600 ring-1 ring-blue-100"><BedIcon size={17} weight="bold" /></span>
                    <span className="text-[11px] font-semibold text-slate-400">住宿 {index + 1}</span>
                  </div>
                  {stay.hotelUrl ? (
                    <a href={stay.hotelUrl} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex max-w-full items-center gap-1.5 break-words text-base font-semibold leading-6 text-slate-900 underline decoration-blue-200 underline-offset-4 transition hover:text-blue-600 hover:decoration-blue-500 focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300" title="打开酒店页面">
                      <span className="min-w-0 break-words">{stay.name}</span><ArrowSquareOutIcon size={14} weight="bold" className="shrink-0 text-blue-500" />
                    </a>
                  ) : <p className="mt-3 break-words text-base font-semibold leading-6 text-slate-900">{stay.name}</p>}
                  <p className="mt-1 text-xs font-medium tabular-nums text-blue-600">{formatShortDate(stay.checkInDate)}{stay.checkInTime ? ` ${stay.checkInTime}` : ""} 入住 · {formatShortDate(stay.checkOutDate)}{stay.checkOutTime ? ` ${stay.checkOutTime}` : ""} 退房</p>
                  {stay.address ? <p className="mt-2 line-clamp-2 break-words text-xs leading-5 text-slate-500">{stay.address}</p> : <p className="mt-2 text-xs text-slate-400">点击补充地址和入住信息</p>}
                  <button type="button" className="mt-3 inline-flex items-center gap-1 rounded-md text-xs font-semibold text-slate-400 transition hover:text-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300" onClick={() => setStayDraft(stay)}><PencilSimpleIcon size={12} weight="bold" />编辑</button>
                </article>
              ))}
              <button type="button" className="grid min-h-40 min-w-[180px] snap-start place-items-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 px-5 text-sm font-semibold text-slate-400 transition hover:border-blue-200 hover:bg-blue-50/50 hover:text-blue-600" onClick={() => setStayDraft("new")}><span className="flex flex-col items-center gap-2"><span className="grid size-9 place-items-center rounded-full bg-white ring-1 ring-slate-200"><PlusIcon size={17} weight="bold" /></span>再添加一处住宿</span></button>
            </div>
          ) : (
            <button type="button" className="m-4 flex w-[calc(100%-2rem)] items-center gap-3 rounded-2xl border border-dashed border-blue-200 bg-[#f7faff] px-4 py-4 text-left transition hover:bg-blue-50 active:scale-[0.995]" onClick={() => setStayDraft("new")}>
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-white text-blue-600 ring-1 ring-blue-100"><PlusIcon size={18} weight="bold" /></span>
              <span><span className="block text-sm font-semibold text-slate-700">添加第一处住宿</span><span className="mt-1 block text-xs text-slate-400">填写酒店名称、入住与退房日期</span></span>
            </button>
          )}
        </section>

        <div className="grid items-start gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
          <aside className="space-y-4 lg:sticky lg:top-5">
            <section className="rounded-[18px] border border-slate-200/80 bg-white p-4">
              <div className="mb-3">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-800"><NavigationArrowIcon size={18} weight="bold" />出发与返程</h2>
                <p className="mt-1 text-xs leading-5 text-slate-400">记录抵达目的地和回程的大交通。</p>
              </div>
              <div className="space-y-2">
                {(["outbound", "return"] as const).map((direction) => {
                  const journey = data.journeys.find((item) => item.direction === direction);
                  const label = direction === "outbound" ? "去程" : "返程";
                  return journey ? (
                    <button key={direction} type="button" className="group w-full rounded-xl border border-blue-100 bg-[#f5f9fe] p-3 text-left transition hover:border-blue-200 hover:bg-[#eef5fc]" onClick={() => setJourneyDirection(direction)}>
                      <div className="flex items-center justify-between gap-2"><span className="text-xs font-semibold text-blue-600">{label} · {journey.mode}</span><PencilSimpleIcon size={13} weight="bold" className="text-slate-300 group-hover:text-blue-500" /></div>
                      <p className="mt-1.5 flex items-center gap-1.5 break-words text-sm font-semibold text-slate-800"><span>{journey.origin}</span><span className="text-slate-300">→</span><span>{journey.destination}</span></p>
                      <p className="mt-1 text-xs tabular-nums text-slate-400">{formatShortDate(journey.date)}{journey.departureTime ? ` · ${journey.departureTime}` : ""}{journey.arrivalTime ? `–${journey.arrivalTime}` : ""}{journey.reference ? ` · ${journey.reference}` : ""}</p>
                    </button>
                  ) : (
                    <button key={direction} type="button" className="flex w-full items-center gap-2.5 rounded-xl border border-dashed border-slate-200 bg-slate-50/70 px-3 py-3 text-left text-sm font-semibold text-slate-500 transition hover:border-blue-200 hover:bg-blue-50/60 hover:text-blue-600" onClick={() => setJourneyDirection(direction)}><span className="grid size-7 place-items-center rounded-full bg-white ring-1 ring-slate-200"><PlusIcon size={14} weight="bold" /></span>添加{label}</button>
                  );
                })}
              </div>
            </section>

            <section className="overflow-hidden rounded-[18px] border border-slate-200/80 bg-white">
              <div className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-800"><MapPinIcon size={18} weight="bold" />旅行地图</div>
                <div className="flex rounded-lg bg-slate-100 p-1 text-[11px] font-semibold">
                  <button type="button" className={`rounded-md px-2 py-1 transition ${mapMode === "point" ? "bg-white text-slate-800 shadow-sm" : "text-slate-400 hover:text-slate-600"}`} onClick={() => setMapMode("point")}>地点查看</button>
                  <button type="button" className={`rounded-md px-2 py-1 transition ${mapMode === "route" ? "bg-white text-blue-600 shadow-sm" : "text-slate-400 hover:text-slate-600"}`} onClick={() => setMapMode("route")}>当天路线</button>
                </div>
              </div>
              {mapMode === "route" && itineraryDates.length > 0 ? (
                <div className="border-t border-slate-100 bg-slate-50/70 px-3 py-2">
                  <select className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-semibold text-slate-600 outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-100" value={activeRouteDate ?? ""} onChange={(event) => {
                    setRouteDate(event.target.value);
                    const firstItem = sortedItems.find((item) => item.date === event.target.value);
                    if (firstItem) setFocusedItemId(firstItem.id);
                  }} aria-label="选择路线日期">
                    {itineraryDates.map((date) => <option key={date} value={date}>{formatShortDate(date)} · {sortedItems.filter((item) => item.date === date).length} 个地点</option>)}
                  </select>
                  <p className="mt-1.5 text-[10px] leading-4 text-slate-400">按时间顺序连接地点，用于查看行程方向，不代表实际道路导航。</p>
                </div>
              ) : null}
              {mapMode === "route" ? (
                <TravelRouteMap
                  items={routeItems}
                  focusedItemId={focusedItemId}
                  onSelect={(itemId) => {
                    const item = sortedItems.find((current) => current.id === itemId);
                    if (item) focusItem(item);
                  }}
                />
              ) : (
                <iframe
                  className="h-56 w-full border-0 bg-slate-100 lg:h-64"
                  src={`https://www.google.com/maps?q=${mapQuery}&output=embed`}
                  title={`${data.event.name} 地图`}
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  allowFullScreen
                />
              )}
              {sortedItems.length > 0 ? (
                <div className="max-h-60 space-y-1.5 overflow-y-auto border-t border-slate-100 p-2">
                  {sortedItems.map((item, index) => (
                    <div key={item.id}>
                      <button
                        type="button"
                        className={`flex w-full items-center gap-2.5 rounded-xl border px-2.5 py-2 text-left transition ${focusedItem?.id === item.id ? "border-blue-300 bg-[#eaf3ff] text-blue-700 shadow-[0_4px_14px_rgba(59,130,246,0.08)]" : "border-blue-100 bg-[#f5f9fe] text-slate-600 hover:border-blue-200 hover:bg-[#eef5fc]"}`}
                        onClick={() => focusItem(item)}
                      >
                        <span className={`grid size-6 shrink-0 place-items-center rounded-lg text-xs font-bold ${focusedItem?.id === item.id ? "bg-blue-600 text-white" : "bg-white text-slate-500 ring-1 ring-blue-100"}`}>{index + 1}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block break-words text-sm font-semibold">{item.title}</span>
                          <span className="mt-0.5 block break-words text-xs text-slate-400">{item.placeName}</span>
                          <span className="mt-0.5 block text-xs tabular-nums text-slate-400">{formatShortDate(item.date)} · {String(item.startHour).padStart(2, "0")}:00–{String(item.endHour).padStart(2, "0")}:00</span>
                        </span>
                      </button>
                      <div className="flex flex-col items-center py-1">
                        <span className="h-1.5 border-l border-dashed border-slate-200" />
                        {item.transportMode ? (
                          <button type="button" className="w-full rounded-lg bg-slate-50 px-2.5 py-2 text-left text-xs text-slate-500 transition hover:bg-slate-100 hover:text-slate-700" onClick={() => setTransportItemId(item.id)}>
                            <span className="font-semibold text-slate-700">{item.transportMode}</span>
                            {item.transportDurationMinutes ? <span> · 约 {item.transportDurationMinutes} 分钟</span> : null}
                            {item.transportNote ? <span className="mt-0.5 block break-words text-slate-400">{item.transportNote}</span> : null}
                          </button>
                        ) : (
                          <button type="button" className="grid size-7 place-items-center rounded-full bg-slate-100 text-slate-400 transition hover:bg-blue-50 hover:text-blue-600 active:scale-95" onClick={() => setTransportItemId(item.id)} aria-label={`添加离开${item.title}后的交通方式`} title="添加交通方式">
                            <PlusIcon size={14} weight="bold" />
                          </button>
                        )}
                        {index < sortedItems.length - 1 ? <span className="h-1.5 border-l border-dashed border-slate-200" /> : null}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="border-t border-slate-100 px-4 py-3 text-xs leading-5 text-slate-400">点击右侧旅行日历中的时间格，添加第一个地点。</p>
              )}
            </section>

            <section className="rounded-[18px] border border-slate-200/80 bg-white p-4">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-800"><UsersThreeIcon size={18} weight="bold" />参与者</h2>
                <span className="text-sm text-slate-400">{data.members.length}</span>
              </div>
              <div className="space-y-2">
                {data.members.map((member) => member.isCurrent ? (
                  <button key={member.id} type="button" className="group flex w-full min-w-0 items-center gap-2 rounded-xl bg-slate-50 px-3 py-2.5 text-left transition hover:bg-slate-100" onClick={onEditTag}>
                    <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: member.tagColor }} />
                    <span className="min-w-0 truncate text-sm font-semibold text-slate-700">{member.tagName}</span>
                    <span className="ml-auto text-xs font-medium text-[var(--accent)]">你</span>
                    <PencilSimpleIcon size={13} weight="bold" className="text-slate-300 group-hover:text-slate-500" />
                  </button>
                ) : (
                  <div key={member.id} className="flex min-w-0 items-center gap-2 rounded-xl bg-slate-50 px-3 py-2.5">
                    <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: member.tagColor }} />
                    <span className="truncate text-sm font-semibold text-slate-700">{member.tagName}</span>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-xs leading-5 text-slate-500">点击自己的 Tag 可修改名称和颜色。</p>
            </section>
          </aside>

          <section className="overflow-hidden rounded-[18px] border border-slate-200/80 bg-white">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <p className="text-sm font-semibold text-slate-800">旅行日历</p>
              <p className="text-xs text-slate-400">行程外日期已锁定</p>
            </div>
            {moveError ? <p className="form-error mx-4 mt-3">{moveError}</p> : null}
            <div className="overflow-x-auto">
              <div className="min-w-[820px]">
                <div className="grid grid-cols-[68px_repeat(7,minmax(96px,1fr))] border-b border-slate-200">
                  <div />
                  {dates.map((date, index) => {
                    const locked = date < data.event.startDate || date > endDate;
                    const tripDay = locked ? null : getTripDayNumber(data.event.startDate, date);
                    return <div key={date} className={`border-l border-slate-200 px-2 py-3 text-center ${locked ? "bg-slate-50 text-slate-300" : "text-slate-700"}`}>
                      <div className="flex items-center justify-center gap-1.5 text-sm font-semibold">{DAY_NAMES[index]} <span className="font-normal text-slate-400">{formatShortDate(date)}</span>{locked ? <LockSimpleIcon size={12} weight="bold" /> : null}</div>
                      {tripDay ? <span className="mt-1.5 inline-flex rounded-md bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-600">旅行第 {tripDay} 天</span> : null}
                    </div>;
                  })}
                </div>
                {HOURS.map((hour) => (
                  <div key={hour} className="grid min-h-20 grid-cols-[68px_repeat(7,minmax(96px,1fr))]">
                    <div className="border-b border-slate-100 px-2 pt-3 text-right text-xs tabular-nums text-slate-400">{String(hour).padStart(2, "0")}:00</div>
                    {dates.map((date) => {
                      const locked = date < data.event.startDate || date > endDate;
                      const items = sortedItems.filter((item) => item.date === date && item.startHour === hour);
                      return (
                        <div
                          key={`${date}-${hour}`}
                          data-trip-date={date}
                          data-trip-hour={hour}
                          data-trip-locked={locked ? "true" : "false"}
                          aria-disabled={locked}
                          className={`min-h-20 border-b border-l border-slate-100 p-1.5 ${locked ? "bg-slate-50/80" : dragTarget?.date === date && dragTarget.startHour === hour ? "cursor-pointer bg-blue-100/70 shadow-[inset_0_0_0_2px_rgba(59,130,246,0.55)]" : "cursor-pointer bg-white transition hover:bg-blue-50/40"}`}
                          role={locked ? undefined : "button"}
                          tabIndex={locked ? undefined : 0}
                          onClick={() => { if (!locked) setDraft({ date, startHour: hour }); }}
                          onKeyDown={(event) => {
                            if (!locked && (event.key === "Enter" || event.key === " ")) {
                              event.preventDefault();
                              setDraft({ date, startHour: hour });
                            }
                          }}
                        >
                          <div className="space-y-1">
                            {items.map((item) => (
                              <button
                                key={item.id}
                                type="button"
                                className={`flex w-full min-w-0 touch-none select-none flex-col items-start rounded-lg border px-2.5 py-2 text-left transition ${movingItemId === item.id ? "cursor-wait opacity-55" : dragPreview?.item.id === item.id ? "cursor-grabbing opacity-40" : "cursor-grab active:cursor-grabbing"} ${focusedItem?.id === item.id ? "border-blue-300 bg-blue-100 text-blue-800" : "border-blue-100 bg-blue-50 text-slate-700 hover:border-blue-200"}`}
                                onPointerDown={(event) => startDragging(event, item)}
                                onPointerMove={updateDragTarget}
                                onPointerUp={finishDragging}
                                onPointerCancel={cancelDragging}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  if (suppressClickRef.current) return;
                                  focusItem(item);
                                  setDraft(item);
                                }}
                              >
                                <span className="w-full whitespace-normal break-words text-sm font-semibold leading-5">{item.title}</span>
                                {item.note ? (
                                  <span className="mt-1 w-full whitespace-pre-wrap break-words text-[11px] leading-[1.45] text-slate-500">{item.note}</span>
                                ) : null}
                                <span className="mt-1.5 block text-[10px] tabular-nums text-slate-500">{String(item.startHour).padStart(2, "0")}:00–{String(item.endHour).padStart(2, "0")}:00</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>
      </div>

      {draft ? (
        <TravelItineraryModal
          code={data.event.shareCode}
          identityId={identityId}
          startDate={data.event.startDate}
          endDate={endDate}
          seed={draft}
          onClose={() => setDraft(null)}
          onSaved={(item) => {
            onItineraryChange([
              ...data.itinerary.filter((current) => current.id !== item.id),
              item,
            ]);
            setFocusedItemId(item.id);
            setDraft(null);
          }}
          onDeleted={(itemId) => {
            onItineraryChange(data.itinerary.filter((item) => item.id !== itemId));
            setFocusedItemId((current) => current === itemId ? null : current);
            setDraft(null);
          }}
        />
      ) : null}

      {transportItemId ? (() => {
        const itemIndex = sortedItems.findIndex((item) => item.id === transportItemId);
        const item = sortedItems[itemIndex];
        return item ? (
          <TravelTransportModal
            code={data.event.shareCode}
            identityId={identityId}
            item={item}
            nextItem={sortedItems[itemIndex + 1]}
            onClose={() => setTransportItemId(null)}
            onSaved={(update) => {
              onItineraryChange(data.itinerary.map((current) => current.id === item.id ? { ...current, ...update } : current));
              setTransportItemId(null);
            }}
          />
        ) : null;
      })() : null}

      {stayDraft ? <TravelStayModal
        code={data.event.shareCode}
        identityId={identityId}
        startDate={data.event.startDate}
        endDate={endDate}
        stay={stayDraft === "new" ? undefined : stayDraft}
        onClose={() => setStayDraft(null)}
        onSaved={(stay) => { onStaysChange([...data.stays.filter((item) => item.id !== stay.id), stay].sort((a, b) => a.checkInDate.localeCompare(b.checkInDate))); setStayDraft(null); }}
        onDeleted={(id) => { onStaysChange(data.stays.filter((item) => item.id !== id)); setStayDraft(null); }}
      /> : null}

      {journeyDirection ? <TravelJourneyModal
        code={data.event.shareCode}
        identityId={identityId}
        direction={journeyDirection}
        startDate={data.event.startDate}
        endDate={endDate}
        journey={data.journeys.find((item) => item.direction === journeyDirection)}
        onClose={() => setJourneyDirection(null)}
        onSaved={(journey) => { onJourneysChange([...data.journeys.filter((item) => item.direction !== journey.direction), journey]); setJourneyDirection(null); }}
        onDeleted={(id) => { onJourneysChange(data.journeys.filter((item) => item.id !== id)); setJourneyDirection(null); }}
      /> : null}

      {editingDates ? (
        <TravelDateRangeModal
          startDate={data.event.startDate}
          endDate={endDate}
          saving={travelDatesSaving}
          onClose={() => setEditingDates(false)}
          onSave={async (startDate, nextEndDate) => {
            await onTravelDatesChange(startDate, nextEndDate);
            setEditingDates(false);
          }}
        />
      ) : null}

      {guideOpen ? <TravelPlanGuide onClose={() => setGuideOpen(false)} /> : null}

      {dragPreview ? (
        <div className="pointer-events-none fixed z-50 w-44 -translate-y-1/2 rounded-xl border border-blue-300 bg-white/95 px-3 py-2.5 shadow-[0_16px_40px_rgba(37,99,235,0.2)] backdrop-blur" style={{ left: dragPreview.x + 14, top: dragPreview.y }} aria-hidden="true">
          <p className="truncate text-sm font-semibold text-slate-900">{dragPreview.item.title}</p>
          <p className="mt-1 text-xs tabular-nums text-slate-500">{dragTarget ? `${formatShortDate(dragTarget.date)} · ${String(dragTarget.startHour).padStart(2, "0")}:00` : "移到可用时间格"}</p>
        </div>
      ) : null}
    </main>
  );
}

function TravelDateRangeModal({
  startDate,
  endDate,
  saving,
  onClose,
  onSave,
}: {
  startDate: string;
  endDate: string;
  saving: boolean;
  onClose: () => void;
  onSave: (startDate: string, endDate: string) => Promise<void>;
}) {
  const [nextStartDate, setNextStartDate] = useState(startDate);
  const [nextEndDate, setNextEndDate] = useState(endDate);
  const [error, setError] = useState("");

  return (
    <Modal title="修改旅行日期" onClose={saving ? () => undefined : onClose}>
      <form className="space-y-5" onSubmit={async (event) => {
        event.preventDefault();
        setError("");
        try {
          await onSave(nextStartDate, nextEndDate);
        } catch (caught) {
          setError(caught instanceof Error ? caught.message : "修改旅行日期失败");
        }
      }}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="travel-start-date" className="field-label">开始日期</label>
            <input id="travel-start-date" type="date" className="text-input" value={nextStartDate} onChange={(event) => {
              setNextStartDate(event.target.value);
              if (nextEndDate < event.target.value) setNextEndDate(event.target.value);
            }} />
          </div>
          <div>
            <label htmlFor="travel-end-date" className="field-label">结束日期</label>
            <input id="travel-end-date" type="date" className="text-input" min={nextStartDate} value={nextEndDate} onChange={(event) => setNextEndDate(event.target.value)} />
          </div>
        </div>
        <p className="text-xs leading-5 text-slate-500">修改后日历会按新的范围展示；已有行程不会被自动删除。</p>
        {error ? <p className="form-error">{error}</p> : null}
        <button type="submit" className="primary-button w-full" disabled={saving || !nextStartDate || !nextEndDate || nextEndDate < nextStartDate}>{saving ? "正在保存" : "保存旅行日期"}</button>
      </form>
    </Modal>
  );
}
