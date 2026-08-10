
import { useState, useEffect, createContext, useContext, ReactNode } from "react";
import { useDebounce } from "@/hooks/useDebounce";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { emailService } from "@/utils/emailService";
import { useOrderData } from "./hooks/useOrderData";
import { useOrderActions } from "./hooks/useOrderActions";
import { Database } from "@/integrations/supabase/types";

type OrderStatus = Database["public"]["Enums"]["order_status"];

interface Order {
  id: string;
  order_number: string;
  purchase_order?: string;
  customer_name: string;
  customer_phone?: string;
  customer_address: string;
  products: any;
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
  delivery_fee?: number;
  subtotal?: number;
  order_notes?: string;
  delivery_notes?: string;
  driver_name?: string;
  truck_registration?: string;
  truck_type_display?: string;
  company_name?: string;
  business_name?: string;
  customer_type?: string;
}

interface OrderManagementContextType {
  // State
  isCreating: boolean;
  setIsCreating: (value: boolean) => void;
  editingOrder: Order | null;
  setEditingOrder: (order: Order | null) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  statusFilter: string;
  setStatusFilter: (filter: string) => void;
  paymentStatusFilter: string;
  setPaymentStatusFilter: (filter: string) => void;
  deletingOrder: Order | null;
  setDeletingOrder: (order: Order | null) => void;
  isDeleting: boolean;
  editingNotes: Order | null;
  setEditingNotes: (order: Order | null) => void;
  
  // Data
  orders: Order[];
  isLoading: boolean;
  error: any;
  filteredOrders: Order[];
  
  // Pagination
  fetchNextPage: () => void;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  
  // Actions
  updateOrderStatus: (orderId: string, newStatus: OrderStatus, currentOrder: Order) => void;
  handleDeleteOrder: (orderId: string, deleteType: 'single' | 'group') => Promise<void>;
  refetch: () => void;
  
  // Computed
  hasActiveFilters: boolean;
  clearFilters: () => void;
}

const OrderManagementContext = createContext<OrderManagementContextType | undefined>(undefined);

export function useOrderManagement() {
  const context = useContext(OrderManagementContext);
  if (!context) {
    throw new Error('useOrderManagement must be used within OrderManagementProvider');
  }
  return context;
}

interface OrderManagementProviderProps {
  children: ReactNode;
}

export function OrderManagementProvider({ children }: OrderManagementProviderProps) {
  const [isCreating, setIsCreating] = useState(false);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<string>("all");
  const [deletingOrder, setDeletingOrder] = useState<Order | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [editingNotes, setEditingNotes] = useState<Order | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Use custom hooks for data and actions - filters are applied server-side
  const debouncedSearch = useDebounce(searchQuery, 300);
  const { orders, isLoading, error, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } = useOrderData({
    searchQuery: debouncedSearch,
    statusFilter,
    paymentStatusFilter,
  });
  const { updateOrderStatus, handleDeleteOrder: handleDeleteOrderAction } = useOrderActions(refetch);
  const filteredOrders = orders;

  // Clear all filters
  const clearFilters = () => {
    setSearchQuery("");
    setStatusFilter("all");
    setPaymentStatusFilter("all");
  };

  // Check if any filters are active
  const hasActiveFilters = searchQuery.trim() !== "" || statusFilter !== "all" || paymentStatusFilter !== "all";

  // Enhanced delete handler that supports both single and group deletion
  const handleDeleteOrder = async (orderId: string, deleteType: 'single' | 'group') => {
    if (!deletingOrder || isDeleting) return;

    setIsDeleting(true);
    try {
      await handleDeleteOrderAction(orderId, deleteType, deletingOrder);
      setDeletingOrder(null);
    } finally {
      setIsDeleting(false);
    }
  };

  // Set up real-time subscription for order updates with email notifications.
  // Invalidations and toasts are coalesced: a burst of order changes from other
  // staff triggers ONE refresh and ONE toast instead of one per event.
  useEffect(() => {
    let invalidateTimer: number | undefined;
    let pendingStatusChanges = 0;
    let pendingInserts = 0;
    let lastOrderNumber = '';

    const flush = () => {
      invalidateTimer = undefined;

      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['customer-orders'] });
      queryClient.invalidateQueries({ queryKey: ['opportunity-orders'] });

      if (pendingInserts > 0) {
        toast({
          title: pendingInserts === 1 ? "New Order Created" : "New Orders Created",
          description: pendingInserts === 1
            ? `Order ${lastOrderNumber} has been created`
            : `${pendingInserts} new orders have been created`,
        });
      } else if (pendingStatusChanges > 0) {
        toast({
          title: "Orders Updated",
          description: pendingStatusChanges === 1
            ? `Order ${lastOrderNumber} changed status`
            : `${pendingStatusChanges} orders changed status`,
        });
      }

      pendingStatusChanges = 0;
      pendingInserts = 0;
      lastOrderNumber = '';
    };

    const scheduleFlush = () => {
      if (invalidateTimer !== undefined) return;
      invalidateTimer = window.setTimeout(flush, 1500);
    };

    const channel = supabase
      .channel('orders-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, async (payload) => {
        scheduleFlush();

        if (payload.eventType === 'UPDATE' && payload.new && payload.old) {
          // Detect soft delete (deleted_at changed from null to a value)
          if (payload.new.deleted_at && !payload.old.deleted_at) {
            try {
              const { data: sheetsSettings, error: sheetsErr } = await supabase
                .from('google_sheets_settings')
                .select('sync_enabled, spreadsheet_id')
                .limit(1)
                .maybeSingle();
              if (sheetsErr) console.error('Sheets settings error (delete):', sheetsErr);
              
              if (sheetsSettings?.sync_enabled && sheetsSettings?.spreadsheet_id) {
                supabase.functions.invoke('google-sheets-sync', {
                  body: { action: 'delete-single', order_number: payload.new.order_number },
                }).catch(err => console.error('Google Sheets delete-sync error:', err));
              }
            } catch (err) {
              console.error('Failed to sync deletion to Google Sheets:', err);
            }
          } else {
            const oldStatus = payload.old.status;
            const newStatus = payload.new.status;

            if (oldStatus !== newStatus) {
              pendingStatusChanges += 1;
              lastOrderNumber = payload.new.order_number;

              // Only send email notification when order status changes to loading
              if (newStatus === 'loading') {
                try {
                  const driverName = payload.new.driver_name;
                  await emailService.sendOrderStatusUpdate(payload.new.id, oldStatus, newStatus, driverName);
                } catch (error) {
                  console.error('Failed to send status update email:', error);
                }
              }
            }
          }
        }

        if (payload.eventType === 'INSERT' && payload.new) {
          pendingInserts += 1;
          lastOrderNumber = payload.new.order_number;
        }

        // Real-time auto-sync for INSERT/UPDATE is now handled by the order creation flow
        // using syncAllOrdersToSheets(). Keeping real-time only for delete sync above.
      })
      .subscribe();

    return () => {
      if (invalidateTimer !== undefined) window.clearTimeout(invalidateTimer);
      supabase.removeChannel(channel);
    };
  }, [queryClient, toast]);


  const contextValue: OrderManagementContextType = {
    // State
    isCreating,
    setIsCreating,
    editingOrder,
    setEditingOrder,
    searchQuery,
    setSearchQuery,
    statusFilter,
    setStatusFilter,
    paymentStatusFilter,
    setPaymentStatusFilter,
    deletingOrder,
    setDeletingOrder,
    isDeleting,
    editingNotes,
    setEditingNotes,
    
    // Data
    orders,
    isLoading,
    error,
    filteredOrders,
    
    // Pagination
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    
    // Actions
    updateOrderStatus,
    handleDeleteOrder,
    refetch,
    
    // Computed
    hasActiveFilters,
    clearFilters
  };

  return (
    <OrderManagementContext.Provider value={contextValue}>
      {children}
    </OrderManagementContext.Provider>
  );
}
