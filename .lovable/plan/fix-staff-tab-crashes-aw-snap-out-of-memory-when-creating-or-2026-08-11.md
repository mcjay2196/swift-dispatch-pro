# Fix: staff tab crashes ("Aw, Snap! Out of Memory") when creating orders

## What I confirmed so far

- Orders **are** still being written to the database (most recent one ~20 minutes ago, plus several yard-sale orders today), so this is not a server-side or permissions failure. Nothing in the data suggests a role/user-level cause.
- The live site at swiftdispatch.localservicepro.com.au **already serves** the previous memory fixes (batched returns query, lazy-mounted cards, 3-page cap, heap watchdog are all present in the deployed bundle). So the crash is happening despite those fixes, and the remaining cause has not been identified yet.
- Data volume is not the culprit: 9,426 active orders, but the order `products` payload averages 283 bytes (2.6 MB across the whole table), and product images are short URLs, not embedded data.

Because the earlier round of fixes was a set of educated guesses that did not resolve it, this plan starts with measurement instead of more guessing.

## Step 1 — Reproduce and measure (before changing anything)

Drive the running app in a headless browser with a real signed-in session and record actual heap usage:

1. Load `/orders`, idle for 2-3 minutes, sample heap every 5 seconds.
2. Open the Create Order dialog, walk the full flow (customer -> products -> delivery -> review), close it, and repeat 5-10 times, sampling heap between each cycle.
3. Scroll the list and press "Load More" several times, sampling heap.
4. Record network request counts per minute and count repeated identical requests.

This tells us which of the three phases grows without bound: idle page, dialog open/close cycles, or scrolling. A dialog that leaks per open/close is the most likely match for "crashes while creating an order", and it would explain why the list-focused fixes did not help.

## Step 2 — Fix what the measurement points at

Likely candidates, in the order I would check them against the trace:

- **Create Order dialog not unmounting** — if the multi-step form, its product catalogue (904 products), realtime subscriptions, or Google Maps/Places instances stay in memory after close, each order created leaks a full copy. Fix: fully unmount the dialog content on close and tear down subscriptions/listeners.
- **A render or effect loop** in the order form (address/suburb/fee recalculation feeding back into state) that grows an array or re-subscribes on every pass. An out-of-memory crash within a few minutes almost always means an unbounded loop rather than steady growth.
- **Realtime channel accumulation** — a new channel per dialog open or per page visit without `removeChannel` on cleanup.
- **React Query cache growth** — unbounded cached entries from per-keystroke search keys in the product/customer pickers (`gcTime` tuning plus stable query keys).

## Step 3 — Verify with the same measurement

Re-run the exact Step 1 script after the fix and confirm heap returns to a flat baseline across 10 dialog cycles, then publish so the affected staff get the build.

## Step 4 — Safety net

Add a lightweight guard so this degrades instead of killing the tab: when the heap watchdog crosses a high threshold, drop cached order pages back to the first page and warn the user to reload, rather than letting Chrome hard-crash mid-order.

## Technical notes

- Files most likely involved: `src/components/order/MultiStepOrderForm.tsx`, `src/components/order/ProductSelectionStep.tsx`, `src/components/order/OrderManagementDialogs.tsx`, `src/components/order/OrderManagementProvider.tsx`, `src/hooks/useDeliveryFeeCalculation.ts`, `src/hooks/useGoogleMaps.ts`, `src/utils/memoryWatchdog.ts`.
- Measurement uses Playwright with `performance.memory.usedJSHeapSize` sampling and a CDP heap snapshot comparison between the first and tenth dialog cycle to name the retained objects concretely.
- No database or pricing logic changes are part of this work.
