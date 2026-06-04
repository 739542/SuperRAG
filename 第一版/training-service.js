/**
 * Training service and adapter layer.
 * Calls dify-lite first and falls back to mock data when the backend has no
 * matching imported project yet.
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

  async function getTrainingOptions() {
    const documents = await getDocumentsWithFallback();
    return {
      topics: ["项目背景", "核心概念", "功能模块", "业务流程", "接口与数据", "测试与验收"],
      projects: uniqueValues(documents.map((item) => item.project || item.collectionName || item.collection_name)),
    };
  }

  async function generateTrainingResult(payload = {}) {
    try {
      const raw = await getBackend().requestJson("/scenes/training", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        timeoutMs: window.SuperRagConfig?.CHAT_API_TIMEOUT_MS || 90000,
        body: JSON.stringify({
          query: payload.query,
          project: payload.project,
          focus: payload.topic,
          role: "training",
          user: "course-demo-user",
        }),
      });
      const result = mapSceneResultToTrainingResult(raw, payload);
      getBackend().appendHistoryRecord({
        id: result.id,
        title: result.title,
        sceneMode: "training",
        artifactType: "training_plan",
        project: result.project,
        summary: result.summary,
        query: result.query,
        originalQuestion: result.query,
        outputSummary: result.summary,
        structuredOutput: result,
        qualityAssessment: raw.qualityAssessment || raw.quality_assessment || {},
        citations: result.citations,
      });
      return clone(result);
    } catch (error) {
      console.warn(`[SuperRAG TrainingService] backend unavailable, using mock: ${error.message || error}`);
      const base = getMock().mockTrainingResult || {};
      const citations = resolveCitations(base.citations);
      return clone(
        mapWorkflowTrainingResultToTrainingResult({
          ...base,
          query: payload.query || "请解释项目背景",
          topic: payload.topic || base.topic || "项目背景",
          project: payload.project || base.project || "企业知识库",
          citations,
        }),
      );
    }
  }

  function mapWorkflowTrainingResultToTrainingResult(raw = {}) {
    return {
      id: raw.id || `training-${Date.now()}`,
      title: raw.title || "培训材料",
      query: raw.query || "",
      topic: raw.topic || "项目背景",
      project: raw.project || "企业知识库",
      summary: raw.summary || raw.conclusion || "",
      background: raw.background || raw.backgroundSummary || raw.summary || raw.conclusion || "",
      terms: raw.terms || raw.termExplanations || [],
      learningPath: raw.learningPath || raw.learning_path || raw.path || [],
      recommendedDocs: raw.recommendedDocs || raw.recommended_docs || raw.documents || [],
      citations: (raw.citations || []).map(mapCitationToEvidence),
    };
  }

  function mapSceneResultToTrainingResult(raw = {}, payload = {}) {
    const citations = (raw.citations || []).map(mapCitationToEvidence);
    const evidence = raw.evidence || [];
    const actions = raw.nextActions || [];
    const summary = raw.summary || "";
    if (isEvidenceInsufficientText(summary) || (!citations.length && evidence.some(isEvidenceInsufficientText))) {
      return {
        id: raw.id || `training-${Date.now()}`,
        title: "新人培训计划生成受限",
        query: payload.query || "",
        topic: payload.topic || "项目背景",
        project: raw.collection?.name || payload.project || "",
        summary: "当前知识库证据不足，无法生成正式新人培训计划。",
        background: "系统没有检索到足够的项目文档证据。请先补充需求文档、接口文档、部署说明或新人培训资料。",
        terms: [],
        learningPath: [],
        recommendedDocs: [],
        citations,
        evidenceInsufficient: true,
      };
    }
    return {
      id: raw.id || `training-${Date.now()}`,
      title: raw.title || "培训材料",
      query: payload.query || "",
      topic: payload.topic || "项目背景",
      project: raw.collection?.name || payload.project || "",
      summary,
      background: summary,
      terms: evidence.slice(0, 4).map((item, index) => ({
        term: `知识点 ${index + 1}`,
        explanation: item,
      })),
      learningPath: actions.slice(0, 5).map((item, index) => ({
        day: `步骤 ${index + 1}`,
        title: item,
        description: item,
      })),
      recommendedDocs: citations.slice(0, 4).map((citation) => ({
        title: citation.documentTitle,
        reason: citation.snippet,
        priority: "high",
        estimatedReadTime: "5 min",
      })),
      citations,
    };
  }

  function isEvidenceInsufficientText(value) {
    const text = String(value || "").toLowerCase();
    return [
      "i could not find grounded project evidence",
      "no evidence was found",
      "current knowledge base",
      "grounded evidence",
      "当前知识库没有检索到",
      "证据不足",
      "没有找到足够",
    ].some((pattern) => text.includes(pattern));
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

  async function getDocumentsWithFallback() {
    try {
      const response = await getBackend().requestJson("/documents");
      return Array.isArray(response.items) ? response.items : [];
    } catch (error) {
      return getMock().mockDocuments || [];
    }
  }

  function mapWorkflowTrainingResultToTrainingResult(raw = {}) {
    const citations = (raw.citations || []).map(mapCitationToEvidence);
    const keyConcepts = normalizeKeyConcepts(raw.keyConcepts || raw.key_concepts || raw.terms || raw.termExplanations || []);
    const learningPath = normalizeLearningPath(raw.learningPath || raw.learning_path || raw.path || [], citations);
    const phaseSummaries = normalizePhaseSummaries(raw.phaseSummaries || raw.phase_summaries || [], learningPath);
    const recommendedDocs = normalizeRecommendedDocs(raw.recommendedDocs || raw.recommended_docs || raw.documents || [], citations);
    const selfTestQuestions = normalizeSelfTestQuestions(raw.selfTestQuestions || raw.self_test_questions || [], {
      query: raw.query || "",
      citations,
      learningPath,
    });
    const uncertainty = normalizeUncertainty(raw.uncertainty || raw.uncertainPoints || raw.uncertain_points || []);
    return {
      id: raw.id || `training-${Date.now()}`,
      title: raw.title || "鍩硅鏉愭枡",
      query: raw.query || "",
      topic: raw.topic || "椤圭洰鑳屾櫙",
      project: raw.project || "浼佷笟鐭ヨ瘑搴?",
      summary: raw.summary || raw.conclusion || "",
      background: raw.background || raw.backgroundSummary || raw.summary || raw.conclusion || "",
      keyConcepts,
      terms: keyConcepts,
      learningPath,
      phaseSummaries,
      recommendedDocs,
      selfTestQuestions,
      uncertainty,
      citations,
      evidenceInsufficient: Boolean(raw.evidenceInsufficient || raw.evidence_insufficient),
    };
  }

  function mapSceneResultToTrainingResult(raw = {}, payload = {}) {
    const citations = (raw.citations || []).map(mapCitationToEvidence);
    const summary = raw.summary || "";
    const background = raw.background || raw.structuredAnswer?.background || summary;
    const keyConcepts = normalizeKeyConcepts(raw.keyConcepts || raw.structuredAnswer?.keyConcepts || raw.terms || []);
    const learningPath = normalizeLearningPath(raw.learningPath || raw.structuredAnswer?.learningPath || [], citations);
    const phaseSummaries = normalizePhaseSummaries(raw.phaseSummaries || raw.structuredAnswer?.phaseSummaries || [], learningPath);
    const recommendedDocs = normalizeRecommendedDocs(raw.recommendedDocs || raw.structuredAnswer?.recommendedDocs || [], citations);
    const selfTestQuestions = normalizeSelfTestQuestions(raw.selfTestQuestions || raw.structuredAnswer?.selfTestQuestions || [], {
      query: payload.query || raw.query || "",
      citations,
      learningPath,
    });
    const uncertainty = normalizeUncertainty(raw.uncertainty || raw.structuredAnswer?.uncertainty || []);

    if (isEvidenceInsufficientText(summary) || (!citations.length && (raw.evidence || []).some(isEvidenceInsufficientText))) {
      return {
        id: raw.id || `training-${Date.now()}`,
        title: "鏂颁汉鍩硅璁″垝鐢熸垚鍙楅檺",
        query: payload.query || "",
        topic: payload.topic || "椤圭洰鑳屾櫙",
        project: raw.collection?.name || payload.project || "",
        summary: "褰撳墠鐭ヨ瘑搴撹瘉鎹笉瓒筹紝鏃犳硶鐢熸垚姝ｅ紡鏂颁汉鍩硅璁″垝銆?",
        background: "绯荤粺娌℃湁妫€绱㈠埌瓒冲鐨勯」鐩枃妗ｈ瘉鎹€傝鍏堣ˉ鍏呴渶姹傛枃妗ｃ€佹帴鍙ｆ枃妗ｃ€侀儴缃茶鏄庢垨鏂颁汉鍩硅璧勬枡銆?",
        keyConcepts: [],
        terms: [],
        learningPath: [],
        phaseSummaries: [],
        recommendedDocs: [],
        selfTestQuestions: [],
        uncertainty,
        citations,
        evidenceInsufficient: true,
      };
    }

    return {
      id: raw.id || `training-${Date.now()}`,
      title: raw.title || "鍩硅鏉愭枡",
      query: payload.query || "",
      topic: payload.topic || "椤圭洰鑳屾櫙",
      project: raw.collection?.name || payload.project || "",
      summary,
      background,
      keyConcepts,
      terms: keyConcepts,
      learningPath,
      phaseSummaries,
      recommendedDocs,
      selfTestQuestions,
      uncertainty,
      citations,
      evidenceInsufficient: Boolean(raw.evidenceInsufficient || raw.evidence_insufficient),
    };
  }

  function normalizeKeyConcepts(items = []) {
    const result = [];
    const seen = new Set();
    (Array.isArray(items) ? items : []).forEach((item, index) => {
      const raw = typeof item === "string" ? { name: item, explanation: item } : item || {};
      const term = String(raw.name || raw.term || `鐭ヨ瘑鐐?${index + 1}`).trim();
      const explanation = String(raw.explanation || raw.description || raw.summary || "").trim();
      if (!term || seen.has(term) || isGenericTrainingText(term) || isGenericTrainingText(explanation)) {
        return;
      }
      seen.add(term);
      result.push({
        term,
        name: term,
        explanation,
        relatedDocuments: normalizeStringList(raw.relatedDocuments || raw.documents || []),
      });
    });
    return result.slice(0, 8);
  }

  function normalizeLearningPath(items = [], citations = []) {
    const result = [];
    (Array.isArray(items) ? items : []).forEach((item, index) => {
      const raw = typeof item === "string" ? { title: item, goal: item, description: item } : item || {};
      const title = String(raw.title || raw.name || "").trim();
      const goal = String(raw.goal || raw.description || title).trim();
      const tasks = normalizeStringList(raw.tasks || raw.steps || []).filter((task) => !isGenericTrainingText(task));
      const deliverable = String(raw.deliverable || raw.output || "").trim();
      const relatedDocuments = normalizeStringList(raw.relatedDocuments || raw.documents || []);
      if (!title || isGenericTrainingText(title) || isGenericTrainingText(goal) || (!tasks.length && !goal)) {
        return;
      }
      result.push({
        day: String(raw.day || `Day ${index + 1}`),
        title,
        goal,
        tasks: tasks.length ? tasks : [goal],
        deliverable: deliverable || "输出当日学习笔记或问题清单。",
        relatedDocuments,
        description: String(raw.description || goal).trim(),
      });
    });
    if (!result.length && citations.length) {
      return citations.slice(0, 4).map((citation, index) => ({
        day: `Day ${index + 1}`,
        title: `阅读 ${citation.documentTitle}`,
        goal: citation.snippet || `理解 ${citation.documentTitle} 的核心内容。`,
        tasks: [
          `阅读 ${citation.documentTitle} 的核心片段并整理业务对象、流程和规则。`,
          "记录当前仍需补证据或请教团队的问题。",
        ],
        deliverable: `输出《${citation.documentTitle}》学习笔记。`,
        relatedDocuments: [citation.documentTitle],
        description: citation.snippet || `围绕 ${citation.documentTitle} 形成入门理解。`,
      }));
    }
    return result.slice(0, 7);
  }

  function normalizePhaseSummaries(items = [], learningPath = []) {
    const result = [];
    (Array.isArray(items) ? items : []).forEach((item) => {
      const raw = typeof item === "string" ? { phase: item, focus: item } : item || {};
      const phase = String(raw.phase || raw.title || "").trim();
      const focus = String(raw.focus || raw.summary || raw.description || "").trim();
      if (!phase || isGenericTrainingText(phase) || isGenericTrainingText(focus)) {
        return;
      }
      result.push({
        phase,
        focus,
        days: normalizeStringList(raw.days || raw.dayRange || []),
        expectedOutcome: String(raw.expectedOutcome || raw.outcome || "").trim(),
      });
    });
    if (!result.length && learningPath.length) {
      return [
        {
          phase: "理解业务对象",
          focus: "先识别业务对象、模块职责和基础术语，建立整体认知框架。",
          days: learningPath.slice(0, 2).map((item) => item.day),
          expectedOutcome: "能够说明核心模块分别解决什么问题。",
        },
        {
          phase: "走通主链路",
          focus: "把主流程、关键状态、上下游依赖和核心规则串起来。",
          days: learningPath.slice(2, 4).map((item) => item.day),
          expectedOutcome: "能够复述主业务链路和关键状态变化。",
        },
        {
          phase: "掌握规则与异常",
          focus: "重点核对权限、金额、状态、异常流程等高风险边界。",
          days: learningPath.slice(4, 6).map((item) => item.day),
          expectedOutcome: "能够区分正常流程、异常流程和待确认规则。",
        },
        {
          phase: "自测与复盘",
          focus: "通过问答自测和证据复盘，梳理仍需补文档或请教的问题。",
          days: learningPath.slice(-1).map((item) => item.day),
          expectedOutcome: "形成一份自测清单和问题清单。",
        },
      ];
    }
    return result.slice(0, 4);
  }

  function normalizeRecommendedDocs(items = [], citations = []) {
    const result = [];
    const seen = new Set();
    (Array.isArray(items) ? items : []).forEach((item) => {
      const raw = typeof item === "string" ? { title: item, reason: item } : item || {};
      const title = String(raw.title || raw.documentTitle || "").trim();
      const reason = String(raw.reason || raw.summary || raw.description || "").trim();
      if (!title || seen.has(title) || isGenericTrainingText(reason)) {
        return;
      }
      seen.add(title);
      result.push({
        title,
        reason,
        priority: String(raw.priority || "medium").trim() || "medium",
        estimatedReadTime: String(raw.estimatedReadTime || raw.estimated_read_time || "10-15 min").trim(),
      });
    });
    if (!result.length) {
      citations.slice(0, 5).forEach((citation, index) => {
        const title = String(citation.documentTitle || citation.sourceName || "").trim();
        if (!title || seen.has(title)) {
          return;
        }
        seen.add(title);
        result.push({
          title,
          reason: citation.snippet,
          priority: index < 2 ? "high" : "medium",
          estimatedReadTime: "10-15 min",
        });
      });
    }
    return result.slice(0, 6);
  }

  function normalizeSelfTestQuestions(items = [], { query = "", citations = [], learningPath = [] } = {}) {
    const result = normalizeStringList(items).filter((item) => !isGenericTrainingText(item));
    if (result.length) {
      return result.slice(0, 8);
    }
    const docNames = uniqueValues(
      citations
        .map((item) => item.documentTitle || item.sourceName || "")
        .concat(learningPath.flatMap((item) => item.relatedDocuments || []))
        .filter(Boolean),
    );
    const topicText = docNames.slice(0, 3).join("、") || "当前项目模块";
    return [
      query ? `围绕“${query}”，当前知识库已经明确了哪些结论？` : "",
      `请用自己的话说明 ${topicText} 分别承担什么业务职责。`,
      "主流程从哪里开始，经过哪些关键状态或审批节点，最后产出什么结果？",
      "哪些字段、金额、权限或状态规则最容易出错？",
    ].filter(Boolean).slice(0, 6);
  }

  function normalizeUncertainty(items = []) {
    return normalizeStringList(items).filter((item) => !isGenericTrainingText(item)).slice(0, 5);
  }

  function normalizeStringList(value) {
    const list = Array.isArray(value) ? value : typeof value === "string" ? value.split(/\n+/) : [];
    return list.map((item) => String(item || "").trim()).filter(Boolean);
  }

  function isGenericTrainingText(value) {
    const text = String(value || "").trim();
    if (!text) {
      return false;
    }
    return [
      "优先核对引用文档原文",
      "未绑定证据的实现想法只能作为待复核建议",
      "待复核建议",
      "核对引用文档原文",
      "作为正式结论",
      "grounded evidence",
      "review the cited documents",
      "still needs review",
    ].some((pattern) => text.includes(pattern));
  }

  window.trainingService = {
    getTrainingOptions,
    generateTrainingResult,
    mapWorkflowTrainingResultToTrainingResult,
    mapCitationToEvidence,
  };

  window.trainingApi = window.trainingService;
})();
