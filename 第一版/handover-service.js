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
      completedItems: raw.completedItems || raw.completed_items || raw.completedFeatures || raw.completed_features || [],
      completedFeatures: raw.completedFeatures || raw.completed_features || raw.completedItems || raw.completed_items || [],
      unfinishedItems: raw.unfinishedItems || raw.unfinished_items || [],
      todoList: (raw.todoList || raw.todo_list || raw.todos || []).map(mapTodoItem),
      todos: (raw.todos || raw.todoList || raw.todo_list || []).map(mapTodoItem),
      riskRegister: raw.riskRegister || raw.risk_register || raw.risks || [],
      risks: raw.risks || raw.riskRegister || raw.risk_register || [],
      responsibilityBoundary: raw.responsibilityBoundary || raw.responsibility_boundary || raw.roles || raw.relatedRoles || raw.related_roles || [],
      roles: raw.roles || raw.responsibilityBoundary || raw.responsibility_boundary || raw.relatedRoles || raw.related_roles || [],
      dependentDocuments: raw.dependentDocuments || raw.dependent_documents || raw.dependentDocs || raw.dependent_docs || raw.documents || [],
      dependentDocs: raw.dependentDocs || raw.dependent_docs || raw.dependentDocuments || raw.dependent_documents || raw.documents || [],
      informationGaps: raw.informationGaps || raw.information_gaps || [],
      handoverChecklist: raw.handoverChecklist || raw.handover_checklist || [],
      evidenceMap: raw.evidenceMap || raw.evidence_map || [],
      citations: (raw.citations || []).map(mapCitationToEvidence),
      source: raw.source || "",
      structuredSource: raw.structuredSource || raw.structured_source || raw.source || "",
      generationMode: raw.generationMode || raw.generation_mode || inferGenerationMode(raw.source),
      pipelineVersion: raw.pipelineVersion || raw.pipeline_version || "",
      fallbackNotice: raw.fallbackNotice || raw.fallback_notice || "",
      technicalWarnings: asList(raw.technicalWarnings || raw.technical_warnings),
      evidenceLevel: raw.evidenceLevel || raw.evidence_level || "",
      qualityAssessment: raw.qualityAssessment || raw.quality_assessment || {},
    };
  }

  function mapSceneResultToHandoverResult(raw = {}, payload = {}) {
    const citations = (raw.citations || []).map(mapCitationToEvidence);
    const risks = raw.risks || raw.riskRegister || raw.risk_register || [];
    const todos = (raw.todos || raw.todoList || raw.todo_list || []).map(mapTodoItem);
    const completedItems = raw.completedItems || raw.completed_items || raw.completedFeatures || raw.completed_features || [];
    const dependentDocs = raw.dependentDocs || raw.dependent_docs || raw.dependentDocuments || raw.dependent_documents || [];
    const roles = raw.roles || raw.responsibilityBoundary || raw.responsibility_boundary || [];
    return {
      id: raw.id || `handover-${Date.now()}`,
      title: raw.title || "交接摘要",
      query: payload.query || "",
      project: raw.collection?.name || payload.project || "",
      scope: payload.scope || "功能模块",
      projectBackground: raw.projectBackground || raw.project_background || raw.summary || "",
      currentProgress: raw.currentProgress || raw.current_progress || raw.summary || "",
      completedItems,
      completedFeatures: completedItems.length ? completedItems : (raw.evidence || []).slice(0, 4),
      unfinishedItems: raw.unfinishedItems || raw.unfinished_items || risks,
      todoList: todos,
      todos: todos.length ? todos : (raw.nextActions || []).map((action, index) => ({
        taskName: action,
        priority: index === 0 ? "high" : "medium",
        riskLevel: risks[index]?.risk || risks[index]?.description || risks[index] || "medium",
        owner: "项目成员",
        suggestedOwner: "项目成员",
        dependentDocument: citations[index]?.documentTitle || "",
        evidenceSource: citations[index]?.documentTitle || "",
        dueDate: "",
        status: "pending",
      })),
      riskRegister: risks,
      risks: risks.map((risk) => ({
        type: risk.type || "风险",
        description: risk.description || risk.risk || risk,
        impact: risk.impact || risk.description || risk.risk || risk,
        suggestion: risk.suggestion || "补充文档或人工确认。",
        evidenceSource: risk.evidenceSource || risk.evidence_source || risk.sourceDocument || risk.source_document || raw.source || "Dify Lite",
        sourceDocument: risk.sourceDocument || risk.source_document || risk.evidenceSource || risk.evidence_source || raw.source || "Dify Lite",
        evidenceSnippet: risk.evidenceSnippet || risk.evidence_snippet || "",
      })),
      responsibilityBoundary: roles,
      roles: roles.length ? roles : [{ role: "交接负责人", responsibility: "核对摘要、任务和风险项。" }],
      dependentDocuments: dependentDocs,
      dependentDocs: dependentDocs.length ? dependentDocs : citations.map((citation) => citation.documentTitle),
      informationGaps: raw.informationGaps || raw.information_gaps || [],
      handoverChecklist: raw.handoverChecklist || raw.handover_checklist || [],
      evidenceMap: raw.evidenceMap || raw.evidence_map || [],
      citations,
      source: raw.source || "",
      structuredSource: raw.structuredSource || raw.structured_source || raw.source || "",
      generationMode: raw.generationMode || raw.generation_mode || inferGenerationMode(raw.source),
      pipelineVersion: raw.pipelineVersion || raw.pipeline_version || "",
      fallbackNotice: raw.fallbackNotice || raw.fallback_notice || "",
      technicalWarnings: asList(raw.technicalWarnings || raw.technical_warnings),
      evidenceLevel: raw.evidenceLevel || raw.evidence_level || "",
      qualityAssessment: raw.qualityAssessment || raw.quality_assessment || {},
    };
  }

  function mapTodoItem(raw = {}) {
    return {
      taskName: raw.taskName || raw.task_name || raw.task || "待办事项",
      priority: raw.priority || "medium",
      riskLevel: raw.riskLevel || raw.risk_level || "medium",
      owner: raw.owner || raw.suggestedOwner || raw.suggested_owner || "待确认角色",
      suggestedOwner: raw.suggestedOwner || raw.suggested_owner || raw.owner || "待确认角色",
      dependentDocument: raw.dependentDocument || raw.dependent_document || raw.evidenceSource || raw.evidence_source || "",
      evidenceSource: raw.evidenceSource || raw.evidence_source || raw.dependentDocument || raw.dependent_document || "",
      dueDate: raw.dueDate || raw.due_date || "",
      status: raw.status || "pending",
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

  function asList(value) {
    if (Array.isArray(value)) {
      return value.filter((item) => item !== null && item !== undefined && String(item).trim());
    }
    if (value === null || value === undefined || String(value).trim() === "") {
      return [];
    }
    return [value];
  }

  function inferGenerationMode(source) {
    const value = String(source || "").toLowerCase();
    if (value.includes("mock")) {
      return "mock-fallback";
    }
    if (value.includes("retrieval")) {
      return "retrieval-fallback";
    }
    if (value.includes("json")) {
      return "json-repaired-model";
    }
    if (value) {
      return "model";
    }
    return "unknown";
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
