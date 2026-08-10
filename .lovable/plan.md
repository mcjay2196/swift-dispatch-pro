# Fix "Aw, Snap! Out of Memory" on the Orders screen

## What the screenshot actually shows

That is Chrome killing the whole tab because the page's memory ran out — not an app error we can catch. It happens on machines that keep the Orders tab open all day (yours works because you open it fresh, do the order, and the tab is young). So the goal is to cut the page's memory growth, not to "fix create order" as such.

## What I verified in the code and database

- The database has 9,390 active orders; the Orders list pulls 50 at a time with a "Load More" button.
- Every order card runs its **own** database query for returns (`order-returns`, one per card) and mounts its own Return dialog. 50 cards = 50 queries; after a few "Load More" clicks that's hundreds of live queries and cached results that are never released, because pages accumulate and nothing is virtualised.
- The Orders screen subscribes to **every** change on the orders table. Each change invalidates the orders query, which makes React Query re-fetch **all loaded pages**, and pops a toast. In a busy shop with several staff, this fires constantly.
- The product picker in the create-order dialog tears down and re-creates its realtime subscription every time the search text or category changes.
- There are ~225 console log statements still active in production; each one retains the objects it logged for the life of the tab.

I could not reproduce the crash end-to-end because this project uses an external Supabase and no test session can be minted, so the fixes below target the confirmed growth sources plus a small telemetry hook to prove it on a staff machine.

## The fix

1. **Remove the per-card returns query.** Fetch return counts for the whole loaded page in a single query and pass the flag down to the cards. Only mount the Return dialog when it is actually opened.
2. **Cap what the list keeps in memory.** Keep at most a few pages of orders live at once (older pages dropped, re-fetchable) so "Load More" can't grow without bound, and only render cards near the viewport.
3. **Calm the realtime feed.** Debounce/coalesce the invalidations so a burst of order changes causes one refresh instead of one per event, refresh only the first page rather than every loaded page, and stop toasting on every single order event from other users.
4. **Fix the product-picker subscription churn** in the create-order dialog: subscribe once on mount, and use a ref for the reload callback so typing a search doesn't re-subscribe.
5. **Silence production logging.** Route the noisy `console.log`/`debug` calls through the existing debug logger and disable it outside development; keep `console.error`.
6. **Add a small memory telemetry check** (uses Chrome's `performance.memory`) that logs a warning when the tab's heap crosses a threshold, so we can confirm on the affected machine which screen is responsible.

## Technical notes

- Batch returns via a single `order_returns` query filtered by `order_id in (...)` for the loaded page, exposed through the Order Management context.
- Use React Query's `maxPages` on the orders infinite query, and windowed rendering for the grouped list output of `groupOrdersBySplit`.
- Realtime invalidation in `OrderManagementProvider` gets a trailing debounce (~1.5s) and switches to `refetchType: 'first'`-style targeted refresh.
- No database, pricing, totals, split-order or order-creation logic changes.

## Interim advice for staff

Reloading the Orders tab once or twice a day (or closing and reopening it) will avoid the crash until this ships.
