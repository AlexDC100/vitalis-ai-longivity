import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Index from "./pages/Index.tsx";
import NotFound from "./pages/NotFound.tsx";
import ResetPassword from "./pages/ResetPassword.tsx";
import SharedReport from "./pages/SharedReport.tsx";
import ThemeFlickerTest from "./pages/ThemeFlickerTest.tsx";
import CaseDetail from "./pages/CaseDetail.tsx";
import CaseReport from "./pages/CaseReport.tsx";
import { ThemeProvider } from "@/lib/theme";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/case/:id" element={<CaseDetail />} />
            <Route path="/case/:id/report" element={<CaseReport />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/r/:token" element={<SharedReport />} />
          <Route path="/__theme-flicker-test" element={<ThemeFlickerTest />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
