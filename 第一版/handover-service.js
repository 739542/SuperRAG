/**
 * Handover service and adapter layer.
 *
 * The handover page calls window.handoverService only. It currently returns
 * mock structured handover results. Future Workflow calls should be proxied by
 * our backend and adapted here.
 */
(function () {
  function clone(value) {
    return structuredClone(value);
  }

  function getMock() {
    return window.SuperRagMock || {};
  }

  async function getHandoverOptions() {
    const documents = getMock().mockDocuments || [];
    return {
      scopes: ["功能模块", "接口开发", "测试任务", "部署运维", "文档整理"],
      projects: uniqueValues(documents.map((item) => item.project)),
    };
  }

  async function generateHandoverResult(payload = {}) {
    const base = getMock().mockHandoverResult || {};
    const citations = resolveCitations(base.citations);
    return clone(
      mapWorkflowHandoverResultToHandoverResult({
        ...base,
        query: payload.query || "请总结当前项目进度",
        project: payload.project || base.project || "企业知识库",
        scope: payload.scope || base.scope || "功能模块",
        citations,
      }),
    );
  }

  function mapWorkflowHandoverResultToHandoverResult(raw = {}) {
    return {
      id: raw.id || `handover-${Date.now()}`,
      title: raw.title || "交接摘要",
      query: raw.query || "",
      project: raw.project || "企业知识库",
      scope: raw.scope || "功能模块",
      projectBackground: raw.projectBackground || raw.project_background || raw.background || "",
      currentProgress: raw.currentProgress || raw.current_progress || raw.progress || "",
      completedFeatures: raw.completedFeatures || raw.completed_features || [],
      unfinishedItems: raw.unfinishedItems || raw.unfinished_items || [],
      todos: raw.todos || raw.todoList || raw.todo_list || [],
      risks: raw.risks || [],
      roles: raw.roles || raw.relatedRoles || raw.related_roles || [],
      dependentDocs: raw.dependentDocs || raw.dependent_docs || raw.documents || [],
      citations: (raw.citations || []).map(mapCitationToEvidence),
    };
  }

  function mapCitationToEvidence(raw = {}) {
    return {
      id: raw.id || raw.segmentId || raw.segment_id || "",
      documentTitle: raw.documentTitle || raw.document_title || raw.title || "知识库片段",
      snippet: raw.snippet || raw.content || "",
      relevanceScore: Number(raw.relevanceScore ?? raw.relevance_score ?? raw.score ?? 0),
      page: raw.page || raw.pageNo || raw.page_no || "",
      segmentId: raw.segmentId || raw.segment_id || raw.id || "",
    };
  }

  function resolveCitations(citationIds = []) {
    const citations = getMock().mockCitations || [];
    const idSet = new Set(citationIds);
    return citations.filter((citation) => idSet.has(citation.id));
  }

  function uniqueValues(values) {
    return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, "zh-CN"));
  }

  window.handoverService = {
    getHandoverOptions,
    generateHandoverResult,
    mapWorkflowHandoverResultToHandoverResult,
    mapCitationToEvidence,
  };

  window.handoverApi = window.handoverService;
})();
