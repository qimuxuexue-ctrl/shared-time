"use client";

import { TrashIcon } from "@phosphor-icons/react";
import { useState, type FormEvent } from "react";

import { Modal } from "@/components/modal";
import type { TravelJourney } from "@/lib/types";

const MODES = ["飞机", "新干线 / 火车", "长途巴士", "轮船", "自驾", "包车", "其他"];

export function TravelJourneyModal({ code, identityId, direction, startDate, endDate, journey, onClose, onSaved, onDeleted }: {
  code: string;
  identityId: string;
  direction: "outbound" | "return";
  startDate: string;
  endDate: string;
  journey?: TravelJourney;
  onClose: () => void;
  onSaved: (journey: TravelJourney) => void;
  onDeleted: (id: string) => void;
}) {
  const label = direction === "outbound" ? "去程" : "返程";
  const [mode, setMode] = useState(journey?.mode ?? "");
  const [date, setDate] = useState(journey?.date ?? (direction === "outbound" ? startDate : endDate));
  const [departureTime, setDepartureTime] = useState(journey?.departureTime ?? "");
  const [arrivalTime, setArrivalTime] = useState(journey?.arrivalTime ?? "");
  const [origin, setOrigin] = useState(journey?.origin ?? "");
  const [destination, setDestination] = useState(journey?.destination ?? "");
  const [reference, setReference] = useState(journey?.reference ?? "");
  const [note, setNote] = useState(journey?.note ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/events/${code}/travel-details`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "journey", identityId, direction, mode, date, departureTime, arrivalTime, origin, destination, reference, note }),
      });
      const payload = await response.json() as { journey?: TravelJourney; error?: string };
      if (!response.ok || !payload.journey) throw new Error(payload.error ?? `保存${label}失败`);
      onSaved(payload.journey);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : `保存${label}失败`);
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!journey) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/events/${code}/travel-details`, { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: "journey", identityId, id: journey.id }) });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? `删除${label}失败`);
      onDeleted(journey.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : `删除${label}失败`);
      setSaving(false);
    }
  };

  return <Modal title={`${journey ? "编辑" : "添加"}${label}交通`} onClose={saving ? () => undefined : onClose}>
    <form className="space-y-5" onSubmit={submit}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div><label htmlFor="journey-mode" className="field-label">交通方式</label><select id="journey-mode" className="text-input" value={mode} onChange={(event) => setMode(event.target.value)} autoFocus><option value="">请选择</option>{MODES.map((item) => <option key={item}>{item}</option>)}</select></div>
        <div><label htmlFor="journey-date" className="field-label">日期</label><input id="journey-date" type="date" className="text-input" value={date} onChange={(event) => setDate(event.target.value)} /></div>
      </div>
      <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
        <div><label htmlFor="journey-origin" className="field-label">出发地</label><input id="journey-origin" className="text-input" value={origin} onChange={(event) => setOrigin(event.target.value)} maxLength={100} placeholder="上海虹桥" /></div>
        <span className="pb-3 text-slate-300">→</span>
        <div><label htmlFor="journey-destination" className="field-label">目的地</label><input id="journey-destination" className="text-input" value={destination} onChange={(event) => setDestination(event.target.value)} maxLength={100} placeholder="东京羽田" /></div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div><label htmlFor="journey-departure" className="field-label">出发时间 <span className="font-normal text-slate-400">（选填）</span></label><input id="journey-departure" type="time" className="text-input" value={departureTime} onChange={(event) => setDepartureTime(event.target.value)} /></div>
        <div><label htmlFor="journey-arrival" className="field-label">到达时间 <span className="font-normal text-slate-400">（选填）</span></label><input id="journey-arrival" type="time" className="text-input" value={arrivalTime} onChange={(event) => setArrivalTime(event.target.value)} /></div>
      </div>
      <div><label htmlFor="journey-reference" className="field-label">班次或订单 <span className="font-normal text-slate-400">（选填）</span></label><input id="journey-reference" className="text-input" value={reference} onChange={(event) => setReference(event.target.value)} maxLength={80} placeholder="例如 NH920 / G6 / 车牌信息" /></div>
      <div><label htmlFor="journey-note" className="field-label">备注 <span className="font-normal text-slate-400">（选填）</span></label><textarea id="journey-note" className="text-input min-h-20 resize-y py-3 leading-6" value={note} onChange={(event) => setNote(event.target.value)} maxLength={240} placeholder="集合地点、行李限制或取票信息" /></div>
      {error ? <p className="form-error">{error}</p> : null}
      <div className={`grid gap-3 ${journey ? "grid-cols-[auto_1fr]" : "grid-cols-1"}`}>
        {journey ? <button type="button" className="secondary-button justify-center text-red-600 hover:border-red-200 hover:bg-red-50" disabled={saving} onClick={() => void remove()}><TrashIcon size={17} weight="bold" />删除</button> : null}
        <button type="submit" className="primary-button w-full" disabled={saving || !mode || !date || !origin.trim() || !destination.trim()}>{saving ? "正在保存" : `保存${label}`}</button>
      </div>
    </form>
  </Modal>;
}
