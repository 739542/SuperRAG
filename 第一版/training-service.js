/**
 * Training service and adapter layer.
 *
 * The training page calls window.trainingService only. It currently returns
 * mock structured training results. Future Dify Workflow integration should be
 * hidden behind this service, not called directly from page code.
 */
(function () {
  function clone(value) {
    return structuredClone(value);
  }

  function getMock() {
    return window.SuperRagMock || {};
  }

  async function getTrainingOptions() {
    const documents = getMock().mockDocuments || [];
    return {
      topics: ["项目背景", "核心术语", "模块职责", "开发流程", "接口规范", "测试流程"],
      projects: uniqueValues(documents.map((item) => item.project)),
    };
  }

  async function generateTrainingResult(payload = {}) {
    const base = getMock().mockTrainingResult || {};
    const citations = resolveCitations(base.citations);
    return clone(
      mapWorkflowTrainingResultToTrainingResult({
        ...base,
        query: payload.query || "这个项目主要解决什么问题？",
        topic: payload.topic || base.topic || "项目背景",
        project: payload.project || base.project || "企业知识库",
        citations,
      }),
    );
  }

  function mapWorkflowTrainingResultToTrainingResult(raw = {}) {
    return {
      id: raw.id || `training-${Date.now()}`,
      title: raw.title || "培训说明",
      query: raw.query || "",
      topic: raw.topic || "项目背景",
      project: raw.project || "企业知识库",
      summary: raw.summary || raw.conclusion || "",
      background: raw.background || raw.backgroundSummary || "",
      terms: raw.terms || raw.termExplanations || [],
      learningPath: raw.learningPath || raw.learning_path || raw.path || [],
      recommendedDocs: raw.recommendedDocs || raw.recommended_docs || raw.documents || [],
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

  window.trainingService = {
    getTrainingOptions,
    generateTrainingResult,
    mapWorkflowTrainingResultToTrainingResult,
    mapCitationToEvidence,
  };

  window.trainingApi = window.trainingService;
})();
