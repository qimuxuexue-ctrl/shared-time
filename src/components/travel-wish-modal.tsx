"use client";

import { TrashIcon } from "@phosphor-icons/react";
import { useState, type FormEvent } from "react";

import { Modal } from "@/components/modal";
import type { TravelWish } from "@/lib/types";

export function TravelWishModal({
  code,
  identityId,
  wish,
  onClose,
  onSaved,
  onDeleted,
}: {
  code: string;
  identityId: string;
  wish?: TravelWish;
  onClose: () => void;
  onSaved: (wish: TravelWish) => void;
  onDeleted: (id: string) => void;
}) {
  const [content, setContent] = useState(wish?.content ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/events/${code}/wishes`, {
        method: wish ? "PUT" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ identityId, wishId: wish?.id, content }),
      });
      const payload = await response.json() as { wish?: TravelWish; error?: string };
      if (!response.ok || !payload.wish) throw new Error(payload.error ?? "暂时没能保存这个愿望");
      onSaved(payload.wish);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "暂时没能保存这个愿望");
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!wish) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/events/${code}/wishes`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ identityId, wishId: wish.id }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "暂时没能删除这个愿望");
      onDeleted(wish.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "暂时没能删除这个愿望");
      setSaving(false);
    }
  };

  return <Modal title={wish ? "编辑愿望" : "贴一张愿望便签"} onClose={saving ? () => undefined : onClose}>
    <form onSubmit={submit}>
      <label htmlFor="travel-wish-content" className="field-label">想在这次旅行中实现什么？</label>
      <textarea
        id="travel-wish-content"
        className="text-input min-h-36 resize-y py-3 leading-6"
        value={content}
        onChange={(event) => setContent(event.target.value)}
        maxLength={280}
        placeholder="例如 想在海边看一次日落，或者一起去当地市场逛逛"
        autoFocus
      />
      <div className="mt-2 flex items-start justify-between gap-3 text-xs leading-5 text-slate-400">
        <span>先记下心愿，地点和时间都可以以后再决定。</span>
        <span className="shrink-0 tabular-nums">{content.length}/280</span>
      </div>
      {error ? <p className="form-error mt-4">{error}</p> : null}
      <div className={`mt-6 grid gap-3 ${wish ? "grid-cols-[auto_1fr]" : "grid-cols-1"}`}>
        {wish ? <button type="button" className="secondary-button justify-center text-red-600 hover:border-red-200 hover:bg-red-50" disabled={saving} onClick={() => void remove()}><TrashIcon size={17} weight="bold" />删除</button> : null}
        <button type="submit" className="primary-button w-full" disabled={saving || !content.trim()}>{saving ? "正在贴上" : wish ? "保存愿望" : "贴上愿望"}</button>
      </div>
    </form>
  </Modal>;
}
