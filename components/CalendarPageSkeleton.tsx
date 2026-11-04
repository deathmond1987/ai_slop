import type { CalendarView } from "@/lib/display-mode";
import { CalendarFeedSkeleton } from "./CalendarFeedSkeleton";

function SkeletonBlock({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-zinc-200 dark:bg-zinc-800 ${className}`} />;
}

export function CalendarPageSkeleton({ view }: { view: CalendarView }) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between flex-wrap gap-2 text-xs" aria-hidden="true">
        <SkeletonBlock className="h-5 w-24" />
        <div className="flex items-center gap-1 flex-wrap">
          <SkeletonBlock className="h-6 w-16" />
          <SkeletonBlock className="h-6 w-24" />
        </div>
      </div>
      <CalendarFeedSkeleton view={view} />
    </section>
  );
}
