import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { tokenStore } from "@/lib/api";
import Layout from "@/components/Layout";
import ProtectedRoute from "@/components/ProtectedRoute";
import Login from "@/pages/Login";
import Signup from "@/pages/Signup";
import Dashboard from "@/pages/Dashboard";
import Clients from "@/pages/clients/Clients";
import ClientForm from "@/pages/clients/ClientForm";
import ClientDetail from "@/pages/clients/ClientDetail";
import Invoices from "@/pages/invoices/Invoices";
import InvoiceForm from "@/pages/invoices/InvoiceForm";
import InvoiceDetail from "@/pages/invoices/InvoiceDetail";
import DirectInvoice from "@/pages/invoices/DirectInvoice";
import InvoiceLogs from "@/pages/invoices/InvoiceLogs";
import Brands from "@/pages/brands/Brands";
import BrandForm from "@/pages/brands/BrandForm";
import Merchants from "@/pages/merchants/Merchants";
import MerchantForm from "@/pages/merchants/MerchantForm";
import Users from "@/pages/users/Users";
import UserForm from "@/pages/users/UserForm";
import Roles from "@/pages/roles/Roles";
import RoleForm from "@/pages/roles/RoleForm";
import Logs from "@/pages/Logs";
import Settings from "@/pages/Settings";
import PaymentLink from "@/pages/payments/PaymentLink";
import SquareCheckout from "@/pages/payments/SquareCheckout";
import PaymentResult from "@/pages/payments/PaymentResult";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/signup/:token" element={<Signup />} />
      <Route path="/invoice/payment-link/:id" element={<PaymentLink />} />
      <Route path="/invoice/checkout/:id" element={<SquareCheckout />} />
      <Route path="/payment_success" element={<PaymentResult variant="success" />} />
      <Route path="/payment_cancel" element={<PaymentResult variant="cancel" />} />

      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/dashboard/main" replace />} />
        <Route path="main" element={<Dashboard />} />

        <Route path="clients" element={<Clients />} />
        <Route path="clients/add" element={<ClientForm />} />
        <Route path="clients/:id" element={<ClientDetail />} />
        <Route path="clients/update/:id" element={<ClientForm />} />

        <Route path="invoices" element={<Invoices />} />
        <Route path="invoices/add" element={<InvoiceForm />} />
        <Route path="invoices/:id" element={<InvoiceDetail />} />
        <Route path="invoices/update/:id" element={<InvoiceForm />} />
        <Route path="direct-invoice" element={<DirectInvoice />} />
        <Route path="invoice-logs" element={<InvoiceLogs />} />

        <Route path="brand-management" element={<Brands />} />
        <Route path="brand-management/add" element={<BrandForm />} />
        <Route path="brand-management/update/:id" element={<BrandForm />} />

        <Route path="merchant-management" element={<Merchants />} />
        <Route path="merchant-management/add" element={<MerchantForm />} />
        <Route path="merchant-management/update/:id" element={<MerchantForm />} />
        <Route path="merchant-records" element={<Merchants recordView />} />

        <Route path="user-management" element={<Users />} />
        <Route path="user-management/add" element={<UserForm />} />
        <Route path="user-management/update/:id" element={<UserForm />} />

        <Route path="roles" element={<Roles />} />
        <Route path="roles/add" element={<RoleForm />} />
        <Route path="roles/update/:id" element={<RoleForm />} />

        <Route path="logs" element={<Logs />} />
        <Route path="settings" element={<Settings />} />
      </Route>

      <Route path="*" element={<RequireAuthRedirect />} />
    </Routes>
  );
}

function RequireAuthRedirect() {
  const location = useLocation();
  return tokenStore.access ? <Navigate to="/dashboard/main" replace /> : <Navigate to="/login" replace state={{ from: location }} />;
}
