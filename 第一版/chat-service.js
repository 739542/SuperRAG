/**
 * Chat service and adapter layer.
 *
 * The intelligent QA page should call window.chatService only.
 * This adapter keeps the frontend-facing message shape stable while
 * exposing the new AUCMR-inspired multi-stage pipeline fields.
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

  function getBackend() {
    if (!window.SuperRagBackend) {
      throw new Error("SuperRagBackend is not loaded");
    }
    return window.SuperRagBackend;
  }

  async function getSessions(params = {}) {
    const localSessions = getBackend()?.getHistoryRecords?.()
      ?.filter((record) => record.sceneMode === "chat")
      ?.map((record) => ({
        id: record.sessionId || record.id,
        title: record.title,
        sceneMode: "chat",
        createdAt: record.createdAt,
        updatedAt: record.createdAt,
      })) || [];
    const sessions = localSessions.length ? localSessions : await getApi().getSessions();
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
    const documents = await getDocumentsWithBackendFallback();
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
    try {
      const rawAnswer = await getBackend().requestJson("/scenes/general", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        timeoutMs: window.SuperRagConfig?.CHAT_API_TIMEOUT_MS || 90000,
        body: JSON.stringify({
          query: payload.question,
          project: payload.project || "",
          collection_id: payload.knowledgeBaseId || "",
          focus: payload.answerMode || "evidence",
          user: "course-demo-user",
        }),
      });
      const message = mapSceneResultToMessage(rawAnswer, payload);
      getBackend().appendHistoryRecord({
        id: message.id,
        sessionId: payload.sessionId,
        title: String(payload.question || "").slice(0, 40) || "Knowledge QA",
        sceneMode: "chat",
        project: rawAnswer.collection?.name || payload.project || payload.knowledgeBaseId || "",
        summary: message.content,
        originalQuestion: payload.question,
        outputSummary: message.content,
        citations: message.citationItems,
      });
      return clone(message);
    } catch (error) {
      console.error(`[SuperRAG ChatService] backend request failed: ${error.message || error}`);
      const message = String(error.message || error || "Unknown backend error");
      return clone({
        id: `answer-error-${Date.now()}`,
        sessionId: payload.sessionId || "",
        role: "assistant",
        content: `后端智能问答调用失败：${message}`,
        createdAt: nowText(),
        evidenceLevel: "low",
        structuredAnswer: {
          conclusion: "后端智能问答调用失败，当前没有可用的正式回答。",
          evidence: message,
          suggestion: "请检查模型 API 配置、后端进程状态和浏览器缓存后再重试。",
          uncertainty: "本次结果不是正常生成的回答。",
        },
        citations: [],
        citationItems: [],
        answerMode: payload.answerMode || "evidence",
        pipelineVersion: "",
        pipelineSteps: [],
        pipeline: {},
        queryDesigner: {},
        retriever: {},
        evidenceCollector: {},
        answerGenerator: {},
        validator: {},
        missingInformation: [],
        implementationSuggestions: [],
        uncertainPoints: [message],
      });
    }
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
    const evidenceLevel = mapEvidenceLevel(raw.evidenceLevel || raw.evidence_level || inferEvidenceLevel(citationItems));
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
      evidenceLevel,
      structuredAnswer,
      citations: raw.citations || citationItems.map((citation) => citation.id),
      citationItems,
      pipelineVersion: raw.pipelineVersion || raw.pipeline_version || "",
      pipelineSteps: raw.pipelineSteps || raw.pipeline_steps || [],
      pipeline: raw.pipeline || {},
      queryDesigner: raw.queryDesigner || raw.query_designer || {},
      retriever: raw.retriever || raw.retrieval || {},
      evidenceCollector: raw.evidenceCollector || raw.evidence_collector || {},
      answerGenerator: raw.answerGenerator || raw.answer_generator || {},
      validator: raw.validator || {},
      missingInformation: raw.missingInformation || raw.missing_information || [],
      implementationSuggestions: raw.implementationSuggestions || raw.implementation_suggestions || [],
      uncertainPoints: raw.uncertainPoints || raw.uncertain_points || [],
      evidence: raw.evidence || [],
      risks: raw.risks || [],
      nextActions: raw.nextActions || [],
      answerMode: raw.answerMode || raw.answer_mode || "evidence",
    };
  }

  function mapSceneResultToMessage(raw = {}, payload = {}) {
    const citations = (raw.citations || []).map(mapBackendCitationToCitation);
    const evidenceLevel = mapEvidenceLevel(raw.evidenceLevel || raw.evidence_level || inferEvidenceLevel(citations));
    const content = raw.summary || raw.answer || "";
    const structuredAnswer =
      raw.structuredAnswer ||
      raw.structured_answer ||
      buildStructuredAnswer(
        {
          ...raw,
          answer: content,
          implementation_suggestions: raw.implementationSuggestions || raw.implementation_suggestions || raw.nextActions || [],
          uncertain_points: raw.uncertainPoints || raw.uncertain_points || raw.risks || [],
        },
        citations,
      );

    return {
      id: raw.id || `answer-${Date.now()}`,
      sessionId: payload.sessionId || "",
      role: "assistant",
      content,
      createdAt: nowText(),
      evidenceLevel,
      structuredAnswer,
      citations: citations.map((citation) => citation.id),
      citationItems: citations,
      evidence: raw.evidence || [],
      risks: raw.risks || [],
      nextActions: raw.nextActions || [],
      pipelineVersion: raw.pipelineVersion || raw.pipeline_version || "",
      pipelineSteps: raw.pipelineSteps || raw.pipeline_steps || [],
      pipeline: raw.pipeline || {},
      queryDesigner: raw.queryDesigner || raw.query_designer || {},
      retriever: raw.retriever || raw.retrieval || {},
      evidenceCollector: raw.evidenceCollector || raw.evidence_collector || {},
      answerGenerator: raw.answerGenerator || raw.answer_generator || {},
      validator: raw.validator || {},
      missingInformation: raw.missingInformation || raw.missing_information || [],
      implementationSuggestions: raw.implementationSuggestions || raw.implementation_suggestions || [],
      uncertainPoints: raw.uncertainPoints || raw.uncertain_points || [],
      answerMode: payload.answerMode || "evidence",
    };
  }

  function buildStructuredAnswer(raw, citationItems) {
    const content = raw.content || raw.answer || "当前暂无回答内容。";
    const evidenceLines = []
      .concat(raw.evidence || [])
      .concat(citationItems.slice(0, 3).map((citation) => citation.snippet))
      .filter((item) => String(item || "").trim());
    const suggestionLines = []
      .concat(raw.implementationSuggestions || raw.implementation_suggestions || [])
      .concat(raw.nextActions || [])
      .filter((item) => String(item || "").trim());
    const uncertaintyLines = []
      .concat(raw.uncertainPoints || raw.uncertain_points || [])
      .concat(raw.missingInformation || raw.missing_information || [])
      .concat(raw.risks || [])
      .filter((item) => String(item || "").trim());
    const validator = raw.validator || {};

    if (Array.isArray(validator.unsupported_claims) && validator.unsupported_claims.length) {
      uncertaintyLines.push(`Unsupported claims: ${validator.unsupported_claims.join("; ")}`);
    }
    if (Array.isArray(validator.uncertain_claims) && validator.uncertain_claims.length) {
      uncertaintyLines.push(`Uncertain claims: ${validator.uncertain_claims.join("; ")}`);
    }
    if (raw.pipelineVersion || raw.pipeline_version) {
      suggestionLines.push(`Pipeline version: ${raw.pipelineVersion || raw.pipeline_version}`);
    }

    return {
      conclusion: content,
      evidence: evidenceLines.join("\n") || "当前回答没有足够的可引用证据。",
      suggestion: suggestionLines.join("\n") || "建议继续补充相关项目文档后再确认结论。",
      uncertainty: uncertaintyLines.join("\n") || "当前没有识别到明显的不确定项。",
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
      chunkId: raw.chunkId || raw.chunk_id || raw.segmentId || raw.segment_id || raw.id || "",
      documentId: raw.documentId || raw.document_id || "",
      sourceName: raw.sourceName || raw.source_name || raw.documentTitle || raw.document_title || raw.title || "",
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

    const scores = citations
      .map((citation) => Number(citation.relevanceScore ?? citation.score ?? 0))
      .filter((score) => Number.isFinite(score))
      .sort((a, b) => b - a);
    const positiveScores = scores.filter((score) => score > 0);
    if (!positiveScores.length) {
      return citations.length >= 2 ? "medium" : "low";
    }

    const bestScore = positiveScores[0];
    if (bestScore >= 0.5 && citations.length >= 3) {
      return "high";
    }
    if (bestScore >= 0.25 || citations.length >= 2) {
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

  async function getDocumentsWithBackendFallback() {
    try {
      const response = await getBackend().requestJson("/documents");
      return Array.isArray(response.items) ? response.items : [];
    } catch (error) {
      console.warn(`[SuperRAG ChatService] document options fallback: ${error.message || error}`);
      return getApi().getDocuments();
    }
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
