/**
 * Dashboard service and adapter layer.
 *
 * The dashboard page reads through this service so future backend endpoints can
 * replace mock internals without changing page rendering code.
 */
(function () {
  function clone(value) {
    return structuredClone(value);
  }

  function getApi() {
    if (!window.SuperRagApi) {
      throw new Error("SuperRagApi is not loaded");
    }
    return window.SuperRagApi;
  }

  async function getDashboardStats() {
    const stats = await getApi().getDashboardStats();
    return clone(mapBackendStatsToStats(stats || {}));
  }

  async function getRecentDocuments(params = {}) {
    const limit = Number(params.limit || 5);
    const documents = await getApi().getDocuments();
    return clone((documents || []).slice(0, limit).map(mapBackendDocumentSummaryToDocumentSummary));
  }

  async function getRecentActivities(params = {}) {
    const limit = Number(params.limit || 5);
    const sessions = await getApi().getSessions();
    return clone((sessions || []).slice(0, limit).map(mapBackendActivityToActivity));
  }

  async function getKnowledgeDocuments() {
    const documents = await getApi().getDocuments();
    return clone(documents || []);
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
      title: raw.title || raw.name || raw.fileName || raw.file_name || "未命名文档",
      type: raw.type || raw.documentType || raw.document_type || "Unknown",
      status: raw.status || "pending",
      updatedAt: raw.updatedAt || raw.updated_at || raw.updateTime || raw.update_time || "",
      tags: Array.isArray(raw.tags) ? raw.tags : [],
      project: raw.project || raw.projectName || raw.project_name || "",
    };
  }

  function mapBackendActivityToActivity(raw = {}) {
    return {
      id: raw.id || raw.sessionId || raw.session_id || "",
      title: raw.title || "未命名记录",
      sceneMode: raw.sceneMode || raw.scene_mode || "chat",
      updatedAt: raw.updatedAt || raw.updated_at || raw.createdAt || raw.created_at || "",
    };
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
