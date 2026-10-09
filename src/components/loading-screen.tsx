import Image from "next/image";
import Link from "next/link";

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

export function LoadingRecoveryScreen({
  onRetry,
  secondaryLabel,
  onSecondary,
  secondaryHref,
}: {
  onRetry: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
  secondaryHref?: string;
}) {
  return (
    <main className="grid min-h-[100dvh] place-items-center bg-[var(--page)] px-5 py-10">
      <section className="w-full max-w-[420px] text-center">
        <div className="mx-auto grid size-28 place-items-center rounded-full border border-blue-100/80 bg-white shadow-[0_18px_55px_rgba(67,83,108,0.10)]">
          <Image
            src="/icon.png"
            alt="Share timeline 小老虎"
            width={78}
            height={78}
            priority
            className="size-[78px] object-contain"
          />
        </div>
        <div className="mt-6 rounded-[22px] border border-blue-100/80 bg-white px-6 py-7 shadow-[0_18px_60px_rgba(67,83,108,0.07)] sm:px-8">
          <p className="text-xs font-semibold tracking-[0.12em] text-blue-500">稍等一下</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">小老虎还在找路</h1>
          <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-slate-500">
            这次连接比平时慢了一点，你的内容都还在。我们可以再轻轻试一次。
          </p>
          <button type="button" className="primary-button mt-6 w-full" onClick={onRetry}>
            再试一次
          </button>
          {secondaryLabel && secondaryHref ? (
            <Link href={secondaryHref} className="mt-4 inline-flex text-sm font-medium text-slate-400 transition hover:text-slate-700 focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300">
              {secondaryLabel}
            </Link>
          ) : secondaryLabel && onSecondary ? (
            <button type="button" className="mt-4 text-sm font-medium text-slate-400 transition hover:text-slate-700 focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300" onClick={onSecondary}>
              {secondaryLabel}
            </button>
          ) : null}
        </div>
      </section>
    </main>
  );
}
