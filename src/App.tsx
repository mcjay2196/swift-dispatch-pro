import React from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/components/auth/AuthProvider";
import { AuthPage } from "@/components/auth/AuthPage";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Index from "./pages/Index";
import DriverPortal from "./pages/DriverPortal";
import CustomerPortal from "./pages/CustomerPortal";
import PortalLogin from "./pages/PortalLogin";
import Knowledgebase from "./pages/Knowledgebase";
import SwiftDispatchGuide from "./pages/SwiftDispatchGuide";
import PaymentSuccess from "./pages/PaymentSuccess";
import PaymentCancelled from "./pages/PaymentCancelled";
import NotFound from "./pages/NotFound";
import Storefront from "./pages/Storefront";
import MyProfile from "./pages/MyProfile";
import Reports from "./pages/Reports";

import { useUserRole } from "./hooks/useUserRole";
import { DashboardOverview } from "@/components/DashboardOverview";
import { OpportunityPipeline } from "@/components/OpportunityPipeline";
import { OrderManagement } from "@/components/OrderManagement";
import { ProductManagement } from "@/components/ProductManagement";
import { CustomerManagement } from "@/components/CustomerManagement";
import { PaymentManagement } from "@/components/PaymentManagement";
import { EmailManagement } from "@/components/EmailManagement";
import { TruckManagement } from "@/components/TruckManagement";
import { TeamManagement } from "@/components/TeamManagement";
import { SuburbManagement } from "@/components/SuburbManagement";
import { Settings } from "@/components/Settings";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false, // Don't refetch when tab regains focus
      refetchOnMount: false, // Don't refetch when component remounts
      staleTime: 1000 * 60 * 5, // Data stays fresh for 5 minutes
      gcTime: 1000 * 60 * 10, // Keep unused data in cache for 10 minutes
      retry: 1, // Only retry failed requests once
    },
  },
});

function AuthenticatedApp() {
  const { user, session, loading: authLoading } = useAuth();
  const { role, loading: roleLoading } = useUserRole();

  // Only show loading on initial check, not on token refresh
  const isInitializing = authLoading && !session;
  
  if (isInitializing || (roleLoading && user && !role)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <AuthPage />;
  }

  // Route based on user role with strict protection
  return (
    <Routes>
      <Route 
        path="/" 
        element={
          <ProtectedRoute allowedRoles={['admin', 'super_admin']}>
            <Index />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<DashboardOverview />} />
        <Route path="opportunities" element={<OpportunityPipeline />} />
        <Route path="orders" element={<OrderManagement />} />
        <Route path="reports/product-sales" element={<Reports />} />
        <Route path="products" element={<ProductManagement />} />
        <Route path="customers" element={<CustomerManagement />} />
        <Route path="payments" element={<PaymentManagement />} />
        <Route path="fleet" element={<TruckManagement />} />
        <Route 
          path="team" 
          element={
            <ProtectedRoute allowedRoles={['super_admin']}>
              <TeamManagement />
            </ProtectedRoute>
          } 
        />
        <Route path="suburbs" element={<SuburbManagement />} />
        <Route path="emails" element={<EmailManagement />} />
        <Route path="settings" element={<Settings />} />
        <Route path="guide" element={<SwiftDispatchGuide />} />
      </Route>
      <Route 
        path="/driver" 
        element={
          <ProtectedRoute allowedRoles={['driver']}>
            <DriverPortal />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/customer-portal" 
        element={
          <ProtectedRoute allowedRoles={['account_customer']}>
            <CustomerPortal />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/my-profile" 
        element={
          <ProtectedRoute allowedRoles={['super_admin', 'admin', 'driver', 'customer', 'account_customer']}>
            <MyProfile />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/knowledgebase" 
        element={<Knowledgebase />} 
      />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

function AppRoutes() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public routes - no authentication required */}
        <Route path="/portal-login" element={<PortalLogin />} />
        <Route path="/storefront" element={<Storefront />} />
        <Route path="/payment-success" element={<PaymentSuccess />} />
        <Route path="/payment-cancelled" element={<PaymentCancelled />} />

        
        {/* All other routes require authentication */}
        <Route path="/*" element={<AuthenticatedApp />} />
      </Routes>
    </BrowserRouter>
  );
}

const App = () => {
  // Unregister service worker to prevent reload loops (immediate fix)
  React.useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then(regs => {
        regs.forEach(reg => reg.unregister());
      });
    }
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <AppRoutes />
          <Toaster />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
};

export default App;
