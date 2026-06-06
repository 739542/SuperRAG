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

  function getBackend() {
    if (!window.SuperRagBackend) {
      throw new Error("SuperRagBackend is not loaded");
    }
    return window.SuperRagBackend;
  }

  async function getSessions(params = {}) {
    const localSessions = buildLocalChatSessions(getLocalChatRecords());
    const sessions = localSessions;
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

  async function getSuggestedQuestions(params = {}) {
    try {
      const response = await getBackend().requestJson("/chat/suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        timeoutMs: 65000,
        body: JSON.stringify({
          collection_id: params.knowledgeBaseId || "",
          project: params.project || "",
          answerMode: params.answerMode || "evidence",
        }),
      });
      const items = normalizeSuggestedQuestions(response.items || []);
      if (items.length) {
        return {
          items: clone(items),
          source: response.source || "backend",
          warning: response.warning || "",
        };
      }
    } catch (error) {
      console.warn(`[SuperRAG ChatService] suggested questions unavailable: ${error.message || error}`);
    }

    return {
      items: [],
      source: "backend-unavailable",
      warning: "后端推荐问题接口当前不可用，前端不再生成本地候选问题。",
    };
  }

  async function getMessages(sessionId) {
    const localMessages = buildMessagesFromLocalHistory(sessionId);
    if (localMessages.length) {
      return clone(localMessages);
    }

    return [];
  }

  async function deleteSession(sessionId) {
    const normalizedSessionId = String(sessionId || "").trim();
    if (!normalizedSessionId) {
      return {
        sessionId: "",
        deletedCount: 0,
        deletedRecordIds: [],
      };
    }

    const deletedRecordIds = uniqueValues(
      getLocalChatRecords()
        .filter((record) => {
          const recordSessionId = getRecordSessionId(record);
          return recordSessionId === normalizedSessionId || record.id === normalizedSessionId;
        })
        .map((record) => record.id || record.artifactId || ""),
    );

    deletedRecordIds.forEach((id) => {
      getBackend().deleteHistoryRecord(id);
    });

    return {
      sessionId: normalizedSessionId,
      deletedCount: deletedRecordIds.length,
      deletedRecordIds,
    };
  }

  function getLocalChatRecords() {
    return (getBackend()?.getHistoryRecords?.() || [])
      .filter((record) => normalizeSceneMode(record.sceneMode || record.scene) === "chat")
      .sort((a, b) => getTimeValue(a.createdAt || a.created_at) - getTimeValue(b.createdAt || b.created_at));
  }

  function normalizeSuggestedQuestions(items = []) {
    const normalized = [];
    const seen = new Set();
    (Array.isArray(items) ? items : []).forEach((item) => {
      const raw = typeof item === "string" ? { question: item, label: item } : item || {};
      const question = String(raw.question || raw.query || raw.text || "").trim();
      const label = String(raw.label || raw.title || question).trim();
      if (!question || seen.has(question)) {
        return;
      }
      seen.add(question);
      normalized.push({
        label: truncateText(label, 24),
        question,
        reason: truncateText(raw.reason || raw.description || "根据当前知识库生成。", 120),
      });
    });
    return normalized.slice(0, 6);
  }

  function buildLocalSuggestedQuestions({ documents = [], project = "" } = {}) {
    const topics = extractDocumentTopics(documents);
    const primary = topics[0] || project || "当前项目";
    const relationScope = topics.length > 1 ? topics.slice(0, 5).join("、") : `${primary}相关模块和文档`;
    return normalizeSuggestedQuestions([
      { label: `${primary}支持哪些业务？`, question: `${primary}主要支持哪些业务能力？` },
      { label: `${relationScope}之间的关系`, question: `${relationScope}之间是什么关系？` },
      { label: `${primary}业务规则`, question: `${primary}有哪些关键业务规则和限制条件？` },
      { label: `${primary}权限风险`, question: `${primary}涉及哪些权限边界和风险点？` },
      { label: `${primary}关键流程`, question: `${primary}从发起到完成的关键流程是什么？` },
      { label: "哪些内容证据不足？", question: `当前知识库中关于${primary}还缺少哪些文档证据？` },
    ]);
  }

  function extractDocumentTopics(documents = []) {
    const text = documents.map((item) => [item.title, item.project].filter(Boolean).join(" ")).join(" ");
    const preferred = ["客户", "商机", "合同", "回款", "发票", "权限", "审批", "接口", "测试", "部署", "需求", "交接", "培训"];
    const topics = preferred.filter((item) => text.includes(item));
    documents.forEach((item) => {
      const topic = cleanQuestionTopic(item.title || item.name || item.project || "");
      if (topic && !topics.includes(topic)) {
        topics.push(topic);
      }
    });
    return topics.slice(0, 8);
  }

  function cleanQuestionTopic(value = "") {
    const fileStem = String(value).replace(/\.[^.]+$/, "");
    return fileStem
      .replace(/^\d+[_\-.\s]*/, "")
      .replace(/SuperRAG|CRM|V\d+(\.\d+)*|final|最终版|演示整理版/gi, "")
      .replace(/(模块|管理|说明|文档|设计|规格|需求|手册|记录|资料|流程)+/g, "")
      .replace(/[_\-（）()\s]+/g, "")
      .replace(/[，。；、]+/g, "")
      .slice(0, 10);
  }

  function buildLocalChatSessions(records = []) {
    const groups = new Map();
    records.forEach((record) => {
      const sessionId = getRecordSessionId(record);
      if (!sessionId) {
        return;
      }
      if (!groups.has(sessionId)) {
        groups.set(sessionId, []);
      }
      groups.get(sessionId).push(record);
    });

    return [...groups.entries()].map(([sessionId, items]) => {
      const sorted = [...items].sort((a, b) => getTimeValue(a.createdAt || a.created_at) - getTimeValue(b.createdAt || b.created_at));
      const first = sorted[0] || {};
      const last = sorted[sorted.length - 1] || first;
      return {
        id: sessionId,
        title: last.title || last.originalQuestion || last.query || first.title || "历史问答会话",
        sceneMode: "chat",
        createdAt: first.createdAt || first.created_at || "",
        updatedAt: last.updatedAt || last.updated_at || last.createdAt || last.created_at || "",
      };
    });
  }

  function buildMessagesFromLocalHistory(sessionId) {
    if (!sessionId) {
      return [];
    }
    const records = getLocalChatRecords().filter((record) => getRecordSessionId(record) === sessionId || record.id === sessionId);
    return records.flatMap((record, index) => {
      const recordSessionId = getRecordSessionId(record) || sessionId;
      const question = record.originalQuestion || record.original_question || record.query || record.title || "";
      const createdAt = record.createdAt || record.created_at || nowText();
      const userMessage = {
        id: `${record.id || record.artifactId || sessionId}-user-${index}`,
        sessionId: recordSessionId,
        role: "user",
        content: question,
        createdAt,
        citations: [],
        citationItems: [],
        evidenceLevel: "medium",
      };
      const assistantMessage = mapBackendAnswerToMessage({
        id: record.id || record.artifactId || `history-answer-${index}`,
        sessionId: recordSessionId,
        role: "assistant",
        content: record.outputSummary || record.output_summary || record.summary || "",
        answer: record.outputSummary || record.output_summary || record.summary || "",
        query: question,
        originalQuestion: question,
        structuredAnswer: record.structuredOutput || record.structured_output || {},
        citationItems: record.citations || [],
        citationsDetail: record.citations || [],
        qualityAssessment: record.qualityAssessment || record.quality_assessment || {},
        evidenceLevel: record.evidenceLevel || record.evidence_level || "",
        createdAt,
        answerMode: "evidence",
      });
      return question ? [userMessage, assistantMessage] : [assistantMessage];
    });
  }

  function getRecordSessionId(record = {}) {
    return record.sessionId || record.session_id || record.chatSessionId || record.chat_session_id || record.id || record.artifactId || "";
  }

  function normalizeSceneMode(scene) {
    const value = String(scene || "");
    return value === "general" ? "chat" : value;
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
      if (isDocumentListQuestion(payload.question)) {
        rawAnswer.knowledgeDocuments = await getDocumentsWithBackendFallback();
      }
      const message = mapSceneResultToMessage(rawAnswer, payload);
      getBackend().appendHistoryRecord({
        id: message.id,
        sessionId: payload.sessionId,
        title: String(payload.question || "").slice(0, 40) || "Knowledge QA",
        sceneMode: "chat",
        artifactType: "general_answer",
        project: rawAnswer.collection?.name || payload.project || payload.knowledgeBaseId || "",
        summary: message.content,
        query: payload.question,
        originalQuestion: payload.question,
        outputSummary: message.content,
        structuredOutput: message.structuredAnswer,
        qualityAssessment: rawAnswer.qualityAssessment || rawAnswer.quality_assessment || {},
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
    const rawStructuredAnswer =
      raw.structuredAnswer ||
      raw.structured_answer ||
      raw.structuredOutput ||
      raw.structured_output ||
      buildStructuredAnswer(raw, citationItems);
    const structuredAnswer = normalizeStructuredAnswer(rawStructuredAnswer, {
      raw,
      citationItems,
    });

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
      query: raw.query || raw.originalQuestion || raw.original_question || "",
    };
  }

  function mapSceneResultToMessage(raw = {}, payload = {}) {
    const citations = (raw.citations || []).map(mapBackendCitationToCitation);
    const evidenceLevel = mapEvidenceLevel(raw.evidenceLevel || raw.evidence_level || inferEvidenceLevel(citations));
    const content = raw.summary || raw.answer || "";
    const rawStructuredAnswer =
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
    const structuredAnswer = normalizeStructuredAnswer(rawStructuredAnswer, {
      raw: { ...raw, answer: content, query: payload.question || raw.query || "" },
      citationItems: citations,
    });

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
      query: payload.question || raw.query || "",
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
      uncertaintyLines.push(`缺少证据支撑的结论：${validator.unsupported_claims.join("；")}`);
    }
    if (Array.isArray(validator.uncertain_claims) && validator.uncertain_claims.length) {
      uncertaintyLines.push(`需要人工确认的结论：${validator.uncertain_claims.join("；")}`);
    }

    return {
      conclusion: content,
      evidence: evidenceLines.join("\n"),
      evidenceItems: buildEvidenceItemsFromCitations(citationItems, evidenceLines),
      suggestion: suggestionLines.join("\n"),
      suggestionItems: normalizeDisplayList(suggestionLines, []),
      uncertainty: uncertaintyLines.join("\n"),
      uncertaintyItems: normalizeDisplayList(uncertaintyLines, []),
    };
  }

  function normalizeStructuredAnswer(answer = {}, { raw = {}, citationItems = [] } = {}) {
    const source = answer && typeof answer === "object" ? answer : {};
    const rawConclusion = source.conclusion || raw.answer || raw.summary || raw.content || "";
    const evidenceLines = normalizeDisplayList(source.evidence || raw.evidence || [], []);
    const suggestionLines = normalizeDisplayList(
      source.suggestionItems || source.suggestion || raw.implementationSuggestions || raw.implementation_suggestions || raw.nextActions || [],
      [],
    );
    const uncertaintyLines = normalizeDisplayList(
      source.uncertaintyItems || source.uncertainty || raw.uncertainPoints || raw.uncertain_points || raw.missingInformation || raw.missing_information || raw.risks || [],
      [],
    );
    const evidenceItems = normalizeEvidenceItems(source.evidenceItems || source.evidence_items, citationItems, evidenceLines);
    const conclusion = normalizeBackendText(rawConclusion);
    const followUpItems = normalizeDisplayList(source.followUpItems || source.follow_up_items || [], []);
    const basisSummary = normalizeBackendText(source.basisSummary || source.basis_summary || "");

    return {
      conclusion,
      basisSummary,
      evidence: evidenceItems.length
        ? evidenceItems.map((item, index) => `${index + 1}. ${item.title}：${item.summary}`).join("\n")
        : evidenceLines.join("\n"),
      evidenceItems,
      suggestion: suggestionLines.join("\n"),
      suggestionItems: suggestionLines,
      followUpItems,
      uncertainty: uncertaintyLines.join("\n"),
      uncertaintyItems: uncertaintyLines,
      rawConclusion,
    };
  }

  function buildReadableConclusion(text, citationItems = [], raw = {}) {
    const cleaned = cleanAnswerText(text);
    const insufficient = isEvidenceInsufficientText(cleaned);
    if (insufficient) {
      return "当前知识库没有检索到足够证据，系统不会把无依据内容包装成正式结论。建议先补充相关需求、接口、交接或培训文档。";
    }

    if (isGenericEvidenceAnswer(cleaned)) {
      const questionFocused = buildQuestionFocusedAnswer(raw.query || "", citationItems, raw);
      if (questionFocused) {
        return questionFocused;
      }
      const topics = uniqueValues(citationItems.map((item) => documentTopic(item.documentTitle || item.title || item.sourceName))).slice(0, 4);
      return buildTopicBasedAnswer(raw.query || "", topics, citationItems);
    }

    if (cleaned) {
      return truncateText(cleaned, 420);
    }

    const fallbackTopics = uniqueValues(citationItems.map((item) => documentTopic(item.documentTitle || item.title || item.sourceName))).slice(0, 4);
    if (fallbackTopics.length) {
      return `当前问题命中了 ${fallbackTopics.join("、")} 等文档，建议结合下方证据摘要确认结论。`;
    }
    return raw.query ? `当前问题“${truncateText(raw.query, 80)}”暂未形成明确结论。` : "当前暂无明确结论。";
  }

  function buildQuestionFocusedAnswer(query = "", citationItems = [], raw = {}) {
    const grouped = groupCitationItemsByDocument(citationItems);
    if (!grouped.length) {
      return "";
    }

    const primary = grouped[0];
    const primaryTitle = primary.title || "相关文档";
    const aspects = extractEvidenceAspects(primary.items);
    const supportingTopics = grouped
      .slice(1, 4)
      .map((item) => documentTopic(item.title || ""))
      .filter(Boolean);

    if (isContentInventoryQuestion(query)) {
      const lines = [`围绕《${primaryTitle}》，当前命中的文档内容主要包括：`];
      if (aspects.length) {
        lines.push(...aspects.map((aspect, index) => `${index + 1}. ${aspect}`));
      } else {
        lines.push(`1. ${buildCitationSnippetSummary(primary.items)}`);
      }
      if (supportingTopics.length) {
        lines.push(`其他命中文档主要用于补充与该主题相关的上下游关系：${supportingTopics.join("、")}。`);
      }
      return lines.join("\n");
    }

    const snippetSummary = buildCitationSnippetSummary(primary.items);
    if (!snippetSummary) {
      return "";
    }

    const shortQuery = truncateText(query || raw.query || "", 40);
    const lines = [`针对“${shortQuery}”，当前命中的文档表明：${snippetSummary}`];
    if (aspects.length) {
      lines.push(`这些证据主要围绕：${aspects.join("、")}。`);
    }
    if (supportingTopics.length) {
      lines.push(`同时，${supportingTopics.join("、")} 等文档可用于补充相关的流程或约束信息。`);
    }
    return lines.join("\n");
  }

  function groupCitationItemsByDocument(citationItems = []) {
    const groups = new Map();
    citationItems.forEach((item) => {
      const title = item.documentTitle || item.title || item.sourceName || "相关文档";
      if (!groups.has(title)) {
        groups.set(title, []);
      }
      groups.get(title).push(item);
    });
    return [...groups.entries()].map(([title, items]) => ({ title, items }));
  }

  function isContentInventoryQuestion(query = "") {
    return /包含|哪些内容|都包含了|主要内容|文档内容|介绍|说明/.test(String(query || ""));
  }

  function isDocumentListQuestion(query = "") {
    return /(有哪些|有哪几个|有几个|目前有哪些|目前有哪几个|当前有哪些|收录了哪些|包含哪些)(文档|文件|资料)/.test(String(query || ""));
  }

  function extractEvidenceAspects(items = []) {
    const text = items
      .map((item) => cleanEvidenceSnippet(item.snippet || item.content || "", item.documentTitle || item.title || ""))
      .join(" ");
    const patterns = [
      ["模块定位与业务作用", /模块定位|用于处理|用于记录|用于管理/],
      ["核心业务对象与关联数据", /核心业务对象|发票申请|客户|合同|回款|商机/],
      ["主要功能操作与处理环节", /新建|创建|编辑|提交|审核|作废|查看|记录/],
      ["上下游流程联动与状态流转", /联动|同步|流程|状态|进度/],
      ["关键业务规则与校验约束", /规则|唯一|必填|不得|超过|校验|阻止/],
    ];
    return patterns.filter(([, pattern]) => pattern.test(text)).map(([label]) => label).slice(0, 5);
  }

  function buildCitationSnippetSummary(items = []) {
    const sentences = [];
    items.slice(0, 3).forEach((item) => {
      const cleaned = cleanEvidenceSnippet(item.snippet || item.content || "", item.documentTitle || item.title || "");
      cleaned
        .split(/[。！？；]+/)
        .map((part) => part.trim())
        .filter((part) => part.length >= 12)
        .forEach((part) => {
          if (!sentences.includes(part)) {
            sentences.push(part);
          }
        });
    });
    return sentences.slice(0, 2).join("；");
  }

  function buildDocumentListAnswer(query = "", documents = [], citationItems = []) {
    const normalizedDocuments = (Array.isArray(documents) ? documents : [])
      .map((item) => mapBackendKnowledgeDocument(item))
      .filter((item) => item.title);

    const uniqueDocuments = [];
    const seen = new Set();
    normalizedDocuments.forEach((item) => {
      const key = `${item.knowledgeBaseId || item.project || ""}::${item.title}`;
      if (seen.has(key)) {
        return;
      }
      seen.add(key);
      uniqueDocuments.push(item);
    });

    if (!uniqueDocuments.length) {
      const grouped = groupCitationItemsByDocument(citationItems);
      if (!grouped.length) {
        return "";
      }
      const docLines = grouped
        .slice(0, 8)
        .map((group, index) => `${index + 1}. ${group.title || "相关文档"}`)
        .filter(Boolean);
      if (!docLines.length) {
        return "";
      }
      return [
        `根据当前命中的检索结果，当前知识库里至少可以确认这些文档：`,
        ...docLines,
        "如果你要的是完整文档清单，建议再结合文档知识库页面核对。",
      ].join("\n");
    }

    const groupedByProject = new Map();
    uniqueDocuments.forEach((item) => {
      const groupKey = item.project || "未分组知识库";
      if (!groupedByProject.has(groupKey)) {
        groupedByProject.set(groupKey, []);
      }
      groupedByProject.get(groupKey).push(item);
    });

    const lines = [];
    lines.push(`当前知识库中可见的文档共有 ${uniqueDocuments.length} 个：`);

    [...groupedByProject.entries()].forEach(([project, items]) => {
      if (groupedByProject.size > 1) {
        lines.push(`${project}：`);
      }
      items
        .sort((a, b) => String(a.title).localeCompare(String(b.title), "zh-CN"))
        .forEach((item, index) => {
          const prefix = groupedByProject.size > 1 ? "-" : `${index + 1}.`;
          lines.push(`${prefix} ${item.title}`);
        });
    });

    const projectNames = uniqueValues(uniqueDocuments.map((item) => item.project)).slice(0, 3);
    if (projectNames.length) {
      lines.push(`当前回答基于 ${projectNames.join("、")} 中的实时文档列表整理。`);
    }

    return lines.join("\n");
  }

  function buildTopicBasedAnswer(query = "", topics = [], citationItems = []) {
    const normalizedQuery = String(query || "");
    const topicText = topics.length ? topics.join("、") : "当前命中的知识库文档";
    const hasCrmSignals = citationItems.some((item) => /客户|商机|合同|回款|发票|CRM/i.test([item.documentTitle, item.sourceName, item.snippet].join(" ")));

    if (hasCrmSignals && /关系|关联|链路|流程/.test(normalizedQuery)) {
      return "根据当前 CRM 业务文档，客户是销售业务的基础对象，商机承接销售机会推进过程，合同记录成交后的正式约定，回款反映资金回收进展，发票通常围绕合同和回款信息发起申请。这个问题建议结合下方客户、商机、合同、回款、发票文档证据继续确认细节。";
    }
    if (hasCrmSignals && /风险|注意|规则|权限/.test(normalizedQuery)) {
      return "当前 CRM 文档显示，设计时需要重点关注客户转移、公海规则、团队成员权限、合同与回款联动、发票金额约束等业务边界。涉及权限、金额、状态流转和删除约束的内容不应只靠经验补全，需要回到引用文档或补充接口/规则说明后确认。";
    }
    if (hasCrmSignals && /客户/.test(normalizedQuery)) {
      return "CRM 客户管理主要围绕客户资料沉淀、客户跟进、负责人或团队成员协作、客户转移与公海等业务展开。具体字段、权限边界和异常规则需要以下方客户管理文档片段为准。";
    }
    if (hasCrmSignals) {
      return `当前问题主要涉及 ${topicText}。从已有 CRM 文档看，回答应围绕业务对象、操作流程、权限边界和证据充分度来确认；如果要形成正式设计结论，建议继续查看下方证据并转入设计辅助生成结构化产物。`;
    }
    return `当前问题主要涉及 ${topicText}。以下回答基于当前知识库片段进行归纳，正式使用前仍需要核对引用原文。`;
  }

  function buildFollowUpQuestions(query = "", citationItems = [], conclusion = "") {
    const text = [query, conclusion, ...citationItems.map((item) => `${item.documentTitle} ${item.snippet}`)].join(" ");
    if (/客户|商机|合同|回款|发票|CRM/i.test(text)) {
      return [
        "是否需要进一步生成 CRM 模块功能清单？",
        "是否需要整理客户-商机-合同-回款-发票的业务流程？",
        "是否需要转入设计辅助模式生成详细文本用例？",
        "是否需要检查当前回答中证据不足的业务规则？",
      ];
    }
    return [
      "是否需要把当前结论整理成功能清单？",
      "是否需要继续查看相关文档原文？",
      "是否需要转入设计辅助模式生成结构化产物？",
      "是否需要列出当前知识库缺失的文档类型？",
    ];
  }

  function normalizeEvidenceItems(items, citationItems = [], evidenceLines = []) {
    const explicitItems = Array.isArray(items)
      ? items
          .filter(Boolean)
          .map((item, index) => {
            if (typeof item === "string") {
              return {
                title: `证据 ${index + 1}`,
                summary: normalizeBackendText(item),
                score: "",
              };
            }
            return {
              title: item.title || item.documentTitle || item.sourceDocument || `证据 ${index + 1}`,
              summary: normalizeBackendText(item.summary || item.snippet || item.evidenceSnippet || item.content || item.description || ""),
              score: item.score || item.relevanceScore || item.evidenceScore || "",
              documentId: item.documentId || "",
              chunkId: item.chunkId || item.segmentId || "",
            };
          })
      : [];

    if (explicitItems.length) {
      return explicitItems.filter((item) => item.summary);
    }

    const fromCitations = citationItems.slice(0, 5).map((citation, index) => ({
      title: citation.documentTitle || citation.title || citation.sourceName || `证据 ${index + 1}`,
      summary: normalizeBackendText(citation.snippet || citation.content || ""),
      score: Number(citation.relevanceScore ?? citation.score ?? 0),
      documentId: citation.documentId || "",
      chunkId: citation.chunkId || citation.segmentId || citation.id || "",
    }));

    if (fromCitations.length) {
      return fromCitations;
    }

    return evidenceLines.slice(0, 5).map((line, index) => ({
      title: `证据 ${index + 1}`,
      summary: normalizeBackendText(line),
      score: "",
    }));
  }

  function buildEvidenceItemsFromCitations(citationItems = [], evidenceLines = []) {
    return normalizeEvidenceItems([], citationItems, evidenceLines);
  }

  function normalizeDisplayList(value, fallback = []) {
    const rawItems = Array.isArray(value) ? value : String(value || "").split(/\n+/);
    const items = rawItems
      .flatMap((item) => String(item || "").split(/\n+/))
      .map(normalizeBackendText)
      .filter(Boolean);
    return items.length ? items : fallback;
  }

  function normalizeBackendText(value) {
    return String(value || "")
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .trim();
  }

  function cleanAnswerText(value) {
    return String(value || "")
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .replace(/Based on the retrieved project evidence, the most relevant findings are:?/gi, "根据当前知识库检索结果：")
      .replace(/\bUnsupported claims?:/gi, "缺少证据支撑的结论：")
      .replace(/\bUncertain claims?:/gi, "需要人工确认的结论：")
      .replace(/\bPipeline version:/gi, "生成链路版本：")
      .replace(/\bNo major uncertainty was detected in the retrieved evidence\.?/gi, "当前没有识别到明显的不确定项。")
      .replace(/\bReview the cited documents before treating this as a final conclusion\.?/gi, "请先核对引用文档，再将回答作为正式结论。")
      .replace(/\bRetrieved chunks have low relevance scores; key details may still be missing\.?/gi, "检索片段相关度偏低，关键细节可能仍然缺失。")
      .replace(/\bOnly a small amount of supporting evidence was found\.?/gi, "当前只找到少量支撑证据，建议补充更多项目文档。")
      .replace(/\bvector search unavailable:/gi, "向量检索暂不可用：")
      .replace(/\s+mentions\s+/gi, "：")
      .replace(/\s+/g, " ")
      .trim();
  }

  function cleanEvidenceSnippet(value, title = "") {
    let text = String(value || "")
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .replace(/https?:\/\/\S+/g, "")
      .replace(/原始链接[:：][^\n>]*/g, "")
      .replace(/来源[:：][^\n>]*/g, "")
      .replace(/^\s*\d+[_-][^:：\s]+\.(?:md|markdown|txt|pdf|docx|xlsx|csv)\s*(?:mentions|提到|[:：])?\s*/i, "")
      .replace(/^\s*[^:：\s]+\.(?:md|markdown|txt|pdf|docx|xlsx|csv)\s*(?:mentions|提到|[:：])?\s*/i, "")
      .replace(/\bmentions\b/gi, "：")
      .replace(/SuperRAG演示整理版/g, "")
      .replace(/CRM[^，。；:：\s]{0,12}模块说明/g, "")
      .replace(/[>#*_`]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const topic = documentTopic(title);
    if (topic) {
      text = text.replace(new RegExp(topic.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"), "").trim();
    }
    text = text.replace(/^CRM\s*/i, "").replace(/^模块说明[（(].*?[）)]/, "").trim();
    return truncateText(text || "该文档命中用户问题相关片段，请点击“查看原文”核对完整上下文。", 180);
  }

  function translateTechnicalLine(value) {
    return String(value || "")
      .replace(/^Treat the cited document content as confirmed facts\.?$/i, "可把已引用的文档内容作为当前回答的依据。")
      .replace(/^Treat any uncited implementation idea as an optional suggestion that still needs review\.?$/i, "未绑定证据的实现想法只能作为待复核建议。")
      .replace(/^Import the relevant requirement, design, code, or interface document before answering again\.?$/i, "请先补充相关需求、设计、接口或交接文档后再重新提问。")
      .replace(/^Evidence is missing\.?$/i, "当前问题缺少可用证据。")
      .trim();
  }

  function isGenericEvidenceAnswer(text) {
    const normalized = String(text || "").toLowerCase();
    return (
      normalized.includes("based on the retrieved project evidence") ||
      normalized.includes("the most relevant findings") ||
      normalized.includes(" mentions ") ||
      normalized.startsWith("根据当前知识库检索结果：")
    );
  }

  function isEvidenceInsufficientText(text) {
    const normalized = String(text || "").toLowerCase();
    return normalized.includes("could not find grounded") || normalized.includes("no evidence was found") || normalized.includes("没有检索到足够证据");
  }

  function documentTopic(title) {
    return String(title || "知识库片段")
      .replace(/\.[a-z0-9]+$/i, "")
      .replace(/^\d+[_-]*/, "")
      .replace(/SuperRAG演示整理版/g, "")
      .replace(/CRM/g, "")
      .replace(/模块说明/g, "")
      .replace(/[（）()《》]/g, "")
      .replace(/\s+/g, "")
      .trim() || "知识库片段";
  }

  function truncateText(value, limit = 180) {
    const text = String(value || "").trim();
    return text.length > limit ? `${text.slice(0, limit)}...` : text;
  }

  /* function normalizeSuggestedQuestions(items = []) {
    const normalized = [];
    const seen = new Set();
    (Array.isArray(items) ? items : []).forEach((item) => {
      const raw = typeof item === "string" ? { question: item, label: item } : item || {};
      const question = String(raw.question || raw.query || raw.text || "").trim();
      const label = String(raw.label || raw.title || question).trim();
      if (!question || seen.has(question)) {
        return;
      }
      seen.add(question);
      normalized.push({
        label: label || question,
        question,
        reason: truncateText(raw.reason || raw.description || "鏍规嵁褰撳墠鐭ヨ瘑搴撶敓鎴愩€?", 120),
      });
    });
    return normalized.slice(0, 6);
  }

  function buildReadableConclusion(text, citationItems = [], raw = {}) {
    const cleaned = cleanAnswerText(text);
    const query = String(raw.query || raw.originalQuestion || "").trim();
    const insufficient = isEvidenceInsufficientText(cleaned);
    if (insufficient) {
      return "褰撳墠鐭ヨ瘑搴撴病鏈夋绱㈠埌瓒冲璇佹嵁锛岀郴缁熶笉浼氭妸鏃犱緷鎹唴瀹瑰寘瑁呮垚姝ｅ紡缁撹銆傚缓璁厛琛ュ厖鐩稿叧闇€姹傘€佹帴鍙ｃ€佷氦鎺ユ垨鍩硅鏂囨。銆?";
    }

    if (cleaned && !isGenericEvidenceAnswer(cleaned)) {
      return truncateText(cleaned, 420);
    }

    if (isContentInventoryQuestion(query)) {
      const questionFocused = buildQuestionFocusedAnswer(query, citationItems, raw);
      if (questionFocused) {
        return questionFocused;
      }
    }

    if (isRuleFlowComparisonQuestion(query)) {
      const ruleFocused = buildRuleOrPermissionAnswer(query, citationItems);
      if (ruleFocused) {
        return ruleFocused;
      }
      if (cleaned) {
        return truncateText(cleaned, 420);
      }
    }

    if (cleaned && !looksLikeFallbackEvidenceSummary(cleaned)) {
      return truncateText(cleaned, 420);
    }

    const fallbackTopics = uniqueValues(citationItems.map((item) => documentTopic(item.documentTitle || item.title || item.sourceName))).slice(0, 4);
    if (fallbackTopics.length) {
      return `褰撳墠闂鍛戒腑浜?${fallbackTopics.join("銆?)} 绛夋枃妗ｏ紝寤鸿缁撳悎涓嬫柟璇佹嵁鎽樿纭缁撹銆俙`;
    }
    return query ? `褰撳墠闂鈥?{truncateText(query, 80)}鈥濇殏鏈舰鎴愭槑纭粨璁恒€俙` : "褰撳墠鏆傛棤鏄庣‘缁撹銆?";
  }

  function buildQuestionFocusedAnswer(query = "", citationItems = [], raw = {}) {
    const grouped = groupCitationItemsByDocument(citationItems);
    if (!grouped.length) {
      return "";
    }

    const primary = grouped[0];
    const primaryTitle = primary.title || "鐩稿叧鏂囨。";
    const aspects = extractEvidenceAspects(primary.items);
    const supportingTopics = grouped
      .slice(1, 4)
      .map((item) => documentTopic(item.title || ""))
      .filter(Boolean);

    if (isContentInventoryQuestion(query)) {
      const lines = [`鍥寸粫銆?{primaryTitle}銆嬶紝褰撳墠鍛戒腑鐨勬枃妗ｅ唴瀹逛富瑕佸寘鎷細`];
      if (aspects.length) {
        lines.push(...aspects.map((aspect, index) => `${index + 1}. ${aspect}`));
      } else {
        lines.push(`1. ${buildCitationSnippetSummary(primary.items)}`);
      }
      if (supportingTopics.length) {
        lines.push(`鍏朵粬鍛戒腑鏂囨。涓昏鐢ㄤ簬琛ュ厖涓庤涓婚鐩稿叧鐨勪笂涓嬫父鍏崇郴锛?{supportingTopics.join("銆?)}銆俙`);
      }
      return lines.join("\n");
    }

    return "";
  }

  function isContentInventoryQuestion(query = "") {
    return /鍖呭惈|鍝簺鍐呭|閮藉寘鍚簡|涓昏鍐呭|鏂囨。鍐呭|浠嬬粛|璇存槑|清单|概览/.test(String(query || ""));
  }

  function isRuleFlowComparisonQuestion(query = "") {
    return /权限|条件|规则|流程|关系|关联|划分|区别|差异|编辑|审批|角色|负责人|团队成员|金额/.test(String(query || ""));
  }

  function looksLikeFallbackEvidenceSummary(text = "") {
    const normalized = String(text || "").toLowerCase();
    return (
      normalized.includes("based on the retrieved project evidence") ||
      normalized.includes("the most relevant findings") ||
      normalized.includes(" mentions ") ||
      normalized.startsWith("鏍规嵁褰撳墠鐭ヨ瘑搴撴绱㈢粨鏋滐細") ||
      normalized.startsWith("閽堝")
    );
  }

  function buildRuleOrPermissionAnswer(query = "", citationItems = []) {
    const groups = groupCitationItemsByDocument(citationItems);
    if (!groups.length) {
      return "";
    }

    const sections = [];
    const amountDocs = groups.filter((group) => /金额|合同|开票|发票|回款/.test(group.title + " " + group.items.map((item) => item.snippet).join(" ")));
    const permissionDocs = groups.filter((group) => /权限|负责人|团队|成员|转移|审批/.test(group.title + " " + group.items.map((item) => item.snippet).join(" ")));

    if (/金额|开票|合同/.test(query) && amountDocs.length) {
      sections.push(`金额编辑条件：${buildCitationSnippetSummary(amountDocs.flatMap((group) => group.items).slice(0, 3))}`);
    }
    if (/权限|负责人|团队|成员/.test(query) && permissionDocs.length) {
      sections.push(`负责人 / 团队成员权限：${buildCitationSnippetSummary(permissionDocs.flatMap((group) => group.items).slice(0, 3))}`);
    }
    if (groups.length > 1) {
      const related = groups.slice(0, 4).map((group) => documentTopic(group.title)).filter(Boolean);
      if (related.length) {
        sections.push(`涉及模块联动：${uniqueValues(related).join("、")}。`);
      }
    }

    if (!sections.length) {
      return "";
    }

    return [`针对“${truncateText(query, 48)}”，当前证据可以先支持这些结论：`, ...sections.map((item, index) => `${index + 1}. ${item}`)].join("\n");
  }

  */

  function normalizeSuggestedQuestions(items = []) {
    const normalized = [];
    const seen = new Set();
    (Array.isArray(items) ? items : []).forEach((item) => {
      const raw = typeof item === "string" ? { question: item, label: item } : item || {};
      const question = String(raw.question || raw.query || raw.text || "").trim();
      const label = String(raw.label || raw.title || question).trim();
      if (!question || seen.has(question)) {
        return;
      }
      seen.add(question);
      normalized.push({
        label: label || question,
        question,
        reason: truncateText(raw.reason || raw.description || "鏍规嵁褰撳墠鐭ヨ瘑搴撶敓鎴愩€?", 120),
      });
    });
    return normalized.slice(0, 6);
  }

  function buildReadableConclusion(text, citationItems = [], raw = {}) {
    const cleaned = cleanAnswerText(text);
    const query = String(raw.query || raw.originalQuestion || "").trim();
    if (isDocumentListQuestion(query)) {
      const documentListAnswer = buildDocumentListAnswer(query, raw.knowledgeDocuments || raw.documents || [], citationItems);
      if (documentListAnswer) {
        return documentListAnswer;
      }
    }
    if (isEvidenceInsufficientText(cleaned)) {
      return "当前知识库没有检索到足够证据，系统不会把无依据内容包装成正式结论。建议先补充相关需求、接口、交接或培训文档。";
    }

    if (cleaned && !isGenericEvidenceAnswer(cleaned)) {
      return truncateText(cleaned, 420);
    }

    if (isContentInventoryQuestion(query)) {
      const questionFocused = buildQuestionFocusedAnswer(query, citationItems, raw);
      if (questionFocused) {
        return questionFocused;
      }
    }

    if (isRuleFlowComparisonQuestion(query)) {
      const ruleFocused = buildRuleOrPermissionAnswer(query, citationItems);
      if (ruleFocused) {
        return ruleFocused;
      }
      if (cleaned && !looksLikeFallbackEvidenceSummary(cleaned)) {
        return truncateText(cleaned, 420);
      }
    }

    const fallbackTopics = uniqueValues(citationItems.map((item) => documentTopic(item.documentTitle || item.title || item.sourceName))).slice(0, 4);
    if (fallbackTopics.length) {
      return `当前问题命中了 ${fallbackTopics.join("、")} 等文档，建议结合下方证据摘要确认最终结论。`;
    }
    return query ? `当前问题“${truncateText(query, 80)}”暂未形成明确结论。` : "当前暂无明确结论。";
  }

  function buildQuestionFocusedAnswer(query = "", citationItems = [], raw = {}) {
    const grouped = groupCitationItemsByDocument(citationItems);
    if (!grouped.length || !isContentInventoryQuestion(query)) {
      return "";
    }

    const primary = grouped[0];
    const primaryTitle = primary.title || "相关文档";
    const aspects = extractEvidenceAspects(primary.items);
    const supportingTopics = grouped
      .slice(1, 4)
      .map((item) => documentTopic(item.title || ""))
      .filter(Boolean);

    const lines = [`围绕《${primaryTitle}》，当前命中的文档内容主要包括：`];
    if (aspects.length) {
      lines.push(...aspects.map((aspect, index) => `${index + 1}. ${aspect}`));
    } else {
      lines.push(`1. ${buildCitationSnippetSummary(primary.items)}`);
    }
    if (supportingTopics.length) {
      lines.push(`其他命中文档主要用于补充与该主题相关的上下游关系：${supportingTopics.join("、")}。`);
    }
    return lines.join("\n");
  }

  function isContentInventoryQuestion(query = "") {
    return /包含|哪些内容|都包含了|主要内容|文档内容|介绍|说明|清单|概览/.test(String(query || ""));
  }

  function isRuleFlowComparisonQuestion(query = "") {
    return /权限|条件|规则|流程|关系|关联|划分|区别|差异|编辑|审批|角色|负责人|团队成员|金额/.test(String(query || ""));
  }

  function looksLikeFallbackEvidenceSummary(text = "") {
    const normalized = String(text || "").toLowerCase();
    return (
      normalized.includes("based on the retrieved project evidence") ||
      normalized.includes("the most relevant findings") ||
      normalized.includes(" mentions ") ||
      normalized.startsWith("鏍规嵁褰撳墠鐭ヨ瘑搴撴绱㈢粨鏋滐細")
    );
  }

  function buildRuleOrPermissionAnswer(query = "", citationItems = []) {
    const groups = groupCitationItemsByDocument(citationItems);
    if (!groups.length) {
      return "";
    }

    const sections = [];
    const amountItems = groups
      .filter((group) => /金额|合同|开票|发票|回款/.test(group.title + " " + group.items.map((item) => item.snippet).join(" ")))
      .flatMap((group) => group.items)
      .slice(0, 3);
    const permissionItems = groups
      .filter((group) => /权限|负责人|团队|成员|转移|审批/.test(group.title + " " + group.items.map((item) => item.snippet).join(" ")))
      .flatMap((group) => group.items)
      .slice(0, 3);

    if (/金额|开票|合同/.test(query) && amountItems.length) {
      sections.push(`金额编辑条件：${buildCitationSnippetSummary(amountItems)}`);
    }
    if (/权限|负责人|团队|成员/.test(query) && permissionItems.length) {
      sections.push(`负责人 / 团队成员权限：${buildCitationSnippetSummary(permissionItems)}`);
    }
    if (groups.length > 1) {
      const related = uniqueValues(groups.slice(0, 4).map((group) => documentTopic(group.title)).filter(Boolean));
      if (related.length) {
        sections.push(`涉及模块联动：${related.join("、")}。`);
      }
    }

    if (!sections.length) {
      return "";
    }

    return [`针对“${truncateText(query, 48)}”，当前证据可以先支持这些结论：`, ...sections.map((item, index) => `${index + 1}. ${item}`)].join("\n");
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
      console.warn(`[SuperRAG ChatService] document options unavailable: ${error.message || error}`);
      return [];
    }
  }

  function buildReadableConclusion(text, citationItems = [], raw = {}) {
    const cleaned = cleanAnswerText(text);
    const query = String(raw.query || raw.originalQuestion || "").trim();
    if (isDocumentListQuestion(query)) {
      const documentListAnswer = buildDocumentListAnswer(query, raw.knowledgeDocuments || raw.documents || [], citationItems);
      if (documentListAnswer) {
        return documentListAnswer;
      }
    }
    if (isEvidenceInsufficientText(cleaned)) {
      return "当前知识库没有检索到足够证据，系统不会把无依据内容包装成正式结论。建议先补充相关需求、接口、交接或培训文档。";
    }
    if (cleaned && !isGenericEvidenceAnswer(cleaned)) {
      return truncateText(cleaned, 420);
    }

    const grouped = groupCitationItemsByDocument(citationItems);
    if (!grouped.length) {
      return query ? `当前问题“${truncateText(query, 80)}”暂未形成明确结论。` : "当前暂无明确结论。";
    }

    if (isContentInventoryQuestion(query)) {
      const primary = grouped[0];
      const aspects = extractEvidenceAspects(primary.items);
      const lines = [`围绕《${primary.title || "相关文档"}》，当前命中的文档内容主要包括：`];
      if (aspects.length) {
        lines.push(...aspects.map((aspect, index) => `${index + 1}. ${aspect}`));
      } else {
        lines.push(`1. ${buildCitationSnippetSummary(primary.items)}`);
      }
      return lines.join("\n");
    }

    const docLines = grouped
      .slice(0, 3)
      .map((group, index) => `${index + 1}. ${group.title || "相关文档"}：${buildCitationSnippetSummary(group.items)}`)
      .filter(Boolean);
    if (docLines.length) {
      return [`针对“${truncateText(query, 48)}”，当前证据更直接支持这些信息：`, ...docLines].join("\n");
    }

    const fallbackTopics = uniqueValues(citationItems.map((item) => documentTopic(item.documentTitle || item.title || item.sourceName))).slice(0, 4);
    if (fallbackTopics.length) {
      return `当前问题命中了 ${fallbackTopics.join("、")} 等文档，建议结合下方证据摘要确认最终结论。`;
    }
    return query ? `当前问题“${truncateText(query, 80)}”暂未形成明确结论。` : "当前暂无明确结论。";
  }

  function isGenericEvidenceAnswer(text) {
    const normalized = String(text || "").toLowerCase();
    return (
      normalized.includes("based on the retrieved project evidence") ||
      normalized.includes("the most relevant findings") ||
      normalized.includes(" mentions ") ||
      normalized.startsWith("根据当前知识库检索结果") ||
      normalized.startsWith("鏍规嵁褰撳墠")
    );
  }

  window.chatService = {
    getSessions,
    getKnowledgeOptions,
    getSuggestedQuestions,
    getMessages,
    deleteSession,
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
