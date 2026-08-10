import { createContext, useContext, useMemo, ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ReturnSummary {
  hasReturns: boolean;
  latestReturnStatus?: string;
  totalItemsReturned: number;
}

const EMPTY_SUMMARY: ReturnSummary = { hasReturns: false, totalItemsReturned: 0 };

type SummaryMap = Record<string, ReturnSummary>;

const OrderReturnsSummaryContext = createContext<SummaryMap>({});

/**
 * Fetches return summaries for a batch of orders in ONE query.
 * Replaces the previous per-card query, which mounted a separate
 * React Query entry for every rendered order card.
 */
export function useOrderReturnsSummaryQuery(orderIds: string[]): SummaryMap {
  // Stable key so re-renders with the same ids don't refetch
  const idsKey = useMemo(() => [...orderIds].sort().join(","), [orderIds]);

  const { data } = useQuery({
    queryKey: ["order-returns-summary", idsKey],
    enabled: idsKey.length > 0,
    staleTime: 1000 * 60 * 5,
    queryFn: async (): Promise<SummaryMap> => {
      const ids = idsKey.split(",").filter(Boolean);
      if (ids.length === 0) return {};

      const { data, error } = await supabase
        .from("order_returns")
        .select("order_id, status, total_items_returned, created_at")
        .in("order_id", ids)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error fetching order returns summary:", error);
        return {};
      }

      const map: SummaryMap = {};
      for (const row of data || []) {
        const existing = map[row.order_id];
        if (existing) {
          existing.totalItemsReturned += row.total_items_returned || 0;
        } else {
          map[row.order_id] = {
            hasReturns: true,
            // rows are newest-first, so the first one seen is the latest
            latestReturnStatus: row.status,
            totalItemsReturned: row.total_items_returned || 0,
          };
        }
      }
      return map;
    },
  });

  return data || {};
}

export function OrderReturnsSummaryProvider({
  value,
  children,
}: {
  value: SummaryMap;
  children: ReactNode;
}) {
  return (
    <OrderReturnsSummaryContext.Provider value={value}>
      {children}
    </OrderReturnsSummaryContext.Provider>
  );
}

export function useReturnSummary(orderId: string): ReturnSummary {
  const map = useContext(OrderReturnsSummaryContext);
  return map[orderId] || EMPTY_SUMMARY;
}
