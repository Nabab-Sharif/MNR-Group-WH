import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import StockEntry from "./pages/StockEntry";
import IssueInspection from "./pages/IssueInspection";
import CartonHistory from "./pages/CartonHistory";
import ManagementDashboard from "./pages/ManagementDashboard";
import OfficePage from "./pages/OfficePage";
import BuyerPage from "./pages/BuyerPage";
import AdminPanel from "./pages/AdminPanel";
import SwipeBack from "./components/SwipeBack";
import { ConfirmHost } from "@/components/ui/confirm-dialog";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <ConfirmHost />
      <AuthProvider>
        <BrowserRouter>
          <SwipeBack />
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/login" element={<Login />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/stock" element={<StockEntry />} />
            <Route path="/issue" element={<IssueInspection />} />
            <Route path="/history" element={<CartonHistory />} />
            <Route path="/management" element={<ManagementDashboard />} />
            <Route path="/office/:officeId" element={<OfficePage />} />
            <Route path="/office/:officeId/buyer/:buyer" element={<BuyerPage />} />
            <Route path="/admin" element={<AdminPanel />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
