"use client";

import { TrashIcon } from "@phosphor-icons/react";
import { useState, type FormEvent } from "react";

import { Modal } from "@/components/modal";
import type { TravelStay } from "@/lib/types";

export function TravelStayModal({ code, identityId, startDate, endDate, stay, onClose, onSaved, onDeleted }: {
  code: string;
  identityId: string;
  startDate: string;
  endDate: string;
  stay?: TravelStay;
  onClose: () => void;
  onSaved: (stay: TravelStay) => void;
  onDeleted: (id: string) => void;
}) {
  const [name, setName] = useState(stay?.name ?? "");
  const [checkInDate, setCheckInDate] = useState(stay?.checkInDate ?? startDate);
  const [checkOutDate, setCheckOutDate] = useState(stay?.checkOutDate ?? endDate);
  const [address, setAddress] = useState(stay?.address ?? "");
  const [hotelUrl, setHotelUrl] = useState(stay?.hotelUrl ?? "");
  const [note, setNote] = useState(stay?.note ?? "");
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
        body: JSON.stringify({ kind: "stay", identityId, id: stay?.id, name, checkInDate, checkOutDate, address, hotelUrl, note }),
      });
      const payload = await response.json() as { stay?: TravelStay; error?: string };
      if (!response.ok || !payload.stay) throw new Error(payload.error ?? "保存住宿失败");
      onSaved(payload.stay);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "保存住宿失败");
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!stay) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/events/${code}/travel-details`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "stay", identityId, id: stay.id }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "删除住宿失败");
      onDeleted(stay.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "删除住宿失败");
      setSaving(false);
    }
  };

  return <Modal title={stay ? "编辑住宿" : "添加住宿"} onClose={saving ? () => undefined : onClose}>
    <form className="space-y-5" onSubmit={submit}>
      <div>
        <label htmlFor="stay-name" className="field-label">酒店或住宿名称</label>
        <input id="stay-name" className="text-input" value={name} onChange={(event) => setName(event.target.value)} maxLength={100} placeholder="例如 浅草格拉斯丽酒店" autoFocus />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="stay-check-in" className="field-label">入住日期</label>
          <input id="stay-check-in" type="date" className="text-input" min={startDate} max={endDate} value={checkInDate} onChange={(event) => { setCheckInDate(event.target.value); if (checkOutDate < event.target.value) setCheckOutDate(event.target.value); }} />
        </div>
        <div>
          <label htmlFor="stay-check-out" className="field-label">退房日期</label>
          <input id="stay-check-out" type="date" className="text-input" min={checkInDate} max={endDate} value={checkOutDate} onChange={(event) => setCheckOutDate(event.target.value)} />
        </div>
      </div>
      <div>
        <label htmlFor="stay-address" className="field-label">地址 <span className="font-normal text-slate-400">（选填）</span></label>
        <input id="stay-address" className="text-input" value={address} onChange={(event) => setAddress(event.target.value)} maxLength={240} placeholder="街道、车站或区域" />
      </div>
      <div>
        <label htmlFor="stay-url" className="field-label">酒店页面链接 <span className="font-normal text-slate-400">（选填）</span></label>
        <input id="stay-url" type="url" inputMode="url" className="text-input" value={hotelUrl} onChange={(event) => setHotelUrl(event.target.value)} maxLength={1000} placeholder="https://…" />
        <p className="mt-1.5 text-xs leading-5 text-slate-400">可粘贴官网或预订页面，保存后点击住宿标题即可打开。</p>
      </div>
      <div>
        <label htmlFor="stay-note" className="field-label">住宿备注 <span className="font-normal text-slate-400">（选填）</span></label>
        <textarea id="stay-note" className="text-input min-h-20 resize-y py-3 leading-6" value={note} onChange={(event) => setNote(event.target.value)} maxLength={300} placeholder="例如 15:00 后入住，订单在雪雪名下" />
        <p className="mt-1.5 text-right text-xs tabular-nums text-slate-400">{note.length}/300</p>
      </div>
      {error ? <p className="form-error">{error}</p> : null}
      <div className={`grid gap-3 ${stay ? "grid-cols-[auto_1fr]" : "grid-cols-1"}`}>
        {stay ? <button type="button" className="secondary-button justify-center text-red-600 hover:border-red-200 hover:bg-red-50" disabled={saving} onClick={() => void remove()}><TrashIcon size={17} weight="bold" />删除</button> : null}
        <button type="submit" className="primary-button w-full" disabled={saving || !name.trim() || !checkInDate || !checkOutDate}>{saving ? "正在保存" : "保存住宿"}</button>
      </div>
    </form>
  </Modal>;
}
