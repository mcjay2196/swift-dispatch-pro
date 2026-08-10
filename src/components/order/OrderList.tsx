import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { LazyMount } from "@/components/ui/lazy-mount";
import {
  OrderReturnsSummaryProvider,
  useOrderReturnsSummaryQuery,
} from "@/hooks/useOrderReturnsSummary";
import { OrderCard } from "./OrderCard";
import { SplitOrderGroupCard } from "./SplitOrderGroupCard";
import { groupOrdersBySplit } from "./utils/groupOrdersBySplit";
import { Database } from "@/integrations/supabase/types";

type OrderStatus = Database["public"]["Enums"]["order_status"];

interface Order {
  id: string;
  order_number: string;
  purchase_order?: string;
  customer_name: string;
  customer_phone?: string;
  customer_address: string;
  delivery_address?: string;
  products: any;
  products_formatted?: string;
  total_amount: number;
  status: OrderStatus;
  payment_status?: string;
  payment_date?: string;
  driver_id?: string;
  created_at: string;
  delivery_date?: string;
  delivery_time?: string;
  special_instructions?: string;
  customer_id?: string;
  suburb_id?: string;
  delivery_suburb_id?: string;
  delivery_fee?: number;
  subtotal?: number;
  order_notes?: string;
  delivery_notes?: string;
  driver_name?: string;
  truck_registration?: string;
  truck_type_display?: string;
  suburb_name?: string;
  suburb_state?: string;
  suburb_postcode?: string;
  delivery_suburb_name?: string;
  delivery_suburb_state?: string;
  delivery_suburb_postcode?: string;
  master_order_id?: string | null;
  is_split_order?: boolean | null;
}

interface OrderListProps {
  orders: Order[];
  isLoading: boolean;
  hasActiveFilters: boolean;
  onClearFilters: () => void;
  onEdit: (order: Order) => void;
  onDelete: (order: Order) => void;
  onStatusUpdate: (orderId: string, newStatus: OrderStatus, currentOrder: Order) => void;
  onNotesEdit: (order: Order) => void;
  onPaymentStatusUpdate?: () => void;
  fetchNextPage?: () => void;
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
}

export function OrderList({ 
  orders, 
  isLoading, 
  hasActiveFilters, 
  onClearFilters,
  onEdit,
  onDelete,
  onStatusUpdate,
  onNotesEdit,
  onPaymentStatusUpdate,
  fetchNextPage,
  hasNextPage,
  isFetchingNextPage
}: OrderListProps) {
  if (isLoading) {
    return (
      <div className="text-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
        <p className="mt-2 text-slate-600">Loading orders...</p>
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="text-center py-8 text-slate-500">
        {hasActiveFilters ? (
          <div>
            <p>No orders match your current filters.</p>
            <Button variant="outline" onClick={onClearFilters} className="mt-2">
              Clear Filters
            </Button>
          </div>
        ) : (
          <p>No orders found. Create your first order to get started!</p>
        )}
      </div>
    );
  }

  const groupedItems = groupOrdersBySplit(orders);

  return (
    <OrdersListBody
      orders={orders}
      groupedItems={groupedItems}
      onEdit={onEdit}
      onDelete={onDelete}
      onStatusUpdate={onStatusUpdate}
      onNotesEdit={onNotesEdit}
      onPaymentStatusUpdate={onPaymentStatusUpdate}
      fetchNextPage={fetchNextPage}
      hasNextPage={hasNextPage}
      isFetchingNextPage={isFetchingNextPage}
    />
  );
}

function OrdersListBody({
  orders,
  groupedItems,
  onEdit,
  onDelete,
  onStatusUpdate,
  onNotesEdit,
  onPaymentStatusUpdate,
  fetchNextPage,
  hasNextPage,
  isFetchingNextPage,
}: OrderListProps & { groupedItems: ReturnType<typeof groupOrdersBySplit<any>> }) {
  // ONE query for all returns on the loaded page instead of one per card
  const orderIds = useMemo(() => orders.map((o) => o.id), [orders]);
  const returnsSummary = useOrderReturnsSummaryQuery(orderIds);

  return (
    <OrderReturnsSummaryProvider value={returnsSummary}>
    <div className="space-y-4">
      {groupedItems.map((item) => {
        if (item.kind === 'group') {
          return (
            <LazyMount key={`group-${item.master.id}`} placeholderHeight={180}>
            <SplitOrderGroupCard
              key={`group-${item.master.id}`}
              master={item.master as any}
              splits={item.splits as any}
              onEdit={onEdit}
              onDelete={onDelete}
              onStatusUpdate={onStatusUpdate}
              onNotesEdit={onNotesEdit}
              onPaymentStatusUpdate={onPaymentStatusUpdate}
            />
            </LazyMount>
          );
        }
        return (
          <LazyMount key={item.order.id} placeholderHeight={240}>
          <OrderCard
            order={item.order}
            onEdit={onEdit}
            onDelete={onDelete}
            onStatusUpdate={onStatusUpdate}
            onNotesEdit={onNotesEdit}
            onPaymentStatusUpdate={onPaymentStatusUpdate}
          />
          </LazyMount>
        );
      })}
      {hasNextPage && (
        <div className="flex justify-center pt-4">
          <Button
            variant="outline"
            onClick={() => fetchNextPage?.()}
            disabled={isFetchingNextPage}
            className="min-w-[200px]"
          >
            {isFetchingNextPage ? (
              <span className="flex items-center gap-2">
                <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-current"></span>
                Loading more...
              </span>
            ) : (
              "Load More Orders"
            )}
          </Button>
        </div>
      )}
    </div>
    </OrderReturnsSummaryProvider>
  );
}
