"use client";

import { CalendarBlankIcon, CaretLeftIcon, CaretRightIcon } from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState } from "react";

const WEEKDAYS = ["一", "二", "三", "四", "五", "六", "日"];

function toDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function toDateString(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function todayString() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
}

export function DatePicker({ value, onChange, min, max, align = "left", ariaLabel }: {
  value: string;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
  align?: "left" | "right";
  ariaLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState(() => value.slice(0, 7));
  const rootRef = useRef<HTMLDivElement>(null);
  const today = todayString();

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const days = useMemo(() => {
    const first = toDate(`${viewMonth}-01`);
    const mondayOffset = (first.getUTCDay() + 6) % 7;
    const gridStart = addDays(first, -mondayOffset);
    return Array.from({ length: 42 }, (_, index) => toDateString(addDays(gridStart, index)));
  }, [viewMonth]);

  const changeMonth = (amount: number) => {
    const month = toDate(`${viewMonth}-01`);
    month.setUTCMonth(month.getUTCMonth() + amount);
    setViewMonth(toDateString(month).slice(0, 7));
  };

  return <div ref={rootRef} className="app-date-picker relative mt-1">
    <button type="button" className="text-input flex items-center justify-between gap-3 text-left tabular-nums" aria-label={ariaLabel} aria-haspopup="dialog" aria-expanded={open} onClick={() => { if (!open) setViewMonth(value.slice(0, 7)); setOpen((current) => !current); }}>
      <span>{value.replaceAll("-", "/")}</span><CalendarBlankIcon size={17} weight="bold" className="shrink-0 text-slate-500" />
    </button>
    {open ? <div className={`absolute top-[calc(100%+0.5rem)] z-20 w-[min(18rem,calc(100vw-3rem))] rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_18px_50px_rgba(46,65,94,0.18)] ${align === "right" ? "right-0" : "left-0"}`} role="dialog" aria-label={`${ariaLabel}日历`}>
      <div className="flex items-center justify-between gap-3 pb-3">
        <button type="button" className="grid size-8 place-items-center rounded-lg text-slate-500 transition hover:bg-slate-100 active:scale-95" onClick={() => changeMonth(-1)} aria-label="上个月"><CaretLeftIcon size={16} weight="bold" /></button>
        <p className="text-sm font-semibold tabular-nums text-slate-800">{viewMonth.slice(0, 4)} 年 {Number(viewMonth.slice(5))} 月</p>
        <button type="button" className="grid size-8 place-items-center rounded-lg text-slate-500 transition hover:bg-slate-100 active:scale-95" onClick={() => changeMonth(1)} aria-label="下个月"><CaretRightIcon size={16} weight="bold" /></button>
      </div>
      <div className="grid grid-cols-7 text-center">
        {WEEKDAYS.map((day) => <span key={day} className="pb-2 text-[11px] font-semibold text-slate-400">{day}</span>)}
        {days.map((date) => {
          const disabled = Boolean((min && date < min) || (max && date > max));
          const selected = date === value;
          const currentMonth = date.slice(0, 7) === viewMonth;
          return <button key={date} type="button" disabled={disabled} aria-pressed={selected} className={`mx-auto grid size-9 place-items-center rounded-xl text-xs font-medium tabular-nums transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 ${selected ? "bg-blue-600 font-semibold text-white shadow-[0_4px_12px_rgba(52,120,246,0.24)]" : date === today ? "bg-blue-50 font-semibold text-blue-700 hover:bg-blue-100" : currentMonth ? "text-slate-700 hover:bg-slate-100" : "text-slate-300 hover:bg-slate-50"} disabled:cursor-not-allowed disabled:opacity-25`} onClick={() => { onChange(date); setOpen(false); }}>{Number(date.slice(8))}</button>;
        })}
      </div>
      {(!min || today >= min) && (!max || today <= max) ? <div className="mt-2 flex justify-end border-t border-slate-100 pt-2"><button type="button" className="rounded-lg px-2 py-1 text-xs font-semibold text-blue-600 transition hover:bg-blue-50" onClick={() => { onChange(today); setOpen(false); }}>今天</button></div> : null}
    </div> : null}
  </div>;
}
