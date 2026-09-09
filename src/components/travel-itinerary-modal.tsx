"use client";

import { MagnifyingGlassIcon, MapPinIcon, TrashIcon } from "@phosphor-icons/react";
import { useState, type FormEvent } from "react";

import { Modal } from "@/components/modal";
import type { TravelItineraryItem } from "@/lib/types";

type PlaceResult = {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
};

export function TravelItineraryModal({
  code,
  identityId,
  startDate,
  endDate,
  seed,
  onClose,
  onSaved,
  onDeleted,
}: {
  code: string;
  identityId: string;
  startDate: string;
  endDate: string;
  seed: TravelItineraryItem | { date: string; startHour: number };
  onClose: () => void;
  onSaved: (item: TravelItineraryItem) => void;
  onDeleted: (itemId: string) => void;
}) {
  const existing = "id" in seed ? seed : null;
  const [date, setDate] = useState(seed.date);
  const [startHour, setStartHour] = useState(seed.startHour);
  const [endHour, setEndHour] = useState(existing?.endHour ?? seed.startHour + 1);
  const [query, setQuery] = useState(existing?.placeName ?? "");
  const [place, setPlace] = useState<PlaceResult | null>(existing ? {
    id: existing.id,
    name: existing.placeName,
    address: existing.address,
    latitude: existing.latitude,
    longitude: existing.longitude,
  } : null);
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  const search = async () => {
    if (query.trim().length < 2) return;
    setSearching(true);
    setError("");
    try {
      const response = await fetch(`/api/places/search?q=${encodeURIComponent(query.trim())}`);
      const payload = (await response.json()) as { places?: PlaceResult[]; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "地点搜索失败");
      setResults(payload.places ?? []);
      if (!payload.places?.length) setError("没有找到这个地点，请尝试更完整的名称");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "地点搜索失败");
    } finally {
      setSearching(false);
    }
  };

  const save = async (formEvent: FormEvent<HTMLFormElement>) => {
    formEvent.preventDefault();
    if (!place) {
      setError("请先搜索并选择一个地点");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/events/${code}/itinerary`, {
        method: existing ? "PUT" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          identityId,
          itemId: existing?.id,
          date,
          startHour,
          endHour,
          placeName: place.name,
          address: place.address,
          latitude: place.latitude,
          longitude: place.longitude,
        }),
      });
      const payload = (await response.json()) as { item?: TravelItineraryItem; error?: string };
      if (!response.ok || !payload.item) throw new Error(payload.error ?? "保存行程失败");
      onSaved(payload.item);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "保存行程失败");
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!existing) return;
    setDeleting(true);
    setError("");
    try {
      const response = await fetch(`/api/events/${code}/itinerary`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ identityId, itemId: existing.id }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "删除行程失败");
      onDeleted(existing.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "删除行程失败");
      setDeleting(false);
    }
  };

  return (
    <Modal title={existing ? "编辑行程" : "添加行程"} onClose={saving || deleting ? () => undefined : onClose}>
      <form className="space-y-5" onSubmit={save}>
        <div className="grid grid-cols-[1fr_0.8fr_0.8fr] gap-3">
          <div>
            <label htmlFor="trip-date" className="field-label">日期</label>
            <input id="trip-date" type="date" className="text-input" min={startDate} max={endDate} value={date} onChange={(event) => setDate(event.target.value)} />
          </div>
          <div>
            <label htmlFor="trip-start" className="field-label">开始</label>
            <select id="trip-start" className="text-input" value={startHour} onChange={(event) => {
              const next = Number(event.target.value);
              setStartHour(next);
              if (endHour <= next) setEndHour(next + 1);
            }}>
              {Array.from({ length: 14 }, (_, index) => index + 10).map((hour) => <option key={hour} value={hour}>{String(hour).padStart(2, "0")}:00</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="trip-end" className="field-label">结束</label>
            <select id="trip-end" className="text-input" value={endHour} onChange={(event) => setEndHour(Number(event.target.value))}>
              {Array.from({ length: 24 - startHour }, (_, index) => startHour + index + 1).map((hour) => <option key={hour} value={hour}>{String(hour).padStart(2, "0")}:00</option>)}
            </select>
          </div>
        </div>

        <div>
          <label htmlFor="place-query" className="field-label">地点</label>
          <div className="flex gap-2">
            <input id="place-query" className="text-input" value={query} onChange={(event) => {
              setQuery(event.target.value);
              setResults([]);
              setError("");
              if (event.target.value !== place?.name) setPlace(null);
            }} placeholder="例如 浅草寺" autoFocus={!existing} maxLength={120} />
            <button type="button" className="secondary-button shrink-0 px-4" disabled={searching || query.trim().length < 2} onClick={() => void search()}>
              <MagnifyingGlassIcon size={18} weight="bold" />{searching ? "搜索中" : "搜索"}
            </button>
          </div>
          <p className="mt-2 text-xs text-slate-400">
            优先显示中文名称，也支持英文搜索；地点数据由
            <a className="ml-1 underline decoration-slate-300 underline-offset-2 hover:text-slate-600" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>
            提供。
          </p>
        </div>

        {results.length > 0 ? (
          <div className="max-h-52 space-y-2 overflow-y-auto rounded-xl bg-slate-50 p-2">
            {results.map((result) => (
              <button key={result.id} type="button" className={`flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition ${place?.id === result.id ? "bg-blue-50 text-blue-700" : "bg-white text-slate-700 hover:bg-slate-100"}`} onClick={() => { setPlace(result); setQuery(result.name); }}>
                <MapPinIcon className="mt-0.5 shrink-0" size={17} weight={place?.id === result.id ? "fill" : "bold"} />
                <span className="min-w-0"><span className="block truncate text-sm font-semibold">{result.name}</span><span className="mt-0.5 block line-clamp-2 text-xs leading-5 text-slate-500">{result.address}</span></span>
              </button>
            ))}
          </div>
        ) : null}

        {place ? (
          <div className="rounded-xl border border-blue-100 bg-blue-50/70 px-3 py-2.5 text-sm text-slate-700">
            <span className="font-semibold">已选择：{place.name}</span>
            <span className="mt-0.5 block truncate text-xs text-slate-500">{place.address}</span>
          </div>
        ) : null}
        {error ? <p className="form-error">{error}</p> : null}

        <div className={`grid gap-3 ${existing ? "grid-cols-[auto_1fr]" : "grid-cols-1"}`}>
          {existing ? <button type="button" className="secondary-button justify-center text-red-600 hover:border-red-200 hover:bg-red-50" disabled={saving || deleting} onClick={() => void remove()}><TrashIcon size={17} weight="bold" />{deleting ? "正在删除" : "删除"}</button> : null}
          <button type="submit" className="primary-button w-full" disabled={saving || deleting || !place}>{saving ? "正在保存" : existing ? "保存修改" : "加入行程"}</button>
        </div>
      </form>
    </Modal>
  );
}
