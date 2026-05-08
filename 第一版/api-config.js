/**
 * SuperRAG frontend API configuration.
 *
 * This file is intentionally small so the backend base URL can be changed
 * without touching page code. Do not put API keys in frontend files.
 */
(function () {
  const existing = window.SuperRagConfig || {};

  window.SuperRagConfig = {
    API_BASE_URL: existing.API_BASE_URL || "http://127.0.0.1:8088/api",
    DOCUMENT_API_TIMEOUT_MS: existing.DOCUMENT_API_TIMEOUT_MS || 5000,
    USE_REAL_DOCUMENT_API: existing.USE_REAL_DOCUMENT_API !== false,
  };
})();
