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
      console.warn(`[SuperRAG DemoService] backend demo center fallback: ${error.message || error}`);
      return clone(buildFallbackDemoCenter(error));
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

  function buildFallbackDemoCenter(error) {
    const history = getBackend()?.getHistoryRecords?.() || [];
    const designCount = history.filter((item) => item.sceneMode === "design").length;
    const handoverCount = history.filter((item) => item.sceneMode === "handover").length;
    const citationCount = history.reduce((total, item) => total + (item.citations?.length || 0), 0);
    return normalizeDemoCenter({
      title: "SuperRAG 答辩演示中心",
      subtitle: `后端暂不可用，当前使用前端历史产物兜底：${error.message || error}`,
      summary: {
        documentCount: 0,
        chunkCount: 0,
        charCount: 0,
        artifactCount: history.length,
        citationCount,
        knowledgeGapCount: 0,
        readyCount: designCount || handoverCount ? 2 : 0,
        checkCount: 7,
      },
      documentCoverage: fallbackDocuments().map((item) => ({ ...item, status: "待连接后端", matchedDocument: null })),
      artifactSummary: {
        sceneCounts: {
          general: history.filter((item) => item.sceneMode === "chat").length,
          training: history.filter((item) => item.sceneMode === "training").length,
          handover: handoverCount,
          design: designCount,
        },
        reviewCounts: {},
        recentArtifacts: history.slice(0, 6),
      },
      readinessChecks: fallbackChecks(designCount, handoverCount, citationCount),
      flowSteps: fallbackFlowSteps(),
      recommendedQuestions: fallbackQuestions(),
      talkingPoints: fallbackTalkingPoints(),
    });
  }

  function fallbackDocuments() {
    return [
      ["01_CRM客户管理模块说明.md", "客户管理", "支撑客户对象、负责人权限、重复客户和公海规则分析。"],
      ["02_CRM商机管理模块说明.md", "商机管理", "支撑商机阶段流转、赢单转合同和销售过程风险分析。"],
      ["03_CRM合同管理模块说明.md", "合同管理", "支撑合同金额联动、合同状态和删除约束设计。"],
      ["04_CRM回款管理模块说明.md", "回款管理", "支撑回款计划、回款记录和合同回款一致性分析。"],
      ["05_CRM发票管理模块说明.md", "发票管理", "支撑发票金额限制、开票流程和异常场景分析。"],
    ].map(([title, module, purpose], index) => ({
      id: `fallback-doc-${index + 1}`,
      title,
      module,
      purpose,
      keywords: [],
    }));
  }

  function fallbackChecks(designCount, handoverCount, citationCount) {
    return [
      { id: "documents", label: "CRM 演示文档已入库", status: "warning", route: "#/documents", description: "后端不可用，暂无法读取文档入库状态。" },
      { id: "chunks", label: "RAG 切片可见", status: "warning", route: "#/documents", description: "后端不可用，暂无法读取 chunk 状态。" },
      { id: "design", label: "设计辅助产物已生成", status: designCount ? "ready" : "pending", route: "#/design-assistant", description: `前端历史中已有 ${designCount} 个设计产物。` },
      { id: "handover", label: "交接清单已生成", status: handoverCount ? "ready" : "pending", route: "#/handover", description: `前端历史中已有 ${handoverCount} 个交接产物。` },
      { id: "citations", label: "引用证据可追踪", status: citationCount ? "ready" : "warning", route: "#/history", description: `前端历史中累计 ${citationCount} 条引用证据。` },
      { id: "gaps", label: "知识缺口可解释", status: "pending", route: "#/knowledge-gaps", description: "连接后端后可聚合知识缺口。" },
      { id: "review", label: "产物复核流程可演示", status: "ready", route: "#/history", description: "历史产物页面支持复核状态和版本记录。" },
    ];
  }

  function fallbackFlowSteps() {
    return [
      { step: "01", title: "上传 CRM 演示文档", description: "导入五份 CRM markdown 文档。", route: "#/documents", status: "warning" },
      { step: "02", title: "查看 RAG 入库与切片", description: "在文档详情中展示 chunk 和质量检查。", route: "#/documents", status: "warning" },
      { step: "03", title: "生成需求设计产物", description: "进入设计辅助生成结构化产物。", route: "#/design-assistant", status: "pending" },
      { step: "04", title: "生成项目交接清单", description: "进入交接模式生成可执行待办。", route: "#/handover", status: "pending" },
      { step: "05", title: "解释证据与知识缺口", description: "进入知识缺口页面查看低证据项。", route: "#/knowledge-gaps", status: "pending" },
      { step: "06", title: "复核并沉淀历史产物", description: "在历史产物页面标记复核状态。", route: "#/history", status: "ready" },
    ];
  }

  function fallbackQuestions() {
    return [
      { scene: "design", route: "#/design-assistant", question: "请基于 CRM 文档，为客户管理模块生成详细文本用例、业务规则和风险清单", expectedOutput: "业务对象、业务规则、文本用例、模块建议、追踪矩阵。" },
      { scene: "handover", route: "#/handover", question: "请生成 CRM 项目接手者第一周待办清单，并指出缺失资料", expectedOutput: "待办清单、风险登记、依赖文档、信息缺口。" },
      { scene: "chat", route: "#/chat", question: "客户负责人和团队成员的权限边界是什么？", expectedOutput: "结论、依据、引用证据和补充资料建议。" },
    ];
  }

  function fallbackTalkingPoints() {
    return [
      "SuperRAG 的定位是面向软件研发团队的知识交接与需求设计辅助系统。",
      "系统展示文档入库、RAG 检索、结构化生成、证据追踪、知识缺口和历史产物复核闭环。",
      "答辩时优先演示设计辅助和交接模式，再展示知识缺口与历史产物复核。",
    ];
  }

  function normalizeList(value) {
    return Array.isArray(value) ? value.filter(Boolean) : [];
  }

  window.demoCenterService = {
    getDemoCenter,
  };
})();
