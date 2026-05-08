/**
 * Design service and adapter layer.
 *
 * The design assistant page calls window.designService only. It currently
 * returns mock structured design outputs. Future backend Workflow integration
 * should be adapted here, keeping citations and evidenceLevel stable.
 */
(function () {
  function clone(value) {
    return structuredClone(value);
  }

  function getMock() {
    return window.SuperRagMock || {};
  }

  function getApi() {
    if (!window.SuperRagApi) {
      throw new Error("SuperRagApi is not loaded");
    }
    return window.SuperRagApi;
  }

  async function getDesignOptions() {
    const documents = getMock().mockDocuments || [];
    return {
      outputTypes: ["功能清单", "详细文本用例", "模块划分建议", "接口设计建议", "风险分析", "答辩说明稿"],
      projects: [
        "企业知识助手系统",
        "新人培训平台",
        "任务交接管理模块",
        "需求设计辅助模块",
        ...uniqueValues(documents.map((item) => item.project)),
      ].filter((value, index, list) => list.indexOf(value) === index),
      granularities: ["简要", "标准", "详细"],
    };
  }

  async function getDesignOutputs() {
    const outputs = await getApi().getDesignOutputs();
    return clone(outputs.map(mapWorkflowDesignOutputToDesignOutput));
  }

  async function generateDesignOutput(payload = {}) {
    const raw = await getApi().generateMockDesignOutput(payload);
    return clone(mapWorkflowDesignOutputToDesignOutput(raw));
  }

  function mapWorkflowDesignOutputToDesignOutput(raw = {}) {
    const rawCitations = raw.citationItems || raw.citationsDetail || raw.citations || [];
    const citationItems = rawCitations.some((item) => typeof item === "object")
      ? rawCitations
      : resolveCitations(rawCitations);
    const functionList = raw.functionList || raw.function_list || raw.functions || [];
    const useCases = raw.useCases || raw.use_cases || raw.textUseCases || raw.text_use_cases || [];
    const moduleSuggestions = raw.moduleSuggestions || raw.module_suggestions || raw.modules || [];
    const risks = raw.risks || raw.riskItems || raw.risk_items || [];
    const nextActions = raw.nextActions || raw.next_actions || raw.actions || [];

    return {
      id: raw.id || `design-${Date.now()}`,
      title: raw.title || "设计辅助初稿",
      inputQuestion: raw.inputQuestion || raw.input_question || raw.query || "",
      project: raw.project || raw.projectName || raw.project_name || "企业知识助手系统",
      outputType: raw.outputType || raw.output_type || "详细文本用例",
      outputTypeLabel: raw.outputTypeLabel || raw.output_type_label || raw.outputType || raw.output_type || "详细文本用例",
      granularity: raw.granularity || "标准",
      createdAt: raw.createdAt || raw.created_at || nowText(),
      evidenceLevel: mapEvidenceLevel(raw.evidenceLevel || raw.evidence_level || inferEvidenceLevel(citationItems)),
      functionList: functionList.map(mapFunctionItem),
      useCases: useCases.map(mapUseCaseItem),
      moduleSuggestions: moduleSuggestions.map(mapModuleItem),
      risks: risks.map(mapRiskItem),
      nextActions: nextActions.map(mapNextActionItem),
      citations: citationItems.map(mapCitationToEvidence),
      qualityChecks: mapQualityChecks(raw.qualityChecks || raw.quality_checks || {}, raw.evidenceLevel || raw.evidence_level),
    };
  }

  function mapFunctionItem(raw = {}, index) {
    if (typeof raw === "string") {
      return {
        id: `F-${String(index + 1).padStart(3, "0")}`,
        name: raw,
        description: "由 mock 字符串功能项转换，后端接入后建议返回结构化描述。",
        priority: index < 2 ? "高" : "中",
        relatedDocument: "需求分析说明书.pdf",
      };
    }

    return {
      id: raw.id || raw.functionId || raw.function_id || `F-${String(index + 1).padStart(3, "0")}`,
      name: raw.name || raw.functionName || raw.function_name || "未命名功能",
      description: raw.description || raw.desc || raw.detail || "待补充功能描述。",
      priority: raw.priority || "中",
      relatedDocument: raw.relatedDocument || raw.related_document || raw.documentTitle || raw.document_title || "待关联文档",
    };
  }

  function mapUseCaseItem(raw = {}, index) {
    if (typeof raw === "string") {
      return {
        id: `UC-${String(index + 1).padStart(3, "0")}`,
        name: raw,
        actor: "项目成员",
        preconditions: ["相关文档已入库", "用户已进入设计辅助页"],
        mainSuccessScenario: ["输入设计目标", "系统检索企业知识库", "系统返回结构化设计建议"],
        extensionScenarios: ["用户切换输出粒度后重新生成"],
        exceptionScenarios: ["证据不足时提示补充文档"],
        postconditions: "生成结果可复制、导出或保存到历史记录。",
      };
    }

    return {
      id: raw.id || raw.useCaseId || raw.use_case_id || `UC-${String(index + 1).padStart(3, "0")}`,
      name: raw.name || raw.useCaseName || raw.use_case_name || "未命名用例",
      actor: raw.actor || raw.participant || "项目成员",
      preconditions: raw.preconditions || raw.precondition || [],
      mainSuccessScenario: raw.mainSuccessScenario || raw.main_success_scenario || raw.mainFlow || raw.main_flow || [],
      extensionScenarios: raw.extensionScenarios || raw.extension_scenarios || raw.extensions || [],
      exceptionScenarios: raw.exceptionScenarios || raw.exception_scenarios || raw.exceptions || [],
      postconditions: raw.postconditions || raw.postcondition || "待补充",
    };
  }

  function mapModuleItem(raw = {}, index) {
    if (typeof raw === "string") {
      return {
        name: raw,
        responsibility: "由 mock 字符串模块项转换，后端接入后建议返回模块职责、输入输出和依赖关系。",
        input: ["设计目标", "引用文档"],
        output: ["模块建议"],
        dependencies: ["文档管理", "引用证据面板"],
      };
    }

    return {
      name: raw.name || raw.moduleName || raw.module_name || `模块 ${index + 1}`,
      responsibility: raw.responsibility || raw.description || "待补充模块职责。",
      input: raw.input || raw.inputs || [],
      output: raw.output || raw.outputs || [],
      dependencies: raw.dependencies || raw.dependency || [],
    };
  }

  function mapRiskItem(raw = {}, index) {
    if (typeof raw === "string") {
      return {
        description: raw,
        impact: "影响设计结论的可信度和评审通过率。",
        supplement: "补充需求文档或接口说明。",
        confidence: index === 0 ? "中" : "低",
        needsReview: true,
      };
    }

    return {
      description: raw.description || raw.riskDescription || raw.risk_description || "待确认风险",
      impact: raw.impact || raw.scope || "待确认影响范围",
      supplement: raw.supplement || raw.suggestedMaterial || raw.suggested_material || raw.suggestion || "补充相关文档",
      confidence: raw.confidence || "中",
      needsReview: Boolean(raw.needsReview ?? raw.needs_review ?? true),
    };
  }

  function mapNextActionItem(raw = {}, index) {
    if (typeof raw === "string") {
      return {
        action: raw,
        priority: index === 0 ? "高" : "中",
        owner: "前端负责人",
        dependentDocument: "需求分析说明书.pdf",
        doneDefinition: "完成后能进入人工评审。",
      };
    }

    return {
      action: raw.action || raw.title || "待办动作",
      priority: raw.priority || "中",
      owner: raw.owner || raw.suggestedOwner || raw.suggested_owner || "项目成员",
      dependentDocument: raw.dependentDocument || raw.dependent_document || raw.documentTitle || raw.document_title || "待关联文档",
      doneDefinition: raw.doneDefinition || raw.done_definition || raw.acceptanceCriteria || raw.acceptance_criteria || "完成标准待补充",
    };
  }

  function mapQualityChecks(raw = {}, evidenceLevel) {
    const mappedEvidenceLevel = mapEvidenceLevel(evidenceLevel || raw.evidenceLevel || raw.evidence_level);
    return {
      hasUncitedContent: Boolean(raw.hasUncitedContent ?? raw.has_uncited_content ?? mappedEvidenceLevel === "low"),
      hasRequirementGap: Boolean(raw.hasRequirementGap ?? raw.has_requirement_gap ?? mappedEvidenceLevel !== "high"),
      requiresHumanReview: Boolean(raw.requiresHumanReview ?? raw.requires_human_review ?? mappedEvidenceLevel !== "high"),
      readyForReview: Boolean(raw.readyForReview ?? raw.ready_for_review ?? mappedEvidenceLevel === "high"),
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

  function mapEvidenceLevel(level) {
    const normalized = String(level || "").toLowerCase();
    if (["high", "sufficient", "充分"].includes(normalized)) {
      return "high";
    }
    if (["low", "insufficient", "不足"].includes(normalized)) {
      return "low";
    }
    return "medium";
  }

  function inferEvidenceLevel(citations = []) {
    if (!citations.length) {
      return "low";
    }
    const bestScore = Math.max(...citations.map((citation) => Number(citation.relevanceScore ?? citation.score ?? 0)));
    if (bestScore >= 0.88 && citations.length >= 3) {
      return "high";
    }
    if (bestScore >= 0.65) {
      return "medium";
    }
    return "low";
  }

  function uniqueValues(values) {
    return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, "zh-CN"));
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

  window.designService = {
    getDesignOptions,
    getDesignOutputs,
    generateDesignOutput,
    mapWorkflowDesignOutputToDesignOutput,
    mapCitationToEvidence,
    mapEvidenceLevel,
  };

  window.designApi = window.designService;
})();
