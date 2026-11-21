import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import { refreshAccessToken, tokenStore } from "@/lib/api";
import type {
  AuditLog,
  Brand,
  BulkSendResponse,
  Client,
  CurrencyRates,
  DashboardReport,
  Invoice,
  InvoiceListResponse,
  InvoiceLog,
  Merchant,
  Paginated,
  PaymentQuote,
  Role,
  User,
} from "@/types";

const baseUrl = import.meta.env.VITE_API_URL || "/api";

const baseQuery = fetchBaseQuery({
  baseUrl,
  prepareHeaders: (headers) => {
    const token = tokenStore.access;
    if (token) headers.set("Authorization", `Bearer ${token}`);
    return headers;
  },
});

// RTK Query calls must recover from an expired access token just like the
// axios client does, otherwise every query fails after JWT_EXPIRES_IN and the
// user is logged out even though the refresh token is still valid.
const baseQueryWithReauth: typeof baseQuery = async (args, api, extraOptions) => {
  let result = await baseQuery(args, api, extraOptions);
  if (result.error?.status !== 401 || !tokenStore.refresh) return result;

  try {
    await refreshAccessToken();
    result = await baseQuery(args, api, extraOptions);
  } catch {
    tokenStore.clear();
    if (!window.location.pathname.startsWith("/login")) window.location.assign("/login");
  }
  return result;
};

export interface ListQuery {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  clientId?: string;
  brandId?: string;
  module?: string;
  // Invoice listing extensions. Other list endpoints simply ignore these.
  currency?: string;
  issueDateFrom?: string;
  issueDateTo?: string;
  dueDateFrom?: string;
  dueDateTo?: string;
  amountMin?: number;
  amountMax?: number;
  sortBy?: string;
  sortDir?: "asc" | "desc";
}

function listParams(query: ListQuery) {
  const params = new URLSearchParams();
  if (query.page) params.set("page", String(query.page));
  if (query.limit) params.set("limit", String(query.limit));
  if (query.search) params.set("search", query.search);
  if (query.status) params.set("status", query.status);
  if (query.clientId) params.set("clientId", query.clientId);
  if (query.brandId) params.set("brandId", query.brandId);
  if (query.module) params.set("module", query.module);
  if (query.currency) params.set("currency", query.currency);
  if (query.issueDateFrom) params.set("issueDateFrom", query.issueDateFrom);
  if (query.issueDateTo) params.set("issueDateTo", query.issueDateTo);
  if (query.dueDateFrom) params.set("dueDateFrom", query.dueDateFrom);
  if (query.dueDateTo) params.set("dueDateTo", query.dueDateTo);
  if (query.amountMin !== undefined) params.set("amountMin", String(query.amountMin));
  if (query.amountMax !== undefined) params.set("amountMax", String(query.amountMax));
  if (query.sortBy) params.set("sortBy", query.sortBy);
  if (query.sortDir) params.set("sortDir", query.sortDir);
  return params.toString();
}

export const apiSlice = createApi({
  reducerPath: "api",
  baseQuery: baseQueryWithReauth,
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
    "Rates",
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
    invoices: builder.query<InvoiceListResponse, ListQuery>({
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
    bulkSendInvoices: builder.mutation<{ data: BulkSendResponse }, { ids: string[] }>({
      query: (body) => ({ url: "/invoices/bulk/send", method: "POST", body }),
      invalidatesTags: ["Invoice", "InvoiceLog", "Dashboard"],
    }),
    exportInvoices: builder.mutation<Blob, { ids: string[] }>({
      query: (body) => ({
        url: "/invoices/bulk/export",
        method: "POST",
        body,
        responseHandler: (response) => response.blob(),
      }),
    }),
    invoiceCheckout: builder.mutation<{ data: { url: string } }, string>({
      query: (id) => ({ url: `/payments/checkout/${id}`, method: "POST" }),
    }),
    /** Locks a fresh FX rate + USD amount server-side for one payment attempt. */
    createPaymentQuote: builder.mutation<{ data: PaymentQuote }, string>({
      query: (id) => ({ url: `/payments/quote/${id}`, method: "POST" }),
    }),
    publicInvoice: builder.query<
      {
        data: Partial<Invoice> & {
          baseCurrency?: string;
          paymentState?: string;
          pendingPayment?: boolean;
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
      providesTags: ["Rates"],
    }),
    refreshRates: builder.mutation<{ data: CurrencyRates }, void>({
      query: () => ({ url: "/rates/refresh", method: "POST" }),
      invalidatesTags: ["Rates"],
    }),
    saveRates: builder.mutation<{ data: CurrencyRates }, { overrides: Record<string, number | null> }>({
      query: ({ overrides }) => ({ url: "/rates/overrides", method: "PUT", body: { overrides } }),
      invalidatesTags: ["Rates"],
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
  useBulkSendInvoicesMutation,
  useExportInvoicesMutation,
  useInvoiceCheckoutMutation,
  useCreatePaymentQuoteMutation,
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
