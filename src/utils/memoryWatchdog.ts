/**
 * Lightweight tab memory watchdog.
 *
 * Chrome kills a tab with "Aw, Snap! Out of Memory" when the renderer runs out
 * of heap. This samples the heap periodically and warns (once per threshold
 * crossing) so we can attribute growth to a specific screen.
 */

const SAMPLE_INTERVAL_MS = 60_000;
const WARN_RATIO = 0.7;
const CRITICAL_RATIO = 0.85;

type PerfMemory = {
  usedJSHeapSize: number;
  totalJSHeapSize: number;
  jsHeapSizeLimit: number;
};

function getMemory(): PerfMemory | null {
  const mem = (performance as any)?.memory;
  if (!mem || typeof mem.usedJSHeapSize !== "number") return null;
  return mem as PerfMemory;
}

const mb = (bytes: number) => Math.round(bytes / 1024 / 1024);

export function startMemoryWatchdog() {
  if (typeof window === "undefined") return () => {};
  if ((window as any).__memWatchdogStarted) return () => {};
  (window as any).__memWatchdogStarted = true;

  let warned = false;
  let criticalWarned = false;

  const tick = () => {
    const mem = getMemory();
    if (!mem) return;
    const ratio = mem.usedJSHeapSize / mem.jsHeapSizeLimit;

    if (ratio >= CRITICAL_RATIO && !criticalWarned) {
      criticalWarned = true;
      console.error(
        `[memory] Heap critical: ${mb(mem.usedJSHeapSize)}MB of ${mb(
          mem.jsHeapSizeLimit
        )}MB (${Math.round(ratio * 100)}%) on ${window.location.pathname}. Reload the tab.`
      );
    } else if (ratio >= WARN_RATIO && !warned) {
      warned = true;
      console.warn(
        `[memory] Heap high: ${mb(mem.usedJSHeapSize)}MB of ${mb(
          mem.jsHeapSizeLimit
        )}MB (${Math.round(ratio * 100)}%) on ${window.location.pathname}.`
      );
    } else if (ratio < WARN_RATIO) {
      warned = false;
      criticalWarned = false;
    }
  };

  const id = window.setInterval(tick, SAMPLE_INTERVAL_MS);
  return () => window.clearInterval(id);
}
