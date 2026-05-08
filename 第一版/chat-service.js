/**
 * Chat service and adapter layer.
 *
 * The intelligent QA page should call window.chatService only. It currently
 * returns mock data through SuperRagApi. When the real backend is ready,
 * replace internals here while preserving citations, evidenceLevel and
 * structuredAnswer in the returned shape.
 */
(function () {
  function clone(value) {
    return structuredClone(value);
  }

  function getApi() {
    if (!window.SuperRagApi) {
      throw new Error("SuperRagApi is not loaded");
    }
    return window.SuperRagApi;
  }

  async function getSessions(params = {}) {
    const sessions = await getApi().getSessions();
    const keyword = String(params.keyword || "").trim().toLowerCase();
    const list = sessions
      .filter((session) => {
        const haystack = [session.title, session.sceneMode].join(" ").toLowerCase();
        return !keyword || haystack.includes(keyword);
      })
      .sort((a, b) => getTimeValue(b.updatedAt) - getTimeValue(a.updatedAt))
      .map(mapBackendSessionToSession);

    return {
      total: list.length,
      list: clone(list),
    };
  }

  async function getKnowledgeOptions() {
    const documents = await getApi().getDocuments();
    const mappedDocuments = documents.map(mapBackendKnowledgeDocument);
    return {
      documents: clone(mappedDocuments),
      knowledgeBases: uniqueValues(mappedDocuments.map((item) => item.knowledgeBaseId || item.project || "企业知识库")),
      projects: uniqueValues(mappedDocuments.map((item) => item.project)),
    };
  }

  async function getMessages(sessionId) {
    const messages = await getApi().getChatMessages(sessionId);
    const mappedMessages = await Promise.all(
      messages.map(async (message) => {
        if (message.role !== "assistant") {
          return mapBackendMessageToMessage(message);
        }
        const citationItems = await getApi().getCitations(message.id);
        return mapBackendMessageToMessage({
          ...message,
          citationItems,
          evidenceLevel: inferEvidenceLevel(citationItems),
        });
      }),
    );

    return clone(mappedMessages);
  }

  async function sendQuestion(payload) {
    const rawAnswer = await getApi().generateMockAnswer(payload.question);
    return clone(
      mapBackendAnswerToMessage({
        ...rawAnswer,
        sessionId: payload.sessionId,
        answerMode: payload.answerMode,
      }),
    );
  }

  function createLocalSession(title = "新的知识检索会话") {
    const now = nowText();
    return {
      id: `sess-local-${Date.now()}`,
      title,
      sceneMode: "chat",
      createdAt: now,
      updatedAt: now,
    };
  }

  function createUserMessage({ sessionId, content }) {
    return {
      id: `msg-user-${Date.now()}`,
      sessionId,
      role: "user",
      content,
      createdAt: nowText(),
      citations: [],
      citationItems: [],
      evidenceLevel: "medium",
    };
  }

  function mapBackendSessionToSession(raw = {}) {
    return {
      id: raw.id || raw.sessionId || raw.session_id,
      title: raw.title || raw.name || "未命名会话",
      sceneMode: raw.sceneMode || raw.scene_mode || raw.mode || "chat",
      createdAt: raw.createdAt || raw.created_at || "",
      updatedAt: raw.updatedAt || raw.updated_at || raw.createdAt || raw.created_at || "",
    };
  }

  function mapBackendKnowledgeDocument(raw = {}) {
    return {
      id: raw.id || raw.documentId || raw.document_id,
      title: raw.title || raw.name || "未命名文档",
      project: raw.project || raw.projectName || raw.project_name || "企业知识库",
      knowledgeBaseId: raw.difyDatasetId || raw.dify_dataset_id || raw.collectionId || raw.collection_id || raw.project,
    };
  }

  function mapBackendMessageToMessage(raw = {}) {
    if (raw.role === "assistant") {
      return mapBackendAnswerToMessage(raw);
    }

    return {
      id: raw.id || raw.messageId || raw.message_id,
      sessionId: raw.sessionId || raw.session_id,
      role: raw.role || "user",
      content: raw.content || raw.question || "",
      createdAt: raw.createdAt || raw.created_at || nowText(),
      citations: raw.citations || [],
      citationItems: [],
      evidenceLevel: "medium",
    };
  }

  function mapBackendAnswerToMessage(raw = {}) {
    const citationItems = (raw.citationItems || raw.citationsDetail || raw.citation_items || []).map(mapBackendCitationToCitation);
    const structuredAnswer =
      raw.structuredAnswer ||
      raw.structured_answer ||
      raw.structuredOutput ||
      raw.structured_output ||
      buildStructuredAnswer(raw, citationItems);

    return {
      id: raw.id || raw.messageId || raw.message_id || `answer-${Date.now()}`,
      sessionId: raw.sessionId || raw.session_id || "",
      role: "assistant",
      content: raw.content || raw.answer || structuredAnswer.conclusion || "",
      createdAt: raw.createdAt || raw.created_at || nowText(),
      evidenceLevel: mapEvidenceLevel(raw.evidenceLevel || raw.evidence_level || inferEvidenceLevel(citationItems)),
      structuredAnswer,
      citations: raw.citations || citationItems.map((citation) => citation.id),
      citationItems,
      answerMode: raw.answerMode || raw.answer_mode || "evidence",
    };
  }

  function buildStructuredAnswer(raw, citationItems) {
    const content = raw.content || raw.answer || "当前暂无回答内容。";
    const citationSummary = citationItems
      .slice(0, 2)
      .map((citation) => citation.snippet)
      .join("；");
    return {
      conclusion: content,
      evidence: raw.evidence?.[0] || citationSummary || "当前回答没有足够引用片段。",
      suggestion: raw.nextActions?.[0] || "建议继续补充相关文档，并在正式结论前核对引用证据。",
      uncertainty: raw.risks?.[0] || "该回答基于当前知识库片段生成，未入库资料不会被覆盖。",
    };
  }

  function mapBackendCitationToCitation(raw = {}) {
    return {
      id: raw.id || raw.segmentId || raw.segment_id || raw.chunkId || raw.chunk_id || "",
      documentTitle: raw.documentTitle || raw.document_title || raw.title || raw.sourceName || raw.source_name || "知识库片段",
      snippet: raw.snippet || raw.content || raw.text || "暂无片段摘要。",
      relevanceScore: Number(raw.relevanceScore ?? raw.relevance_score ?? raw.score ?? 0),
      page: raw.page || raw.pageNo || raw.page_no || "",
      segmentId: raw.segmentId || raw.segment_id || raw.id || "",
    };
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
    if (bestScore >= 0.88 && citations.length >= 2) {
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

  function getTimeValue(value) {
    const normalized = String(value || "").replace(" ", "T");
    const time = new Date(normalized).getTime();
    return Number.isNaN(time) ? 0 : time;
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

  window.chatService = {
    getSessions,
    getKnowledgeOptions,
    getMessages,
    sendQuestion,
    createLocalSession,
    createUserMessage,
    mapBackendSessionToSession,
    mapBackendMessageToMessage,
    mapBackendAnswerToMessage,
    mapBackendCitationToCitation,
    mapEvidenceLevel,
  };

  window.chatApi = window.chatService;
})();
