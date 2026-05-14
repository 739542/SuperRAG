/**
 * SuperRAG frontend API configuration.
 *
 * This file is intentionally small so the backend base URL can be changed
 * without touching page code. Do not put API keys in frontend files.
 */
(function () {
  const existing = window.SuperRagConfig || {};
  const sameOriginApi =
    window.location.protocol === "file:" ? "http://127.0.0.1:8088/api" : `${window.location.origin}/api`;

  window.SuperRagConfig = {
    API_BASE_URL: existing.API_BASE_URL || sameOriginApi,
    DOCUMENT_API_TIMEOUT_MS: existing.DOCUMENT_API_TIMEOUT_MS || 60000,
    CHAT_API_TIMEOUT_MS: existing.CHAT_API_TIMEOUT_MS || 90000,
    USE_REAL_DOCUMENT_API: existing.USE_REAL_DOCUMENT_API !== false,
  };

  function getConfig() {
    return window.SuperRagConfig;
  }

  async function requestJson(path, options = {}) {
    const config = getConfig();
    const controller = new AbortController();
    const timeoutMs = options.timeoutMs || config.DOCUMENT_API_TIMEOUT_MS || 5000;
    const timeoutId = setTimeout(() => controller.abort(`Request timed out after ${timeoutMs}ms`), timeoutMs);
    try {
      const { timeoutMs: _timeoutMs, ...fetchOptions } = options;
      const response = await fetch(`${config.API_BASE_URL}${path}`, {
        ...fetchOptions,
        signal: controller.signal,
      });
      const payload = await parseJson(response);
      if (!response.ok) {
        throw new Error(payload.error || payload.message || `HTTP ${response.status}`);
      }
      return payload;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async function parseJson(response) {
    const text = await response.text();
    if (!text) {
      return {};
    }
    try {
      return JSON.parse(text);
    } catch (error) {
      return { message: text };
    }
  }

  function nowText() {
    return new Intl.DateTimeFormat("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })
      .format(new Date())
      .replace(/\//g, "-");
  }

  function getHistoryRecords() {
    try {
      return JSON.parse(localStorage.getItem("superrag_real_history") || "[]");
    } catch (error) {
      return [];
    }
  }

  function appendHistoryRecord(record) {
    const records = [
      {
        id: record.id || `hist-${Date.now()}`,
        createdAt: nowText(),
        creator: "course-demo-user",
        ...record,
      },
      ...getHistoryRecords(),
    ].slice(0, 80);
    localStorage.setItem("superrag_real_history", JSON.stringify(records));
    return records[0];
  }

  function deleteHistoryRecord(id) {
    const records = getHistoryRecords().filter((record) => record.id !== id);
    localStorage.setItem("superrag_real_history", JSON.stringify(records));
  }

  window.SuperRagBackend = {
    getConfig,
    requestJson,
    nowText,
    getHistoryRecords,
    appendHistoryRecord,
    deleteHistoryRecord,
  };
})();
