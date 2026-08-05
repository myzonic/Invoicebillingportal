export type PermissionAction = "create" | "read" | "update" | "delete";

export interface RolePermission {
  id: string;
  module: string;
  canCreate: boolean;
  canRead: boolean;
  canUpdate: boolean;
  canDelete: boolean;
}

export interface Role {
  id: string;
  name: string;
  description?: string;
  isSystem: boolean;
  permissions: RolePermission[];
}

export interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string;
  isActive: boolean;
  createdAt?: string;
  role: { id: string; name: string; permissions?: RolePermission[] };
}

export interface Client {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  brandId?: string;
  brand?: Brand | null;
  notes?: string;
  isActive: boolean;
  _count?: { invoices: number };
  createdAt: string;
}

export interface Brand {
  id: string;
  name: string;
  logoUrl?: string;
  currency: string;
  email?: string;
  phone?: string;
  address?: string;
  pdfHeader?: string;
  pdfFooter?: string;
  isDefault: boolean;
  _count?: { clients: number; invoices: number };
}

export interface Merchant {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  brandId?: string;
  brand?: Brand | null;
  isActive: boolean;
  createdAt: string;
}

export interface InvoiceItem {
  description: string;
  quantity: number;
  unitPrice: number;
  amount?: number;
}

export type InvoiceStatus = "DRAFT" | "SENT" | "PARTIALLY_PAID" | "PAID" | "OVERDUE" | "CANCELLED";

export interface Invoice {
  id: string;
  number: string;
  clientId: string;
  client?: { id: string; name: string; email?: string };
  brandId?: string;
  brand?: Brand | null;
  items: InvoiceItem[];
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  discountAmount: number;
  total: number;
  currency: string;
  color?: string | null;
  status: InvoiceStatus;
  notes?: string;
  issueDate: string;
  dueDate?: string;
  sentAt?: string;
  paidAt?: string;
  squarePaymentLink?: string;
  payments?: Payment[];
  createdAt: string;
}

export interface Payment {
  id: string;
  invoiceId: string;
  amount: number;
  currency: string;
  method: "SQUARE" | "MANUAL" | "BANK_TRANSFER";
  status: "PENDING" | "SUCCEEDED" | "FAILED" | "REFUNDED";
  reference?: string;
  capturedAt?: string;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  userId?: string;
  userEmail?: string;
  module: string;
  action: string;
  details?: unknown;
  ip?: string;
  createdAt: string;
}

export interface InvoiceLog {
  id: string;
  invoiceId?: string;
  invoice?: { id: string; number: string };
  toEmail: string;
  subject: string;
  status: string;
  error?: string;
  sentAt: string;
}

export interface DashboardReport {
  totals: {
    invoices: number;
    clients: number;
    brands: number;
    merchants: number;
    revenue: number;
    paid: number;
    unpaid: number;
    overdue: number;
  };
  totalsByStatus: { status: string; count: number; total: number }[];
  monthlyRevenue: { month: string; revenue: number }[];
  recentInvoices: Invoice[];
  revenueByCurrency: { currency: string; total: number }[];
  totalsByCurrency: { currency: string; total: number }[];
}

export interface CurrencyRates {
  base: string;
  currencies: string[];
  rates: Record<string, number>;
  live: Record<string, number> | null;
  date: string | null;
  updatedAt: string | null;
  overrides: Record<string, number>;
  source: "live" | "override" | "mixed" | "none";
}

export interface Paginated<T> {
  success: boolean;
  data: T[];
  meta: { page: number; limit: number; total: number; pages: number };
}
