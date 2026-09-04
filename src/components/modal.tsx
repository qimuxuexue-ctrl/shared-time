"use client";

import { XIcon } from "@phosphor-icons/react";
import { useEffect, type ReactNode } from "react";

export function Modal({
  title,
  children,
  onClose,
  size = "default",
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  size?: "default" | "wide";
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/20 p-3 backdrop-blur-sm sm:items-center"
      role="presentation"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <section
        className={`max-h-[calc(100dvh-1.5rem)] w-full overflow-y-auto rounded-[22px] border border-slate-200/80 bg-white p-5 shadow-[0_24px_80px_rgba(62,78,102,0.18)] sm:p-6 ${
          size === "wide" ? "max-w-2xl" : "max-w-md"
        }`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        <div className="mb-6 flex items-center justify-between gap-4">
          <h2 id="modal-title" className="text-xl font-semibold tracking-tight text-slate-950">
            {title}
          </h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label="关闭">
            <XIcon size={18} weight="bold" />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
