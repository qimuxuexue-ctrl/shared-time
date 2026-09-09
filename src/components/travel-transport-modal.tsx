"use client";

import { TrashIcon } from "@phosphor-icons/react";
import { useState, type FormEvent } from "react";

import { Modal } from "@/components/modal";
import type { TravelItineraryItem } from "@/lib/types";

const TRANSPORT_OPTIONS = ["步行", "地铁 / 电车", "公交", "出租车", "驾车", "骑行", "飞机", "其他"];

type TransportUpdate = Pick<
  TravelItineraryItem,
  "transportMode" | "transportDurationMinutes" | "transportNote"
>;

export function TravelTransportModal({
  code,
  identityId,
  item,
  nextItem,
  onClose,
  onSaved,
}: {
  code: string;
  identityId: string;
  item: TravelItineraryItem;
  nextItem?: TravelItineraryItem;
  onClose: () => void;
  onSaved: (update: TransportUpdate) => void;
}) {
  const [mode, setMode] = useState(item.transportMode ?? "");
  const [duration, setDuration] = useState(item.transportDurationMinutes?.toString() ?? "");
  const [note, setNote] = useState(item.transportNote ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const hasTransport = Boolean(item.transportMode);

  const persist = async (update: TransportUpdate) => {
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/events/${code}/itinerary`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ identityId, itemId: item.id, ...update }),
      });
      const payload = (await response.json()) as TransportUpdate & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "保存交通信息失败");
      onSaved({
        transportMode: payload.transportMode,
        transportDurationMinutes: payload.transportDurationMinutes,
        transportNote: payload.transportNote,
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "保存交通信息失败");
      setSaving(false);
    }
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!mode) return;
    void persist({
      transportMode: mode,
      transportDurationMinutes: duration ? Number(duration) : null,
      transportNote: note.trim() || null,
    });
  };

  return (
    <Modal title={hasTransport ? "编辑交通方式" : "添加交通方式"} onClose={saving ? () => undefined : onClose}>
      <form className="space-y-5" onSubmit={submit}>
        <p className="rounded-xl bg-slate-50 px-3 py-2.5 text-sm leading-6 text-slate-600">
          {nextItem
            ? <>从 <strong className="font-semibold text-slate-800">{item.title}</strong> 前往 <strong className="font-semibold text-slate-800">{nextItem.title}</strong></>
            : <>记录离开 <strong className="font-semibold text-slate-800">{item.title}</strong> 后的交通安排</>}
        </p>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_0.72fr]">
          <div>
            <label htmlFor="transport-mode" className="field-label">交通方式</label>
            <select id="transport-mode" className="text-input" value={mode} onChange={(event) => setMode(event.target.value)} autoFocus>
              <option value="">请选择</option>
              {TRANSPORT_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="transport-duration" className="field-label">预计用时 <span className="font-normal text-slate-400">（分钟）</span></label>
            <input id="transport-duration" className="text-input tabular-nums" type="number" inputMode="numeric" min={1} max={1440} value={duration} onChange={(event) => setDuration(event.target.value)} placeholder="例如 25" />
          </div>
        </div>

        <div>
          <label htmlFor="transport-note" className="field-label">补充说明 <span className="font-normal text-slate-400">（选填）</span></label>
          <textarea id="transport-note" className="text-input min-h-20 resize-y py-3 leading-6" value={note} onChange={(event) => setNote(event.target.value)} maxLength={160} placeholder="例如 从 2 号口进站，乘银座线" />
          <p className="mt-1.5 text-right text-xs tabular-nums text-slate-400">{note.length}/160</p>
        </div>

        {error ? <p className="form-error">{error}</p> : null}

        <div className={`grid gap-3 ${hasTransport ? "grid-cols-[auto_1fr]" : "grid-cols-1"}`}>
          {hasTransport ? (
            <button type="button" className="secondary-button justify-center text-red-600 hover:border-red-200 hover:bg-red-50" disabled={saving} onClick={() => void persist({ transportMode: null, transportDurationMinutes: null, transportNote: null })}>
              <TrashIcon size={17} weight="bold" />移除
            </button>
          ) : null}
          <button type="submit" className="primary-button w-full" disabled={saving || !mode}>{saving ? "正在保存" : "保存交通信息"}</button>
        </div>
      </form>
    </Modal>
  );
}
