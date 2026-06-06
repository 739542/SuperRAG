/**
 * Dashboard service and adapter layer.
 * Reads live backend document status plus locally persisted real artifacts.
 */
(function () {
  function clone(value) {
    return structuredClone(value);
  }

  function getBackend() {
    return window.SuperRagBackend;
  }

  async function getDashboardStats() {
    const history = getBackend()?.getHistoryRecords?.() || [];

    try {
      const [health, docsResponse] = await Promise.all([
        getBackend().requestJson("/health"),
        getBackend().requestJson("/documents"),
      ]);
      const documents = Array.isArray(docsResponse.items) ? docsResponse.items.map(mapBackendDocumentSummaryToDocumentSummary) : [];
      return clone({
        documentCount: Number(health.documents ?? documents.length),
        categoryCount: Number(health.collections ?? uniqueValues(documents.map((item) => item.project)).length),
        todayQuestionCount: history.filter((item) => item.sceneMode === "chat").length,
        designOutputCount: history.filter((item) => item.sceneMode === "design").length,
        indexingCount: documents.filter((item) => item.status === "indexing").length,
        failedDocumentCount: documents.filter((item) => item.status === "failed").length,
      });
    } catch (error) {
      return clone({
        documentCount: 0,
        categoryCount: 0,
        todayQuestionCount: history.filter((item) => item.sceneMode === "chat").length,
        designOutputCount: history.filter((item) => item.sceneMode === "design").length,
        indexingCount: 0,
        failedDocumentCount: 0,
      });
    }
  }

  async function getRecentDocuments(params = {}) {
    const limit = Number(params.limit || 5);
    const documents = await getDocumentsFromBackend();
    return clone((documents || []).slice(0, limit).map(mapBackendDocumentSummaryToDocumentSummary));
  }

  async function getRecentActivities(params = {}) {
    const limit = Number(params.limit || 5);
    const local = getBackend()?.getHistoryRecords?.() || [];
    return clone(local.slice(0, limit).map(mapBackendActivityToActivity));
  }

  async function getKnowledgeDocuments() {
    const documents = await getDocumentsFromBackend();
    return clone((documents || []).map(mapBackendDocumentSummaryToDocumentSummary));
  }

  function mapBackendStatsToStats(raw = {}) {
    return {
      documentCount: Number(raw.documentCount ?? raw.document_count ?? 0),
      categoryCount: Number(raw.categoryCount ?? raw.category_count ?? 0),
      todayQuestionCount: Number(raw.todayQuestionCount ?? raw.today_question_count ?? 0),
      designOutputCount: Number(raw.designOutputCount ?? raw.design_output_count ?? 0),
      indexingCount: Number(raw.indexingCount ?? raw.indexing_count ?? 0),
      failedDocumentCount: Number(raw.failedDocumentCount ?? raw.failed_document_count ?? 0),
    };
  }

  function mapBackendDocumentSummaryToDocumentSummary(raw = {}) {
    return {
      id: raw.id || raw.documentId || raw.document_id || "",
      title: raw.title || raw.name || raw.fileName || raw.file_name || raw.originalName || raw.original_name || "Untitled document",
      type: raw.type || raw.doc_type || raw.documentType || raw.document_type || "Unknown",
      status: mapDocumentStatus(raw.status),
      updatedAt: raw.updatedAt || raw.updated_at || raw.updateTime || raw.update_time || raw.createdAt || raw.created_at || "",
      tags: Array.isArray(raw.tags) ? raw.tags : [],
      project: raw.project || raw.projectName || raw.project_name || raw.collectionName || raw.collection_name || "",
    };
  }

  function mapBackendActivityToActivity(raw = {}) {
    return {
      id: raw.id || raw.sessionId || raw.session_id || "",
      title: raw.title || raw.originalQuestion || raw.original_question || "SuperRAG activity",
      sceneMode: raw.sceneMode || raw.scene_mode || "chat",
      updatedAt: raw.updatedAt || raw.updated_at || raw.createdAt || raw.created_at || "",
    };
  }

  function mapDocumentStatus(status) {
    const text = String(status || "").toLowerCase();
    if (["failed", "error"].includes(text)) {
      return "failed";
    }
    if (["indexing", "processing", "parsing"].includes(text)) {
      return "indexing";
    }
    if (status) {
      return "indexed";
    }
    return "pending";
  }

  async function getDocumentsFromBackend() {
    try {
      const response = await getBackend().requestJson("/documents");
      return Array.isArray(response.items) ? response.items : [];
    } catch (error) {
      console.warn(`[SuperRAG DashboardService] live documents unavailable: ${error.message || error}`);
      return [];
    }
  }

  function uniqueValues(values) {
    return [...new Set(values.filter(Boolean))];
  }

  window.dashboardService = {
    getDashboardStats,
    getRecentDocuments,
    getRecentActivities,
    getKnowledgeDocuments,
    mapBackendStatsToStats,
    mapBackendDocumentSummaryToDocumentSummary,
    mapBackendActivityToActivity,
  };

  window.dashboardApi = window.dashboardService;
})();
