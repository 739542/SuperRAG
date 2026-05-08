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
    const citations = clone((mock.mockCitations || []).slice(0, 3));

    return Promise.resolve({
      id: `answer-${Date.now()}`,
      sessionId: "mock-session",
      role: "assistant",
      content: `围绕“${normalizedQuestion}”，SuperRAG 会先检索企业知识库，再输出结论、依据、风险和后续动作。当前为 mock 返回，后续可在 api.js 中替换为真实问答接口。`,
      createdAt: nowText(),
      citations: citations.map((citation) => citation.id),
      citationItems: citations,
      evidence: [
        "已从企业知识库中找到相关文档片段。",
        "回答结构保留引用证据，便于后续追溯。",
      ],
      risks: ["当前为 mock 结果，不能代表真实 Dify 召回质量。"],
      nextActions: ["接入真实问答 API 后替换 generateMockAnswer 的内部实现。"],
    });
  }

  function generateMockDesignOutput(input) {
    const payload = typeof input === "object" && input ? input : { inputQuestion: String(input || "") };
    const inputQuestion = payload.inputQuestion || payload.question || "生成一个设计辅助初稿";
    const citations = clone((mock.mockCitations || []).filter((item) => ["cit-001", "cit-002", "cit-005"].includes(item.id)));

    return Promise.resolve({
      id: `design-${Date.now()}`,
      title: payload.title || "设计辅助 mock 初稿",
      inputQuestion,
      project: payload.project || "SuperRAG 企业软件工程知识助手",
      outputType: payload.outputType || "module-design",
      createdAt: nowText(),
      evidenceLevel: "medium",
      functionList: [
        "文档上传与入库状态展示",
        "基于知识库的智能问答",
        "结构化设计产物生成",
        "引用证据追溯",
      ],
      useCases: [
        "用户输入设计目标，系统检索相关文档并输出功能清单。",
        "用户查看引用片段，判断设计建议是否有充分证据。",
      ],
      moduleSuggestions: ["DocumentPanel", "AnswerCard", "DesignOutputTabs", "CitationPanel"],
      risks: ["当前设计结果来自 mock 数据，真实证据强度需要由 Dify 检索结果确认。"],
      nextActions: ["补充真实 Workflow 输出字段映射。", "为设计产物增加保存和历史记录能力。"],
      citations: citations.map((citation) => citation.id),
      citationItems: citations,
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
