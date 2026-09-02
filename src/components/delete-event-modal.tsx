"use client";

import { WarningCircleIcon } from "@phosphor-icons/react";
import { useState } from "react";

import { Modal } from "@/components/modal";
import type { Identity } from "@/lib/types";

export function DeleteEventModal({
  identity,
  event,
  onClose,
  onDeleted,
}: {
  identity: Identity;
  event: { name: string; shareCode: string };
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  const deleteEvent = async () => {
    setDeleting(true);
    setError("");

    try {
      const response = await fetch(`/api/events/${event.shareCode}`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ identityId: identity.id }),
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "删除事件失败");
      }

      onDeleted();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "删除事件失败");
      setDeleting(false);
    }
  };

  return (
    <Modal title="删除事件？" onClose={deleting ? () => undefined : onClose}>
      <div className="mb-5 flex items-start gap-3 rounded-xl bg-red-50 p-3.5 text-red-800">
        <WarningCircleIcon className="mt-0.5 shrink-0" size={20} weight="fill" />
        <p className="text-sm leading-6">
          删除「{event.name}」后，所有参与者、Tag 和已选择的时间都会永久清空。
        </p>
      </div>
      {error ? <p className="form-error mb-4">{error}</p> : null}
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          className="secondary-button"
          onClick={onClose}
          disabled={deleting}
        >
          取消
        </button>
        <button
          type="button"
          className="danger-button"
          onClick={() => void deleteEvent()}
          disabled={deleting}
        >
          {deleting ? "正在删除" : "确认删除"}
        </button>
      </div>
    </Modal>
  );
}
