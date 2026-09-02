"use client";

import {
  ArrowRightIcon,
  CalendarBlankIcon,
  ClockIcon,
  HashIcon,
  PlusIcon,
  QuestionMarkIcon,
  SignOutIcon,
  TicketIcon,
  TrashIcon,
  UsersThreeIcon,
} from "@phosphor-icons/react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent } from "react";

import { Modal } from "@/components/modal";
import { DeleteEventModal } from "@/components/delete-event-modal";
import { UsageGuide } from "@/components/usage-guide";
import {
  clearStoredIdentity,
  readStoredIdentity,
  storeIdentity,
} from "@/lib/browser-identity";
import type { EventSummary, EventType, Identity } from "@/lib/types";

type IdentityResponse = {
  identity: Identity;
  isNew: boolean;
  events: EventSummary[];
};

async function readJson<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(payload.error ?? "请求失败，请稍后重试");
  }
  return payload;
}

export function HomeApp() {
  const router = useRouter();
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [events, setEvents] = useState<EventSummary[]>([]);
  const [status, setStatus] = useState<"checking" | "signed-out" | "ready">(
    "checking",
  );
  const [idInput, setIdInput] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [modal, setModal] = useState<"create" | "join" | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<EventSummary | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);

  const signIn = useCallback(async (displayId: string) => {
    setError("");
    setSubmitting(true);

    try {
      const response = await fetch("/api/identity", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: displayId }),
      });
      const payload = await readJson<IdentityResponse>(response);
      storeIdentity(payload.identity);
      setIdentity(payload.identity);
      setEvents(payload.events);
      setStatus("ready");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "无法识别这个 ID");
      setStatus("signed-out");
    } finally {
      setSubmitting(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      const stored = readStoredIdentity();
      if (!stored) {
        setStatus("signed-out");
        return;
      }

      setIdInput(stored.displayId);
      void signIn(stored.displayId);
    });

    return () => {
      active = false;
    };
  }, [signIn]);

  const signOut = () => {
    clearStoredIdentity();
    setIdentity(null);
    setEvents([]);
    setIdInput("");
    setError("");
    setStatus("signed-out");
  };

  if (status === "checking") {
    return (
      <main className="grid min-h-[100dvh] place-items-center bg-[var(--page)] px-5">
        <div className="w-full max-w-sm space-y-4" aria-label="正在恢复身份">
          <div className="h-8 w-40 animate-pulse rounded-xl bg-slate-200" />
          <div className="h-44 animate-pulse rounded-[22px] bg-white" />
        </div>
      </main>
    );
  }

  if (status === "signed-out" || !identity) {
    return (
      <main className="relative grid min-h-[100dvh] place-items-center bg-[var(--page)] px-5 py-12">
        <GuideButton
          className="absolute right-5 top-5 sm:right-7 sm:top-7"
          onClick={() => setGuideOpen(true)}
        />
        <section className="w-full max-w-[430px]">
          <div className="mb-8">
            <Image
              src="/brand-character.png"
              alt="Share timeline 角色图标"
              width={80}
              height={80}
              priority
              className="mb-4 size-20 object-contain"
            />
            <h1 className="text-4xl font-semibold tracking-[-0.04em] text-slate-950">
              Share timeline
            </h1>
            <p className="mt-3 max-w-sm text-base leading-7 text-slate-500">
              输入一个只属于你的 ID/昵称*。下次回来，仍然可以通过输入ID/昵称找到原来的事件和 Tag。
            </p>
          </div>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              void signIn(idInput);
            }}
            className="rounded-[22px] border border-slate-200/80 bg-white p-5 shadow-[0_18px_60px_rgba(67,83,108,0.08)] sm:p-6"
          >
            <label htmlFor="identity-id" className="field-label">
              你的 ID/昵称
            </label>
            <input
              id="identity-id"
              className="text-input"
              value={idInput}
              onChange={(event) => setIdInput(event.target.value)}
              placeholder="例如 小王2026"
              autoComplete="username"
              autoFocus
              maxLength={24}
            />
            <p className="mt-2 text-sm leading-5 text-slate-500">
              可使用中文、英文、数字、下划线和连字符。
            </p>
            {error ? <p className="form-error">{error}</p> : null}
            <button
              type="submit"
              className="primary-button mt-5 w-full"
              disabled={submitting || idInput.trim().length < 2}
            >
              {submitting ? "正在查找" : "继续"}
              {!submitting ? <ArrowRightIcon size={18} weight="bold" /> : null}
            </button>
          </form>
        </section>
        {guideOpen ? <UsageGuide onClose={() => setGuideOpen(false)} /> : null}
      </main>
    );
  }

  return (
    <main className="min-h-[100dvh] bg-[var(--page)]">
      <header className="border-b border-slate-200/80 bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex h-[72px] max-w-6xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <Image
              src="/brand-character.png"
              alt=""
              width={40}
              height={40}
              className="size-10 object-contain"
            />
            <span className="text-base font-semibold tracking-tight text-slate-950">
              Share timeline
            </span>
          </div>
          <div className="flex items-center gap-2">
            <GuideButton onClick={() => setGuideOpen(true)} />
            <div className="hidden rounded-full bg-slate-100 px-3 py-2 text-sm font-medium text-slate-600 sm:block">
              {identity.displayId}
            </div>
            <button type="button" className="icon-button" onClick={signOut} aria-label="切换 ID">
              <SignOutIcon size={18} weight="bold" />
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
        <div className="mb-8 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-500">
              <ClockIcon size={16} weight="bold" />
              北京时间 UTC+8
            </p>
            <h1 className="text-3xl font-semibold tracking-[-0.035em] text-slate-950 sm:text-4xl">
              你的事件
            </h1>
          </div>
          <div className="flex gap-2">
            <button type="button" className="secondary-button" onClick={() => setModal("join")}>
              <TicketIcon size={18} weight="bold" />
              输入邀请码
            </button>
            <button type="button" className="primary-button" onClick={() => setModal("create")}>
              <PlusIcon size={18} weight="bold" />
              创建事件
            </button>
          </div>
        </div>

        {events.length === 0 ? (
          <section className="rounded-[22px] border border-dashed border-slate-300 bg-white/70 px-6 py-14 text-center">
            <div className="mx-auto mb-4 grid size-12 place-items-center rounded-2xl bg-slate-100 text-slate-500">
              <CalendarBlankIcon size={23} weight="duotone" />
            </div>
            <h2 className="text-lg font-semibold text-slate-900">还没有事件</h2>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-500">
              创建一个新的时间表，或输入朋友发来的六位邀请码。
            </p>
          </section>
        ) : (
          <section className="grid gap-4 md:grid-cols-2">
            {events.map((event) => (
              <article
                key={event.id}
                className="group relative rounded-[22px] border border-slate-200/80 bg-white shadow-[0_14px_42px_rgba(67,83,108,0.06)] transition duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-[0_18px_48px_rgba(67,83,108,0.1)]"
              >
                <button
                  type="button"
                  onClick={() => router.push(`/e/${event.shareCode}`)}
                  className="w-full rounded-[22px] p-5 text-left active:bg-slate-50/70"
                >
                  <div className={`mb-6 ${event.isCreator ? "pr-20" : "pr-9"}`}>
                    <div className="min-w-0">
                      <h2 className="truncate text-xl font-semibold tracking-tight text-slate-950">
                        {event.name}
                      </h2>
                      <p className="mt-2 flex items-center gap-1.5 text-sm text-slate-500">
                        <HashIcon size={14} weight="bold" />
                        {event.shareCode}
                      </p>
                    </div>
                  </div>
                  <div className="flex min-h-7 items-end justify-between gap-3">
                    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                      {event.participants.slice(0, 3).map((participant) => (
                        <span
                          key={participant.id}
                          className="max-w-28 truncate rounded-lg px-2.5 py-1.5 text-sm font-semibold"
                          style={{
                            color: participant.tagColor,
                            backgroundColor: `${participant.tagColor}14`,
                          }}
                        >
                          {participant.tagName}
                        </span>
                      ))}
                      {event.participantCount > 3 ? (
                        <span className="px-1 text-sm font-semibold text-slate-400">…</span>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1 text-sm text-slate-400">
                      <span className="flex items-center gap-1">
                        <UsersThreeIcon size={15} weight="bold" />
                        {event.participantCount} 人参加
                      </span>
                      <span>{event.eventType === "one_time" ? "一次性" : "常驻"}</span>
                    </div>
                  </div>
                  <ArrowRightIcon
                    size={20}
                    weight="bold"
                    className="pointer-events-none absolute right-4 top-[1.35rem] text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-[var(--accent)]"
                  />
                </button>
                {event.isCreator ? (
                  <button
                    type="button"
                    className="absolute right-11 top-3.5 z-10 grid size-9 place-items-center rounded-xl text-slate-400 transition hover:bg-red-50 hover:text-red-600 active:scale-95"
                    onClick={() => setDeleteTarget(event)}
                    aria-label={`删除事件 ${event.name}`}
                    title="删除事件"
                  >
                    <TrashIcon size={18} weight="bold" />
                  </button>
                ) : null}
              </article>
            ))}
          </section>
        )}
      </div>

      {modal === "create" ? (
        <CreateEventModal
          identity={identity}
          onClose={() => setModal(null)}
          onCreated={(created) => {
            setEvents((current) => [created, ...current]);
            setModal(null);
            router.push(`/e/${created.shareCode}`);
          }}
        />
      ) : null}

      {modal === "join" ? (
        <JoinEventModal
          identity={identity}
          onClose={() => setModal(null)}
          onJoined={(joined) => {
            setEvents((current) => [joined, ...current.filter((item) => item.id !== joined.id)]);
            setModal(null);
            router.push(`/e/${joined.shareCode}`);
          }}
        />
      ) : null}

      {deleteTarget ? (
        <DeleteEventModal
          identity={identity}
          event={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onDeleted={() => {
            setEvents((current) =>
              current.filter((event) => event.id !== deleteTarget.id),
            );
            setDeleteTarget(null);
          }}
        />
      ) : null}

      {guideOpen ? <UsageGuide onClose={() => setGuideOpen(false)} /> : null}
    </main>
  );
}

function GuideButton({
  onClick,
  className = "",
}: {
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={`z-10 grid size-11 place-items-center rounded-full border border-slate-200/80 bg-white text-slate-400 shadow-[0_10px_30px_rgba(67,83,108,0.08)] transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-600 active:scale-95 ${className}`}
      onClick={onClick}
      aria-label="打开使用指南"
      title="使用指南"
    >
      <QuestionMarkIcon size={19} weight="bold" />
    </button>
  );
}

function CreateEventModal({ identity, onClose, onCreated }: { identity: Identity; onClose: () => void; onCreated: (event: EventSummary) => void }) {
  const [name, setName] = useState("");
  const [tagName, setTagName] = useState(identity.displayId);
  const [eventType, setEventType] = useState<EventType>("one_time");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async (formEvent: FormEvent<HTMLFormElement>) => {
    formEvent.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/events", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ identityId: identity.id, name, tagName, eventType }),
      });
      const payload = await readJson<{ event: EventSummary }>(response);
      onCreated(payload.event);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "创建事件失败");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal title="创建事件" onClose={onClose}>
      <form onSubmit={submit} className="space-y-5">
        <div>
          <label htmlFor="event-name" className="field-label">事件名称</label>
          <input id="event-name" className="text-input" value={name} onChange={(event) => setName(event.target.value)} placeholder="例如 日英课" autoFocus maxLength={80} />
        </div>
        <div>
          <label htmlFor="create-tag" className="field-label">你的 Tag</label>
          <input id="create-tag" className="text-input" value={tagName} onChange={(event) => setTagName(event.target.value)} maxLength={24} />
        </div>
        <div>
          <label htmlFor="event-type" className="field-label">事件类型</label>
          <select id="event-type" className="text-input" value={eventType} onChange={(event) => setEventType(event.target.value as EventType)}>
            <option value="one_time">一次性事件 · 仅本周</option>
            <option value="ongoing">常驻事件 · 可持续预约</option>
          </select>
          <p className="mt-2 text-xs leading-5 text-slate-500">
            一次性事件在本周结束后自动清理；常驻事件可以一直向后预约。
          </p>
        </div>
        {error ? <p className="form-error">{error}</p> : null}
        <button type="submit" className="primary-button w-full" disabled={submitting || !name.trim() || !tagName.trim()}>
          {submitting ? "正在创建" : "创建事件"}
        </button>
      </form>
    </Modal>
  );
}

function JoinEventModal({ identity, onClose, onJoined }: { identity: Identity; onClose: () => void; onJoined: (event: EventSummary) => void }) {
  const [shareCode, setShareCode] = useState("");
  const [tagName, setTagName] = useState(identity.displayId);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async (formEvent: FormEvent<HTMLFormElement>) => {
    formEvent.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/events/join", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ identityId: identity.id, shareCode, tagName }),
      });
      const payload = await readJson<{ event: EventSummary }>(response);
      onJoined(payload.event);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "加入事件失败");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal title="加入事件" onClose={onClose}>
      <form onSubmit={submit} className="space-y-5">
        <div>
          <label htmlFor="share-code" className="field-label">六位邀请码</label>
          <input id="share-code" className="text-input font-mono uppercase tracking-[0.18em]" value={shareCode} onChange={(event) => setShareCode(event.target.value.toUpperCase())} placeholder="K7M4QF" autoFocus maxLength={6} />
        </div>
        <div>
          <label htmlFor="join-tag" className="field-label">这个事件里的 Tag</label>
          <input id="join-tag" className="text-input" value={tagName} onChange={(event) => setTagName(event.target.value)} maxLength={24} />
        </div>
        {error ? <p className="form-error">{error}</p> : null}
        <button type="submit" className="primary-button w-full" disabled={submitting || shareCode.length !== 6 || !tagName.trim()}>
          {submitting ? "正在加入" : "加入事件"}
        </button>
      </form>
    </Modal>
  );
}
