"use client";

import { useCallback, useEffect, useState } from "react";

type ActiveMember = { id: string; tagName: string; tagColor: string };

export function EventPresence({
  code,
  identityId,
}: {
  code: string;
  identityId: string;
}) {
  const [members, setMembers] = useState<ActiveMember[]>([]);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch(`/api/events/${code}/presence`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ identityId }),
      });
      if (!response.ok) return;
      const payload = (await response.json()) as { members?: ActiveMember[] };
      setMembers(payload.members ?? []);
    } catch {
      // Presence is supplemental and should never interrupt the workspace.
    }
  }, [code, identityId]);

  useEffect(() => {
    queueMicrotask(() => void refresh());
    const timer = window.setInterval(() => void refresh(), 15_000);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [refresh]);

  if (members.length < 2) return null;

  return (
    <div className="flex min-w-0 items-center gap-2 rounded-full bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 sm:px-3" role="status">
      <span className="relative flex size-2">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-40" />
        <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
      </span>
      <span className="hidden truncate sm:inline">实时协作 · {members.length} 人正在查看</span>
      <span className="whitespace-nowrap sm:hidden">{members.length} 人在线</span>
    </div>
  );
}
