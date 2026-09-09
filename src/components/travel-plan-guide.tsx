"use client";

import {
  ClockIcon,
  MapPinIcon,
  PlusIcon,
  ShareNetworkIcon,
  UsersThreeIcon,
  XIcon,
} from "@phosphor-icons/react";
import { useEffect, useRef, type ReactNode } from "react";

const STEPS: Array<{
  number: string;
  title: string;
  body: string;
  icon: ReactNode;
}> = [
  {
    number: "01",
    title: "设置旅行日期",
    body: "创建时选择开始日期、结束日期和时区。创建者之后仍可修改，范围外的日历会自动锁定。",
    icon: <ClockIcon size={18} weight="duotone" />,
  },
  {
    number: "02",
    title: "在日历里添加行程",
    body: "点击日期和时间格，填写行程标题、备注与地点；点击已有行程可以继续修改。",
    icon: <PlusIcon size={18} weight="bold" />,
  },
  {
    number: "03",
    title: "搜索或导入地点",
    body: "可用中文、英文、完整地址或邮编搜索。小众地点搜不到时，粘贴 Google 地图分享链接读取定位。",
    icon: <MapPinIcon size={18} weight="duotone" />,
  },
  {
    number: "04",
    title: "补充交通方式",
    body: "点击左侧行程卡下方的“＋”，记录前往下一站的交通方式、预计用时和说明；这一项可以留空。",
    icon: <ShareNetworkIcon size={18} weight="duotone" />,
  },
  {
    number: "05",
    title: "一起编辑计划",
    body: "参与者可以共同添加和修改行程。顶部会显示当前正在查看计划的成员，分享链接即可邀请其他人。",
    icon: <UsersThreeIcon size={18} weight="duotone" />,
  },
];

export function TravelPlanGuide({ onClose }: { onClose: () => void }) {
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
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/25 backdrop-blur-sm sm:items-center sm:p-5" role="presentation" onMouseDown={(event) => {
      if (event.currentTarget === event.target) onClose();
    }}>
      <section className="flex max-h-[94dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-[28px] border border-slate-200/80 bg-white shadow-[0_30px_100px_rgba(48,61,82,0.24)] sm:max-h-[90dvh] sm:rounded-[28px]" role="dialog" aria-modal="true" aria-labelledby="travel-guide-title">
        <header className="flex items-start justify-between gap-5 border-b border-slate-200/80 px-5 py-5 sm:px-7 sm:py-6">
          <div>
            <p className="mb-2 text-xs font-semibold tracking-[0.16em] text-[var(--accent)] uppercase">Quick guide</p>
            <h2 id="travel-guide-title" className="text-2xl font-semibold tracking-[-0.035em] text-slate-950">Travel plan 使用指南</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">从日期到地点，用日历共同整理旅行安排。</p>
          </div>
          <button ref={closeButtonRef} type="button" className="icon-button shrink-0" onClick={onClose} aria-label="关闭使用指南"><XIcon size={18} weight="bold" /></button>
        </header>

        <div className="overflow-y-auto px-5 py-5 sm:px-7 sm:py-6">
          <ol className="divide-y divide-slate-100">
            {STEPS.map((step) => (
              <li key={step.number} className="grid grid-cols-[40px_minmax(0,1fr)_auto] items-start gap-3 py-4 first:pt-0 last:pb-0">
                <span className="grid size-10 place-items-center rounded-xl bg-blue-50 text-[var(--accent)]">{step.icon}</span>
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-slate-900">{step.title}</h3>
                  <p className="mt-1 text-sm leading-6 text-slate-500">{step.body}</p>
                </div>
                <span className="pt-1 font-mono text-[11px] font-semibold tracking-[0.12em] text-slate-300">{step.number}</span>
              </li>
            ))}
          </ol>
        </div>

        <footer className="border-t border-slate-200/80 px-5 py-4 sm:px-7">
          <button type="button" className="primary-button w-full sm:ml-auto sm:flex sm:w-auto sm:min-w-32" onClick={onClose}>知道了</button>
        </footer>
      </section>
    </div>
  );
}
