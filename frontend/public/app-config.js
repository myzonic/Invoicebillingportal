// Fallback for static hosts (e.g. Vercel) that do not inject runtime branding.
// In the single-container Docker deploy the backend serves a dynamic
// /app-config.js before this file, so environment-driven branding still wins.
window.__APP_CONFIG__ = window.__APP_CONFIG__ || {};
