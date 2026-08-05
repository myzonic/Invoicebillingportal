import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import { tokenStore } from "@/lib/api";
import type { AuditLog, Brand, Client, CurrencyRates, DashboardReport, Invoice, InvoiceLog, Merchant, Paginated, Role, User } from "@/types";

const baseUrl = import.meta.env.VITE_API_URL || "/api";

const baseQuery = fetchBaseQuery({
  baseUrl,
  prepareHeaders: (headers) => {
    const token = tokenStore.access;
    if (token) headers.set("Authorization", `Bearer ${token}`);
    return headers;
  },
});

export interface ListQuery {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  clientId?: string;
}

function listParams(query: ListQuery) {
  const params = new URLSearchParams();
  if (query.page) params.set("page", String(query.page));
  if (query.limit) params.set("limit", String(query.limit));
  if (query.search) params.set("search", query.search);
  if (query.status) params.set("status", query.status);
  if (query.clientId) params.set("clientId", query.clientId);
  return params.toString();
}

export const apiSlice = createApi({
  reducerPath: "api",
  baseQuery,
  tagTypes: [
    "Auth",
    "Dashboard",
    "Client",
    "Invoice",
    "Brand",
    "Merchant",
    "User",
    "Role",
    "Log",
    "InvoiceLog",
    "Settings",
  ],
  endpoints: (builder) => ({
    // ---- Auth ----
    login: builder.mutation<{ data: { accessToken: string; refreshToken: string; user: User } }, { email: string; password: string }>({
      query: (body) => ({ url: "/auth/login", method: "POST", body }),
      invalidatesTags: ["Auth"],
    }),
    signup: builder.mutation<{ data: { accessToken: string; refreshToken: string; user: User } }, { token: string; name: string; email: string; password: string }>({
      query: ({ token, ...body }) => ({ url: `/auth/signup/${token}`, method: "POST", body }),
    }),
    me: builder.query<{ data: User }, void>({
      query: () => "/auth/me",
      providesTags: ["Auth"],
    }),

    // ---- Dashboard ----
    dashboard: builder.query<{ data: DashboardReport }, void>({
      query: () => "/dashboard/reports",
      providesTags: ["Dashboard"],
    }),

    // ---- Clients ----
    clients: builder.query<Paginated<Client>, ListQuery>({
      query: (q) => `/clients?${listParams(q)}`,
      providesTags: ["Client"],
    }),
    client: builder.query<{ data: Client }, string>({
      query: (id) => `/clients/${id}`,
      providesTags: ["Client"],
    }),
    createClient: builder.mutation<{ data: Client }, Partial<Client>>({
      query: (body) => ({ url: "/clients", method: "POST", body }),
      invalidatesTags: ["Client", "Dashboard"],
    }),
    updateClient: builder.mutation<{ data: Client }, { id: string; body: Partial<Client> }>({
      query: ({ id, body }) => ({ url: `/clients/${id}`, method: "PUT", body }),
      invalidatesTags: ["Client", "Dashboard"],
    }),
    deleteClient: builder.mutation<void, string>({
      query: (id) => ({ url: `/clients/${id}`, method: "DELETE" }),
      invalidatesTags: ["Client", "Dashboard"],
    }),

    // ---- Invoices ----
    invoices: builder.query<Paginated<Invoice>, ListQuery>({
      query: (q) => `/invoices?${listParams(q)}`,
      providesTags: ["Invoice"],
    }),
    invoice: builder.query<{ data: Invoice }, string>({
      query: (id) => `/invoices/${id}`,
      providesTags: ["Invoice"],
    }),
    createInvoice: builder.mutation<{ data: Invoice }, Partial<Invoice>>({
      query: (body) => ({ url: "/invoices", method: "POST", body }),
      invalidatesTags: ["Invoice", "Dashboard", "Client"],
    }),
    updateInvoice: builder.mutation<{ data: Invoice }, { id: string; body: Partial<Invoice> }>({
      query: ({ id, body }) => ({ url: `/invoices/${id}`, method: "PUT", body }),
      invalidatesTags: ["Invoice", "Dashboard"],
    }),
    deleteInvoice: builder.mutation<void, string>({
      query: (id) => ({ url: `/invoices/${id}`, method: "DELETE" }),
      invalidatesTags: ["Invoice", "Dashboard"],
    }),
    updateInvoiceStatus: builder.mutation<{ data: Invoice }, { id: string; status: string }>({
      query: ({ id, status }) => ({ url: `/invoices/${id}/status`, method: "PATCH", body: { status } }),
      invalidatesTags: ["Invoice", "Dashboard"],
    }),
    sendInvoice: builder.mutation<{ success: boolean }, string>({
      query: (id) => ({ url: `/invoices/${id}/send`, method: "POST" }),
      invalidatesTags: ["Invoice", "InvoiceLog"],
    }),
    invoiceCheckout: builder.mutation<{ data: { url: string } }, string>({
      query: (id) => ({ url: `/payments/checkout/${id}`, method: "POST" }),
    }),
    publicInvoice: builder.query<
      {
        data: Partial<Invoice> & {
          baseCurrency?: string;
          chargeCurrency?: string;
          chargeAmount?: number;
          client?: Client;
          brand?: Brand;
          company?: { name: string; email: string; phone: string; address: string; website: string };
        };
      },
      string
    >({
      query: (id) => `/payments/public/${id}`,
    }),

    // ---- Brands ----
    brands: builder.query<Paginated<Brand>, ListQuery>({
      query: (q) => `/brands?${listParams(q)}`,
      providesTags: ["Brand"],
    }),
    brand: builder.query<{ data: Brand }, string>({
      query: (id) => `/brands/${id}`,
      providesTags: ["Brand"],
    }),
    createBrand: builder.mutation<{ data: Brand }, Partial<Brand>>({
      query: (body) => ({ url: "/brands", method: "POST", body }),
      invalidatesTags: ["Brand"],
    }),
    updateBrand: builder.mutation<{ data: Brand }, { id: string; body: Partial<Brand> }>({
      query: ({ id, body }) => ({ url: `/brands/${id}`, method: "PUT", body }),
      invalidatesTags: ["Brand"],
    }),
    deleteBrand: builder.mutation<void, string>({
      query: (id) => ({ url: `/brands/${id}`, method: "DELETE" }),
      invalidatesTags: ["Brand"],
    }),
    upload: builder.mutation<{ data: { url: string } }, FormData>({
      query: (formData) => ({ url: "/uploads", method: "POST", body: formData }),
    }),

    // ---- Merchants ----
    merchants: builder.query<Paginated<Merchant>, ListQuery>({
      query: (q) => `/merchants?${listParams(q)}`,
      providesTags: ["Merchant"],
    }),
    merchant: builder.query<{ data: Merchant }, string>({
      query: (id) => `/merchants/${id}`,
      providesTags: ["Merchant"],
    }),
    createMerchant: builder.mutation<{ data: Merchant }, Partial<Merchant>>({
      query: (body) => ({ url: "/merchants", method: "POST", body }),
      invalidatesTags: ["Merchant"],
    }),
    updateMerchant: builder.mutation<{ data: Merchant }, { id: string; body: Partial<Merchant> }>({
      query: ({ id, body }) => ({ url: `/merchants/${id}`, method: "PUT", body }),
      invalidatesTags: ["Merchant"],
    }),
    deleteMerchant: builder.mutation<void, string>({
      query: (id) => ({ url: `/merchants/${id}`, method: "DELETE" }),
      invalidatesTags: ["Merchant"],
    }),

    // ---- Users ----
    users: builder.query<Paginated<User>, ListQuery>({
      query: (q) => `/users?${listParams(q)}`,
      providesTags: ["User"],
    }),
    createUser: builder.mutation<{ data: User }, Partial<User> & { password?: string }>({
      query: (body) => ({ url: "/users", method: "POST", body }),
      invalidatesTags: ["User"],
    }),
    updateUser: builder.mutation<{ data: User }, { id: string; body: Partial<User> & { password?: string } }>({
      query: ({ id, body }) => ({ url: `/users/${id}`, method: "PUT", body }),
      invalidatesTags: ["User", "Auth"],
    }),
    deleteUser: builder.mutation<void, string>({
      query: (id) => ({ url: `/users/${id}`, method: "DELETE" }),
      invalidatesTags: ["User"],
    }),

    // ---- Roles ----
    roles: builder.query<{ data: Role[] }, void>({
      query: () => "/roles",
      providesTags: ["Role"],
    }),
    createRole: builder.mutation<{ data: Role }, Partial<Role>>({
      query: (body) => ({ url: "/roles", method: "POST", body }),
      invalidatesTags: ["Role"],
    }),
    updateRole: builder.mutation<{ data: Role }, { id: string; body: Partial<Role> }>({
      query: ({ id, body }) => ({ url: `/roles/${id}`, method: "PUT", body }),
      invalidatesTags: ["Role"],
    }),
    deleteRole: builder.mutation<void, string>({
      query: (id) => ({ url: `/roles/${id}`, method: "DELETE" }),
      invalidatesTags: ["Role"],
    }),

    // ---- Logs ----
    logs: builder.query<Paginated<AuditLog>, ListQuery>({
      query: (q) => `/logs?${listParams(q)}`,
      providesTags: ["Log"],
    }),
    invoiceLogs: builder.query<{ data: InvoiceLog[] }, void>({
      query: () => "/invoice-logs",
      providesTags: ["InvoiceLog"],
    }),

    // ---- Settings ----
    settings: builder.query<{ data: Record<string, unknown> }, void>({
      query: () => "/settings",
      providesTags: ["Settings"],
    }),
    updateSettings: builder.mutation<{ data: Record<string, unknown> }, Record<string, unknown>>({
      query: (body) => ({ url: "/settings", method: "PUT", body }),
      invalidatesTags: ["Settings"],
    }),

    // ---- Currency rates ----
    rates: builder.query<{ data: CurrencyRates }, void>({
      query: () => "/rates",
    }),
    refreshRates: builder.mutation<{ data: CurrencyRates }, void>({
      query: () => ({ url: "/rates/refresh", method: "POST" }),
    }),
    saveRates: builder.mutation<{ data: CurrencyRates }, { overrides: Record<string, number | null> }>({
      query: ({ overrides }) => ({ url: "/rates/overrides", method: "PUT", body: { overrides } }),
    }),
  }),
});

export const {
  useLoginMutation,
  useSignupMutation,
  useMeQuery,
  useDashboardQuery,
  useClientsQuery,
  useClientQuery,
  useCreateClientMutation,
  useUpdateClientMutation,
  useDeleteClientMutation,
  useInvoicesQuery,
  useInvoiceQuery,
  useCreateInvoiceMutation,
  useUpdateInvoiceMutation,
  useDeleteInvoiceMutation,
  useUpdateInvoiceStatusMutation,
  useSendInvoiceMutation,
  useInvoiceCheckoutMutation,
  usePublicInvoiceQuery,
  useBrandsQuery,
  useBrandQuery,
  useCreateBrandMutation,
  useUpdateBrandMutation,
  useDeleteBrandMutation,
  useUploadMutation,
  useMerchantsQuery,
  useMerchantQuery,
  useCreateMerchantMutation,
  useUpdateMerchantMutation,
  useDeleteMerchantMutation,
  useUsersQuery,
  useCreateUserMutation,
  useUpdateUserMutation,
  useDeleteUserMutation,
  useRolesQuery,
  useCreateRoleMutation,
  useUpdateRoleMutation,
  useDeleteRoleMutation,
  useLogsQuery,
  useInvoiceLogsQuery,
  useSettingsQuery,
  useUpdateSettingsMutation,
  useRatesQuery,
  useRefreshRatesMutation,
  useSaveRatesMutation,
} = apiSlice;
