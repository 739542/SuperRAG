/**
 * Handover service and adapter layer.
 * Calls dify-lite first and falls back to mock data when the backend cannot
 * answer for the selected project yet.
 */
(function () {
  function clone(value) {
    return structuredClone(value);
  }

  function getMock() {
    return window.SuperRagMock || {};
  }

  function getBackend() {
    return window.SuperRagBackend;
  }

  async function getHandoverOptions() {
    const documents = await getDocumentsWithFallback();
    return {
      scopes: ["功能模块", "接口服务", "测试验证", "风险问题", "文档资料"],
      projects: uniqueValues(documents.map((item) => item.project || item.collectionName || item.collection_name)),
    };
  }

  async function generateHandoverResult(payload = {}) {
    try {
      const raw = await getBackend().requestJson("/scenes/handover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        timeoutMs: window.SuperRagConfig?.CHAT_API_TIMEOUT_MS || 90000,
        body: JSON.stringify({
          query: payload.query,
          project: payload.project,
          focus: payload.scope,
          role: "handover",
          user: "course-demo-user",
        }),
      });
      const result = mapSceneResultToHandoverResult(raw, payload);
      getBackend().appendHistoryRecord({
        id: result.id,
        title: result.title,
        sceneMode: "handover",
        project: result.project,
        summary: result.currentProgress || result.projectBackground,
        originalQuestion: result.query,
        outputSummary: result.currentProgress || result.projectBackground,
        citations: result.citations,
      });
      return clone(result);
    } catch (error) {
      console.warn(`[SuperRAG HandoverService] backend unavailable, using mock: ${error.message || error}`);
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
  }

  function mapWorkflowHandoverResultToHandoverResult(raw = {}) {
    return {
      id: raw.id || `handover-${Date.now()}`,
      title: raw.title || "交接摘要",
      query: raw.query || "",
      project: raw.project || "企业知识库",
      scope: raw.scope || "功能模块",
      projectBackground: raw.projectBackground || raw.project_background || raw.background || "",
      currentProgress: raw.currentProgress || raw.current_progress || raw.progress || raw.summary || "",
      completedFeatures: raw.completedFeatures || raw.completed_features || [],
      unfinishedItems: raw.unfinishedItems || raw.unfinished_items || [],
      todos: raw.todos || raw.todoList || raw.todo_list || [],
      risks: raw.risks || [],
      roles: raw.roles || raw.relatedRoles || raw.related_roles || [],
      dependentDocs: raw.dependentDocs || raw.dependent_docs || raw.documents || [],
      citations: (raw.citations || []).map(mapCitationToEvidence),
    };
  }

  function mapSceneResultToHandoverResult(raw = {}, payload = {}) {
    const citations = (raw.citations || []).map(mapCitationToEvidence);
    const risks = raw.risks || [];
    return {
      id: raw.id || `handover-${Date.now()}`,
      title: raw.title || "交接摘要",
      query: payload.query || "",
      project: raw.collection?.name || payload.project || "",
      scope: payload.scope || "功能模块",
      projectBackground: raw.summary || "",
      currentProgress: raw.summary || "",
      completedFeatures: (raw.evidence || []).slice(0, 4),
      unfinishedItems: risks,
      todos: (raw.nextActions || []).map((action, index) => ({
        taskName: action,
        priority: index === 0 ? "high" : "medium",
        riskLevel: risks[index] || "medium",
        owner: "项目成员",
        dueDate: "",
        status: "pending",
      })),
      risks: risks.map((risk) => ({
        type: "风险",
        description: risk,
        impact: risk,
        suggestion: "补充文档或人工确认。",
        evidenceSource: raw.source || "Dify Lite",
      })),
      roles: [{ role: "交接负责人", responsibility: "核对摘要、任务和风险项。" }],
      dependentDocs: citations.map((citation) => citation.documentTitle),
      citations,
    };
  }

  function mapCitationToEvidence(raw = {}) {
    return {
      id: raw.id || raw.segmentId || raw.segment_id || "",
      documentTitle: raw.documentTitle || raw.document_title || raw.title || "知识片段",
      snippet: raw.snippet || raw.content || "",
      relevanceScore: Number(raw.relevanceScore ?? raw.relevance_score ?? raw.score ?? 0),
      page: raw.page || raw.pageNo || raw.page_no || "",
      segmentId: raw.segmentId || raw.segment_id || raw.id || "",
      chunkId: raw.chunkId || raw.chunk_id || raw.segmentId || raw.segment_id || raw.id || "",
      documentId: raw.documentId || raw.document_id || "",
      sourceName: raw.sourceName || raw.source_name || raw.documentTitle || raw.document_title || raw.title || "",
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

  async function getDocumentsWithFallback() {
    try {
      const response = await getBackend().requestJson("/documents");
      return Array.isArray(response.items) ? response.items : [];
    } catch (error) {
      return getMock().mockDocuments || [];
    }
  }

  window.handoverService = {
    getHandoverOptions,
    generateHandoverResult,
    mapWorkflowHandoverResultToHandoverResult,
    mapCitationToEvidence,
  };

  window.handoverApi = window.handoverService;
})();
