/**
 * SuperRAG API placeholder layer.
 *
 * All functions return mock data now. When a real backend is ready, keep the
 * function names and returned field shapes stable, then replace internals here.
 */
(function () {
  const mock = window.SuperRagMock || {};
  let documents = clone(mock.mockDocuments || []);

  function clone(value) {
    return structuredClone(value);
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

  function getDashboardStats() {
    return Promise.resolve(clone(mock.mockStats));
  }

  function getDocuments() {
    return Promise.resolve(clone(documents));
  }

  function getSessions() {
    return Promise.resolve(clone(mock.mockSessions || []));
  }

  function getChatMessages(sessionId) {
    const messages = (mock.mockMessages || []).filter((message) => message.sessionId === sessionId);
    return Promise.resolve(clone(messages));
  }

  function getCitations(messageId) {
    const message = (mock.mockMessages || []).find((item) => item.id === messageId);
    const citationIds = new Set(message?.citations || []);
    const citations = (mock.mockCitations || []).filter((citation) => citationIds.has(citation.id));
    return Promise.resolve(clone(citations));
  }

  function getDesignOutputs() {
    return Promise.resolve(clone(mock.mockDesignOutputs || []));
  }

  function getWorkflows() {
    return Promise.resolve(clone(mock.mockWorkflows || []));
  }

  function createDocument(documentPayload) {
    const documentItem = {
      id: `doc-${Date.now()}`,
      title: documentPayload.title || "未命名文档",
      type: documentPayload.type || "Word",
      project: documentPayload.project || "企业知识库",
      tags: documentPayload.tags || [],
      uploader: documentPayload.uploader || "胡俊熙",
      version: documentPayload.version || "v1.0",
      status: documentPayload.status || "indexing",
      visibilityScope: documentPayload.visibilityScope || "项目成员",
      updatedAt: nowText(),
      summary: documentPayload.summary || "该文档由前端 mock 上传进入解析队列，等待后续接入真实上传和 Dify 入库流程。",
      keywords: documentPayload.keywords || ["待解析", "mock 上传"],
      difyDatasetId: documentPayload.difyDatasetId || "ds_pending_mapping",
      difyDocumentId: documentPayload.difyDocumentId || "",
    };

    documents = [documentItem, ...documents];
    return Promise.resolve(clone(documentItem));
  }

  function updateDocument(documentId, patch) {
    documents = documents.map((documentItem) =>
      documentItem.id === documentId
        ? {
            ...documentItem,
            ...patch,
            updatedAt: patch.updatedAt || nowText(),
          }
        : documentItem,
    );
    return Promise.resolve(clone(documents.find((documentItem) => documentItem.id === documentId)));
  }

  function deleteDocument(documentId) {
    documents = documents.filter((documentItem) => documentItem.id !== documentId);
    return Promise.resolve({ success: true, id: documentId });
  }

  function generateMockAnswer(question) {
    const normalizedQuestion = String(question || "").trim() || "当前问题";
    const isLowEvidenceQuestion = /权限|管理员|安全|证据不足|没有资料|未覆盖|未知/.test(normalizedQuestion);
    const isStrongEvidenceQuestion = /入库|流程|新人|文档|核心模块|主要解决/.test(normalizedQuestion);
    const citationSource = clone(mock.mockCitations || []);
    const citations = isLowEvidenceQuestion
      ? citationSource
          .filter((citation) => citation.id === "cit-004")
          .map((citation) => ({
            ...citation,
            relevanceScore: 0.48,
            snippet: "当前资料仅提到不同角色拥有不同可见范围，缺少完整的权限控制、管理员操作和安全审计设计。",
          }))
      : citationSource.slice(0, 3);
    const evidenceLevel = isLowEvidenceQuestion ? "low" : isStrongEvidenceQuestion ? "high" : "medium";
    const structuredAnswer = isLowEvidenceQuestion
      ? {
          conclusion: "当前知识库只能支持权限相关问题的初步判断，暂不适合作为正式设计结论。",
          evidence: "已有资料只覆盖角色和可见范围，缺少管理员权限、接口鉴权和审计日志等关键证据。",
          suggestion: "建议补充管理员权限设计文档、接口鉴权说明和安全审计规则后，再生成正式方案。",
          uncertainty: "证据不足主要集中在权限边界、异常授权和操作留痕，当前回答需要人工复核。",
        }
      : {
          conclusion: `根据当前知识库，“${normalizedQuestion}”应从文档入库、知识检索、场景化输出和引用追溯四个环节理解。`,
          evidence: "相关资料显示，系统强调企业私有知识库、RAG 检索、培训/交接/设计辅助以及回答证据追溯。",
          suggestion: "优先围绕高频业务问题组织知识库，回答时同步展示引用片段、相关度和后续补充建议。",
          uncertainty: "如果问题涉及尚未入库的模块细节，仍需要补充对应需求、接口或交接文档。",
        };

    return Promise.resolve({
      id: `answer-${Date.now()}`,
      sessionId: "mock-session",
      role: "assistant",
      content: structuredAnswer.conclusion,
      createdAt: nowText(),
      evidenceLevel,
      structuredAnswer,
      citations: citations.map((citation) => citation.id),
      citationItems: citations,
      evidence: [
        structuredAnswer.evidence,
        "回答结构保留引用证据，便于后续追溯。",
      ],
      risks: [structuredAnswer.uncertainty],
      nextActions: [structuredAnswer.suggestion],
    });
  }

  function generateMockDesignOutput(input) {
    const payload = typeof input === "object" && input ? input : { inputQuestion: String(input || "") };
    const inputQuestion = payload.inputQuestion || payload.question || "生成一个设计辅助初稿";
    const isLowEvidenceQuestion = /权限|安全|审计|证据不足|未覆盖|未知|管理员/.test(inputQuestion);
    const baseOutputs = clone(mock.mockDesignOutputs || []);
    const output = baseOutputs.find((item) => (isLowEvidenceQuestion ? item.evidenceLevel === "low" : item.evidenceLevel !== "low")) || baseOutputs[0] || {};
    const citationIds = output.citations || [];
    const citations = clone((mock.mockCitations || []).filter((item) => citationIds.includes(item.id))).map((citation) => {
      if (!isLowEvidenceQuestion) {
        return citation;
      }
      return {
        ...citation,
        relevanceScore: Math.min(Number(citation.relevanceScore || 0.48), 0.52),
        snippet: citation.id === "cit-004"
          ? "当前资料仅提到不同角色拥有不同可见范围，缺少完整管理员权限、鉴权接口和审计日志说明。"
          : citation.snippet,
      };
    });

    return Promise.resolve({
      ...output,
      id: `design-${Date.now()}`,
      title: payload.title || (isLowEvidenceQuestion ? "低证据设计初稿" : "设计辅助结构化初稿"),
      inputQuestion,
      project: payload.project || output.project || "企业知识助手系统",
      outputType: payload.outputType || output.outputType || "详细文本用例",
      outputTypeLabel: payload.outputType || output.outputTypeLabel || output.outputType || "详细文本用例",
      granularity: payload.granularity || output.granularity || "标准",
      createdAt: nowText(),
      evidenceLevel: isLowEvidenceQuestion ? "low" : output.evidenceLevel || "high",
      citations: citations.map((citation) => citation.id),
      citationItems: citations,
      qualityChecks: isLowEvidenceQuestion
        ? {
            hasUncitedContent: true,
            hasRequirementGap: true,
            requiresHumanReview: true,
            readyForReview: false,
          }
        : output.qualityChecks,
    });
  }

  window.SuperRagApi = {
    getDashboardStats,
    getDocuments,
    getSessions,
    getChatMessages,
    getCitations,
    getDesignOutputs,
    getWorkflows,
    createDocument,
    updateDocument,
    deleteDocument,
    generateMockAnswer,
    generateMockDesignOutput,
  };
})();
