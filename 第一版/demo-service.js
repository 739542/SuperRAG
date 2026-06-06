/**
 * Demo center service.
 * Aggregates backend readiness data for the defense/demo walkthrough page.
 */
(function () {
  function clone(value) {
    return structuredClone(value);
  }

  function getBackend() {
    return window.SuperRagBackend;
  }

  async function getDemoCenter() {
    try {
      const data = await getBackend().requestJson("/demo-center", {
        timeoutMs: window.SuperRagConfig?.DOCUMENT_API_TIMEOUT_MS || 60000,
      });
      return clone(normalizeDemoCenter(data));
    } catch (error) {
      console.warn(`[SuperRAG DemoService] backend demo center unavailable: ${error.message || error}`);
      return clone(buildOfflineDemoCenter(error));
    }
  }

  function normalizeDemoCenter(raw = {}) {
    return {
      title: raw.title || "SuperRAG 答辩演示中心",
      subtitle: raw.subtitle || "从文档入库到结构化产物复核的可解释 RAG 闭环",
      summary: {
        documentCount: Number(raw.summary?.documentCount ?? 0),
        chunkCount: Number(raw.summary?.chunkCount ?? 0),
        charCount: Number(raw.summary?.charCount ?? 0),
        artifactCount: Number(raw.summary?.artifactCount ?? 0),
        citationCount: Number(raw.summary?.citationCount ?? 0),
        knowledgeGapCount: Number(raw.summary?.knowledgeGapCount ?? 0),
        readyCount: Number(raw.summary?.readyCount ?? 0),
        checkCount: Number(raw.summary?.checkCount ?? 0),
      },
      documentCoverage: normalizeList(raw.documentCoverage),
      artifactSummary: {
        sceneCounts: raw.artifactSummary?.sceneCounts || {},
        reviewCounts: raw.artifactSummary?.reviewCounts || {},
        recentArtifacts: normalizeList(raw.artifactSummary?.recentArtifacts),
      },
      knowledgeGapSummary: raw.knowledgeGapSummary || {},
      topKnowledgeGaps: normalizeList(raw.topKnowledgeGaps),
      readinessChecks: normalizeList(raw.readinessChecks),
      flowSteps: normalizeList(raw.flowSteps),
      recommendedQuestions: normalizeList(raw.recommendedQuestions),
      talkingPoints: normalizeList(raw.talkingPoints),
    };
  }

  function buildOfflineDemoCenter(error) {
    const history = getBackend()?.getHistoryRecords?.() || [];
    const sceneCounts = {
      general: history.filter((item) => item.sceneMode === "chat").length,
      training: history.filter((item) => item.sceneMode === "training").length,
      handover: history.filter((item) => item.sceneMode === "handover").length,
      design: history.filter((item) => item.sceneMode === "design").length,
    };

    return normalizeDemoCenter({
      title: "SuperRAG 答辩演示中心",
      subtitle: `后端服务当前不可用，页面仅展示已落盘的真实历史产物：${error.message || error}`,
      summary: {
        documentCount: 0,
        chunkCount: 0,
        charCount: 0,
        artifactCount: history.length,
        citationCount: history.reduce((total, item) => total + (item.citations?.length || 0), 0),
        knowledgeGapCount: 0,
        readyCount: history.length ? 1 : 0,
        checkCount: 2,
      },
      documentCoverage: [],
      artifactSummary: {
        sceneCounts,
        reviewCounts: {},
        recentArtifacts: history.slice(0, 6),
      },
      knowledgeGapSummary: {},
      topKnowledgeGaps: [],
      readinessChecks: [
        {
          id: "backend",
          label: "后端状态",
          status: "warning",
          route: "#/settings",
          description: `当前无法从 /api/demo-center 读取现场数据：${error.message || error}`,
        },
        {
          id: "history",
          label: "历史产物缓存",
          status: history.length ? "ready" : "pending",
          route: "#/history",
          description: history.length ? `本地仍保留 ${history.length} 条真实运行产物记录。` : "当前没有可展示的真实历史产物。",
        },
      ],
      flowSteps: [],
      recommendedQuestions: [],
      talkingPoints: [],
    });
  }

  function normalizeList(value) {
    return Array.isArray(value) ? value.filter(Boolean) : [];
  }

  window.demoCenterService = {
    getDemoCenter,
  };
})();
