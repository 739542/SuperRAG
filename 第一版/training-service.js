/**
 * Training service and adapter layer.
 * Calls dify-lite first and falls back to mock data when the backend has no
 * matching imported project yet.
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

  async function getTrainingOptions() {
    const documents = await getDocumentsWithFallback();
    return {
      topics: ["项目背景", "核心概念", "功能模块", "业务流程", "接口与数据", "测试与验收"],
      projects: uniqueValues(documents.map((item) => item.project || item.collectionName || item.collection_name)),
    };
  }

  async function generateTrainingResult(payload = {}) {
    try {
      const raw = await getBackend().requestJson("/scenes/training", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        timeoutMs: window.SuperRagConfig?.CHAT_API_TIMEOUT_MS || 90000,
        body: JSON.stringify({
          query: payload.query,
          project: payload.project,
          focus: payload.topic,
          role: "training",
          user: "course-demo-user",
        }),
      });
      const result = mapSceneResultToTrainingResult(raw, payload);
      getBackend().appendHistoryRecord({
        id: result.id,
        title: result.title,
        sceneMode: "training",
        artifactType: "training_plan",
        project: result.project,
        summary: result.summary,
        query: result.query,
        originalQuestion: result.query,
        outputSummary: result.summary,
        structuredOutput: result,
        qualityAssessment: raw.qualityAssessment || raw.quality_assessment || {},
        citations: result.citations,
      });
      return clone(result);
    } catch (error) {
      console.warn(`[SuperRAG TrainingService] backend unavailable, using mock: ${error.message || error}`);
      const base = getMock().mockTrainingResult || {};
      const citations = resolveCitations(base.citations);
      return clone(
        mapWorkflowTrainingResultToTrainingResult({
          ...base,
          query: payload.query || "请解释项目背景",
          topic: payload.topic || base.topic || "项目背景",
          project: payload.project || base.project || "企业知识库",
          citations,
        }),
      );
    }
  }

  function mapWorkflowTrainingResultToTrainingResult(raw = {}) {
    return {
      id: raw.id || `training-${Date.now()}`,
      title: raw.title || "培训材料",
      query: raw.query || "",
      topic: raw.topic || "项目背景",
      project: raw.project || "企业知识库",
      summary: raw.summary || raw.conclusion || "",
      background: raw.background || raw.backgroundSummary || raw.summary || raw.conclusion || "",
      terms: raw.terms || raw.termExplanations || [],
      learningPath: raw.learningPath || raw.learning_path || raw.path || [],
      recommendedDocs: raw.recommendedDocs || raw.recommended_docs || raw.documents || [],
      citations: (raw.citations || []).map(mapCitationToEvidence),
    };
  }

  function mapSceneResultToTrainingResult(raw = {}, payload = {}) {
    const citations = (raw.citations || []).map(mapCitationToEvidence);
    const evidence = raw.evidence || [];
    const actions = raw.nextActions || [];
    const summary = raw.summary || "";
    return {
      id: raw.id || `training-${Date.now()}`,
      title: raw.title || "培训材料",
      query: payload.query || "",
      topic: payload.topic || "项目背景",
      project: raw.collection?.name || payload.project || "",
      summary,
      background: summary,
      terms: evidence.slice(0, 4).map((item, index) => ({
        term: `知识点 ${index + 1}`,
        explanation: item,
      })),
      learningPath: actions.slice(0, 5).map((item, index) => ({
        day: `步骤 ${index + 1}`,
        title: item,
        description: item,
      })),
      recommendedDocs: citations.slice(0, 4).map((citation) => ({
        title: citation.documentTitle,
        reason: citation.snippet,
        priority: "high",
        estimatedReadTime: "5 min",
      })),
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

  window.trainingService = {
    getTrainingOptions,
    generateTrainingResult,
    mapWorkflowTrainingResultToTrainingResult,
    mapCitationToEvidence,
  };

  window.trainingApi = window.trainingService;
})();
