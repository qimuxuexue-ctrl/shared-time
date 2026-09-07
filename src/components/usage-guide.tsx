"use client";

import {
  CalendarPlusIcon,
  CheckCircleIcon,
  ClockIcon,
  CursorClickIcon,
  NotePencilIcon,
  ShareNetworkIcon,
  UserCircleIcon,
  XIcon,
} from "@phosphor-icons/react";
import Image from "next/image";
import { useEffect, useRef, type ReactNode } from "react";

const steps: Array<{
  number: string;
  title: string;
  description: ReactNode;
  image?: string;
  visual?: "recommendations" | "final-plan";
  imageAlt: string;
  icon: ReactNode;
}> = [
  {
    number: "01",
    title: "先记住自己的 ID/昵称",
    description: (
      <>
        第一次进入时填写一个只属于你的 ID/昵称。浏览器会自动记住它；换设备或清除缓存后，重新输入同一个 ID/昵称，就能找回原来的事件和 Tag。
      </>
    ),
    image: "/guide/01-identity.png",
    imageAlt: "Share timeline 输入 ID 或昵称的页面",
    icon: <UserCircleIcon size={19} weight="duotone" />,
  },
  {
    number: "02",
    title: "创建事件，或输入邀请码加入",
    description: (
      <>
        创建时可以选择“仅本周的一次性事件”或“可一直预约的常驻事件”。加入时输入六位邀请码并设置 Tag；之后也可以自由退出事件。
      </>
    ),
    image: "/guide/02-events.png",
    imageAlt: "Share timeline 事件首页，显示创建和加入事件按钮",
    icon: <CalendarPlusIcon size={19} weight="duotone" />,
  },
  {
    number: "03",
    title: "标记自己的空闲时间",
    description: (
      <>
        点击时间格添加或移除自己的 Tag，点击星期标题可以快速选择整段时间。
      </>
    ),
    image: "/guide/03-workspace.png",
    imageAlt: "Share timeline 一周时间表，格子中显示不同参与者的 Tag",
    icon: <CursorClickIcon size={19} weight="duotone" />,
  },
  {
    number: "04",
    title: "添加事件备注",
    description: (
      <>
        在备注区补充课程要求、会议号或其他说明。每位参与者都能看到，也只能修改或删除自己的备注。
      </>
    ),
    image: "/guide/03-workspace.png",
    imageAlt: "Share timeline 事件内的共享备注区域",
    icon: <NotePencilIcon size={19} weight="duotone" />,
  },
  {
    number: "05",
    title: "选择推荐共同时间",
    description: (
      <>
        系统会按空闲人数推荐时间。创建者可以设置安排次数和每次时长，也可以使用“自选或调整”选择其他时间。
      </>
    ),
    visual: "recommendations",
    imageAlt: "Share timeline 推荐共同时间与多次安排选择区域",
    icon: <ClockIcon size={19} weight="duotone" />,
  },
  {
    number: "06",
    title: "确认并分享全部安排",
    description: (
      <>
        选好各次时间后统一确认。确认结果可以连同补充说明生成一张图片，直接分享或保存。
      </>
    ),
    visual: "final-plan",
    imageAlt: "Share timeline 已确定时间方案与分享按钮",
    icon: <ShareNetworkIcon size={19} weight="duotone" />,
  },
];

export function UsageGuide({ onClose }: { onClose: () => void }) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/25 p-0 backdrop-blur-sm sm:items-center sm:p-5"
      role="presentation"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <section
        className="flex max-h-[94dvh] w-full max-w-5xl flex-col overflow-hidden rounded-t-[28px] border border-slate-200/80 bg-white shadow-[0_30px_100px_rgba(48,61,82,0.24)] sm:max-h-[90dvh] sm:rounded-[28px]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="usage-guide-title"
      >
        <header className="flex shrink-0 items-start justify-between gap-6 border-b border-slate-200/80 px-5 py-5 sm:px-8 sm:py-6">
          <div>
            <p className="mb-2 text-xs font-semibold tracking-[0.16em] text-[var(--accent)] uppercase">
              Quick guide
            </p>
            <h2
              id="usage-guide-title"
              className="text-2xl font-semibold tracking-[-0.035em] text-slate-950 sm:text-3xl"
            >
              Share timeline 使用指南
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              六步完成共同时间收集、确认与分享。
            </p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            className="icon-button shrink-0"
            onClick={onClose}
            aria-label="关闭使用指南"
          >
            <XIcon size={18} weight="bold" />
          </button>
        </header>

        <div className="overflow-y-auto px-5 py-6 sm:px-8 sm:py-8">
          <div className="grid gap-6 lg:grid-cols-2">
            {steps.map((step) => (
              <article
                key={step.number}
                className="overflow-hidden rounded-[22px] border border-slate-200/80 bg-white"
              >
                <div className="relative aspect-video overflow-hidden border-b border-slate-200/80 bg-[var(--page)]">
                  {step.visual ? (
                    <GuideVisual variant={step.visual} label={step.imageAlt} />
                  ) : step.image ? (
                    <Image
                      src={step.image}
                      alt={step.imageAlt}
                      fill
                      sizes="(max-width: 1024px) 100vw, 50vw"
                      loading={step.number === "01" ? "eager" : "lazy"}
                      className="object-cover"
                    />
                  ) : null}
                </div>
                <div className="p-5 sm:p-6">
                  <div className="mb-4 flex items-center justify-between">
                    <span className="grid size-9 place-items-center rounded-xl bg-blue-50 text-[var(--accent)]">
                      {step.icon}
                    </span>
                    <span className="font-mono text-xs font-semibold tracking-[0.14em] text-slate-300">
                      {step.number}
                    </span>
                  </div>
                  <h3 className="text-lg font-semibold tracking-tight text-slate-950">
                    {step.title}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-slate-500">
                    {step.description}
                  </p>
                </div>
              </article>
            ))}
          </div>

          <section className="mt-6 grid gap-4 rounded-[22px] bg-slate-50 p-5 sm:grid-cols-3 sm:p-6">
            <GuideTip
              icon={<ClockIcon size={18} weight="duotone" />}
              title="事件时区"
              body="创建时可选择北京时间或东京时间，创建者之后仍可修改。"
            />
            <GuideTip
              icon={<ShareNetworkIcon size={18} weight="duotone" />}
              title="邀请朋友"
              body="复制分享链接或六位邀请码发给参与者。"
            />
            <GuideTip
              icon={<CheckCircleIcon size={18} weight="duotone" />}
              title="确认与分享"
              body="创建者确认后，可生成包含多段时间和说明的结果图片。"
            />
          </section>
        </div>

        <footer className="shrink-0 border-t border-slate-200/80 bg-white px-5 py-4 sm:px-8">
          <button type="button" className="primary-button w-full sm:ml-auto sm:flex sm:w-auto sm:min-w-32" onClick={onClose}>
            知道了
          </button>
        </footer>
      </section>
    </div>
  );
}

function GuideVisual({
  variant,
  label,
}: {
  variant: "recommendations" | "final-plan";
  label: string;
}) {
  if (variant === "recommendations") {
    return (
      <div
        className="absolute inset-0 flex items-center p-5 sm:p-7"
        role="img"
        aria-label={label}
      >
        <div className="w-full rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
          <div className="flex items-center gap-2">
            <p className="text-xs font-semibold text-slate-800 sm:text-sm">
              推荐共同时间
            </p>
            <span className="rounded-lg bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-600">
              本周安排 2 次
            </span>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {["19:00–20:00", "20:00–21:00", "21:00–22:00"].map(
              (time, index) => (
                <div
                  key={time}
                  className={`rounded-xl border px-2 py-3 ${
                    index === 1
                      ? "border-blue-300 bg-blue-50"
                      : "border-slate-200 bg-slate-50"
                  }`}
                >
                  <p className="text-[9px] font-medium text-slate-500 sm:text-[10px]">
                    9月9日 周三
                  </p>
                  <p className="mt-1 truncate text-[10px] font-semibold tabular-nums text-slate-900 sm:text-xs">
                    {time}
                  </p>
                </div>
              ),
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="absolute inset-0 flex items-center p-5 sm:p-7"
      role="img"
      aria-label={label}
    >
      <div className="w-full rounded-2xl border border-blue-200 bg-[#eef5fc] p-4 shadow-sm">
        <p className="text-xs font-semibold text-blue-600">已确定时间方案</p>
        <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
          <p className="rounded-lg bg-white/80 px-2.5 py-2 text-[10px] font-semibold text-slate-700">
            9月9日 周三 · 19:00–20:00
          </p>
          <p className="rounded-lg bg-white/80 px-2.5 py-2 text-[10px] font-semibold text-slate-700">
            9月12日 周六 · 14:00–15:00
          </p>
        </div>
        <div className="mt-3 flex justify-end">
          <span className="rounded-lg bg-[var(--accent)] px-3 py-2 text-[10px] font-semibold text-white">
            分享全部安排
          </span>
        </div>
      </div>
    </div>
  );
}

function GuideTip({
  icon,
  title,
  body,
}: {
  icon: ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="flex gap-3">
      <span className="mt-0.5 text-slate-400">{icon}</span>
      <div>
        <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
        <p className="mt-1 text-xs leading-5 text-slate-500">{body}</p>
      </div>
    </div>
  );
}
