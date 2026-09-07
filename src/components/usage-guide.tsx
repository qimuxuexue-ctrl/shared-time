"use client";

import {
  CalendarPlusIcon,
  CheckCircleIcon,
  ClockIcon,
  CursorClickIcon,
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
  image: string;
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
        创建时可以选择“仅本周的一次性事件”或“可一直预约的常驻事件”。加入别人的事件时，输入对方分享的六位邀请码，再设置你在这个事件里的 Tag。
      </>
    ),
    image: "/guide/02-events.png",
    imageAlt: "Share timeline 事件首页，显示创建和加入事件按钮",
    icon: <CalendarPlusIcon size={19} weight="duotone" />,
  },
  {
    number: "03",
    title: "标记空闲时间，补充备注",
    description: (
      <>
        点击时间格添加或移除自己的 Tag，点击星期标题可快速选择整段时间。需要说明课程、会议号等信息时，可以在备注区补充。
      </>
    ),
    image: "/guide/03-workspace.png",
    imageAlt: "Share timeline 一周时间表，格子中显示不同参与者的 Tag",
    icon: <CursorClickIcon size={19} weight="duotone" />,
  },
  {
    number: "04",
    title: "选择共同时间并分享",
    description: (
      <>
        系统会按空闲人数推荐时间。创建者可以设置本周安排次数和每次时长，也可以自选时间；统一确认后，可将全部安排和补充说明生成图片分享。
      </>
    ),
    image: "/guide/03-workspace.png",
    imageAlt: "Share timeline 推荐共同时间、确认安排与分享功能",
    icon: <CheckCircleIcon size={19} weight="duotone" />,
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
              四步完成一次共同空闲时间预约。
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
                  <Image
                    src={step.image}
                    alt={step.imageAlt}
                    fill
                    sizes="(max-width: 1024px) 100vw, 50vw"
                    loading={step.number === "01" ? "eager" : "lazy"}
                    className="object-cover"
                  />
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
