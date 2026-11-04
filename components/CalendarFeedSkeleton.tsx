import type { CalendarView } from "@/lib/display-mode";

function SkeletonBlock({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-zinc-200 dark:bg-zinc-800 ${className}`} />;
}

export function CalendarFeedSkeleton({ view }: { view: CalendarView }) {
  return (
    <div className="flex flex-col gap-2" aria-hidden="true">
      <SkeletonBlock className="h-12 w-full" />
      <div className="calendar-feed-with-tbd min-w-0">
        <div className="min-w-0 flex flex-col gap-2">
          {view === "grid" ? (
            <div className="grid grid-cols-[2rem_minmax(0,1fr)_2rem] items-center gap-1">
              <SkeletonBlock className="h-8 w-8 rounded-full" />
              <div className="calendar-grid-shell">
                <div className="calendar-grid-min">
                  <SkeletonBlock className="mb-1 h-3 w-24" />
                  <div className="grid grid-cols-7 gap-px overflow-hidden rounded border border-zinc-200 bg-zinc-200 text-scale-10 dark:border-zinc-800 dark:bg-zinc-800">
                    {Array.from({ length: 7 }, (_, index) => (
                      <div
                        key={`weekday-${index}`}
                        className="bg-zinc-100 py-1 dark:bg-zinc-900"
                      >
                        <SkeletonBlock className="mx-auto h-3 w-8" />
                      </div>
                    ))}
                    {Array.from({ length: 42 }, (_, index) => (
                      <div
                        key={`cell-${index}`}
                        className="flex min-h-[3.5rem] flex-col gap-1 bg-white p-1 dark:bg-zinc-950"
                      >
                        <SkeletonBlock className="h-2 w-3" />
                        <SkeletonBlock className="h-6 w-full" />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <SkeletonBlock className="h-8 w-8 rounded-full" />
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {Array.from({ length: 3 }, (_, monthIndex) => (
                <section key={`month-${monthIndex}`} className="flex flex-col gap-2">
                  <SkeletonBlock className="h-4 w-28" />
                  <div className="flex flex-col gap-2">
                    {Array.from({ length: 2 }, (_, dateIndex) => (
                      <div key={`date-${monthIndex}-${dateIndex}`} className="flex flex-col gap-1">
                        {Array.from({ length: 2 }, (_, cardIndex) => (
                          <SkeletonBlock
                            key={`row-${monthIndex}-${dateIndex}-${cardIndex}`}
                            className="h-16 w-full"
                          />
                        ))}
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>

        <aside className="min-w-0 flex flex-col gap-1">
          <SkeletonBlock className="h-3 w-16" />
          <div className="compact-grid tbd-grid">
            {Array.from({ length: 4 }, (_, index) => (
              <SkeletonBlock
                key={`tbd-${index}`}
                className="compact-skeleton-card h-full w-full"
              />
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}
