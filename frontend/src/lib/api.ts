import axios from "axios";

const API_URL = import.meta.env.VITE_API_URL || "";

export const api = axios.create({
  baseURL: API_URL || "/api",
});

const TOKEN_KEY = "myzonic_access_token";
const REFRESH_KEY = "myzonic_refresh_token";

export const tokenStore = {
  get access() {
    return localStorage.getItem(TOKEN_KEY);
  },
  get refresh() {
    return localStorage.getItem(REFRESH_KEY);
  },
  setTokens(access: string, refresh: string) {
    localStorage.setItem(TOKEN_KEY, access);
    localStorage.setItem(REFRESH_KEY, refresh);
  },
  clear() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },
};

api.interceptors.request.use((config) => {
  const token = tokenStore.access;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let refreshing: Promise<string> | null = null;

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retried && tokenStore.refresh) {
      original._retried = true;
      try {
        refreshing = refreshing || refreshToken();
        const newToken = await refreshing;
        refreshing = null;
        original.headers.Authorization = `Bearer ${newToken}`;
        return api(original);
      } catch {
        tokenStore.clear();
        if (!window.location.pathname.startsWith("/login")) window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  },
);

async function refreshToken() {
  const { data } = await axios.post(`${API_URL || "/api"}/auth/refresh`, { refreshToken: tokenStore.refresh });
  tokenStore.setTokens(data.data.accessToken, data.data.refreshToken);
  return data.data.accessToken;
}
