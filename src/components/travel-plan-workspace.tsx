"use client";

import {
  ArrowLeftIcon,
  CaretLeftIcon,
  CaretRightIcon,
  CheckIcon,
  ClockIcon,
  CopyIcon,
  HashIcon,
  LockSimpleIcon,
  MapPinIcon,
  PencilSimpleIcon,
  SignOutIcon,
  TrashIcon,
  UsersThreeIcon,
} from "@phosphor-icons/react";
import Link from "next/link";

import { EventPresence } from "@/components/event-presence";
import {
  addDaysToDateString,
  EVENT_TIME_ZONE_OPTIONS,
  getEventTimeZoneLabel,
  getMondayDateString,
} from "@/lib/dates";
import type { EventTimeZone, EventWorkspaceData } from "@/lib/types";

const HOURS = Array.from({ length: 14 }, (_, index) => index + 10);
const DAY_NAMES = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

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

export function TravelPlanWorkspace({
  data,
  identityId,
  weekStart,
  copied,
  timeZoneSaving,
  onWeekChange,
  onCopy,
  onDelete,
  onLeave,
  onEditTag,
  onTimeZoneChange,
}: {
  data: EventWorkspaceData;
  identityId: string;
  weekStart: string;
  copied: boolean;
  timeZoneSaving: boolean;
  onWeekChange: (weekStart: string) => void;
  onCopy: () => void;
  onDelete: () => void;
  onLeave: () => void;
  onEditTag: () => void;
  onTimeZoneChange: (timeZone: EventTimeZone) => void;
}) {
  const endDate = data.event.endDate ?? data.event.startDate;
  const firstWeek = getMondayDateString(data.event.startDate);
  const lastWeek = getMondayDateString(endDate);
  const dates = Array.from({ length: 7 }, (_, index) =>
    addDaysToDateString(weekStart, index),
  );
  const mapQuery = encodeURIComponent(data.event.name);

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
            <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-950">{formatRange(data.event.startDate, endDate)}</h2>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" className="icon-button" disabled={weekStart <= firstWeek} onClick={() => onWeekChange(addDaysToDateString(weekStart, -7))} aria-label="上一周"><CaretLeftIcon size={18} weight="bold" /></button>
            <button type="button" className="icon-button" disabled={weekStart >= lastWeek} onClick={() => onWeekChange(addDaysToDateString(weekStart, 7))} aria-label="下一周"><CaretRightIcon size={18} weight="bold" /></button>
          </div>
        </section>

        <div className="grid items-start gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
          <aside className="space-y-4 lg:sticky lg:top-5">
            <section className="overflow-hidden rounded-[18px] border border-slate-200/80 bg-white">
              <div className="flex items-center gap-2 px-4 py-3 text-sm font-semibold text-slate-800"><MapPinIcon size={18} weight="bold" />旅行地图</div>
              <iframe
                className="h-56 w-full border-0 bg-slate-100 lg:h-64"
                src={`https://www.google.com/maps?q=${mapQuery}&output=embed`}
                title={`${data.event.name} 地图`}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                allowFullScreen
              />
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
            <div className="overflow-x-auto">
              <div className="min-w-[820px]">
                <div className="grid grid-cols-[68px_repeat(7,minmax(96px,1fr))] border-b border-slate-200">
                  <div />
                  {dates.map((date, index) => {
                    const locked = date < data.event.startDate || date > endDate;
                    return <div key={date} className={`border-l border-slate-200 px-2 py-4 text-center ${locked ? "bg-slate-50 text-slate-300" : "text-slate-700"}`}>
                      <div className="flex items-center justify-center gap-1.5 text-sm font-semibold">{DAY_NAMES[index]} <span className="font-normal text-slate-400">{formatShortDate(date)}</span>{locked ? <LockSimpleIcon size={12} weight="bold" /> : null}</div>
                    </div>;
                  })}
                </div>
                {HOURS.map((hour) => (
                  <div key={hour} className="grid min-h-20 grid-cols-[68px_repeat(7,minmax(96px,1fr))]">
                    <div className="border-b border-slate-100 px-2 pt-3 text-right text-xs tabular-nums text-slate-400">{String(hour).padStart(2, "0")}:00</div>
                    {dates.map((date) => {
                      const locked = date < data.event.startDate || date > endDate;
                      return <div key={`${date}-${hour}`} aria-disabled={locked} className={`border-b border-l border-slate-100 ${locked ? "bg-slate-50/80" : "bg-white"}`} />;
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
