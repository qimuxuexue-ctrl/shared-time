import Image from "next/image";

export function LoadingScreen() {
  return (
    <main
      className="grid min-h-[100dvh] place-items-center bg-[var(--page)] px-5"
      role="status"
      aria-live="polite"
      aria-label="页面加载中"
    >
      <div className="flex flex-col items-center">
        <div className="grid size-28 place-items-center rounded-full border border-slate-200/70 bg-white shadow-[0_16px_45px_rgba(67,83,108,0.09)]">
          <Image
            src="/icon.png"
            alt=""
            width={78}
            height={78}
            priority
            className="loading-tiger size-[78px] object-contain"
          />
        </div>
        <p className="mt-5 text-sm font-medium tracking-[0.12em] text-slate-400">
          loading...
        </p>
      </div>
    </main>
  );
}
