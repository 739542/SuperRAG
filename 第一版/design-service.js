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

  function getBackend() {
    return window.SuperRagBackend;
  }

  async function getDesignOptions() {
    const documents = await getDocumentsWithFallback();
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
    try {
      const raw = await getBackend().requestJson("/scenes/design", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        timeoutMs: window.SuperRagConfig?.CHAT_API_TIMEOUT_MS || 90000,
        body: JSON.stringify({
          query: payload.inputQuestion || payload.question,
          project: payload.project,
          module: payload.outputType,
          focus: payload.granularity,
          user: "course-demo-user",
        }),
      });
      const result = mapSceneResultToDesignOutput(raw, payload);
      getBackend().appendHistoryRecord({
        id: result.id,
        title: result.title,
        sceneMode: "design",
        project: result.project,
        summary: result.inputQuestion,
        originalQuestion: result.inputQuestion,
        outputSummary: result.functionList.map((item) => item.description).join("\n"),
        citations: result.citations,
      });
      return clone(result);
    } catch (error) {
      console.warn(`[SuperRAG DesignService] backend unavailable, using mock: ${error.message || error}`);
      const raw = await getApi().generateMockDesignOutput(payload);
      return clone(mapWorkflowDesignOutputToDesignOutput(raw));
    }
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

  function mapSceneResultToDesignOutput(raw = {}, payload = {}) {
    const citations = (raw.citations || []).map(mapCitationToEvidence);
    const evidenceLevel = inferEvidenceLevel(citations);
    const artifacts = raw.artifacts || [];
    const artifactItems = artifacts.flatMap((artifact) => artifact.items || [artifact.content].filter(Boolean));
    const evidence = raw.evidence || [];
    const actions = raw.nextActions || [];
    const risks = raw.risks || [];
    const backendFunctions = raw.functionList || raw.function_list || raw.functions || [];
    const backendUseCases = raw.useCases || raw.use_cases || raw.textUseCases || raw.text_use_cases || [];
    const backendModules = raw.moduleSuggestions || raw.module_suggestions || raw.modules || [];
    const hasStructuredDesign = backendFunctions.length || backendUseCases.length || backendModules.length;

    if (hasStructuredDesign) {
      return {
        id: raw.id || `design-${Date.now()}`,
        title: raw.title || "设计助手输出",
        inputQuestion: payload.inputQuestion || payload.question || "",
        project: raw.collection?.name || payload.project || "",
        outputType: payload.outputType || "设计输出",
        outputTypeLabel: payload.outputType || "设计输出",
        granularity: payload.granularity || "标准",
        createdAt: nowText(),
        evidenceLevel,
        functionList: backendFunctions.map(mapFunctionItem),
        useCases: backendUseCases.map(mapUseCaseItem),
        moduleSuggestions: backendModules.map(mapModuleItem),
        risks: risks.map(mapRiskItem),
        nextActions: actions.map(mapNextActionItem),
        citations,
        qualityChecks: mapQualityChecks({}, evidenceLevel),
      };
    }

    if (!hasBusinessDesignSignals(artifactItems, evidence)) {
      return buildInsufficientDesignOutput(raw, payload, citations, evidenceLevel, actions, risks);
    }

    return {
      id: raw.id || `design-${Date.now()}`,
      title: raw.title || "设计助手输出",
      inputQuestion: payload.inputQuestion || payload.question || "",
      project: raw.collection?.name || payload.project || "",
      outputType: payload.outputType || "设计输出",
      outputTypeLabel: payload.outputType || "设计输出",
      granularity: payload.granularity || "标准",
      createdAt: nowText(),
      evidenceLevel,
      functionList: (artifactItems.length ? artifactItems : evidence).slice(0, 8).map((item, index) => ({
        id: `F-${String(index + 1).padStart(3, "0")}`,
        name: String(item).slice(0, 28) || `功能 ${index + 1}`,
        description: String(item),
        priority: index < 2 ? "high" : "medium",
        relatedDocument: citations[index]?.documentTitle || raw.source || "Dify Lite",
      })),
      useCases: evidence.slice(0, 4).map((item, index) => ({
        id: `UC-${String(index + 1).padStart(3, "0")}`,
        name: `用例 ${index + 1}`,
        actor: "业务用户",
        preconditions: [item],
        mainSuccessScenario: [raw.summary || item],
        extensionScenarios: actions.slice(0, 2),
        exceptionScenarios: risks.slice(0, 2),
        postconditions: "输出可进入人工评审。",
      })),
      moduleSuggestions: artifacts.slice(0, 4).map((artifact, index) => ({
        name: artifact.title || `模块 ${index + 1}`,
        responsibility: (artifact.items || [artifact.content]).filter(Boolean).join("；"),
        input: [payload.inputQuestion || ""],
        output: artifact.items || [artifact.content].filter(Boolean),
        dependencies: citations.slice(0, 3).map((citation) => citation.documentTitle),
      })),
      risks: risks.map((risk) => ({
        description: risk,
        impact: risk,
        supplement: "补充资料或人工确认后再进入开发。",
        confidence: evidenceLevel,
        needsReview: evidenceLevel !== "high",
      })),
      nextActions: actions.map((action, index) => ({
        action,
        priority: index === 0 ? "high" : "medium",
        owner: "产品/研发",
        dependentDocument: citations[index]?.documentTitle || "",
        doneDefinition: "完成评审并补齐引用依据。",
      })),
      citations,
      qualityChecks: mapQualityChecks({}, evidenceLevel),
    };
  }

  function hasBusinessDesignSignals(items = [], evidence = []) {
    const text = [...items, ...evidence].join(" ");
    const positiveSignals = /(业务|用户|角色|流程|预约|访客|门禁|巡检|能耗|会议室|告警|审批|管理|登记|权限|工单|看板|通知|报表)/;
    const technicalNoise = /(磁盘|Docker|NVMe|SSD|向量|Reranker|LLM|chunk|Top-K|MinIO|Milvus|日志|端口|CPU|内存|部署|测试指标|成功率)/i;
    return positiveSignals.test(text) && !technicalNoise.test(text.slice(0, 260));
  }

  function buildInsufficientDesignOutput(raw = {}, payload = {}, citations = [], evidenceLevel = "low", actions = [], risks = []) {
    const goal = payload.inputQuestion || payload.question || "";
    return {
      id: raw.id || `design-${Date.now()}`,
      title: "设计信息不足",
      inputQuestion: goal,
      project: raw.collection?.name || payload.project || "",
      outputType: payload.outputType || "设计输出",
      outputTypeLabel: payload.outputType || "设计输出",
      granularity: payload.granularity || "标准",
      createdAt: nowText(),
      evidenceLevel: "low",
      functionList: [{
        id: "F-001",
        name: "待确认业务功能",
        description: `当前检索上下文主要是技术配置或部署信息，无法从“${goal}”稳定抽取业务功能。请补充需求说明、业务流程、角色权限或页面原型文档。`,
        priority: "medium",
        relatedDocument: citations[0]?.documentTitle || raw.source || "Dify Lite",
      }],
      useCases: [{
        id: "UC-001",
        name: "补充需求后生成用例",
        actor: "业务用户",
        preconditions: ["已补充明确的业务需求、用户角色和流程边界"],
        mainSuccessScenario: [raw.summary || "系统根据补充后的业务需求生成结构化用例。"],
        extensionScenarios: actions.slice(0, 2),
        exceptionScenarios: risks.slice(0, 2),
        postconditions: "设计结果可进入人工评审。",
      }],
      moduleSuggestions: [{
        name: "待确认模块",
        responsibility: "当前上下文不足以稳定划分业务模块，需要补充业务功能和系统边界。",
        input: [goal],
        output: ["结构化功能清单", "文本用例", "模块边界"],
        dependencies: citations.slice(0, 3).map((citation) => citation.documentTitle),
      }],
      risks: risks.map(mapRiskItem),
      nextActions: actions.map(mapNextActionItem),
      citations,
      qualityChecks: mapQualityChecks({}, evidenceLevel),
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

  async function getDocumentsWithFallback() {
    try {
      const response = await getBackend().requestJson("/documents");
      return Array.isArray(response.items) ? response.items : [];
    } catch (error) {
      return getMock().mockDocuments || [];
    }
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
