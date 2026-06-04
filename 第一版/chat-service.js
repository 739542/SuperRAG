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
    const localSessions = buildLocalChatSessions(getLocalChatRecords());
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

  async function getSuggestedQuestions(params = {}) {
    const documents = Array.isArray(params.documents) ? params.documents : [];
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
      console.warn(`[SuperRAG ChatService] suggested questions fallback: ${error.message || error}`);
    }

    return {
      items: buildLocalSuggestedQuestions({ ...params, documents }),
      source: "frontend-fallback",
      warning: "后端推荐问题接口暂不可用，已基于当前前端文档列表生成兜底问题。",
    };
  }

  async function getMessages(sessionId) {
    const localMessages = buildMessagesFromLocalHistory(sessionId);
    if (localMessages.length) {
      return clone(localMessages);
    }

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
      evidence: evidenceLines.join("\n") || "当前回答没有足够的可引用证据。",
      evidenceItems: buildEvidenceItemsFromCitations(citationItems, evidenceLines),
      suggestion: suggestionLines.join("\n") || "建议继续补充相关项目文档后再确认结论。",
      suggestionItems: normalizeDisplayList(suggestionLines, ["核对下方引用证据后，再将回答作为正式结论使用。"]),
      uncertainty: uncertaintyLines.join("\n") || "当前没有识别到明显的不确定项。",
      uncertaintyItems: normalizeDisplayList(uncertaintyLines, []),
    };
  }

  function normalizeStructuredAnswer(answer = {}, { raw = {}, citationItems = [] } = {}) {
    const source = answer && typeof answer === "object" ? answer : {};
    const rawConclusion = source.conclusion || raw.answer || raw.summary || raw.content || "";
    const evidenceLines = normalizeDisplayList(source.evidence || raw.evidence || [], []);
    const suggestionLines = normalizeDisplayList(
      source.suggestionItems || source.suggestion || raw.implementationSuggestions || raw.implementation_suggestions || raw.nextActions || [],
      ["核对引用证据后，再把回答作为正式交接或设计结论使用。"],
    );
    const uncertaintyLines = normalizeDisplayList(
      source.uncertaintyItems || source.uncertainty || raw.uncertainPoints || raw.uncertain_points || raw.missingInformation || raw.missing_information || raw.risks || [],
      [],
    );
    const evidenceItems = normalizeEvidenceItems(source.evidenceItems || source.evidence_items, citationItems, evidenceLines);
    const conclusion = buildReadableConclusion(rawConclusion, citationItems, raw);
    const followUpItems = buildFollowUpQuestions(raw.query || raw.originalQuestion || "", citationItems, conclusion);

    return {
      conclusion,
      evidence: evidenceItems.length
        ? evidenceItems.map((item, index) => `${index + 1}. ${item.title}：${item.summary}`).join("\n")
        : evidenceLines.join("\n") || "当前回答没有足够的可引用证据。",
      evidenceItems,
      suggestion: (suggestionLines.length ? suggestionLines : followUpItems).join("\n"),
      suggestionItems: suggestionLines.length ? suggestionLines : followUpItems,
      followUpItems,
      uncertainty: uncertaintyLines.join("\n") || "当前没有识别到明显的不确定项。",
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
                summary: cleanEvidenceSnippet(item),
                score: "",
              };
            }
            return {
              title: item.title || item.documentTitle || item.sourceDocument || `证据 ${index + 1}`,
              summary: cleanEvidenceSnippet(item.summary || item.snippet || item.evidenceSnippet || item.content || item.description || ""),
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
      summary: cleanEvidenceSnippet(citation.snippet || citation.content || "", citation.documentTitle || citation.title || ""),
      score: Number(citation.relevanceScore ?? citation.score ?? 0),
      documentId: citation.documentId || "",
      chunkId: citation.chunkId || citation.segmentId || citation.id || "",
    }));

    if (fromCitations.length) {
      return fromCitations;
    }

    return evidenceLines.slice(0, 5).map((line, index) => ({
      title: `证据 ${index + 1}`,
      summary: cleanEvidenceSnippet(line),
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
      .map(cleanAnswerText)
      .map(translateTechnicalLine)
      .filter(Boolean);
    return items.length ? items : fallback;
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
      .replace(/\bI could not find grounded project evidence for this question in the current knowledge base\.?/gi, "当前知识库没有检索到足够证据。")
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
      .replace(/^No grounded evidence was found.*$/i, "当前知识库没有检索到足够证据。")
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
    getSuggestedQuestions,
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
