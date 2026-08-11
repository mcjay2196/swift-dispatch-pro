/**
 * Lightweight tab memory watchdog.
 *
 * Chrome kills a tab with "Aw, Snap! Out of Memory" when the renderer runs out
 * of heap. This samples the heap periodically, warns once per threshold
 * crossing, and — critically — relieves pressure before the tab dies by
 * dropping cached data nothing is currently rendering.
 */

import { pruneInactiveQueries } from "@/lib/queryClient";

const SAMPLE_INTERVAL_MS = 15_000;
const WARN_RATIO = 0.7;
const CRITICAL_RATIO = 0.85;
const RELOAD_RATIO = 0.93;
const RELOAD_FLAG = "__mem_reload_at";
const RELOAD_COOLDOWN_MS = 5 * 60_000;

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

// Reload at most once per cooldown window so we can never loop-reload a tab.
function reloadOnce() {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_FLAG) || 0);
    if (Date.now() - last < RELOAD_COOLDOWN_MS) return;
    sessionStorage.setItem(RELOAD_FLAG, String(Date.now()));
  } catch {
    /* private mode — still reload */
  }
  window.location.reload();
}

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

    if (ratio >= RELOAD_RATIO) {
      // Last resort: the tab is about to be killed by the browser. A clean
      // reload is far better UX than "Aw, Snap!".
      pruneInactiveQueries();
      reloadOnce();
      return;
    }

    if (ratio >= CRITICAL_RATIO) {
      const dropped = pruneInactiveQueries();
      if (!criticalWarned) {
        criticalWarned = true;
        console.error(
          `[memory] Heap critical: ${mb(mem.usedJSHeapSize)}MB of ${mb(
            mem.jsHeapSizeLimit
          )}MB (${Math.round(ratio * 100)}%) on ${
            window.location.pathname
          }. Dropped ${dropped} cached queries.`
        );
      }
    } else if (ratio >= WARN_RATIO) {
      const dropped = pruneInactiveQueries();
      if (!warned) {
        warned = true;
        console.warn(
          `[memory] Heap high: ${mb(mem.usedJSHeapSize)}MB of ${mb(
            mem.jsHeapSizeLimit
          )}MB (${Math.round(ratio * 100)}%) on ${
            window.location.pathname
          }. Dropped ${dropped} cached queries.`
        );
      }
    } else {
      warned = false;
      criticalWarned = false;
    }
  };

  const id = window.setInterval(tick, SAMPLE_INTERVAL_MS);
  return () => window.clearInterval(id);
}
