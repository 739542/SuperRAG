const routes = {
  "/login": "登录",
  "/dashboard": "首页 / 控制台",
  "/demo-center": "答辩演示中心",
  "/documents": "文档知识库",
  "/chat": "智能问答",
  "/training": "新人培训",
  "/handover": "项目交接",
  "/design-assistant": "需求设计辅助",
  "/knowledge-gaps": "知识缺口与证据",
  "/history": "历史产物",
  "/settings": "管理员诊断",
};

const legacyRouteMap = {
  "/general": "/chat",
  "/design": "/design-assistant",
};

const defaultRoute = "/login";
let dashboardLoaded = false;
const documentState = {
  loaded: false,
  documents: [],
};
const chatState = {
  loaded: false,
  sessions: [],
  messagesBySession: {},
  activeSessionId: "",
  documents: [],
  citations: [],
  evidenceLevel: "medium",
  loading: false,
  suggestedQuestions: [],
  suggestedQuestionSource: "",
  suggestedQuestionWarning: "",
  suggestedQuestionScopeKey: "",
  suggestedQuestionLoading: false,
};
const trainingState = {
  loaded: false,
  result: null,
};
const handoverState = {
  loaded: false,
  result: null,
};
const designState = {
  loaded: false,
  result: null,
  activeTab: "overview",
  loading: false,
  editing: false,
  originalResult: null,
  editedResult: null,
  hasManualEdits: false,
  modifiedAt: null,
};
let mermaidLoaderPromise = null;
const historyState = {
  loaded: false,
  records: [],
  options: null,
  activeRecordId: "",
};
const knowledgeGapState = {
  loaded: false,
  data: null,
};
const demoCenterState = {
  loaded: false,
  data: null,
};
const settingsState = {
  loaded: false,
  settings: null,
};

const SIDEBAR_COLLAPSED_STORAGE_KEY = "superrag.sidebar.collapsed";

document.addEventListener("DOMContentLoaded", () => {
  bindLoginActions();
  bindTopbarActions();
  bindDashboardActions();
  bindDemoCenterActions();
  bindChatActions();
  bindTrainingActions();
  bindHandoverActions();
  bindDesignActions();
  bindHistoryActions();
  bindSettingsActions();
  bindDocumentsActions();
  window.addEventListener("hashchange", renderCurrentRoute);
  renderCurrentRoute();
});

function bindTopbarActions() {
  const searchInput = document.querySelector(".global-search input");
  const noticeButton = document.querySelector(".icon-button");
  const sidebarToggle = document.getElementById("sidebar-toggle");

  initializeSidebarToggle(sidebarToggle);

  if (searchInput) {
    searchInput.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") {
        return;
      }
      event.preventDefault();
      const keyword = searchInput.value.trim();
      toast(keyword ? `全局搜索占位：${keyword}` : "请输入搜索关键词。");
    });
  }

  if (noticeButton) {
    noticeButton.addEventListener("click", () => {
      toast("通知中心建设中。");
    });
  }
}

function initializeSidebarToggle(toggleButton) {
  const isCollapsed = localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === "1";
  setSidebarCollapsed(isCollapsed, toggleButton);

  if (!toggleButton) {
    return;
  }

  toggleButton.addEventListener("click", () => {
    const nextCollapsed = !document.body.classList.contains("sidebar-collapsed");
    setSidebarCollapsed(nextCollapsed, toggleButton);
    localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, nextCollapsed ? "1" : "0");
  });
}

function setSidebarCollapsed(isCollapsed, toggleButton = document.getElementById("sidebar-toggle")) {
  document.body.classList.toggle("sidebar-collapsed", isCollapsed);

  if (!toggleButton) {
    return;
  }

  toggleButton.setAttribute("aria-pressed", String(isCollapsed));
  toggleButton.setAttribute("aria-label", isCollapsed ? "展开侧边栏" : "收起侧边栏");

  const toggleText = toggleButton.querySelector(".sidebar-toggle-text");
  if (toggleText) {
    toggleText.textContent = isCollapsed ? "展开菜单" : "收起菜单";
  }
}

function renderCurrentRoute() {
  const route = getRouteFromLocation();
  const normalizedRoute = normalizeRoute(route);

  if (normalizedRoute !== route || !routes[normalizedRoute]) {
    replaceHash(normalizedRoute);
    return;
  }

  document.querySelectorAll("[data-page]").forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.page === normalizedRoute);
  });
  document.body.classList.toggle("is-login-route", normalizedRoute === "/login");

  document.querySelectorAll("[data-route]").forEach((link) => {
    const isActive = link.dataset.route === normalizedRoute;
    link.classList.toggle("active", isActive);
    if (isActive) {
      link.setAttribute("aria-current", "page");
    } else {
      link.removeAttribute("aria-current");
    }
  });

  document.title = `${routes[normalizedRoute]} | SuperRAG`;

  if (normalizedRoute === "/login") {
    return;
  }

  if (normalizedRoute === "/dashboard") {
    renderDashboardPage();
  }

  if (normalizedRoute === "/demo-center") {
    renderDemoCenterPage();
  }

  if (normalizedRoute === "/documents") {
    renderDocumentsPage();
  }

  if (normalizedRoute === "/chat") {
    renderChatPage();
  }

  if (normalizedRoute === "/training") {
    renderTrainingPage();
  }

  if (normalizedRoute === "/handover") {
    renderHandoverPage();
  }

  if (normalizedRoute === "/design-assistant") {
    renderDesignPage();
  }

  if (normalizedRoute === "/knowledge-gaps") {
    renderKnowledgeGapsPage();
  }

  if (normalizedRoute === "/history") {
    renderHistoryPage();
  }

  if (normalizedRoute === "/settings") {
    renderSettingsPage();
  }
}

function bindLoginActions() {
  const loginForm = document.getElementById("login-form");
  const forgotButton = document.getElementById("login-forgot");

  if (loginForm) {
    loginForm.addEventListener("submit", (event) => {
      event.preventDefault();
      toast("登录成功，已进入 SuperRAG 演示中心。");
      window.location.hash = "#/demo-center";
    });
  }

  if (forgotButton) {
    forgotButton.addEventListener("click", () => {
      toast("当前为前端演示账号，真实找回密码能力由后端账号体系提供。");
    });
  }
}

function bindDashboardActions() {
  document.addEventListener("click", (event) => {
    const sessionItem = event.target.closest("[data-session-route]");
    if (!sessionItem) {
      return;
    }
    window.location.hash = sessionItem.dataset.sessionRoute;
  });
}

function bindDemoCenterActions() {
  document.addEventListener("click", async (event) => {
    const copyButton = event.target.closest("[data-demo-copy-question]");
    if (!copyButton) {
      return;
    }
    const question = copyButton.dataset.demoCopyQuestion || "";
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(question);
      toast("演示问题已复制，可以粘贴到对应场景页面。");
      return;
    }
    toast("当前浏览器不支持自动复制，请手动复制问题。");
  });
}

function bindChatActions() {
  document.addEventListener("input", (event) => {
    if (event.target.id !== "chat-session-search") {
      return;
    }
    renderChatSessions();
  });

  document.addEventListener("click", async (event) => {
    const deleteButton = event.target.closest("[data-chat-delete-session-id]");
    if (deleteButton) {
      await removeChatSession(deleteButton.dataset.chatDeleteSessionId);
      return;
    }

    const sessionButton = event.target.closest("[data-chat-session-id]");
    if (sessionButton) {
      chatState.activeSessionId = sessionButton.dataset.chatSessionId;
      await ensureChatMessages(chatState.activeSessionId);
      updateChatEvidenceFromActiveSession();
      renderChatPageContent();
      return;
    }

    const quickQuestion = event.target.closest("[data-chat-question]");
    if (quickQuestion) {
      const input = document.getElementById("chat-input");
      if (input) {
        input.value = quickQuestion.dataset.chatQuestion;
      }
      await submitChatQuestion(quickQuestion.dataset.chatQuestion);
      return;
    }

    if (event.target.closest("#chat-new-session")) {
      createNewChatSession();
      renderChatPageContent();
      document.getElementById("chat-input")?.focus();
      return;
    }

    const citationButton = event.target.closest("[data-citation-title]");
    if (citationButton) {
      openCitationSource(citationButton);
    }
  });

  document.addEventListener("change", async (event) => {
    if (!event.target.matches("#chat-knowledge-select, #chat-project-select, #chat-answer-mode")) {
      return;
    }
    renderChatConversation();
    await refreshChatSuggestedQuestions({ force: true });
  });

  document.addEventListener("submit", async (event) => {
    if (event.target.id !== "chat-form") {
      return;
    }
    event.preventDefault();
    await submitChatQuestion(document.getElementById("chat-input")?.value);
  });
}

async function renderChatPage() {
  if (!chatState.loaded) {
    await loadChatData();
  }
  renderChatPageContent();
  await refreshChatSuggestedQuestions();
}

async function loadChatData() {
  const service = getChatService();
  if (!service) {
    return;
  }

  const [sessionsResult, knowledgeOptions] = await Promise.all([
    service.getSessions(),
    service.getKnowledgeOptions(),
  ]);
  chatState.sessions = sessionsResult.list;
  chatState.documents = knowledgeOptions.documents;
  chatState.activeSessionId = chatState.sessions[0]?.id || "";
  chatState.loaded = true;

  if (chatState.activeSessionId) {
    await ensureChatMessages(chatState.activeSessionId);
    updateChatEvidenceFromActiveSession();
  }
}

function renderChatPageContent() {
  populateChatConfigOptions();
  renderChatSessions();
  renderChatConversation();
  renderChatCitationPanel();
  renderChatSuggestedQuestions();
}

async function refreshChatSuggestedQuestions({ force = false } = {}) {
  const service = getChatService();
  if (!service || !chatState.loaded) {
    return;
  }

  const scope = getChatSuggestionScope();
  const scopeKey = JSON.stringify(scope);
  if (!force && chatState.suggestedQuestionScopeKey === scopeKey && chatState.suggestedQuestions.length) {
    return;
  }

  chatState.suggestedQuestionScopeKey = scopeKey;
  chatState.suggestedQuestionLoading = true;
  renderChatSuggestedQuestions();

  try {
    const result = await service.getSuggestedQuestions({
      ...scope,
      documents: chatState.documents,
    });
    chatState.suggestedQuestions = result.items || [];
    chatState.suggestedQuestionSource = result.source || "";
    chatState.suggestedQuestionWarning = result.warning || "";
  } catch (error) {
    chatState.suggestedQuestions = [];
    chatState.suggestedQuestionSource = "frontend-error";
    chatState.suggestedQuestionWarning = error.message || "推荐问题生成失败。";
  } finally {
    chatState.suggestedQuestionLoading = false;
    renderChatSuggestedQuestions();
  }
}

function getChatSuggestionScope() {
  return {
    knowledgeBaseId: document.getElementById("chat-knowledge-select")?.value || "",
    project: document.getElementById("chat-project-select")?.value || "",
    answerMode: document.getElementById("chat-answer-mode")?.value || "evidence",
  };
}

function renderChatSuggestedQuestions() {
  const container = document.getElementById("chat-quick-question-row");
  if (!container) {
    return;
  }

  if (chatState.suggestedQuestionLoading) {
    container.innerHTML = '<span class="quick-question-status">正在根据当前知识库生成猜你想问...</span>';
    return;
  }

  const questions = chatState.suggestedQuestions || [];
  if (!questions.length) {
    container.innerHTML = '<span class="quick-question-status">当前知识库暂无推荐问题，可直接输入问题开始检索。</span>';
    return;
  }

  const sourceLabel = getSuggestedQuestionSourceLabel(chatState.suggestedQuestionSource);
  container.innerHTML = [
    `<span class="quick-question-source">${escapeHtml(sourceLabel)}</span>`,
    ...questions.map((item) => {
      const question = item.question || item.label || "";
      const label = item.label || question;
      return `<button type="button" data-chat-question="${escapeHtml(question)}" title="${escapeHtml(item.reason || question)}">${escapeHtml(label)}</button>`;
    }),
  ].join("");
}

function getSuggestedQuestionSourceLabel(source = "") {
  if (/openai|model|compatible/i.test(source)) {
    return "AI 生成";
  }
  if (/fallback/i.test(source)) {
    return "基于文档生成";
  }
  return "猜你想问";
}

function populateChatConfigOptions() {
  const knowledgeSelect = document.getElementById("chat-knowledge-select");
  const projectSelect = document.getElementById("chat-project-select");
  if (!knowledgeSelect || !projectSelect) {
    return;
  }

  const knowledgeItems = uniqueValues(
    chatState.documents.map((item) => item.difyDatasetId || item.project || "企业知识库"),
  );
  const projectItems = uniqueValues(chatState.documents.map((item) => item.project));

  setSelectOptions(knowledgeSelect, knowledgeItems, "全部知识库");
  setSelectOptions(projectSelect, projectItems, "全部项目");
}

function setSelectOptions(select, values, allLabel) {
  const currentValue = select.value;
  select.innerHTML = [
    `<option value="">${escapeHtml(allLabel)}</option>`,
    ...values.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`),
  ].join("");
  select.value = values.includes(currentValue) ? currentValue : "";
}

function renderChatSessions() {
  const container = document.getElementById("chat-session-list");
  if (!container) {
    return;
  }

  const keyword = String(document.getElementById("chat-session-search")?.value || "").trim().toLowerCase();
  const sessions = chatState.sessions.filter((session) => {
    return !keyword || [session.title, formatSceneMode(session.sceneMode)].join(" ").toLowerCase().includes(keyword);
  });

  if (!sessions.length) {
    container.innerHTML = '<div class="empty-inline">暂无匹配会话。</div>';
    return;
  }

  container.innerHTML = sessions
    .map(
      (session) => `
        <div class="chat-session-row">
          <button class="chat-session-item ${session.id === chatState.activeSessionId ? "active" : ""}" type="button" data-chat-session-id="${escapeHtml(session.id)}">
            <span>
              <strong>${escapeHtml(session.title)}</strong>
              <small>${escapeHtml(formatSceneMode(session.sceneMode))}</small>
            </span>
            <time>${escapeHtml(formatShortTime(session.updatedAt))}</time>
          </button>
          <button
            class="ghost-icon-button chat-session-delete"
            type="button"
            data-chat-delete-session-id="${escapeHtml(session.id)}"
            aria-label="删除会话：${escapeHtml(session.title)}"
            title="删除会话"
          >×</button>
        </div>
      `,
    )
    .join("");
}

async function ensureChatMessages(sessionId) {
  if (!sessionId || chatState.messagesBySession[sessionId]) {
    return;
  }

  const service = getChatService();
  if (!service) {
    return;
  }

  chatState.messagesBySession[sessionId] = await service.getMessages(sessionId);
}

function createNewChatSession() {
  const service = getChatService();
  if (!service) {
    return;
  }
  const session = service.createLocalSession();
  chatState.sessions = [
    session,
    ...chatState.sessions,
  ];
  chatState.messagesBySession[session.id] = [];
  chatState.activeSessionId = session.id;
  chatState.citations = [];
  chatState.evidenceLevel = "medium";
}

async function removeChatSession(sessionId) {
  const normalizedSessionId = String(sessionId || "").trim();
  if (!normalizedSessionId) {
    return;
  }

  const targetSession = chatState.sessions.find((session) => session.id === normalizedSessionId);
  if (!targetSession) {
    return;
  }

  const confirmed = window.confirm(`确认删除会话“${targetSession.title}”吗？该会话中的智能问答记录将一并删除。`);
  if (!confirmed) {
    return;
  }

  const service = getChatService();
  if (!service) {
    return;
  }

  try {
    await service.deleteSession(normalizedSessionId);
  } catch (error) {
    toast(`删除会话失败：${formatErrorMessage(error)}`);
    return;
  }

  chatState.sessions = chatState.sessions.filter((session) => session.id !== normalizedSessionId);
  delete chatState.messagesBySession[normalizedSessionId];

  if (chatState.activeSessionId === normalizedSessionId) {
    chatState.activeSessionId = chatState.sessions[0]?.id || "";
    if (chatState.activeSessionId) {
      await ensureChatMessages(chatState.activeSessionId);
      updateChatEvidenceFromActiveSession();
    } else {
      chatState.citations = [];
      chatState.evidenceLevel = "medium";
    }
  }

  renderChatPageContent();
  toast("会话已删除。");
}

async function submitChatQuestion(question) {
  const normalizedQuestion = String(question || "").trim();
  if (!normalizedQuestion) {
    toast("请输入你想查询的问题。");
    return;
  }

  const service = getChatService();
  if (!service) {
    return;
  }

  if (!chatState.loaded) {
    await loadChatData();
  }
  if (!chatState.activeSessionId) {
    createNewChatSession();
  }

  const sessionId = chatState.activeSessionId;
  const messages = chatState.messagesBySession[sessionId] || [];
  messages.push(service.createUserMessage({ sessionId, content: normalizedQuestion }));
  chatState.messagesBySession[sessionId] = messages;
  updateActiveSessionTitle(normalizedQuestion);
  chatState.loading = true;
  renderChatPageContent();

  const input = document.getElementById("chat-input");
  if (input) {
    input.value = "";
  }

  try {
    const assistantMessage = await service.sendQuestion({
      question: normalizedQuestion,
      sessionId,
      answerMode: document.getElementById("chat-answer-mode")?.value || "evidence",
      knowledgeBaseId: document.getElementById("chat-knowledge-select")?.value || "",
      project: document.getElementById("chat-project-select")?.value || "",
      history: messages,
    });
    messages.push(assistantMessage);
    chatState.citations = assistantMessage.citationItems || [];
    chatState.evidenceLevel = assistantMessage.evidenceLevel || inferEvidenceLevel(chatState.citations);
  } catch (error) {
    toast(`生成回答失败：${error.message}`);
  } finally {
    chatState.loading = false;
    renderChatPageContent();
  }
}

function updateActiveSessionTitle(question) {
  const now = nowText();
  chatState.sessions = chatState.sessions.map((session) => {
    if (session.id !== chatState.activeSessionId) {
      return session;
    }
    const shouldRename = session.title === "新的知识检索会话" || !session.title;
    return {
      ...session,
      title: shouldRename ? question.slice(0, 22) : session.title,
      updatedAt: now,
    };
  });
}

function renderChatConversation() {
  const container = document.getElementById("chat-conversation");
  if (!container) {
    return;
  }

  const messages = chatState.messagesBySession[chatState.activeSessionId] || [];
  if (!messages.length && !chatState.loading) {
    container.innerHTML = `
      <div class="chat-empty-state">
        <strong>企业知识检索问答</strong>
        <p>请选择会话或输入问题，系统会以结论、依据、建议和不确定性提示组织回答。</p>
      </div>
    `;
    return;
  }

  container.innerHTML = [
    ...messages.map((message) => renderChatMessage(message)),
    chatState.loading ? renderChatLoading() : "",
  ].join("");
  container.scrollTop = container.scrollHeight;
}

function renderChatMessage(message) {
  if (message.role === "user") {
    return `
      <div class="chat-message user-message">
        <div class="question-bubble">
          <span>用户问题</span>
          <p>${escapeHtml(message.content)}</p>
        </div>
      </div>
    `;
  }

  return renderAnswerCard(message);
}

function renderAnswerCard(message) {
  const sections = getAnswerSections(message);
  const evidenceLevel = message.evidenceLevel || inferEvidenceLevel(message.citationItems || []);
  const answerMode = getAnswerModeLabel(message.answerMode || document.getElementById("chat-answer-mode")?.value || "evidence");
  const status = getAnswerStatus(message, sections, evidenceLevel);
  const intent = inferQuestionIntent(message.query || message.originalQuestion || message.content || "");

  return `
    <article class="answer-card chat-message">
      <div class="answer-card-head">
        <div>
          <p class="eyebrow">证据问答</p>
          <h2>企业知识检索回答</h2>
        </div>
        <div class="answer-card-tags">
          ${renderAnswerStatusBadge(status)}
          <span>${escapeHtml(answerMode)}</span>
          ${renderEvidenceLevelBadge(evidenceLevel)}
        </div>
      </div>
      ${renderQuestionUnderstanding(message, intent, evidenceLevel, status)}
      <div class="answer-section conclusion answer-direct-section">
        <h3>直接回答</h3>
        ${renderAnswerConclusion(sections)}
      </div>
      <section class="answer-section answer-basis-section">
        <h3>依据摘要</h3>
        ${renderBasisSummary(message, sections)}
      </section>
      <div class="answer-grid">
        <section class="answer-section">
          <h3>关键证据</h3>
          ${renderAnswerEvidence(sections, message)}
        </section>
        <section class="answer-section">
          <h3>建议追问</h3>
          ${renderSuggestedFollowups(sections, message)}
        </section>
      </div>
      <section class="answer-section uncertainty">
        <h3>不确定性 / 证据不足</h3>
        ${renderAnswerList(sections.uncertaintyItems, sections.uncertainty, "answer-warning-list")}
      </section>
    </article>
  `;
}

function getAnswerStatus(message = {}, sections = {}, evidenceLevel = "medium") {
  const citations = message.citationItems || [];
  const bestScore = getBestCitationScore(citations);
  const query = message.query || message.originalQuestion || "";
  if (!citations.length || evidenceLevel === "low" || bestScore < 0.12 || isEvidenceInsufficientText(sections.conclusion || "")) {
    return { key: "insufficient", label: "证据不足", tone: "bad" };
  }
  if (isBroadProjectQuestion(query)) {
    return { key: "broad", label: "问题过泛，建议收窄", tone: "warn" };
  }
  if (evidenceLevel === "high" && bestScore >= 0.45) {
    return { key: "answerable", label: "可回答", tone: "ok" };
  }
  return { key: "partial", label: "部分可回答", tone: "warn" };
}

function renderAnswerStatusBadge(status = {}) {
  return `<span class="answer-status-badge answer-status-${escapeHtml(status.tone || "warn")}">${escapeHtml(status.label || "部分可回答")}</span>`;
}

function renderQuestionUnderstanding(message = {}, intent = {}, evidenceLevel = "medium", status = {}) {
  const citations = message.citationItems || [];
  const knowledgeLabel = inferMatchedKnowledgeLabel(citations);
  const broadHint = status.key === "broad"
    ? `<div class="answer-intent-hint">当前问题较宽泛，系统将按当前知识库中的 ${escapeHtml(knowledgeLabel)} 回答。若想了解 SuperRAG 项目本身，请选择项目说明文档或更换知识库。</div>`
    : "";
  return `
    <section class="answer-intent-card">
      <span>当前问题意图：<strong>${escapeHtml(intent.label)}</strong></span>
      <span>匹配知识库：<strong>${escapeHtml(knowledgeLabel)}</strong></span>
      <span>证据状态：<strong>${escapeHtml(getEvidenceLevelLabel(evidenceLevel))}</strong></span>
      ${broadHint}
    </section>
  `;
}

function inferQuestionIntent(query) {
  const text = String(query || "");
  if (/\u5305\u542b|\u5185\u5bb9|\u4ecb\u7ecd|\u8bf4\u660e|\u662f\u4ec0\u4e48|\u6709\u54ea\u4e9b/.test(text)) {
    return { key: "doc-qa", label: "\u6587\u6863\u95ee\u7b54" };
  }
  if (/风险|注意|缺口|不足|问题|权限/.test(text)) {
    return { key: "risk", label: "风险分析" };
  }
  if (/功能|模块|规则|字段|接口/.test(text) && !/设计|用例|功能清单|需求拆解|模块划分|流程图/.test(text)) {
    return { key: "feature", label: "功能查询" };
  }
  if (/设计|用例|功能清单|需求拆解|模块划分|流程图/.test(text)) {
    return { key: "design", label: "设计辅助" };
  }
  if (/交接|接手|待办|负责人|进度/.test(text)) {
    return { key: "handover", label: "交接总结" };
  }
  if (/是什么|哪些|支持|关系|关联|流程|解释|总结/.test(text)) {
    return { key: "business", label: "业务解释" };
  }
  return { key: "unknown", label: "不明确" };
}

function inferMatchedKnowledgeLabel(citations = []) {
  const text = citations.map((item) => `${item.documentTitle || ""} ${item.sourceName || ""} ${item.snippet || ""}`).join(" ");
  if (/客户|商机|合同|回款|发票|CRM/i.test(text)) {
    return "CRM 演示库";
  }
  return citations.length ? "当前知识库" : "全部知识库";
}

function isBroadProjectQuestion(query) {
  const text = String(query || "");
  return /这个项目主要解决什么问题|当前系统有哪些核心模块|项目主要解决/.test(text);
}

function renderBasisSummary(message = {}, sections = {}) {
  const citations = message.citationItems || [];
  if (!citations.length) {
    return renderEmptyState("当前回答缺少可引用证据。", "建议补充需求文档、接口文档、交接记录或换一个更具体的问题。");
  }
  const grouped = groupCitationsByDocument(citations);
  const docsText = grouped.slice(0, 4).map((item) => `${item.title}（${item.items.length} 个片段）`).join("、");
  const topicText = inferMatchedKnowledgeLabel(citations);
  return `
    <div class="answer-basis-summary">
      <p>本次回答主要基于 ${escapeHtml(topicText)} 中的 ${escapeHtml(docsText)}。</p>
      <p>${escapeHtml(getBestCitationScore(citations) < 0.25 ? "部分证据相关度偏低，正式使用前建议人工复核。" : "证据可支撑当前问题的初步回答，正式结论仍建议核对原文。")}</p>
    </div>
  `;
}

function renderSuggestedFollowups(sections = {}, message = {}) {
  const items = Array.isArray(sections.followUpItems) && sections.followUpItems.length
    ? sections.followUpItems
    : buildFrontendFollowups(message);
  if (!items.length) {
    return renderEmptyState("当前没有建议追问。", "可以换一个更具体的问题，或转入设计辅助生成结构化产物。");
  }
  return `
    <div class="answer-followup-grid">
      ${items
        .slice(0, 6)
        .map((item) => {
          const text = formatHumanReadableItem(item, { compact: true, maxLength: 80 });
          return `<button type="button" data-chat-question="${escapeHtml(text)}">${escapeHtml(text)}</button>`;
        })
        .join("")}
    </div>
  `;
}

function buildFrontendFollowups(message = {}) {
  const text = [message.query, ...(message.citationItems || []).map((item) => `${item.documentTitle} ${item.snippet}`)].join(" ");
  if (/客户|商机|合同|回款|发票|CRM/i.test(text)) {
    return [
      "是否需要进一步生成 CRM 模块功能清单？",
      "是否需要整理客户-商机-合同-回款-发票的业务流程？",
      "是否需要转入设计辅助模式生成详细文本用例？",
      "是否需要检查当前回答中证据不足的业务规则？",
    ];
  }
  return [
    "是否需要把当前结论整理为功能清单？",
    "是否需要查看引用文档原文？",
    "是否需要转入设计辅助模式生成结构化产物？",
  ];
}

function renderAnswerConclusion(sections = {}) {
  return `
    <div class="answer-conclusion-card">
      <span aria-hidden="true">结</span>
      <div>${renderRichText(sections.conclusion)}</div>
    </div>
  `;
}

function renderAnswerEvidence(sections = {}, message = {}) {
  const items = Array.isArray(sections.evidenceItems) ? sections.evidenceItems.filter(Boolean) : [];
  const fallbackItems = !items.length
    ? (message.citationItems || []).slice(0, 5).map((citation) => ({
        title: citation.documentTitle || citation.title || "知识库片段",
        summary: formatEvidenceDisplayText(citation.snippet || citation.content || "命中用户问题相关片段。"),
        score: citation.relevanceScore ?? citation.score ?? "",
      }))
    : items;

  if (!fallbackItems.length) {
    return `<div class="answer-evidence-empty">${renderRichText(sections.evidence || "当前回答没有足够的可引用证据。")}</div>`;
  }

  return `
    <div class="answer-evidence-list">
      ${fallbackItems
        .map((item, index) => {
          const score = Number(item.score ?? item.relevanceScore ?? item.evidenceScore ?? 0);
          const scoreText = Number.isFinite(score) && score > 0 ? score.toFixed(2) : "待评估";
          return `
            <article class="answer-evidence-card">
              <div class="answer-evidence-head">
                <span>证据 ${index + 1}</span>
                <strong>${escapeHtml(item.title || item.documentTitle || "知识库片段")}</strong>
              </div>
              ${renderExpandableText(item.summary || item.snippet || item.content || "该文档命中用户问题相关片段。", { threshold: 150, className: "answer-evidence-snippet" })}
              <div class="answer-evidence-actions">
                <small>相关度：${escapeHtml(scoreText)}</small>
                ${renderCitationSourceButton(item)}
              </div>
            </article>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderCitationSourceButton(item = {}) {
  const title = item.title || item.documentTitle || item.sourceName || "";
  const documentId = item.documentId || item.document_id || "";
  const chunkId = item.chunkId || item.segmentId || item.id || "";
  if (!documentId && !title && !chunkId) {
    return "";
  }
  return `
    <button
      type="button"
      class="text-link-button citation-inline-action"
      data-citation-title="${escapeHtml(title || "知识库片段")}"
      data-document-id="${escapeHtml(documentId)}"
      data-source-name="${escapeHtml(item.sourceName || title)}"
      data-chunk-id="${escapeHtml(chunkId)}"
    >查看原文</button>
  `;
}

function renderAnswerList(items, fallbackText, className) {
  const list = Array.isArray(items)
    ? items.filter((item) => String(item || "").trim())
    : String(fallbackText || "")
        .split(/\n+/)
        .filter((item) => item.trim());

  if (!list.length) {
    return '<div class="empty-inline">当前没有需要特别提示的内容。</div>';
  }

  return `
    <ul class="${className}">
      ${list.map((item) => `<li>${renderRichTextBlock(formatDisplayValue(item), "compact-rich-answer inline-rich-answer")}</li>`).join("")}
    </ul>
  `;
}

function renderRichText(value) {
  const normalized = normalizeRichTextSource(value);
  if (!normalized) {
    return "<p>待补充</p>";
  }

  const lines = normalized.split("\n");
  const blocks = [];
  let listItems = [];

  function flushList() {
    if (!listItems.length) {
      return;
    }
    blocks.push(`<ul>${listItems.map((item) => `<li>${renderInlineMarkdown(item)}</li>`).join("")}</ul>`);
    listItems = [];
  }

  lines.forEach((rawLine) => {
    const line = rawLine.trim();
    if (!line) {
      flushList();
      return;
    }

    const headingMatch = /^(#{1,4})\s+(.+)$/.exec(line);
    if (headingMatch) {
      flushList();
      const level = Math.min(headingMatch[1].length + 3, 6);
      blocks.push(`<h${level}>${renderInlineMarkdown(headingMatch[2])}</h${level}>`);
      return;
    }

    const bulletMatch = /^[-*]\s+(.+)$/.exec(line);
    if (bulletMatch) {
      listItems.push(bulletMatch[1]);
      return;
    }

    const numberedMatch = /^\d+\.\s+(.+)$/.exec(line);
    if (numberedMatch) {
      listItems.push(numberedMatch[1]);
      return;
    }

    flushList();
    blocks.push(`<p>${renderInlineMarkdown(line)}</p>`);
  });

  flushList();
  return blocks.join("");
}

function renderInlineMarkdown(value) {
  return escapeHtml(stripMarkdownDecorators(value))
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/(^|[\s(])\*([^*]+)\*(?=$|[\s).,!?:;])/g, "$1<em>$2</em>");
}

function normalizeRichTextSource(value) {
  return cleanPresentationText(value && typeof value === "object" ? formatHumanReadableItem(value) : value)
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/```(?:[a-zA-Z0-9_-]+)?/g, "")
    .replace(/^\s{0,3}(#{1,6})([^\s#])/gm, "$1 $2")
    .replace(/^\s*([*+-])([^\s*+-])/gm, "$1 $2")
    .replace(/^\s*(\d+)\.([^\s])/gm, "$1. $2")
    .replace(/^\s*[-*_]{3,}\s*$/gm, "")
    .trim();
}

function stripMarkdownDecorators(value) {
  if (value && typeof value === "object") {
    return formatHumanReadableItem(value);
  }
  return String(value || "")
    .replace(/^\s*#{1,6}\s*/g, "")
    .replace(/^\s*[-*+]\s+/g, "")
    .replace(/^\s*\d+\.\s+/g, "")
    .replace(/^\s*>\s*/g, "")
    .trim();
}

function renderRichTextBlock(value, className = "") {
  const extraClass = className ? ` ${className}` : "";
  return `<div class="rich-answer${extraClass}">${renderRichText(value)}</div>`;
}

function renderRichList(items = [], className = "scenario-bullet-list") {
  const list = Array.isArray(items) ? items.filter((item) => item !== null && item !== undefined && String(item).trim()) : [];
  if (!list.length) {
    return '<div class="empty-inline">待补充</div>';
  }

  return `
    <ul class="${className}">
      ${list.map((item) => `<li>${renderRichTextBlock(formatDisplayValue(item), "compact-rich-answer inline-rich-answer")}</li>`).join("")}
    </ul>
  `;
}

function getAnswerSections(message) {
  if (message.structuredAnswer) {
    return message.structuredAnswer;
  }

  const citationSummary = (message.citationItems || [])
    .slice(0, 2)
    .map((citation) => citation.snippet)
    .join("；");

  return {
    conclusion: message.content || "当前回答为空。",
    evidence: citationSummary || "当前回答未绑定足够引用证据。",
    suggestion: message.nextActions?.[0] || "建议继续补充相关文档，并在正式结论前核对引用证据。",
    uncertainty: message.risks?.[0] || "该回答基于当前知识库片段生成，未入库资料不会被覆盖。",
  };
}

function renderChatLoading() {
  return `
    <article class="answer-card chat-message loading-answer">
      <div class="answer-card-head">
        <div>
          <p class="eyebrow">检索中</p>
          <h2>正在检索知识库并生成结构化回答</h2>
        </div>
      </div>
      <div class="loading-lines">
        <span></span>
        <span></span>
        <span></span>
      </div>
    </article>
  `;
}

function updateChatEvidenceFromActiveSession() {
  const messages = chatState.messagesBySession[chatState.activeSessionId] || [];
  const lastAssistant = [...messages].reverse().find((message) => message.role === "assistant");
  chatState.citations = lastAssistant?.citationItems || [];
  chatState.evidenceLevel = lastAssistant?.evidenceLevel || inferEvidenceLevel(chatState.citations);
}

function renderChatCitationPanel() {
  const listNode = document.getElementById("chat-citation-list");
  const levelNode = document.getElementById("chat-evidence-level");
  const warningNode = document.getElementById("chat-evidence-warning");
  if (!listNode || !levelNode || !warningNode) {
    return;
  }

  const level = chatState.evidenceLevel || inferEvidenceLevel(chatState.citations);
  levelNode.className = `evidence-level level-${level}`;
  levelNode.textContent = getEvidenceLevelLabel(level);
  warningNode.hidden = level !== "low";

  if (!chatState.citations.length) {
    listNode.innerHTML = renderEmptyState("当前回答暂无引用证据。", "建议补充 CRM 需求、接口、交接或业务规则文档，或换一个更具体的问题。");
    return;
  }

  listNode.innerHTML = `
    ${renderCitationOverview(chatState.citations, level)}
    ${renderCitationDocumentSummary(chatState.citations)}
    <div class="citation-detail-stack">
      ${chatState.citations.map(renderCitationCard).join("")}
    </div>
  `;
}

function renderCitationOverview(citations = [], level = "medium") {
  const grouped = groupCitationsByDocument(citations);
  const bestScore = getBestCitationScore(citations);
  return `
    <section class="citation-overview-card">
      <div class="citation-overview-grid">
        <article><span>引用文档</span><strong>${escapeHtml(grouped.length)}</strong></article>
        <article><span>命中片段</span><strong>${escapeHtml(citations.length)}</strong></article>
        <article><span>最高相关度</span><strong>${escapeHtml(bestScore ? bestScore.toFixed(2) : "0.00")}</strong></article>
      </div>
      <div class="citation-trust-note citation-trust-${escapeHtml(level)}">
        ${escapeHtml(level === "low" ? "不建议直接采信，需要补充证据。" : level === "high" ? "证据较充分，可作为初步结论依据。" : "可部分采信，建议人工复核关键结论。")}
      </div>
    </section>
  `;
}

function renderCitationDocumentSummary(citations = []) {
  const grouped = groupCitationsByDocument(citations);
  return `
    <section class="citation-document-summary">
      <h3>证据摘要</h3>
      ${grouped
        .map((group) => `<span>${escapeHtml(group.title)}：命中 ${escapeHtml(group.items.length)} 个片段</span>`)
        .join("")}
    </section>
  `;
}

function renderCitationCard(citation) {
  const score = Number(citation.relevanceScore ?? citation.score ?? 0);
  const displayScore = score ? score.toFixed(2) : "0.00";
  const title = citation.documentTitle || citation.title || "知识库片段";
  const chunkId = citation.chunkId || citation.segmentId || citation.id || "";
  return `
    <details class="citation-card" ${score >= 0.45 ? "open" : ""}>
      <summary class="citation-card-head">
        <strong>${escapeHtml(title)}</strong>
        <span>${escapeHtml(displayScore)}</span>
      </summary>
      ${renderExpandableText(citation.snippet || citation.content || "暂无片段摘要。", { threshold: 160, className: "citation-snippet" })}
      <div class="citation-meta">
        <span>页码/段落：${escapeHtml(citation.page || citation.segmentId || citation.id || "未标注")}</span>
        <button
          type="button"
          data-citation-title="${escapeHtml(title)}"
          data-document-id="${escapeHtml(citation.documentId || citation.document_id || "")}"
          data-source-name="${escapeHtml(citation.sourceName || citation.source_name || title)}"
          data-chunk-id="${escapeHtml(chunkId)}"
        >查看原文</button>
      </div>
    </details>
  `;
}

async function openCitationSource(button) {
  const title = button.dataset.citationTitle || "知识库片段";
  const params = new URLSearchParams();
  const documentId = button.dataset.documentId || "";
  const sourceName = button.dataset.sourceName || title;
  const chunkId = button.dataset.chunkId || "";

  if (documentId) {
    params.set("document_id", documentId);
  }
  if (sourceName) {
    params.set("source_name", sourceName);
  }
  if (chunkId) {
    params.set("chunk_id", chunkId);
  }

  if (!params.toString()) {
    toast("缺少原文定位信息。");
    return;
  }

  const originalLabel = button.textContent;
  button.disabled = true;
  button.textContent = "加载中...";

  try {
    const payload = await window.SuperRagBackend.requestJson(`/documents/source?${params.toString()}`, {
      timeoutMs: 30000,
    });
    showCitationSourceModal(payload, title);
  } catch (error) {
    toast(`原文加载失败：${error.message || error}`);
  } finally {
    button.disabled = false;
    button.textContent = originalLabel;
  }
}

function showCitationSourceModal(payload, fallbackTitle) {
  document.querySelector(".source-preview-modal")?.remove();

  const documentInfo = payload.document || {};
  const chunkInfo = payload.chunk || {};
  const title = documentInfo.title || fallbackTitle || "知识库原文";
  const content = payload.content || chunkInfo.content || "暂未找到可展示的原文内容。";
  const chunkContent = chunkInfo.content || "";
  const sourceType = payload.sourceType || "knowledge";
  const chunkLabel = chunkInfo.id ? `片段：${chunkInfo.id}` : "片段：未标注";

  const modal = document.createElement("div");
  modal.className = "modal-backdrop source-preview-modal";
  modal.innerHTML = `
    <section class="modal-panel source-preview-panel" role="dialog" aria-modal="true" aria-label="引用原文">
      <div class="modal-head">
        <div>
          <p class="eyebrow">SOURCE PREVIEW</p>
          <h2>${escapeHtml(title)}</h2>
        </div>
        <button class="icon-button" type="button" data-source-preview-close aria-label="关闭">×</button>
      </div>
      <div class="source-preview-meta">
        <span>${escapeHtml(sourceType === "uploaded" ? "上传原文" : "知识库片段")}</span>
        <span>${escapeHtml(chunkLabel)}</span>
        ${documentInfo.id ? `<span>文档 ID：${escapeHtml(documentInfo.id)}</span>` : ""}
      </div>
      <div class="source-preview-body">
        ${
          chunkContent
            ? `<section class="source-preview-chunk">
                <h3>命中片段</h3>
                <pre>${escapeHtml(chunkContent)}</pre>
              </section>`
            : ""
        }
        <section class="source-preview-content">
          <h3>原文内容</h3>
          <pre>${escapeHtml(content)}</pre>
        </section>
      </div>
      <div class="modal-actions">
        <button type="button" data-source-preview-close>关闭</button>
      </div>
    </section>
  `;

  modal.addEventListener("click", (event) => {
    if (event.target === modal || event.target.closest("[data-source-preview-close]")) {
      modal.remove();
    }
  });

  document.body.appendChild(modal);
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

function renderEvidenceLevelBadge(level) {
  return `<span class="evidence-level level-${level}">${escapeHtml(getEvidenceLevelLabel(level))}</span>`;
}

function getEvidenceLevelLabel(level) {
  const labels = {
    high: "充分",
    medium: "部分充分",
    low: "不足",
  };
  return labels[level] || "部分充分";
}

function getAnswerModeLabel(mode) {
  const labels = {
    concise: "简洁回答",
    detailed: "详细回答",
    evidence: "带依据回答",
  };
  return labels[mode] || "带依据回答";
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

function bindTrainingActions() {
  document.addEventListener("click", async (event) => {
    const quickQuestion = event.target.closest("[data-training-question]");
    if (quickQuestion) {
      const input = document.getElementById("training-query");
      if (input) {
        input.value = quickQuestion.dataset.trainingQuestion;
      }
      await generateTrainingResult(quickQuestion.dataset.trainingQuestion);
      return;
    }

    if (event.target.closest("#training-generate")) {
      await generateTrainingResult(document.getElementById("training-query")?.value);
    }
  });
}

function bindHandoverActions() {
  document.addEventListener("click", async (event) => {
    const quickQuestion = event.target.closest("[data-handover-question]");
    if (quickQuestion) {
      const input = document.getElementById("handover-query");
      if (input) {
        input.value = quickQuestion.dataset.handoverQuestion;
      }
      await generateHandoverResult(quickQuestion.dataset.handoverQuestion);
      return;
    }

    if (event.target.closest("#handover-generate")) {
      await generateHandoverResult(document.getElementById("handover-query")?.value);
      return;
    }

    const actionButton = event.target.closest("[data-handover-action]");
    if (actionButton) {
      await handleHandoverAction(actionButton.dataset.handoverAction);
    }
  });
}

function bindDesignActions() {
  document.addEventListener("input", (event) => {
    const editField = event.target.closest("[data-design-edit-field]");
    if (!editField) {
      return;
    }
    updateDesignEditedField(editField);
  });

  document.addEventListener("change", (event) => {
    const editField = event.target.closest("[data-design-edit-field]");
    if (!editField) {
      return;
    }
    updateDesignEditedField(editField);
  });

  document.addEventListener("click", async (event) => {
    const tabButton = event.target.closest("[data-design-tab]");
    if (tabButton) {
      designState.activeTab = tabButton.dataset.designTab;
      renderDesignResult(designState.result);
      return;
    }

    const actionButton = event.target.closest("[data-design-action]");
    if (actionButton) {
      await handleDesignAction(actionButton.dataset.designAction);
      return;
    }

    if (event.target.closest("#design-generate")) {
      await generateDesignOutput();
    }
  });
}

function bindHistoryActions() {
  document.addEventListener("input", (event) => {
    if (event.target.id !== "history-search") {
      return;
    }
    renderHistoryList();
  });

  document.addEventListener("change", (event) => {
    if (!event.target.matches("#history-date-from, #history-date-to, #history-scene, #history-project, #history-creator")) {
      return;
    }
    renderHistoryList();
  });

  document.addEventListener("click", async (event) => {
    if (event.target.closest("#close-history-drawer")) {
      closeHistoryDrawer();
      return;
    }

    const actionButton = event.target.closest("[data-history-action]");
    if (!actionButton) {
      return;
    }
    await handleHistoryAction(actionButton.dataset.historyAction, actionButton.dataset.historyId);
  });

  document.addEventListener("submit", async (event) => {
    const form = event.target.closest("[data-history-review-form]");
    if (!form) {
      return;
    }
    event.preventDefault();
    await submitHistoryReviewForm(form);
  });
}

function getBestCitationScore(citations = []) {
  const scores = (Array.isArray(citations) ? citations : [])
    .map((citation) => Number(citation.relevanceScore ?? citation.score ?? citation.evidenceScore ?? 0))
    .filter((score) => Number.isFinite(score));
  return scores.length ? Math.max(...scores) : 0;
}

function groupCitationsByDocument(citations = []) {
  const groups = new Map();
  (Array.isArray(citations) ? citations : []).forEach((citation) => {
    const title = citation.documentTitle || citation.title || citation.sourceName || "知识库片段";
    if (!groups.has(title)) {
      groups.set(title, []);
    }
    groups.get(title).push(citation);
  });
  return [...groups.entries()].map(([title, items]) => ({ title, items }));
}

function bindSettingsActions() {
  document.addEventListener("click", async (event) => {
    const workflowAction = event.target.closest("[data-workflow-action]");
    if (workflowAction) {
      await handleWorkflowAction(workflowAction.dataset.workflowAction, workflowAction.dataset.workflowId);
      return;
    }

    if (event.target.closest("#settings-save")) {
      await saveSettingsFromForm();
    }
  });
}

async function renderTrainingPage() {
  const service = getTrainingService();
  if (!service) {
    return;
  }

  if (!trainingState.loaded) {
    const options = await service.getTrainingOptions();
    populateScenarioSelect("training-topic", options.topics, "项目背景");
    populateScenarioSelect("training-project", options.projects, "企业知识库");
    trainingState.loaded = true;
    await generateTrainingResult("请为 CRM 新人生成 7 天上手学习路径，重点覆盖客户、商机、合同、回款和发票模块。", { silent: true });
    return;
  }

  renderTrainingResult(trainingState.result);
}

async function generateTrainingResult(question, options = {}) {
  const service = getTrainingService();
  if (!service) {
    return;
  }

  const query = String(question || "").trim() || "请给我一周学习路径";
  const resultNode = document.getElementById("training-result");
  if (resultNode) {
    resultNode.innerHTML = renderScenarioLoading("正在生成新人培训说明...");
  }

  try {
    trainingState.result = await service.generateTrainingResult({
      query,
      topic: document.getElementById("training-topic")?.value || "项目背景",
      project: document.getElementById("training-project")?.value || "企业知识库",
    });
    renderTrainingResult(trainingState.result);
    if (!options.silent) {
      toast("培训说明已生成。");
    }
  } catch (error) {
    if (resultNode) {
      resultNode.innerHTML = `<div class="empty-inline">培训结果生成失败：${escapeHtml(error.message)}</div>`;
    }
  }
}

function renderTrainingResult(result) {
  const container = document.getElementById("training-result");
  if (!container) {
    return;
  }
  if (!result) {
    container.innerHTML = '<div class="empty-inline">请输入培训问题后生成结构化说明。</div>';
    return;
  }

  if (isEvidenceInsufficientTrainingResult(result)) {
    container.innerHTML = renderEvidenceInsufficientState({
      title: "当前知识库证据不足",
      description: "系统没有检索到足够的项目文档证据，因此不能生成正式新人培训计划。",
      impact: "该结果不能作为正式培训材料使用，建议先补充需求文档、接口文档、部署说明或新人培训资料。",
      suggestions: [
        "优先上传 CRM 演示文档或真实项目需求说明。",
        "补充接口说明、部署文档和测试用例，提升新人上手路径完整度。",
        "上传后重新生成新人 7 天上手计划。",
      ],
      primaryAction: { label: "去文档知识库上传资料", href: "#/documents" },
      secondaryAction: { label: "查看演示中心", href: "#/demo-center" },
    });
    return;
  }

  container.innerHTML = `
    <section class="scenario-summary-card">
      <div>
        <p class="eyebrow">${escapeHtml(result.topic)}</p>
        <h3>结论摘要</h3>
        ${renderRichTextBlock(result.summary, "compact-rich-answer")}
      </div>
    </section>
    <section class="scenario-section">
      <h3>背景说明</h3>
      ${renderRichTextBlock(result.background, "compact-rich-answer")}
    </section>
    <section class="scenario-section">
      <h3>核心术语解释</h3>
      <div class="term-grid">${result.terms?.length ? result.terms.map(renderTermCard).join("") : renderEmptyState("当前证据不足，暂未抽取核心术语。", "建议补充 CRM 业务术语、字段说明或培训资料。")}</div>
    </section>
    <section class="scenario-section">
      <h3>3-7 天学习路径</h3>
      <div class="learning-timeline">${result.learningPath?.length ? result.learningPath.map(renderLearningStep).join("") : renderEmptyState("当前证据不足，暂未生成学习路径。", "建议先上传需求文档、接口文档、部署说明或新人培训资料。")}</div>
    </section>
    <section class="scenario-section">
      <h3>推荐阅读资料</h3>
      <div class="recommended-doc-grid">${result.recommendedDocs?.length ? result.recommendedDocs.map(renderRecommendedDoc).join("") : renderEmptyState("暂无推荐阅读资料。", "请补充可作为新人培训材料的业务说明或模块文档。")}</div>
    </section>
    <section class="scenario-section">
      <h3>新人自测问题</h3>
      ${renderTrainingSelfTest(result)}
    </section>
    <section class="scenario-section">
      <h3>引用证据</h3>
      <div class="scenario-evidence-list">${result.citations?.length ? result.citations.map(renderScenarioCitation).join("") : renderEmptyState("暂无引用证据。", "当前培训计划不能作为正式材料，建议补充更多项目文档。")}</div>
    </section>
  `;
}

function renderTrainingSelfTest(result = {}) {
  const topic = result.topic || "CRM 业务";
  const citationText = (result.citations || []).map((item) => item.documentTitle || item.sourceName || "").join(" ");
  const crmQuestions = [
    "客户、商机、合同、回款、发票分别承担什么业务职责？",
    "从商机推进到合同和回款，关键状态或动作有哪些？",
    "客户转移、公海、团队成员权限中哪些内容需要重点核对？",
    "哪些结论已经有文档证据，哪些仍需要人工确认？",
  ];
  const genericQuestions = [
    `请用自己的话解释 ${topic} 的核心目标。`,
    "当前知识库中哪些文档最适合作为入门资料？",
    "哪些模块或流程还缺少证据支撑？",
  ];
  const questions = /客户|商机|合同|回款|发票|CRM/i.test(citationText + topic) ? crmQuestions : genericQuestions;
  return renderRichList(questions, "scenario-bullet-list compact-list");
}

function renderTermCard(item) {
  return `
    <article class="term-card">
      <strong>${escapeHtml(stripMarkdownDecorators(item.term))}</strong>
      ${renderRichTextBlock(item.explanation, "compact-rich-answer")}
    </article>
  `;
}

function renderLearningStep(item) {
  return `
    <article class="timeline-step">
      <span>${escapeHtml(stripMarkdownDecorators(item.day))}</span>
      <div>
        <strong>${escapeHtml(stripMarkdownDecorators(item.title))}</strong>
        ${renderRichTextBlock(item.description, "compact-rich-answer")}
      </div>
    </article>
  `;
}

function renderRecommendedDoc(item) {
  return `
    <article class="recommended-doc-card">
      <div class="recommended-doc-head">
        <strong>${escapeHtml(stripMarkdownDecorators(item.title))}</strong>
        <span class="priority-badge priority-${getPriorityClass(item.priority)}">${escapeHtml(item.priority)}</span>
      </div>
      ${renderRichTextBlock(item.reason, "compact-rich-answer")}
      <small>预计阅读时间：${escapeHtml(item.estimatedReadTime)}</small>
    </article>
  `;
}

function renderTrainingResult(result) {
  const container = document.getElementById("training-result");
  if (!container) {
    return;
  }
  if (!result) {
    container.innerHTML = '<div class="empty-inline">璇疯緭鍏ュ煿璁棶棰樺悗鐢熸垚缁撴瀯鍖栬鏄庛€?/div>';
    return;
  }

  if (isEvidenceInsufficientTrainingResult(result)) {
    container.innerHTML = renderEvidenceInsufficientState({
      title: "褰撳墠鐭ヨ瘑搴撹瘉鎹笉瓒?",
      description: "绯荤粺娌℃湁妫€绱㈠埌瓒冲鐨勯」鐩枃妗ｈ瘉鎹紝鍥犳涓嶈兘鐢熸垚姝ｅ紡鏂颁汉鍩硅璁″垝銆?",
      impact: "璇ョ粨鏋滀笉鑳戒綔涓烘寮忓煿璁潗鏂欎娇鐢紝寤鸿鍏堣ˉ鍏呴渶姹傛枃妗ｃ€佹帴鍙ｆ枃妗ｃ€侀儴缃茶鏄庢垨鏂颁汉鍩硅璧勬枡銆?",
      suggestions: [
        "浼樺厛涓婁紶 CRM 婕旂ず鏂囨。鎴栫湡瀹為」鐩渶姹傝鏄庛€?",
        "琛ュ厖鎺ュ彛璇存槑銆侀儴缃叉枃妗ｅ拰娴嬭瘯鐢ㄤ緥锛屾彁鍗囨柊浜轰笂鎵嬭矾寰勫畬鏁村害銆?",
        "涓婁紶鍚庨噸鏂扮敓鎴愭柊浜?7 澶╀笂鎵嬭鍒掋€?",
      ],
      primaryAction: { label: "鍘绘枃妗ｇ煡璇嗗簱涓婁紶璧勬枡", href: "#/documents" },
      secondaryAction: { label: "鏌ョ湅婕旂ず涓績", href: "#/demo-center" },
    });
    return;
  }

  const concepts = result.keyConcepts?.length ? result.keyConcepts : result.terms || [];
  const phaseSummaries = result.phaseSummaries || [];
  const uncertainty = result.uncertainty || [];

  container.innerHTML = `
    <section class="scenario-summary-card">
      <div>
        <p class="eyebrow">${escapeHtml(result.topic || "鏂颁汉鍩硅")}</p>
        <h3>缁撹鎽樿</h3>
        ${renderRichTextBlock(result.summary || result.background || "", "compact-rich-answer")}
      </div>
    </section>
    <section class="scenario-section">
      <h3>鑳屾櫙璇存槑</h3>
      ${renderRichTextBlock(result.background || result.summary || "", "compact-rich-answer")}
    </section>
    <section class="scenario-section">
      <h3>鏍稿績姒傚康</h3>
      <div class="term-grid">${concepts.length ? concepts.map(renderTermCard).join("") : renderEmptyState("褰撳墠璇佹嵁涓嶈冻锛屾殏鏈娊鍙栨牳蹇冩湳璇€?", "寤鸿琛ュ厖 CRM 涓氬姟鏈銆佸瓧娈佃鏄庢垨鍩硅璧勬枡銆?")}</div>
    </section>
    <section class="scenario-section">
      <h3>3-7 澶╁涔犺矾寰?/h3>
      <div class="learning-timeline">${result.learningPath?.length ? result.learningPath.map(renderLearningStep).join("") : renderEmptyState("褰撳墠璇佹嵁涓嶈冻锛屾殏鏈敓鎴愬涔犺矾寰勩€?", "寤鸿鍏堜笂浼犻渶姹傛枃妗ｃ€佹帴鍙ｆ枃妗ｃ€侀儴缃茶鏄庢垨鏂颁汉鍩硅璧勬枡銆?")}</div>
    </section>
    <section class="scenario-section">
      <h3>闃舵鎬荤粨</h3>
      <div class="term-grid">${phaseSummaries.length ? phaseSummaries.map(renderTrainingPhaseSummary).join("") : renderEmptyState("鏆傛棤闃舵鎬荤粨銆?", "绯荤粺浼氬湪鏈夎冻澶熻瘉鎹椂鎸夐樁娈垫眹鎬诲涔犵洰鏍囧拰浜у嚭銆?")}</div>
    </section>
    <section class="scenario-section">
      <h3>鎺ㄨ崘闃呰璧勬枡</h3>
      <div class="recommended-doc-grid">${result.recommendedDocs?.length ? result.recommendedDocs.map(renderRecommendedDoc).join("") : renderEmptyState("鏆傛棤鎺ㄨ崘闃呰璧勬枡銆?", "璇疯ˉ鍏呭彲浣滀负鏂颁汉鍩硅鏉愭枡鐨勪笟鍔¤鏄庢垨妯″潡鏂囨。銆?")}</div>
    </section>
    <section class="scenario-section">
      <h3>鏂颁汉鑷祴闂</h3>
      ${renderTrainingSelfTest(result)}
    </section>
    ${uncertainty.length ? `
      <section class="scenario-section gap-section">
        <h3>涓嶇‘瀹氶」 / 寰呰ˉ璇佹嵁</h3>
        ${renderRichList(uncertainty, "scenario-bullet-list compact-list")}
      </section>
    ` : ""}
    <section class="scenario-section">
      <h3>寮曠敤璇佹嵁</h3>
      <div class="scenario-evidence-list">${result.citations?.length ? result.citations.map(renderScenarioCitation).join("") : renderEmptyState("鏆傛棤寮曠敤璇佹嵁銆?", "褰撳墠鍩硅璁″垝涓嶈兘浣滀负姝ｅ紡鏉愭枃锛屽缓璁ˉ鍏呮洿澶氶」鐩枃妗ｃ€?")}</div>
    </section>
  `;
}

function renderTrainingSelfTest(result = {}) {
  const questions = Array.isArray(result.selfTestQuestions) && result.selfTestQuestions.length
    ? result.selfTestQuestions
    : [];
  return renderRichList(questions, "scenario-bullet-list compact-list");
}

function renderTermCard(item) {
  const docs = Array.isArray(item.relatedDocuments) ? item.relatedDocuments.filter(Boolean) : [];
  return `
    <article class="term-card">
      <strong title="${escapeHtml(stripMarkdownDecorators(item.term || item.name || ""))}">${escapeHtml(stripMarkdownDecorators(item.term || item.name || ""))}</strong>
      ${renderRichTextBlock(item.explanation || "", "compact-rich-answer")}
      ${docs.length ? `<small class="training-doc-meta">${escapeHtml(docs.join(" / "))}</small>` : ""}
    </article>
  `;
}

function renderLearningStep(item) {
  const tasks = Array.isArray(item.tasks) ? item.tasks.filter(Boolean) : [];
  const docs = Array.isArray(item.relatedDocuments) ? item.relatedDocuments.filter(Boolean) : [];
  return `
    <article class="timeline-step">
      <span>${escapeHtml(stripMarkdownDecorators(item.day || ""))}</span>
      <div class="training-step-main">
        <strong title="${escapeHtml(stripMarkdownDecorators(item.title || ""))}">${escapeHtml(stripMarkdownDecorators(item.title || ""))}</strong>
        ${item.goal ? `<div class="training-step-goal">${renderRichTextBlock(item.goal, "compact-rich-answer inline-rich-answer")}</div>` : ""}
        ${tasks.length ? renderTrainingTaskList(tasks) : ""}
        ${item.deliverable ? `<div class="training-step-deliverable"><label>褰撴棩浜у嚭</label>${renderRichTextBlock(item.deliverable, "compact-rich-answer inline-rich-answer")}</div>` : ""}
        ${docs.length ? `<div class="training-step-docs">${renderTrainingDocList(docs)}</div>` : ""}
      </div>
    </article>
  `;
}

function renderRecommendedDoc(item) {
  return `
    <article class="recommended-doc-card">
      <div class="recommended-doc-head">
        <strong title="${escapeHtml(stripMarkdownDecorators(item.title || ""))}">${escapeHtml(stripMarkdownDecorators(item.title || ""))}</strong>
        <span class="priority-badge priority-${getPriorityClass(item.priority)}">${escapeHtml(item.priority || "medium")}</span>
      </div>
      ${renderRichTextBlock(item.reason || "", "compact-rich-answer")}
      <small>棰勮闃呰鏃堕棿锛?{escapeHtml(item.estimatedReadTime || "10-15 min")}</small>
    </article>
  `;
}

function renderTrainingPhaseSummary(item) {
  const days = Array.isArray(item.days) ? item.days.filter(Boolean) : [];
  return `
    <article class="term-card training-phase-card">
      <strong title="${escapeHtml(stripMarkdownDecorators(item.phase || ""))}">${escapeHtml(stripMarkdownDecorators(item.phase || ""))}</strong>
      ${renderRichTextBlock(item.focus || "", "compact-rich-answer")}
      ${days.length ? `<small class="training-doc-meta">瀛︿範鏃舵锛?${escapeHtml(days.join(" / "))}</small>` : ""}
      ${item.expectedOutcome ? `<div class="training-step-deliverable"><label>棰勬湡杈撳嚭</label>${renderRichTextBlock(item.expectedOutcome, "compact-rich-answer inline-rich-answer")}</div>` : ""}
    </article>
  `;
}

function renderTrainingTaskList(tasks = []) {
  return `
    <ul class="training-task-list">
      ${tasks.map((task) => `<li>${escapeHtml(stripMarkdownDecorators(task))}</li>`).join("")}
    </ul>
  `;
}

function renderTrainingDocList(docs = []) {
  return `
    <div class="training-doc-chip-list">
      ${docs.map((doc) => `<span class="training-doc-chip" title="${escapeHtml(stripMarkdownDecorators(doc))}">${escapeHtml(stripMarkdownDecorators(doc))}</span>`).join("")}
    </div>
  `;
}

async function renderHandoverPage() {
  const service = getHandoverService();
  if (!service) {
    return;
  }

  if (!handoverState.loaded) {
    const options = await service.getHandoverOptions();
    populateScenarioSelect("handover-project", options.projects, "企业知识库");
    populateScenarioSelect("handover-scope", options.scopes, "功能模块");
    handoverState.loaded = true;
    await generateHandoverResult("请基于 CRM 客户、商机、合同、回款、发票文档，生成模块交接总览和接手者待办清单", { silent: true });
    return;
  }

  renderHandoverResult(handoverState.result);
}

async function generateHandoverResult(question, options = {}) {
  const service = getHandoverService();
  if (!service) {
    return;
  }

  const query = String(question || "").trim() || "请生成接手者待办清单";
  const resultNode = document.getElementById("handover-result");
  if (resultNode) {
    resultNode.innerHTML = renderScenarioLoading("正在汇总交接信息...");
  }

  try {
    handoverState.result = await service.generateHandoverResult({
      query,
      project: document.getElementById("handover-project")?.value || "企业知识库",
      scope: document.getElementById("handover-scope")?.value || "功能模块",
    });
    renderHandoverResult(handoverState.result);
    if (!options.silent) {
      toast("交接摘要已生成。");
    }
  } catch (error) {
    if (resultNode) {
      resultNode.innerHTML = `<div class="empty-inline">交接摘要生成失败：${escapeHtml(error.message)}</div>`;
    }
  }
}

function renderHandoverResult(result) {
  const container = document.getElementById("handover-result");
  if (!container) {
    return;
  }
  if (!result) {
    container.innerHTML = '<div class="empty-inline">请输入交接问题后生成结构化摘要。</div>';
    return;
  }

  container.innerHTML = `
    <section class="design-summary-card handover-report-head">
      <div>
        <p class="eyebrow">Executable Handover</p>
        <h3>${escapeHtml(stripMarkdownDecorators(result.title || "项目交接报告生成器"))}</h3>
        ${renderRichTextBlock(result.query || "基于当前项目知识库生成可执行交接清单。", "compact-rich-answer")}
      </div>
      <div class="design-summary-meta">
        <span>${escapeHtml(result.project || "当前项目")}</span>
        <span>${escapeHtml(result.scope || "整个项目")}</span>
        ${renderGenerationModeBadge(result.generationMode || result.source)}
      </div>
    </section>
    ${result.fallbackNotice ? `<div class="alert-card warning">${escapeHtml(result.fallbackNotice)}</div>` : ""}
    ${renderRetrievalVisibility(result)}
    ${renderScenarioQualityAssessment(result.qualityAssessment, "handover")}
    ${renderHandoverOverviewBoard(result)}
    <section class="handover-summary-grid">
      ${renderInfoBlock("项目背景", result.projectBackground)}
      ${renderInfoBlock("当前进度", result.currentProgress)}
    </section>
    <section class="handover-two-column">
      ${renderListBlock("已完成事项", result.completedItems?.length ? result.completedItems : result.completedFeatures)}
      ${renderListBlock("未完成事项", result.unfinishedItems)}
    </section>
    <section class="scenario-section">
      <h3>接手者待办清单</h3>
      ${renderTodoTable(result.todoList?.length ? result.todoList : result.todos)}
    </section>
    <section class="scenario-section">
      <h3>风险登记表</h3>
      ${renderHandoverRiskTable(result.riskRegister?.length ? result.riskRegister : result.risks)}
    </section>
    <section class="handover-two-column">
      ${renderRoleBlock(result.responsibilityBoundary?.length ? result.responsibilityBoundary : result.roles)}
      ${renderListBlock("依赖文档", result.dependentDocuments?.length ? result.dependentDocuments : result.dependentDocs)}
    </section>
    <section class="handover-two-column">
      ${renderInformationGapsBlock(result.informationGaps)}
      ${renderChecklistBlock(result.handoverChecklist)}
    </section>
    <section class="scenario-section">
      <h3>证据映射</h3>
      ${renderEvidenceMapTable(result.evidenceMap)}
    </section>
    <section class="scenario-section">
      <h3>引用证据</h3>
      <div class="scenario-evidence-list">${result.citations?.length ? result.citations.map(renderScenarioCitation).join("") : '<div class="empty-inline">暂无引用证据。</div>'}</div>
    </section>
  `;
}

function renderHandoverOverviewBoard(result = {}) {
  const risks = result.riskRegister?.length ? result.riskRegister : result.risks || [];
  const todos = result.todoList?.length ? result.todoList : result.todos || [];
  const docs = result.dependentDocuments?.length ? result.dependentDocuments : result.dependentDocs || [];
  const gaps = result.informationGaps || [];
  const highestRisk = risks.find((item) => /高|严重|阻塞|风险/.test([item.risk, item.description, item.riskLevel, item.impact].join(" "))) || risks[0];
  const firstTodo = todos.find((item) => /high|高|优先/.test(String(item.priority || ""))) || todos[0];
  const shouldHandover = !gaps.length && !risks.some((item) => /高|严重|证据不足|待确认/.test([item.risk, item.description, item.impact].join(" ")));

  return `
    <section class="handover-overview-board scenario-section">
      <div class="card-title-row">
        <div>
          <p class="eyebrow">Handover Overview</p>
          <h3>交接总览看板</h3>
        </div>
        <span class="quality-score-badge quality-score-${shouldHandover ? "ready" : "partial"}">${escapeHtml(shouldHandover ? "可交接" : "需复核")}</span>
      </div>
      <div class="handover-overview-grid">
        ${renderHandoverOverviewItem("当前进度摘要", result.currentProgress || "暂无当前进度摘要。")}
        ${renderHandoverOverviewItem("最高风险", highestRisk ? highestRisk.risk || highestRisk.description || "待确认风险" : "当前未识别明确高风险。", highestRisk ? "risk" : "")}
        ${renderHandoverOverviewItem("接手者第一步", firstTodo ? firstTodo.taskName || firstTodo.task || "先阅读依赖文档并核对待办。" : "先确认依赖文档和负责人。")}
        ${renderHandoverOverviewItem("必须优先阅读的文档", docs.slice(0, 3).map(formatDisplayValue).join("；") || "暂未识别明确依赖文档。")}
        ${renderHandoverOverviewItem("最大信息缺口", gaps[0] || "暂无明显信息缺口。", gaps.length ? "gap" : "")}
        ${renderHandoverOverviewItem("是否建议直接交接", shouldHandover ? "可以进入交接，但仍建议人工复核证据。" : "不建议直接交接，请先补充缺失资料或确认高风险项。", shouldHandover ? "ok" : "risk")}
      </div>
    </section>
  `;
}

function renderHandoverOverviewItem(label, value, tone = "") {
  return `
    <article class="handover-overview-item ${tone ? `handover-overview-${tone}` : ""}">
      <span>${escapeHtml(label)}</span>
      ${renderRichTextBlock(value, "compact-rich-answer inline-rich-answer")}
    </article>
  `;
}

function isEvidenceInsufficientTrainingResult(result = {}) {
  if (result.evidenceInsufficient) {
    return true;
  }
  const text = [
    result.summary,
    result.background,
    ...(result.terms || []).map((item) => item.explanation || item.term || ""),
    ...(result.learningPath || []).map((item) => item.description || item.title || ""),
  ].join(" ");
  return isEvidenceInsufficientText(text) || (!(result.citations || []).length && isEvidenceInsufficientText(result.summary || result.background));
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

function renderEvidenceInsufficientState({
  title,
  description,
  impact,
  suggestions = [],
  primaryAction,
  secondaryAction,
}) {
  return `
    <section class="evidence-empty-state">
      <div class="evidence-empty-icon" aria-hidden="true">!</div>
      <div class="evidence-empty-main">
        <p class="eyebrow">Evidence Required</p>
        <h3>${escapeHtml(title || "当前文档证据不足")}</h3>
        <p>${escapeHtml(description || "当前知识库没有检索到足够相关片段。")}</p>
        <div class="evidence-impact-card">
          <strong>影响说明</strong>
          <span>${escapeHtml(impact || "该内容不能作为正式结论，需要补充文档或人工复核。")}</span>
        </div>
        ${
          suggestions.length
            ? `<ul class="evidence-suggestion-list">${suggestions.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
            : ""
        }
        <div class="evidence-action-row">
          ${primaryAction ? `<a class="primary-button" href="${escapeHtml(primaryAction.href)}">${escapeHtml(primaryAction.label)}</a>` : ""}
          ${secondaryAction ? `<a class="secondary-button" href="${escapeHtml(secondaryAction.href)}">${escapeHtml(secondaryAction.label)}</a>` : ""}
        </div>
      </div>
    </section>
  `;
}

function renderRetrievalVisibility(result = {}) {
  const retriever = result.retriever || {};
  const citations = Array.isArray(result.citations) ? result.citations : [];
  const groups = Array.isArray(retriever.groups) ? retriever.groups : [];
  const queries = Array.isArray(retriever.queries) ? retriever.queries : [];
  const sourceTitles = new Set(
    citations
      .map((item) => item.documentTitle || item.title || item.sourceName || item.sourceDocument)
      .filter(Boolean),
  );
  groups.forEach((group) => {
    (group.hits || []).forEach((hit) => {
      if (hit.sourceDocument || hit.sourceName) {
        sourceTitles.add(hit.sourceDocument || hit.sourceName);
      }
    });
  });

  if (!citations.length && !groups.length && !retriever.hit_count) {
    return "";
  }

  const warningText = cleanPresentationText(retriever.warning || result.warning || "");
  const fallbackText =
    result.source === "retrieval-fallback" || result.generationMode === "retrieval-fallback"
      ? "检索兜底生成"
      : warningText
        ? "检索存在告警"
        : "检索正常";

  const topHits = citations.length
    ? citations.slice(0, 4)
    : groups.flatMap((group) => group.hits || []).slice(0, 4);

  return `
    <section class="retrieval-visibility-card scenario-section">
      <div class="card-title-row">
        <div>
          <p class="eyebrow">RAG Visibility</p>
          <h3>检索过程可见性</h3>
        </div>
        <span class="retrieval-mode-badge">${escapeHtml(fallbackText)}</span>
      </div>
      <div class="retrieval-metrics-grid">
        ${renderRetrievalMetric("检索子问题", queries.length || groups.length || 1)}
        ${renderRetrievalMetric("命中片段", retriever.hit_count ?? topHits.length)}
        ${renderRetrievalMetric("来源文档", sourceTitles.size || "待确认")}
        ${renderRetrievalMetric("Top-K 展示", topHits.length)}
      </div>
      ${
        groups.length
          ? `<div class="retrieval-query-list">${groups
              .slice(0, 5)
              .map(
                (group) => `
                  <span>${escapeHtml(group.query || group.name || "检索子问题")} · ${escapeHtml((group.hits || []).length)} hits</span>
                `,
              )
              .join("")}</div>`
          : ""
      }
      <div class="retrieval-hit-list">
        ${
          topHits.length
            ? topHits.map(renderRetrievalHit).join("")
            : '<div class="empty-inline">暂无可展示的检索片段。</div>'
        }
      </div>
      ${warningText ? `<div class="alert-card warning">${escapeHtml(warningText)}</div>` : ""}
    </section>
  `;
}

function renderRetrievalMetric(label, value) {
  return `
    <div class="retrieval-metric">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </div>
  `;
}

function renderRetrievalHit(item = {}) {
  const score = Number(item.relevanceScore ?? item.score ?? 0);
  const vectorScore = Number(item.vectorScore ?? item.vector_score ?? 0);
  const lexicalScore = Number(item.lexicalScore ?? item.lexical_score ?? 0);
  const title = item.documentTitle || item.title || item.sourceDocument || item.sourceName || "知识库片段";
  return `
    <article class="retrieval-hit-card">
      <div class="retrieval-hit-head">
        <strong>${escapeHtml(title)}</strong>
        <span>score ${escapeHtml(score ? score.toFixed(2) : "0.00")}</span>
      </div>
      ${renderExpandableText(item.snippet || item.content || "暂无片段摘要。", { threshold: 150, className: "retrieval-hit-snippet" })}
      <div class="retrieval-hit-scores">
        <span>vector ${escapeHtml(vectorScore ? vectorScore.toFixed(2) : "0.00")}</span>
        <span>lexical ${escapeHtml(lexicalScore ? lexicalScore.toFixed(2) : "0.00")}</span>
        <span>chunk ${escapeHtml(item.chunkId || item.segmentId || item.id || "未标注")}</span>
      </div>
    </article>
  `;
}

function renderScenarioQualityAssessment(quality = {}, scene = "design") {
  const categories = Array.isArray(quality?.categoryScores) ? quality.categoryScores : [];
  if (!quality || (!categories.length && !quality.openIssueCount && !quality.uncitedItems)) {
    return "";
  }
  const title = scene === "handover" ? "交接质量评估" : "设计质量评估";
  const ready = quality.canEnterReview ? "建议进入人工评审" : "建议补充证据后再评审";
  return `
    <section class="scenario-quality-card scenario-section">
      <div class="card-title-row">
        <div>
          <p class="eyebrow">Quality Assessment</p>
          <h3>${escapeHtml(title)}</h3>
        </div>
        <span class="quality-score-badge quality-score-${escapeHtml(quality.level || "partial")}">${escapeHtml(Math.round(Number(quality.score || 0) * 100))}%</span>
      </div>
      <div class="retrieval-metrics-grid">
        ${renderRetrievalMetric("检查项", quality.totalCheckedItems || 0)}
        ${renderRetrievalMetric("已绑定证据", quality.evidenceBoundItems || 0)}
        ${renderRetrievalMetric("低证据项", quality.lowEvidenceItems || 0)}
        ${renderRetrievalMetric("未引用项", quality.uncitedItems || 0)}
      </div>
      <div class="quality-category-grid">
        ${categories.map(renderQualityCategoryCard).join("")}
      </div>
      <div class="alert-card ${quality.canEnterReview ? "" : "warning"}">${escapeHtml(quality.reviewSuggestion || ready)}</div>
    </section>
  `;
}

function renderQualityCategoryCard(item = {}) {
  const score = Number(item.score || 0);
  return `
    <article class="quality-category-card">
      <div>
        <strong>${escapeHtml(item.label || "质量项")}</strong>
        <span>${escapeHtml(item.evidenceBound || 0)} / ${escapeHtml(item.total || 0)} 已绑定证据</span>
      </div>
      <em>${escapeHtml(Math.round(score * 100))}%</em>
    </article>
  `;
}

function renderInfoBlock(title, content) {
  return `
    <article class="scenario-section">
      <h3>${escapeHtml(title)}</h3>
      ${renderRichTextBlock(content, "compact-rich-answer")}
    </article>
  `;
}

function renderListBlock(title, items = []) {
  return `
    <article class="scenario-section">
      <h3>${escapeHtml(title)}</h3>
      ${renderRichList(items)}
    </article>
  `;
}

function renderTodoTable(todos = []) {
  if (!todos.length) {
    return '<div class="empty-inline">当前文档证据不足，暂未生成明确待办。</div>';
  }
  return `
    <div class="table-wrap">
      <table class="scenario-table">
        <thead>
          <tr>
            <th>任务名称</th>
            <th>优先级</th>
            <th>风险等级</th>
            <th>建议负责人</th>
            <th>依赖文档</th>
            <th>状态</th>
          </tr>
        </thead>
        <tbody>
          ${todos
            .map(
              (todo) => `
                <tr class="${/high|高/.test(String(todo.priority || "")) ? "row-highlight" : ""}">
                  <td><strong>${escapeHtml(formatHumanReadableItem(todo.taskName || todo.task || todo.action || todo, { maxLength: 90 }))}</strong></td>
                  <td><span class="priority-badge priority-${getPriorityClass(todo.priority)}">${escapeHtml(todo.priority || "中")}</span></td>
                  <td><span class="risk-level-badge risk-${getRiskClass(todo.riskLevel)}">${escapeHtml(todo.riskLevel || "待评估")}</span></td>
                  <td>${escapeHtml(formatHumanReadableItem(todo.suggestedOwner || todo.owner || "待确认负责人", { maxLength: 60 }))}</td>
                  <td>${escapeHtml(formatHumanReadableItem(todo.dependentDocument || todo.evidenceSource || "待确认文档", { maxLength: 80 }))}</td>
                  <td>${escapeHtml(formatHumanReadableItem(todo.status || "待处理", { maxLength: 60 }))}</td>
                </tr>
              `,
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderHandoverRisk(risk) {
  return `
    <article class="risk-card">
      <div class="risk-card-head">
        <strong>${escapeHtml(stripMarkdownDecorators(risk.type))}</strong>
        <span>风险</span>
      </div>
      ${renderRichTextBlock(risk.description, "compact-rich-answer")}
      <dl>
        <div><dt>影响范围</dt><dd>${renderRichTextBlock(risk.impact, "compact-rich-answer inline-rich-answer")}</dd></div>
        <div><dt>建议处理</dt><dd>${renderRichTextBlock(risk.suggestion, "compact-rich-answer inline-rich-answer")}</dd></div>
        <div><dt>证据来源</dt><dd>${escapeHtml(stripMarkdownDecorators(risk.evidenceSource))}</dd></div>
      </dl>
    </article>
  `;
}

function renderHandoverRiskTable(risks = []) {
  if (!risks.length) {
    return '<div class="empty-inline">当前文档证据不足，暂未识别明确交接风险。</div>';
  }

  return `
    <div class="table-wrap">
      <table class="scenario-table">
        <thead>
          <tr>
            <th>风险</th>
            <th>影响范围</th>
            <th>建议处理</th>
            <th>证据片段</th>
            <th>来源文档</th>
          </tr>
        </thead>
        <tbody>
          ${risks.map((risk) => `
            <tr class="${/高|严重|阻塞/.test([risk.risk, risk.description, risk.impact].join(" ")) ? "row-highlight" : ""}">
              <td><strong>${escapeHtml(stripMarkdownDecorators(risk.risk || risk.description || "待确认风险"))}</strong></td>
              <td>${renderRichTextBlock(risk.impact || "待确认影响范围", "compact-rich-answer inline-rich-answer")}</td>
              <td>${renderRichTextBlock(risk.suggestion || "补充文档或人工确认。", "compact-rich-answer inline-rich-answer")}</td>
              <td>${renderEvidenceSnippet(risk.evidenceSnippet)}</td>
              <td>${escapeHtml(stripMarkdownDecorators(risk.sourceDocument || risk.evidenceSource || "待关联文档"))}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderRoleBlock(roles = []) {
  return `
    <article class="scenario-section">
      <h3>责任人 / 相关角色</h3>
      <div class="role-list">
        ${roles
          .map(
            (item) => `
              <div>
                <strong>${escapeHtml(stripMarkdownDecorators(item.role))}</strong>
                ${renderRichTextBlock(item.responsibility, "compact-rich-answer")}
              </div>
            `,
          )
          .join("")}
      </div>
    </article>
  `;
}

function renderInformationGapsBlock(gaps = []) {
  return `
    <article class="scenario-section gap-section">
      <h3>信息缺口</h3>
      <p>系统不会编造文档中没有说明的负责人、进度、测试或部署状态，缺失信息会进入人工确认清单。</p>
      ${renderRichList(gaps, "scenario-bullet-list compact-list")}
    </article>
  `;
}

function renderChecklistBlock(items = []) {
  return `
    <article class="scenario-section">
      <h3>交接检查清单</h3>
      ${renderChecklist(items)}
    </article>
  `;
}

function renderChecklist(items = []) {
  const list = Array.isArray(items) ? items.filter((item) => item !== null && item !== undefined && formatHumanReadableItem(item).trim()) : [];
  if (!list.length) {
    return '<div class="empty-inline">当前文档证据不足，暂未生成检查清单。</div>';
  }
  return `
    <div class="handover-checklist">
      ${list.map((item) => `
        <label>
          <input type="checkbox">
          <span>${renderRichTextBlock(formatHumanReadableItem(item), "compact-rich-answer inline-rich-answer")}</span>
        </label>
      `).join("")}
    </div>
  `;
}

function renderEvidenceMapTable(items = []) {
  if (!items.length) {
    return '<div class="empty-inline">暂无证据映射。</div>';
  }
  return `
    <div class="table-wrap">
      <table class="scenario-table">
        <thead>
          <tr>
            <th>结论</th>
            <th>来源文档</th>
            <th>证据片段</th>
            <th>分数</th>
          </tr>
        </thead>
        <tbody>
          ${items.map((item) => `
            <tr>
              <td>${renderRichTextBlock(formatHumanReadableItem(item.conclusion || item, { maxLength: 120 }), "compact-rich-answer inline-rich-answer")}</td>
              <td>${escapeHtml(formatHumanReadableItem(item.sourceDocument || "待关联文档", { maxLength: 80 }))}</td>
              <td>${renderEvidenceSnippet(item.evidenceSnippet)}</td>
              <td>${Number(item.score || 0).toFixed(2)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

async function handleHandoverAction(action) {
  if (!handoverState.result) {
    toast("请先生成交接结果。");
    return;
  }
  const markdown = buildHandoverMarkdown(handoverState.result);
  if (action === "copy") {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(markdown);
      toast("交接清单已复制为 Markdown。");
      return;
    }
    toast("当前浏览器不支持自动复制，请手动复制页面内容。");
    return;
  }
  if (action === "export") {
    downloadTextFile(markdown, `SuperRAG-项目交接清单-${Date.now()}.md`, "text/markdown;charset=utf-8");
    toast("交接清单 Markdown 已导出。");
  }
}

async function renderDesignPage() {
  const service = getDesignService();
  if (!service) {
    return;
  }

  if (!designState.loaded) {
    const options = await service.getDesignOptions();
    populateScenarioSelect("design-output-type", options.outputTypes, "详细文本用例");
    populateScenarioSelect("design-project", options.projects, "SuperRAG CRM 演示库");
    populateScenarioSelect("design-granularity", options.granularities, "标准");

    const input = document.getElementById("design-goal");
    if (input && !input.value.trim()) {
      input.value = "基于当前 CRM 业务文档，生成客户、商机、合同、回款、发票模块的详细文本用例和设计产物。";
    }

    designState.loaded = true;
    await generateDesignOutput({ silent: true });
    return;
  }

  renderDesignResult(designState.result);
  renderDesignEvidencePanel(designState.result);
}

async function generateDesignOutput(options = {}) {
  const service = getDesignService();
  if (!service) {
    return;
  }

  const goal = String(document.getElementById("design-goal")?.value || "").trim();
  if (!goal) {
    toast("请输入设计目标。");
    return;
  }

  designState.loading = true;
  resetDesignEditState();
  const resultNode = document.getElementById("design-result");
  if (resultNode) {
    resultNode.innerHTML = renderScenarioLoading("正在检索企业文档并生成结构化设计初稿...");
  }
  renderDesignEvidencePanel(null);

  try {
    designState.result = await service.generateDesignOutput({
      inputQuestion: goal,
      outputType: document.getElementById("design-output-type")?.value || "详细文本用例",
      project: document.getElementById("design-project")?.value || "企业知识助手系统",
      granularity: document.getElementById("design-granularity")?.value || "标准",
    });
    designState.activeTab = "overview";
    designState.originalResult = cloneDesignValue(designState.result);
    renderDesignResult(designState.result);
    renderDesignEvidencePanel(designState.result);
    if (!options.silent) {
      toast("设计初稿已生成。");
    }
  } catch (error) {
    console.error("[Design Generate Failed]", error);
    if (resultNode) {
      resultNode.innerHTML = `<div class="empty-inline">设计初稿生成失败：${escapeHtml(formatErrorMessage(error))}</div>`;
    }
  } finally {
    designState.loading = false;
  }
}

function renderDesignResult(result) {
  const container = document.getElementById("design-result");
  const tabs = document.querySelectorAll("[data-design-tab]");
  if (!container) {
    return;
  }

  tabs.forEach((tab) => {
    const isActive = tab.dataset.designTab === designState.activeTab;
    tab.classList.toggle("active", isActive);
    tab.setAttribute("aria-selected", String(isActive));
  });

  if (!result) {
    container.innerHTML = '<div class="empty-inline">请输入设计目标后生成结构化设计产物。</div>';
    return;
  }

  const displayResult = getDesignDisplayResult(result);
  const intermediateDocumentBlock = renderDesignIntermediateDocument(displayResult);

  container.innerHTML = `
    <section class="design-summary-card">
      <div>
        <p class="eyebrow">${escapeHtml(displayResult.outputTypeLabel || displayResult.outputType)}</p>
        <h3>${escapeHtml(stripMarkdownDecorators(displayResult.title))}</h3>
        ${renderRichTextBlock(displayResult.inputQuestion, "compact-rich-answer")}
      </div>
      <div class="design-summary-meta">
        <span>${escapeHtml(displayResult.project)}</span>
        <span>${escapeHtml(displayResult.granularity || "标准")}</span>
        ${renderGenerationModeBadge(displayResult.generationMode || displayResult.source)}
        ${renderEvidenceLevelBadge(displayResult.evidenceLevel)}
        ${renderManualEditBadges(displayResult)}
      </div>
    </section>
    ${displayResult.fallbackNotice ? `<div class="alert-card warning">${escapeHtml(displayResult.fallbackNotice)}</div>` : ""}
    ${displayResult.warning ? `<div class="alert-card warning">${escapeHtml(displayResult.warning)}</div>` : ""}
    ${renderDesignEditToolbar(displayResult)}
    ${intermediateDocumentBlock}
    ${renderRetrievalVisibility(displayResult)}
    ${renderScenarioQualityAssessment(displayResult.qualityAssessment, "design")}
    ${renderDesignTabContent(displayResult)}
  `;
  scheduleDesignDiagramRender(displayResult);
}

function renderDesignTabContent(result) {
  const renderers = {
    overview: renderDesignOverview,
    business: renderDesignBusinessAnalysis,
    functions: renderDesignFunctionTable,
    useCases: renderDesignUseCases,
    modules: renderDesignModules,
    dataPermission: renderDesignDataPermission,
    traceability: renderDesignTraceability,
    diagram: renderDesignDiagram,
    risks: renderDesignRisks,
    actions: renderDesignNextActions,
  };
  const renderer = renderers[designState.activeTab] || renderDesignOverview;
  return renderer(result);
}

function renderDesignOverview(result = {}) {
  const risks = Array.isArray(result.risks) ? result.risks : [];
  const openQuestions = Array.isArray(result.openQuestions) ? result.openQuestions : [];
  const citations = Array.isArray(result.citations) ? result.citations : [];
  const review = getDesignReviewAdvice(result);
  const topConclusions = getDesignTopConclusions(result);
  const confirmItems = getDesignConfirmItems(result);

  return `
    <section class="design-overview-grid">
      <article class="scenario-section design-overview-summary">
        <div class="card-title-row">
          <div>
            <p class="eyebrow">Design Overview</p>
            <h3>本次生成摘要</h3>
          </div>
          ${renderGenerationModeBadge(result.generationMode || result.source)}
        </div>
        <dl class="design-overview-dl">
          <div><dt>用户设计目标</dt><dd>${renderRichTextBlock(result.inputQuestion || "暂无设计目标", "compact-rich-answer inline-rich-answer")}</dd></div>
          <div><dt>所属项目</dt><dd>${escapeHtml(result.project || "当前项目")}</dd></div>
          <div><dt>输出粒度</dt><dd>${escapeHtml(result.granularity || "标准")}</dd></div>
          <div><dt>生成时间</dt><dd>${escapeHtml(result.createdAt || nowText())}</dd></div>
        </dl>
      </article>

      <article class="scenario-section design-review-card review-${escapeHtml(review.tone)}">
        <p class="eyebrow">Review Advice</p>
        <h3>${escapeHtml(review.title)}</h3>
        <p>${escapeHtml(review.description)}</p>
      </article>
    </section>

    <section class="scenario-section">
      <h3>产物统计</h3>
      <div class="design-overview-metrics">
        ${renderStructuredCountCard("功能点", result.functionList?.length || 0)}
        ${renderStructuredCountCard("文本用例", result.useCases?.length || 0)}
        ${renderStructuredCountCard("模块建议", result.moduleSuggestions?.length || 0)}
        ${renderStructuredCountCard("风险", risks.length)}
        ${renderStructuredCountCard("待确认", openQuestions.length)}
        ${renderStructuredCountCard("引用文档", groupCitationsByDocument(citations).length)}
      </div>
    </section>

    <section class="design-overview-grid">
      <article class="scenario-section">
        <h3>最重要的 3 条结论</h3>
        ${renderRichList(topConclusions, "scenario-bullet-list compact-list")}
      </article>
      <article class="scenario-section gap-section">
        <h3>最需要人工确认的 3 个问题</h3>
        ${renderRichList(confirmItems, "scenario-bullet-list compact-list")}
      </article>
    </section>

    <section class="scenario-section">
      <h3>证据覆盖摘要</h3>
      ${renderEvidenceCoverage(result.evidenceCoverage || {})}
      <div class="design-overview-metrics compact">
        ${renderStructuredCountCard("未引用项", result.qualityAssessment?.uncitedItems || 0)}
        ${renderStructuredCountCard("低证据项", result.qualityAssessment?.lowEvidenceItems || 0)}
        ${renderStructuredCountCard("已绑定证据", result.qualityAssessment?.evidenceBoundItems || citations.length)}
      </div>
    </section>
  `;
}

function getDesignReviewAdvice(result = {}) {
  const quality = result.qualityAssessment || {};
  const coverageLevel = mapCoverageLevel(result.evidenceCoverage?.coverageLevel);
  if (quality.canEnterReview || (result.evidenceLevel === "high" && coverageLevel !== "low")) {
    return {
      tone: "ok",
      title: "可以进入人工评审",
      description: quality.reviewSuggestion || "当前设计产物已绑定较多引用证据，可进入人工评审，但仍需由负责人确认业务规则和异常流程。",
    };
  }
  if (result.evidenceLevel === "low" || coverageLevel === "low") {
    return {
      tone: "bad",
      title: "不建议直接使用",
      description: quality.reviewSuggestion || "当前证据不足或覆盖面偏弱，建议补充需求文档、接口文档、异常流程说明后再进入评审。",
    };
  }
  return {
    tone: "warn",
    title: "建议补充证据后评审",
    description: quality.reviewSuggestion || "当前产物可作为初稿，但部分功能、风险或用例仍需要人工确认。",
  };
}

function getDesignTopConclusions(result = {}) {
  return [
    ...(result.functionList || []).slice(0, 1).map((item) => `核心功能：${item.name || item.description || "待确认功能"}`),
    ...(result.businessRules || []).slice(0, 1).map((item) => `关键规则：${item.rule || item.description || "待确认规则"}`),
    ...(result.risks || []).slice(0, 1).map((item) => `主要风险：${item.description || item.risk || "待确认风险"}`),
  ].filter(Boolean).slice(0, 3);
}

function getDesignConfirmItems(result = {}) {
  const reviewRisks = (result.risks || [])
    .filter((item) => item.needsReview || /待确认|证据不足|缺少/.test([item.description, item.impact, item.supplement].join(" ")))
    .map((item) => item.description || item.risk || "待确认风险");
  return [...(result.openQuestions || []), ...reviewRisks].filter(Boolean).slice(0, 3);
}

function renderDesignFunctionTable(result) {
  if (designState.editing) {
    return renderDesignFunctionEditor(result);
  }
  return `
    <section class="scenario-section">
      <h3>功能清单</h3>
      <div class="table-wrap">
        <table class="scenario-table design-table">
          <thead>
            <tr>
              <th>功能编号</th>
              <th>功能名称</th>
              <th>功能描述</th>
              <th>优先级</th>
              <th>关联文档</th>
            </tr>
          </thead>
          <tbody>
            ${(result.functionList || [])
              .map(
                (item) => `
                  <tr>
                    <td>${escapeHtml(item.id)}</td>
                    <td><strong>${escapeHtml(stripMarkdownDecorators(item.name))}</strong></td>
                    <td>${renderRichTextBlock(item.description, "compact-rich-answer inline-rich-answer")}</td>
                    <td><span class="priority-badge priority-${getPriorityClass(item.priority)}">${escapeHtml(item.priority)}</span></td>
                    <td>${escapeHtml(stripMarkdownDecorators(item.relatedDocument))}</td>
                  </tr>
                `,
              )
              .join("")}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function renderDesignFunctionEditor(result) {
  const list = result.functionList || [];
  return `
    <section class="scenario-section design-edit-section">
      <h3>编辑功能清单</h3>
      <div class="design-edit-card-grid">
        ${list.length ? list.map((item, index) => `
          <article class="design-edit-card">
            <div class="card-title-row">
              <strong>${escapeHtml(item.id || `F-${index + 1}`)}</strong>
              <span class="quality-score-badge quality-score-partial">可编辑</span>
            </div>
            ${renderEditInput("functionList", index, "name", item.name, "功能名称")}
            ${renderEditInput("functionList", index, "description", item.description, "功能描述", { type: "textarea", rows: 4 })}
            ${renderEditInput("functionList", index, "priority", item.priority, "优先级", { type: "select", choices: ["高", "中", "低", "high", "medium", "low"] })}
            <div class="design-edit-evidence-note">证据来源保留：${escapeHtml(formatHumanReadableItem(item.sourceDocument || item.relatedDocument || "待关联文档", { maxLength: 80 }))}</div>
          </article>
        `).join("") : renderEmptyState("当前文档证据不足，暂未生成可编辑功能点。", "建议补充需求文档、接口说明或交接记录后重新生成。")}
      </div>
    </section>
  `;
}

function renderDesignUseCases(result) {
  if (designState.editing) {
    return renderDesignUseCaseEditor(result);
  }
  return `
    <section class="scenario-section">
      <h3>详细文本用例</h3>
      <div class="use-case-grid">
        ${(result.useCases || [])
          .map(
            (item) => `
              <article class="use-case-card spec-use-case-card">
                <div class="use-case-head spec-use-case-head">
                  <div>
                    <span>${escapeHtml(item.id)}</span>
                    <strong>${escapeHtml(stripMarkdownDecorators(item.name))}</strong>
                  </div>
                  <div class="use-case-badges">
                    <em>${escapeHtml(stripMarkdownDecorators(item.actor || "项目成员"))}</em>
                    ${item.evidenceScore ? `<em>证据 ${Math.round(Math.min(1, Number(item.evidenceScore)) * 100)}%</em>` : ""}
                  </div>
                </div>

                <dl class="use-case-meta-grid">
                  <div><dt>用例目标</dt><dd>${renderRichTextBlock(item.goal || item.name, "compact-rich-answer inline-rich-answer")}</dd></div>
                  <div><dt>触发条件</dt><dd>${renderRichTextBlock(item.trigger || "用户在业务流程中发起该操作。", "compact-rich-answer inline-rich-answer")}</dd></div>
                  <div><dt>业务范围</dt><dd>${escapeHtml(stripMarkdownDecorators(item.scope || "需求设计辅助"))}</dd></div>
                  <div><dt>证据来源</dt><dd>${escapeHtml(stripMarkdownDecorators(item.sourceDocument || "待关联文档"))}</dd></div>
                </dl>

                <div class="use-case-spec-body">
                  <section>
                    <h4>前置条件</h4>
                    ${renderTextOrList(item.preconditions)}
                  </section>
                  <section class="main-flow-section">
                    <h4>主成功场景</h4>
                    ${renderNumberedScenario(item.mainSuccessScenario)}
                  </section>
                  <section>
                    <h4>扩展场景</h4>
                    ${renderTextOrList(item.extensionScenarios)}
                  </section>
                  <section>
                    <h4>异常场景</h4>
                    ${renderTextOrList(item.exceptionScenarios)}
                  </section>
                  <section>
                    <h4>验收标准</h4>
                    ${renderTextOrList(item.acceptanceCriteria)}
                  </section>
                  <section>
                    <h4>后置条件</h4>
                    ${renderTextOrList(item.postconditions)}
                  </section>
                </div>

                <div class="use-case-engineering-row">
                  <section>
                    <h4>涉及字段</h4>
                    ${renderTagList(item.dataFields, "待从接口或字段配置补充")}
                  </section>
                  <section>
                    <h4>绑定业务规则</h4>
                    ${renderTextOrList(item.businessRules)}
                  </section>
                </div>

                <aside class="use-case-evidence">
                  <strong>引用证据</strong>
                  ${renderExpandableText(item.evidenceSnippet || "当前用例缺少明确引用片段，建议补充需求或接口文档。", { threshold: 160, className: "evidence-snippet" })}
                </aside>
              </article>
            `,
          )
          .join("")}
      </div>
    </section>
  `;
}

function renderDesignUseCaseEditor(result) {
  const list = result.useCases || [];
  return `
    <section class="scenario-section design-edit-section">
      <h3>编辑详细文本用例</h3>
      <div class="design-edit-card-grid one-column">
        ${list.length ? list.map((item, index) => `
          <article class="design-edit-card">
            <div class="card-title-row">
              <strong>${escapeHtml(item.id || `UC-${index + 1}`)}</strong>
              <span class="quality-score-badge quality-score-partial">一行一条流程</span>
            </div>
            <div class="design-edit-grid">
              ${renderEditInput("useCases", index, "name", item.name, "用例名称")}
              ${renderEditInput("useCases", index, "actor", item.actor, "参与者")}
            </div>
            ${renderEditInput("useCases", index, "preconditions", item.preconditions, "前置条件", { type: "list", rows: 4 })}
            ${renderEditInput("useCases", index, "mainSuccessScenario", item.mainSuccessScenario, "主成功场景", { type: "list", rows: 6 })}
            ${renderEditInput("useCases", index, "extensionScenarios", item.extensionScenarios, "扩展场景", { type: "list", rows: 4 })}
            ${renderEditInput("useCases", index, "exceptionScenarios", item.exceptionScenarios, "异常场景", { type: "list", rows: 4 })}
            ${renderEditInput("useCases", index, "postconditions", item.postconditions, "后置条件", { type: "textarea", rows: 3 })}
            <div class="design-edit-evidence-note">证据来源保留：${escapeHtml(formatHumanReadableItem(item.sourceDocument || "待关联文档", { maxLength: 100 }))}</div>
          </article>
        `).join("") : renderEmptyState("当前文档证据不足，暂未生成可编辑文本用例。", "建议补充业务流程、角色权限和异常流程说明。")}
      </div>
    </section>
  `;
}

function renderDesignModules(result) {
  if (designState.editing) {
    return renderDesignModuleEditor(result);
  }
  return `
    <section class="scenario-section">
      <h3>模块划分建议</h3>
      <div class="module-grid">
        ${(result.moduleSuggestions || [])
          .map(
            (item) => `
              <article class="module-card">
                <strong>${escapeHtml(stripMarkdownDecorators(item.name))}</strong>
                ${renderRichTextBlock(item.responsibility, "compact-rich-answer")}
                <dl class="design-dl compact">
                  <div><dt>输入</dt><dd>${renderTextOrList(item.input)}</dd></div>
                  <div><dt>输出</dt><dd>${renderTextOrList(item.output)}</dd></div>
                  <div><dt>依赖关系</dt><dd>${renderTextOrList(item.dependencies)}</dd></div>
                </dl>
              </article>
            `,
          )
          .join("")}
      </div>
    </section>
  `;
}

function renderDesignModuleEditor(result) {
  const list = result.moduleSuggestions || [];
  return `
    <section class="scenario-section design-edit-section">
      <h3>编辑模块划分建议</h3>
      <div class="design-edit-card-grid">
        ${list.length ? list.map((item, index) => `
          <article class="design-edit-card">
            ${renderEditInput("moduleSuggestions", index, "name", item.name, "模块名称")}
            ${renderEditInput("moduleSuggestions", index, "responsibility", item.responsibility, "模块职责", { type: "textarea", rows: 4 })}
            ${renderEditInput("moduleSuggestions", index, "input", item.input, "输入", { type: "list", rows: 3 })}
            ${renderEditInput("moduleSuggestions", index, "output", item.output, "输出", { type: "list", rows: 3 })}
            ${renderEditInput("moduleSuggestions", index, "dependencies", item.dependencies, "依赖模块", { type: "list", rows: 3 })}
            <div class="design-edit-evidence-note">证据来源保留：${escapeHtml(formatHumanReadableItem(item.sourceDocument || "待关联文档", { maxLength: 100 }))}</div>
          </article>
        `).join("") : renderEmptyState("当前文档证据不足，暂未生成可编辑模块建议。", "建议补充模块边界、接口依赖或系统设计说明。")}
      </div>
    </section>
  `;
}

function renderDesignRisks(result) {
  if (designState.editing) {
    return renderDesignRiskEditor(result);
  }
  return `
    <section class="scenario-section">
      <h3>风险与待确认问题</h3>
      <div class="risk-card-grid">
        ${(result.risks || [])
          .map(
            (item) => `
              <article class="risk-card design-risk-card">
                <div class="risk-card-head">
                  <strong>${escapeHtml(stripMarkdownDecorators(item.description))}</strong>
                  <span>${escapeHtml(item.needsReview ? "需复核" : "可跟进")}</span>
                </div>
                <dl>
                  <div><dt>影响范围</dt><dd>${renderRichTextBlock(item.impact, "compact-rich-answer inline-rich-answer")}</dd></div>
                  <div><dt>建议补充材料</dt><dd>${renderRichTextBlock(item.supplement, "compact-rich-answer inline-rich-answer")}</dd></div>
                  <div><dt>置信度</dt><dd>${escapeHtml(stripMarkdownDecorators(item.confidence))}</dd></div>
                </dl>
              </article>
            `,
          )
          .join("")}
      </div>
    </section>
    <section class="scenario-section gap-section">
      <h3>待确认问题</h3>
      ${renderRichList(result.openQuestions || [], "scenario-bullet-list compact-list")}
    </section>
  `;
}

function renderDesignRiskEditor(result) {
  const risks = result.risks || [];
  const openQuestions = result.openQuestions || [];
  return `
    <section class="scenario-section design-edit-section">
      <h3>编辑风险项</h3>
      <div class="design-edit-card-grid">
        ${risks.length ? risks.map((item, index) => `
          <article class="design-edit-card">
            <div class="card-title-row">
              <strong>风险 ${index + 1}</strong>
              ${renderEditInput("risks", index, "needsReview", item.needsReview, "需要人工复核", { type: "boolean" })}
            </div>
            ${renderEditInput("risks", index, "description", item.description || item.risk, "风险描述", { type: "textarea", rows: 3 })}
            ${renderEditInput("risks", index, "impact", item.impact, "影响范围", { type: "textarea", rows: 3 })}
            ${renderEditInput("risks", index, "supplement", item.supplement || item.suggestion, "建议处理", { type: "textarea", rows: 3 })}
            <div class="design-edit-evidence-note">证据来源保留：${escapeHtml(formatHumanReadableItem(item.sourceDocument || "待关联文档", { maxLength: 100 }))}</div>
          </article>
        `).join("") : renderEmptyState("当前没有明确风险项。", "若准备进入评审，仍建议人工检查权限、金额、状态流转和异常流程。")}
      </div>
    </section>
    <section class="scenario-section design-edit-section gap-section">
      <h3>编辑待确认问题</h3>
      <div class="design-edit-card-grid">
        ${openQuestions.length ? openQuestions.map((item, index) => `
          <article class="design-edit-card">
            ${renderEditInput("openQuestions", index, "question", item.question || item.description || item.item, "待确认问题", { type: "textarea", rows: 3 })}
            ${renderEditInput("openQuestions", index, "reason", item.reason || item.impact, "原因", { type: "textarea", rows: 3 })}
            ${renderEditInput("openQuestions", index, "suggestion", item.suggestion || item.supplement, "建议补充内容", { type: "textarea", rows: 3 })}
          </article>
        `).join("") : renderEmptyState("当前没有待确认问题。", "如果你发现 AI 初稿缺少依据，可以在保存后通过历史产物复核备注补充说明。")}
      </div>
    </section>
  `;
}

function renderDesignDiagram(result) {
  const diagramSource = String(result.diagram || "").trim();
  return `
    <section class="scenario-section design-diagram-section">
      <div class="design-diagram-head">
        <div>
          <h3>Mermaid 图示输出</h3>
          <p>当前先渲染 Mermaid 第一版图示，渲染失败时保留源码，便于继续调整提示词或手工修正。</p>
        </div>
        <button type="button" class="secondary-button" data-design-action="copy-diagram">复制图示源码</button>
      </div>
      <div class="design-diagram-host" id="design-diagram-host">
        <div class="empty-inline">正在准备图示渲染容器...</div>
      </div>
      <details class="diagram-source-panel">
        <summary>查看 Mermaid 源码</summary>
        <pre class="diagram-source-code" id="design-diagram-source">${escapeHtml(diagramSource || "flowchart TD\nGOAL[\"设计输出\"]")}</pre>
      </details>
    </section>
  `;
}

function renderDesignNextActions(result) {
  return `
    <section class="scenario-section">
      <h3>后续动作建议</h3>
      <div class="table-wrap">
        <table class="scenario-table design-table">
          <thead>
            <tr>
              <th>后续动作</th>
              <th>优先级</th>
              <th>建议负责人</th>
              <th>依赖文档</th>
              <th>完成标准</th>
            </tr>
          </thead>
          <tbody>
            ${(result.nextActions || [])
              .map(
                (item) => `
                  <tr>
                    <td><strong>${escapeHtml(stripMarkdownDecorators(item.action))}</strong></td>
                    <td><span class="priority-badge priority-${getPriorityClass(item.priority)}">${escapeHtml(item.priority)}</span></td>
                    <td>${escapeHtml(stripMarkdownDecorators(item.owner))}</td>
                    <td>${escapeHtml(stripMarkdownDecorators(item.dependentDocument))}</td>
                    <td>${renderRichTextBlock(item.doneDefinition, "compact-rich-answer inline-rich-answer")}</td>
                  </tr>
                `,
              )
              .join("")}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function renderDesignEvidencePanel(result) {
  const levelNode = document.getElementById("design-evidence-level");
  const warningNode = document.getElementById("design-evidence-warning");
  const citationNode = document.getElementById("design-citation-list");
  const qualityNode = document.getElementById("design-quality-checks");
  if (!levelNode || !warningNode || !citationNode || !qualityNode) {
    return;
  }

  if (!result) {
    levelNode.className = "evidence-level level-medium";
    levelNode.textContent = "等待生成";
    warningNode.hidden = true;
    qualityNode.innerHTML = '<div class="empty-inline">生成设计初稿后展示质量检查。</div>';
    citationNode.innerHTML = '<div class="empty-inline">暂无引用证据。</div>';
    return;
  }

  const level = result.evidenceLevel || inferEvidenceLevel(result.citations);
  levelNode.className = `evidence-level level-${level}`;
  levelNode.textContent = getEvidenceLevelLabel(level);
  warningNode.hidden = level !== "low";
  qualityNode.innerHTML = renderQualityChecks(result);
  citationNode.innerHTML = result.citations?.length
    ? result.citations.map(renderScenarioCitation).join("")
    : '<div class="empty-inline">暂无引用证据。</div>';
}

function renderQualityChecks(result) {
  const checks = result.qualityChecks || {};
  const items = [
    {
      label: "是否存在无引用内容",
      value: checks.hasUncitedContent ? "存在" : "未发现",
      tone: checks.hasUncitedContent ? "bad" : "ok",
    },
    {
      label: "是否存在需求缺口",
      value: checks.hasRequirementGap ? "存在" : "未发现",
      tone: checks.hasRequirementGap ? "warn" : "ok",
    },
    {
      label: "是否建议人工复核",
      value: checks.requiresHumanReview ? "建议复核" : "可常规审阅",
      tone: checks.requiresHumanReview ? "warn" : "ok",
    },
    {
      label: "是否可进入开发评审",
      value: checks.readyForReview ? "可以" : "暂不建议",
      tone: checks.readyForReview ? "ok" : "bad",
    },
  ];

  return `
    <div class="quality-check-list">
      ${items.map(renderQualityCheck).join("")}
    </div>
  `;
}

function renderQualityCheck(item) {
  return `
    <div class="quality-check-item quality-${item.tone}">
      <span>${escapeHtml(item.label)}</span>
      <strong>${escapeHtml(item.value)}</strong>
    </div>
  `;
}

function renderTextOrList(value) {
  if (Array.isArray(value)) {
    return renderRichList(value, "scenario-bullet-list compact-list");
  }
  if (value && typeof value === "object") {
    return renderRichTextBlock(formatHumanReadableItem(value), "compact-rich-answer inline-rich-answer");
  }
  return renderRichTextBlock(value, "compact-rich-answer inline-rich-answer");
}

function renderNumberedScenario(value) {
  const list = Array.isArray(value) ? value.filter((item) => item !== null && item !== undefined && String(item).trim()) : [];
  if (!list.length) {
    return '<div class="empty-inline">待补充</div>';
  }

  return `
    <ol class="scenario-numbered-list">
      ${list
        .map(
          (item, index) => `
            <li>
              <span>${String(index + 1).padStart(2, "0")}</span>
              <div>${renderRichTextBlock(item, "compact-rich-answer inline-rich-answer")}</div>
            </li>
          `,
        )
        .join("")}
    </ol>
  `;
}

function renderDesignDataPermission(result) {
  return `
    <section class="scenario-section">
      <h3>数据对象建议</h3>
      <div class="data-object-grid">
        ${renderCollectionOrEmpty(result.dataObjects, renderDataObjectCard, "当前文档证据不足，暂未生成数据对象建议。")}
      </div>
    </section>
    <section class="scenario-section">
      <h3>权限与角色分析</h3>
      <div class="permission-analysis-grid">
        ${renderCollectionOrEmpty(result.permissionAnalysis, renderPermissionCard, "当前文档证据不足，暂未识别权限边界。")}
      </div>
    </section>
    <section class="scenario-section">
      <h3>异常场景</h3>
      <div class="exception-scenario-grid">
        ${renderCollectionOrEmpty(result.exceptionScenarios, renderExceptionScenarioCard, "当前文档证据不足，暂未生成异常场景。")}
      </div>
    </section>
  `;
}

function renderDataObjectCard(item) {
  return `
    <article class="data-object-card">
      <strong>${escapeHtml(stripMarkdownDecorators(item.name || "未命名数据对象"))}</strong>
      <dl class="design-dl compact">
        <div><dt>建议字段</dt><dd>${renderTagList(item.fields, "待补充字段")}</dd></div>
        <div><dt>关联模块</dt><dd>${renderTagList(item.relatedModules, "待关联模块")}</dd></div>
        <div><dt>来源文档</dt><dd>${escapeHtml(stripMarkdownDecorators(item.sourceDocument || "待关联文档"))}</dd></div>
      </dl>
    </article>
  `;
}

function renderPermissionCard(item) {
  if (typeof item === "string") {
    return `<article class="permission-card">${renderRichTextBlock(item, "compact-rich-answer")}</article>`;
  }
  return `
    <article class="permission-card">
      <strong>${escapeHtml(stripMarkdownDecorators(item.role || item.name || "权限项"))}</strong>
      ${renderRichTextBlock(item.permission || item.responsibility || item.description || item.boundary || "待补充权限说明。", "compact-rich-answer")}
      ${item.sourceDocument ? `<small>来源：${escapeHtml(stripMarkdownDecorators(item.sourceDocument))}</small>` : ""}
    </article>
  `;
}

function renderExceptionScenarioCard(item) {
  if (typeof item === "string") {
    return `<article class="exception-card">${renderRichTextBlock(item, "compact-rich-answer")}</article>`;
  }
  return `
    <article class="exception-card">
      <strong>${escapeHtml(stripMarkdownDecorators(item.name || item.scenario || item.description || "异常场景"))}</strong>
      ${renderRichTextBlock(item.description || item.scenario || "待补充异常说明。", "compact-rich-answer")}
      <dl>
        <div><dt>处理建议</dt><dd>${renderRichTextBlock(item.suggestion || item.handling || "需要人工确认处理规则。", "compact-rich-answer inline-rich-answer")}</dd></div>
        <div><dt>来源文档</dt><dd>${escapeHtml(stripMarkdownDecorators(item.sourceDocument || item.source || "待关联文档"))}</dd></div>
      </dl>
    </article>
  `;
}

function renderDesignTraceability(result) {
  return `
    <section class="scenario-section">
      <h3>需求-功能-用例-模块-证据追踪矩阵</h3>
      ${renderTraceabilityTable(result.traceabilityMatrix)}
    </section>
  `;
}

function renderTraceabilityTable(items = []) {
  if (!items.length) {
    return '<div class="empty-inline">当前文档证据不足，暂未生成追踪矩阵。</div>';
  }
  return `
    <div class="table-wrap traceability-table-wrap">
      <table class="scenario-table design-table traceability-table">
        <thead>
          <tr>
            <th>需求/业务规则来源</th>
            <th>功能点</th>
            <th>文本用例</th>
            <th>建议模块</th>
            <th>证据等级</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          ${items.map((item) => `
            <tr>
              <td>${escapeHtml(stripMarkdownDecorators(item.requirementSource || "待关联需求"))}</td>
              <td><strong>${escapeHtml(stripMarkdownDecorators(item.functionName || "待关联功能"))}</strong></td>
              <td>${escapeHtml(stripMarkdownDecorators(item.useCaseName || "待关联用例"))}</td>
              <td>${escapeHtml(stripMarkdownDecorators(item.moduleName || "待关联模块"))}</td>
              <td>${escapeHtml(stripMarkdownDecorators(item.evidenceLevel || resultEvidenceLevelLabel(item)))}</td>
              <td>
                <details class="traceability-evidence-detail">
                  <summary>查看证据</summary>
                  <dl>
                    <div><dt>来源文档</dt><dd>${escapeHtml(stripMarkdownDecorators(item.sourceDocument || "待关联文档"))}</dd></div>
                    <div><dt>chunk id</dt><dd>${escapeHtml(stripMarkdownDecorators(item.chunkId || item.segmentId || "未标注"))}</dd></div>
                    <div><dt>score</dt><dd>${escapeHtml(Number(item.score || item.evidenceScore || 0).toFixed(2))}</dd></div>
                  </dl>
                  ${renderExpandableText(item.evidenceSnippet || "当前追踪项缺少明确证据片段。", { threshold: 160, className: "evidence-snippet" })}
                </details>
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderDesignBusinessAnalysis(result) {
  if (designState.editing) {
    return `
      <section class="scenario-section">
        <h3>业务对象识别</h3>
        <div class="business-object-grid">
          ${renderCollectionOrEmpty(result.businessObjects, renderBusinessObjectCard, "当前文档证据不足，暂未识别明确业务对象。")}
        </div>
      </section>
      ${renderDesignBusinessRuleEditor(result)}
      <section class="scenario-section">
        <h3>证据覆盖率</h3>
        ${renderEvidenceCoverage(result.evidenceCoverage)}
      </section>
    `;
  }
  return `
    <section class="scenario-section">
      <h3>业务对象识别</h3>
      <div class="business-object-grid">
        ${renderCollectionOrEmpty(result.businessObjects, renderBusinessObjectCard, "当前文档证据不足，暂未识别明确业务对象。")}
      </div>
    </section>
    <section class="scenario-section">
      <h3>业务规则抽取</h3>
      <div class="business-rule-list">
        ${renderCollectionOrEmpty(result.businessRules, renderBusinessRuleCard, "当前文档证据不足，暂未抽取明确业务规则。")}
      </div>
    </section>
    <section class="scenario-section">
      <h3>证据覆盖率</h3>
      ${renderEvidenceCoverage(result.evidenceCoverage)}
    </section>
  `;
}

function renderDesignBusinessRuleEditor(result) {
  const list = result.businessRules || [];
  return `
    <section class="scenario-section design-edit-section">
      <h3>编辑业务规则</h3>
      <div class="design-edit-card-grid">
        ${list.length ? list.map((item, index) => `
          <article class="design-edit-card">
            ${renderEditInput("businessRules", index, "rule", item.rule || item.description, "规则名称")}
            ${renderEditInput("businessRules", index, "description", item.description || item.rule, "规则描述", { type: "textarea", rows: 4 })}
            ${renderEditInput("businessRules", index, "impactScope", item.impactScope || item.impact, "影响范围", { type: "textarea", rows: 3 })}
            ${renderEditInput("businessRules", index, "needsReview", item.needsReview, "需要人工复核", { type: "boolean" })}
            <div class="design-edit-evidence-note">证据来源保留：${escapeHtml(formatHumanReadableItem(item.sourceDocument || "待关联文档", { maxLength: 100 }))}</div>
          </article>
        `).join("") : renderEmptyState("当前文档证据不足，暂未抽取可编辑业务规则。", "建议补充业务流程、权限边界和异常流程说明。")}
      </div>
    </section>
  `;
}

function renderBusinessObjectCard(item) {
  return `
    <article class="business-object-card">
      <strong>${escapeHtml(stripMarkdownDecorators(item.name || "未命名对象"))}</strong>
      ${renderRichTextBlock(item.meaning || item.description || "待补充业务含义。", "compact-rich-answer")}
      <dl>
        <div><dt>关联模块</dt><dd>${renderTagList(item.relatedModules, "待关联模块")}</dd></div>
        <div><dt>来源文档</dt><dd>${escapeHtml(stripMarkdownDecorators(item.sourceDocument || "待关联文档"))}</dd></div>
      </dl>
      ${item.evidenceSnippet ? renderExpandableText(item.evidenceSnippet, { threshold: 160, className: "evidence-snippet" }) : ""}
    </article>
  `;
}

function renderBusinessRuleCard(item) {
  return `
    <article class="business-rule-card">
      <div>
        <strong>${escapeHtml(stripMarkdownDecorators(item.rule || item.description || "未命名规则"))}</strong>
        <span>${escapeHtml(item.needsReview ? "需人工复核" : "证据较充分")}</span>
      </div>
      ${renderRichTextBlock(item.description || item.rule || "待补充规则描述。", "compact-rich-answer")}
      <dl>
        <div><dt>影响范围</dt><dd>${renderRichTextBlock(item.impactScope || item.impact || "待确认影响范围", "compact-rich-answer inline-rich-answer")}</dd></div>
        <div><dt>来源文档</dt><dd>${escapeHtml(stripMarkdownDecorators(item.sourceDocument || "待关联文档"))}</dd></div>
      </dl>
      ${item.evidenceSnippet ? renderExpandableText(item.evidenceSnippet, { threshold: 160, className: "evidence-snippet" }) : ""}
    </article>
  `;
}

function renderTagList(value, emptyText = "待补充") {
  const list = Array.isArray(value) ? value.filter((item) => item !== null && item !== undefined && String(item).trim()) : [];
  if (!list.length) {
    return `<div class="empty-inline">${escapeHtml(emptyText)}</div>`;
  }

  return `
    <div class="tag-list">
      ${list.map((item) => `<span>${escapeHtml(stripMarkdownDecorators(formatDisplayValue(item)))}</span>`).join("")}
    </div>
  `;
}

const HUMAN_READABLE_FIELD_LABELS = {
  sourceDocument: "来源",
  evidenceSource: "来源",
  evidenceSnippet: "证据",
  reason: "原因",
  suggestion: "建议",
  supplement: "建议",
  impact: "影响",
  impactScope: "影响范围",
  priority: "优先级",
  owner: "负责人",
  suggestedOwner: "建议负责人",
  dependentDocument: "依赖文档",
  status: "状态",
};

function formatHumanReadableItem(value, options = {}) {
  const maxLength = Number(options.maxLength || 0);
  if (typeof value === "string" && /^\s*[{[]/.test(value)) {
    try {
      return formatHumanReadableItem(JSON.parse(value), options);
    } catch (error) {
      // Keep rendering the original string when it is not valid JSON.
    }
  }
  if (Array.isArray(value)) {
    const text = value.map((item) => formatHumanReadableItem(item, { compact: true })).filter(Boolean).join("；");
    return maxLength ? cleanDisplayText(text, { maxLength }) : cleanDisplayText(text);
  }
  if (!value || typeof value !== "object") {
    return cleanDisplayText(value || "", maxLength ? { maxLength } : {});
  }

  const primaryKeys = [
    "question",
    "title",
    "name",
    "description",
    "risk",
    "item",
    "gap",
    "action",
    "conclusion",
    "taskName",
    "task",
    "rule",
    "requirementSource",
    "functionName",
    "useCaseName",
    "moduleName",
  ];
  const primary = primaryKeys.map((key) => value[key]).find((item) => item !== null && item !== undefined && String(item).trim());
  const pieces = [];
  if (primary) {
    pieces.push(cleanDisplayText(primary));
  }

  Object.entries(HUMAN_READABLE_FIELD_LABELS).forEach(([key, label]) => {
    const fieldValue = value[key] ?? value[toSnakeCase(key)];
    if (fieldValue === null || fieldValue === undefined || String(fieldValue).trim() === "") {
      return;
    }
    const text = cleanDisplayText(Array.isArray(fieldValue) ? fieldValue.join("、") : fieldValue, {
      maxLength: key.toLowerCase().includes("snippet") ? 120 : 0,
    });
    if (!text || pieces.some((piece) => piece.includes(text))) {
      return;
    }
    pieces.push(`${label}：${text}`);
  });

  if (!pieces.length) {
    Object.entries(value).some(([key, fieldValue]) => {
      if (fieldValue === null || fieldValue === undefined || typeof fieldValue === "object" || String(fieldValue).trim() === "") {
        return false;
      }
      pieces.push(`${key}：${cleanDisplayText(fieldValue)}`);
      return pieces.length >= 3;
    });
  }

  const text = pieces.join(options.compact ? "；" : "\n");
  return maxLength ? cleanDisplayText(text, { maxLength }) : cleanDisplayText(text);
}

function toSnakeCase(value) {
  return String(value || "").replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

function formatDisplayValue(value) {
  return formatHumanReadableItem(value);
}

function renderCollectionOrEmpty(items, renderer, emptyText) {
  const list = Array.isArray(items)
    ? items.filter((item) => item !== null && item !== undefined && (typeof item !== "string" || item.trim()))
    : [];
  if (!list.length) {
    return `<div class="empty-inline">${escapeHtml(emptyText)}</div>`;
  }
  return list.map(renderer).join("");
}

function renderEvidenceSnippet(value, limit = 120) {
  const text = formatEvidenceDisplayText(value || "", limit);
  if (!text) {
    return '<span class="muted-inline">暂无证据片段</span>';
  }
  return renderExpandableText(value, {
    threshold: limit,
    className: "evidence-snippet-inline",
    emptyText: "暂无证据片段",
  });
}

function formatEvidenceDisplayText(value, limit = 180) {
  const text = cleanPresentationText(value || "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/原始链接[:：][^\n>]*/g, "")
    .replace(/来源[:：][^\n>]*/g, "")
    .replace(/^\s*\d+[_-][^:：\s]+\.(?:md|markdown|txt|pdf|docx|xlsx|csv)\s*(?:mentions|提到|[:：])?\s*/i, "")
    .replace(/^\s*[^:：\s]+\.(?:md|markdown|txt|pdf|docx|xlsx|csv)\s*(?:mentions|提到|[:：])?\s*/i, "")
    .replace(/\bmentions\b/gi, "：")
    .replace(/SuperRAG演示整理版/g, "")
    .replace(/CRM[^，。；:：\s]{0,12}模块说明/g, "")
    .replace(/#+\s*/g, "")
    .replace(/[>`*_]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) {
    return "";
  }
  return text.length > limit ? `${text.slice(0, limit)}...` : text;
}

function renderExpandableText(value, options = {}) {
  const threshold = Number(options.threshold || 160);
  const className = options.className || "expandable-text";
  const emptyText = options.emptyText || "当前文档证据不足，暂未生成明确内容。";
  const fullText = cleanDisplayText(value || "");
  if (!fullText) {
    return `<span class="muted-inline">${escapeHtml(emptyText)}</span>`;
  }
  if (fullText.length <= threshold) {
    return `<span class="${escapeHtml(className)}">${escapeHtml(fullText)}</span>`;
  }
  const shortText = cleanDisplayText(fullText, { maxLength: threshold });
  return `
    <details class="expandable-text-block ${escapeHtml(className)}">
      <summary><span>${escapeHtml(shortText)}</span><em>展开</em></summary>
      <p>${escapeHtml(fullText)}</p>
    </details>
  `;
}

function resultEvidenceLevelLabel(item = {}) {
  if (item.evidenceScore || item.score) {
    const score = Number(item.evidenceScore || item.score || 0);
    if (score >= 0.6) {
      return "充分";
    }
    if (score > 0) {
      return "部分充分";
    }
  }
  return "部分充分";
}

function renderEvidenceCoverage(coverage = {}) {
  const covered = Array.isArray(coverage.coveredAspects) ? coverage.coveredAspects : [];
  const missing = Array.isArray(coverage.missingAspects) ? coverage.missingAspects : [];
  return `
    <div class="coverage-card-grid">
      <article class="coverage-card">
        <span>已覆盖方面</span>
        ${renderTagList(covered, "暂无覆盖项")}
      </article>
      <article class="coverage-card ${missing.length ? "coverage-warning" : ""}">
        <span>缺失方面</span>
        ${renderTagList(missing, "暂无明显缺口")}
      </article>
      <article class="coverage-card">
        <span>覆盖等级</span>
        <strong>${escapeHtml(getEvidenceLevelLabel(mapCoverageLevel(coverage.coverageLevel)))}</strong>
        ${renderRichTextBlock(coverage.reviewSuggestion || "请结合引用证据人工复核后再进入评审。", "compact-rich-answer")}
      </article>
    </div>
  `;
}

function mapCoverageLevel(level) {
  const value = String(level || "").toLowerCase();
  if (["high", "sufficient", "strong", "充分"].includes(value)) {
    return "high";
  }
  if (["low", "insufficient", "weak", "不足"].includes(value)) {
    return "low";
  }
  return "medium";
}

function renderGenerationModeBadge(mode) {
  const normalized = String(mode || "unknown").toLowerCase();
  const labels = {
    model: "真实模型生成",
    "openai-compatible": "真实模型生成",
    "retrieval-fallback": "检索兜底生成",
    "mock-fallback": "演示数据回退",
    "frontend-mock": "演示数据回退",
    "json-repaired-model": "JSON 修复生成",
    unknown: "来源待确认",
  };
  const label = labels[normalized] || labels[normalized.replaceAll("_", "-")] || labels.unknown;
  const tone = normalized.includes("mock") ? "mock" : normalized.includes("retrieval") ? "fallback" : normalized.includes("json") ? "repair" : "model";
  return `<span class="generation-badge generation-${tone}">${escapeHtml(label)}</span>`;
}

function downloadTextFile(content, filename, type = "text/plain;charset=utf-8") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function cloneDesignValue(value) {
  if (value === null || value === undefined) {
    return value;
  }
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}

function getDesignDisplayResult(result = designState.result) {
  return designState.editing && designState.editedResult ? designState.editedResult : result;
}

function resetDesignEditState() {
  designState.editing = false;
  designState.originalResult = null;
  designState.editedResult = null;
  designState.hasManualEdits = false;
  designState.modifiedAt = null;
}

function startDesignEditMode() {
  if (!designState.result) {
    toast("请先生成设计初稿。");
    return;
  }
  designState.originalResult = designState.originalResult || cloneDesignValue(designState.result);
  designState.editedResult = normalizeDesignEditableResult(cloneDesignValue(designState.result));
  designState.editing = true;
  renderDesignResult(designState.result);
  renderDesignEvidencePanel(designState.editedResult);
  toast("已进入人工修订模式。");
}

function saveDesignEditMode() {
  if (!designState.editing || !designState.editedResult) {
    return;
  }
  const modifiedAt = nowText();
  designState.result = {
    ...cloneDesignValue(designState.editedResult),
    manualEdited: true,
    modifiedAt,
    reviewStatus: "待复核",
    humanNotes: "用户已对 AI 生成结果进行人工修订",
  };
  designState.editing = false;
  designState.editedResult = null;
  designState.hasManualEdits = true;
  designState.modifiedAt = modifiedAt;
  renderDesignResult(designState.result);
  renderDesignEvidencePanel(designState.result);
  toast("人工修订已保存，当前产物状态为待复核。");
}

function cancelDesignEditMode() {
  designState.editing = false;
  designState.editedResult = null;
  renderDesignResult(designState.result);
  renderDesignEvidencePanel(designState.result);
  toast("已取消本次编辑，保留当前设计结果。");
}

function restoreDesignOriginalResult() {
  if (!designState.originalResult) {
    toast("当前没有可恢复的 AI 原始结果。");
    return;
  }
  designState.result = cloneDesignValue(designState.originalResult);
  designState.editing = false;
  designState.editedResult = null;
  designState.hasManualEdits = false;
  designState.modifiedAt = null;
  renderDesignResult(designState.result);
  renderDesignEvidencePanel(designState.result);
  toast("已恢复 AI 原始结果。");
}

function normalizeDesignEditableResult(result = {}) {
  const next = result || {};
  next.functionList = (next.functionList || []).map((item, index) => typeof item === "object" ? item : {
    id: `F-${String(index + 1).padStart(3, "0")}`,
    name: String(item || `功能 ${index + 1}`),
    description: String(item || ""),
    priority: "中",
  });
  next.useCases = (next.useCases || []).map((item, index) => typeof item === "object" ? item : {
    id: `UC-${String(index + 1).padStart(3, "0")}`,
    name: String(item || `用例 ${index + 1}`),
    actor: "业务用户",
    preconditions: [],
    mainSuccessScenario: [String(item || "")].filter(Boolean),
    extensionScenarios: [],
    exceptionScenarios: [],
    postconditions: "待补充",
  });
  next.risks = (next.risks || []).map((item) => typeof item === "object" ? item : {
    description: String(item || "待确认风险"),
    impact: "影响设计结论可信度。",
    supplement: "补充相关文档或人工确认。",
    needsReview: true,
  });
  next.openQuestions = (next.openQuestions || []).map((item) => typeof item === "object" ? item : {
    question: String(item || "待确认问题"),
    reason: "当前证据不足。",
    suggestion: "建议补充需求、接口或业务规则文档。",
  });
  next.moduleSuggestions = (next.moduleSuggestions || []).map((item, index) => typeof item === "object" ? item : {
    name: String(item || `模块 ${index + 1}`),
    responsibility: String(item || ""),
    input: [],
    output: [],
    dependencies: [],
  });
  next.businessRules = (next.businessRules || []).map((item, index) => typeof item === "object" ? item : {
    rule: String(item || `业务规则 ${index + 1}`),
    description: String(item || ""),
    impactScope: "待确认影响范围",
    needsReview: true,
  });
  return next;
}

function updateDesignEditedField(fieldNode) {
  if (!designState.editing || !designState.editedResult || !fieldNode) {
    return;
  }
  const collection = fieldNode.dataset.designEditCollection;
  const index = Number(fieldNode.dataset.designEditIndex);
  const field = fieldNode.dataset.designEditField;
  const type = fieldNode.dataset.designEditType || "text";
  if (!collection || !field || !Number.isInteger(index)) {
    return;
  }
  const list = designState.editedResult[collection];
  if (!Array.isArray(list) || !list[index]) {
    return;
  }
  let value = fieldNode.type === "checkbox" ? fieldNode.checked : fieldNode.value;
  if (type === "list") {
    value = splitTextareaLines(value);
  }
  if (type === "boolean") {
    value = Boolean(fieldNode.checked);
  }
  list[index][field] = value;
  designState.hasManualEdits = true;
}

function splitTextareaLines(value) {
  return String(value || "")
    .split(/\n+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function valueToTextarea(value) {
  if (Array.isArray(value)) {
    return value.map((item) => formatHumanReadableItem(item, { compact: true })).join("\n");
  }
  return formatHumanReadableItem(value, { compact: true });
}

function renderDesignEditToolbar(result = {}) {
  const manualEdited = Boolean(result.manualEdited || designState.hasManualEdits);
  const modifiedAt = result.modifiedAt || designState.modifiedAt || "";
  const title = designState.editing ? "人工修订中" : manualEdited ? "已人工修订" : "AI 生成初稿";
  const description = designState.editing
    ? "正在编辑功能点、文本用例、风险和待确认问题。证据链不会被修改，请在评审前核对引用证据。"
    : manualEdited
      ? `本产物已人工修订${modifiedAt ? `，修订时间：${modifiedAt}` : ""}，当前状态为待复核。`
      : "当前结果是 AI 基于 RAG 证据生成的工程初稿，可进入人工修订。";
  return `
    <section class="design-edit-toolbar ${designState.editing ? "is-editing" : ""}">
      <div>
        <p class="eyebrow">Human Review Loop</p>
        <h3>${escapeHtml(title)}</h3>
        <p>${escapeHtml(description)}</p>
      </div>
      <div class="design-edit-actions">
        ${
          designState.editing
            ? `
              <button class="primary-button" type="button" data-design-action="save-edit">保存修改</button>
              <button type="button" data-design-action="cancel-edit">取消编辑</button>
              <button type="button" data-design-action="restore-ai">恢复 AI 原始结果</button>
            `
            : `
              <button type="button" data-design-action="start-edit">进入编辑模式</button>
              ${manualEdited && designState.originalResult ? '<button type="button" data-design-action="restore-ai">恢复 AI 原始结果</button>' : ""}
            `
        }
      </div>
    </section>
  `;
}

function renderManualEditBadges(result = {}) {
  return `
    <span class="quality-score-badge quality-score-ready">AI 生成初稿</span>
    ${result.manualEdited ? '<span class="quality-score-badge quality-score-partial">已人工修订</span>' : ""}
    ${result.manualEdited || result.reviewStatus ? `<span class="quality-score-badge quality-score-partial">${escapeHtml(result.reviewStatus || "待复核")}</span>` : ""}
  `;
}

function renderEditInput(collection, index, field, value, label, options = {}) {
  const type = options.type || "text";
  const inputClass = options.className || "";
  const valueText = type === "list" ? valueToTextarea(value) : formatHumanReadableItem(value, { compact: true });
  const commonAttrs = `data-design-edit-collection="${escapeHtml(collection)}" data-design-edit-index="${escapeHtml(index)}" data-design-edit-field="${escapeHtml(field)}" data-design-edit-type="${escapeHtml(type)}"`;
  if (type === "select") {
    const choices = options.choices || ["高", "中", "低"];
    return `
      <label class="design-edit-field ${escapeHtml(inputClass)}">
        <span>${escapeHtml(label)}</span>
        <select ${commonAttrs}>
          ${choices.map((choice) => `<option value="${escapeHtml(choice)}" ${choice === value ? "selected" : ""}>${escapeHtml(choice)}</option>`).join("")}
        </select>
      </label>
    `;
  }
  if (type === "boolean") {
    return `
      <label class="design-edit-checkbox ${escapeHtml(inputClass)}">
        <input type="checkbox" ${commonAttrs} ${value ? "checked" : ""} />
        <span>${escapeHtml(label)}</span>
      </label>
    `;
  }
  if (type === "textarea" || type === "list") {
    return `
      <label class="design-edit-field ${escapeHtml(inputClass)}">
        <span>${escapeHtml(label)}</span>
        <textarea rows="${escapeHtml(options.rows || 4)}" ${commonAttrs}>${escapeHtml(valueText)}</textarea>
      </label>
    `;
  }
  return `
    <label class="design-edit-field ${escapeHtml(inputClass)}">
      <span>${escapeHtml(label)}</span>
      <input type="text" value="${escapeHtml(valueText)}" ${commonAttrs} />
    </label>
  `;
}

async function handleDesignAction(action) {
  if (action === "regenerate") {
    await generateDesignOutput();
    return;
  }

  if (action === "start-edit") {
    startDesignEditMode();
    return;
  }

  if (action === "save-edit") {
    saveDesignEditMode();
    return;
  }

  if (action === "cancel-edit") {
    cancelDesignEditMode();
    return;
  }

  if (action === "restore-ai") {
    restoreDesignOriginalResult();
    return;
  }

  if (!designState.result) {
    toast("请先生成设计初稿。");
    return;
  }

  const activeResult = getDesignDisplayResult(designState.result);

  if (action === "copy") {
    const markdown = buildDesignMarkdown(activeResult);
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(markdown);
      toast("设计结果已复制为 Markdown。");
      return;
    }
    toast("当前浏览器不支持自动复制，请手动复制页面内容。");
    return;
  }

  if (action === "copy-diagram") {
    const diagramText = String(activeResult.diagram || "").trim();
    if (!diagramText) {
      toast("当前没有可复制的图示源码。");
      return;
    }
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(diagramText);
      toast("Mermaid 图示源码已复制。");
      return;
    }
    toast("当前浏览器不支持自动复制，请手动复制图示源码。");
    return;
  }

  if (action === "export") {
    const markdown = buildDesignMarkdown(activeResult);
    downloadTextFile(markdown, `SuperRAG-需求设计产物-${Date.now()}.md`, "text/markdown;charset=utf-8");
    toast("设计产物 Markdown 已导出。");
    return;
  }

  if (action === "save") {
    if (designState.editing) {
      toast("请先点击“保存修改”，再保存到历史产物。");
      return;
    }
    const result = designState.result;
    window.SuperRagBackend?.appendHistoryRecord?.({
      id: `${result.id || "design"}-saved-${Date.now()}`,
      title: result.title,
      sceneMode: "design",
      artifactType: "design_output",
      project: result.project,
      summary: buildDesignHistorySummary(result),
      query: result.inputQuestion,
      originalQuestion: result.inputQuestion,
      outputSummary: buildDesignHistorySummary(result),
      structuredOutput: result,
      qualityAssessment: result.qualityAssessment || {},
      citations: result.citations,
      manualEdited: Boolean(result.manualEdited),
      modifiedAt: result.modifiedAt || "",
      reviewStatus: result.manualEdited ? "待复核" : result.reviewStatus || "草稿",
      humanNotes: result.manualEdited ? "用户已对 AI 生成结果进行人工修订" : "",
      changeSummary: result.manualEdited ? "保存人工修订后的设计产物" : "手动保存设计产物",
    });
    toast("设计产物已保存到历史产物。");
  }
}

function buildDesignHistorySummary(result = {}) {
  const functions = (result.functionList || []).slice(0, 4).map((item) => `${item.id || ""} ${item.name || item.description || ""}`.trim());
  const useCases = (result.useCases || []).slice(0, 3).map((item) => `${item.id || ""} ${item.name || ""}`.trim());
  const risks = (result.risks || []).slice(0, 3).map((item) => item.description || item.risk || formatHumanReadableItem(item));
  const lines = [
    result.manualEdited ? "该设计产物已由用户人工修订，当前状态为待复核。" : "该设计产物为 AI 基于 RAG 证据生成的工程初稿。",
    functions.length ? `功能点：${functions.join("；")}` : "",
    useCases.length ? `文本用例：${useCases.join("；")}` : "",
    risks.length ? `待复核风险：${risks.join("；")}` : "",
  ].filter(Boolean);
  return cleanDisplayText(lines.join("\n"), { maxLength: 900 });
}

function buildDesignMarkdown(result) {
  const lines = [
    `# ${result.title}`,
    "",
    `设计目标：${result.inputQuestion}`,
    `关联项目：${result.project}`,
    `证据充分度：${getEvidenceLevelLabel(result.evidenceLevel)}`,
    `生成来源：${stripHtml(renderGenerationModeBadge(result.generationMode || result.source))}`,
    `生成链路：${result.pipelineVersion || "未标注"}`,
    "",
    "## 修订信息",
    `- 生成来源：AI 结构化生成`,
    `- 是否人工修订：${result.manualEdited ? "是" : "否"}`,
    `- 修订时间：${result.modifiedAt || "未修订"}`,
    `- 当前状态：${result.reviewStatus || (result.manualEdited ? "待复核" : "草稿")}`,
    `- 说明：${result.manualEdited ? "本产物为 AI 生成初稿，经人工修订后形成，仍需结合引用证据复核。" : "本产物为 AI 生成初稿，进入正式评审前建议人工核对引用证据。"}`,
    "",
    "## 业务对象识别",
    ...(result.businessObjects || []).map((item) => `- ${formatMarkdownValue(item)}`),
    "",
    "## 业务规则",
    ...(result.businessRules || []).map((item) => `- ${formatMarkdownValue(item)}`),
    "",
    "## 功能清单",
    ...(result.functionList || []).map((item) => `- ${item.id || ""} ${item.name || "未命名功能"}：${formatMarkdownValue(item.description)}（${item.priority || "中"}，${formatMarkdownValue(item.sourceDocument || item.relatedDocument || "待关联文档")}）`),
    "",
    "## 详细文本用例",
    ...(result.useCases || []).flatMap((item) => [
      `### ${item.id} ${item.name}`,
      `- 参与者：${item.actor}`,
      `- 前置条件：${formatMarkdownValue(item.preconditions)}`,
      `- 主成功场景：${formatMarkdownValue(item.mainSuccessScenario)}`,
      `- 扩展场景：${formatMarkdownValue(item.extensionScenarios)}`,
      `- 异常场景：${formatMarkdownValue(item.exceptionScenarios)}`,
      `- 后置条件：${formatMarkdownValue(item.postconditions)}`,
      `- 证据来源：${item.sourceDocument || "待关联"}`,
      "",
    ]),
    "",
    "## 模块划分建议",
    ...(result.moduleSuggestions || []).map((item) => `- ${formatMarkdownValue(item)}`),
    "",
    "## 数据对象建议",
    ...(result.dataObjects || []).map((item) => `- ${formatMarkdownValue(item)}`),
    "",
    "## 权限与角色分析",
    ...(result.permissionAnalysis || []).map((item) => `- ${formatMarkdownValue(item)}`),
    "",
    "## 风险与待确认问题",
    ...(result.risks || []).map((item) => `- ${formatMarkdownValue(item)}`),
    ...(result.openQuestions || []).map((item) => `- 待确认：${formatMarkdownValue(item)}`),
    "",
    "## 需求追踪矩阵",
    ...(result.traceabilityMatrix || []).map((item) => `- ${formatMarkdownValue(item.requirementSource)} -> ${formatMarkdownValue(item.functionName)} -> ${formatMarkdownValue(item.useCaseName)} -> ${formatMarkdownValue(item.moduleName)}（${formatMarkdownValue(item.sourceDocument)}）`),
    "",
    "## 后续动作建议",
    ...(result.nextActions || []).map((item) => `- ${formatMarkdownValue(item.action || item)}（${formatMarkdownValue(item.priority || "中")}，负责人：${formatMarkdownValue(item.owner || "待确认")}）`),
    "",
    "## 引用证据",
    ...(result.citations || []).map((item) => `- ${formatMarkdownValue(item.documentTitle || "知识库片段")}：${cleanDisplayText(item.snippet || "", { maxLength: 260 })}`),
    "",
    "## Mermaid 图示",
    "```mermaid",
    result.diagram || 'flowchart TD\nGOAL["设计输出"]',
    "```",
  ];
  return lines.join("\n");
}

function buildHandoverMarkdown(result) {
  const lines = [
    `# ${result.title || "项目交接报告"}`,
    "",
    `交接问题：${result.query || ""}`,
    `所属项目：${result.project || ""}`,
    `交接范围：${result.scope || ""}`,
    `生成来源：${stripHtml(renderGenerationModeBadge(result.generationMode || result.source))}`,
    "",
    "## 项目背景",
    result.projectBackground || "暂无数据",
    "",
    "## 当前进度",
    result.currentProgress || "暂无数据",
    "",
    "## 已完成事项",
    ...((result.completedItems?.length ? result.completedItems : result.completedFeatures) || []).map((item) => `- ${formatMarkdownValue(item)}`),
    "",
    "## 未完成事项",
    ...(result.unfinishedItems || []).map((item) => `- ${formatMarkdownValue(item)}`),
    "",
    "## 风险登记表",
    ...((result.riskRegister?.length ? result.riskRegister : result.risks) || []).map((item) => `- ${item.risk || item.description}；影响：${item.impact || "待确认"}；建议：${item.suggestion || "补充文档或人工确认"}；来源：${item.sourceDocument || item.evidenceSource || "待关联"}`),
    "",
    "## 接手者待办清单",
    ...((result.todoList?.length ? result.todoList : result.todos) || []).map((item) => `- [ ] ${item.taskName}（${item.priority}，${item.suggestedOwner || item.owner}，依赖：${item.dependentDocument || item.evidenceSource || "待确认"}）`),
    "",
    "## 责任边界",
    ...((result.responsibilityBoundary?.length ? result.responsibilityBoundary : result.roles) || []).map((item) => `- ${item.role}：${item.responsibility}`),
    "",
    "## 依赖文档",
    ...((result.dependentDocuments?.length ? result.dependentDocuments : result.dependentDocs) || []).map((item) => `- ${formatMarkdownValue(item)}`),
    "",
    "## 信息缺口",
    ...(result.informationGaps || []).map((item) => `- ${formatMarkdownValue(item)}`),
    "",
    "## 交接检查清单",
    ...(result.handoverChecklist || []).map((item) => `- [ ] ${formatMarkdownValue(item)}`),
    "",
    "## 证据映射",
    ...(result.evidenceMap || []).map((item) => `- ${item.conclusion}（${item.sourceDocument}）：${item.evidenceSnippet}`),
  ];
  return lines.join("\n");
}

function formatMarkdownValue(value) {
  if (Array.isArray(value)) {
    return value.map(formatMarkdownValue).join("；");
  }
  if (value && typeof value === "object") {
    return formatHumanReadableItem(value, { compact: true });
  }
  return cleanPresentationText(value || "待补充");
}

function cleanPresentationText(value) {
  return cleanDisplayText(value);
}

function cleanDisplayText(value, options = {}) {
  const maxLength = Number(options.maxLength || 0);
  const text = String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/原始链接[:：][^\n>]*/g, "")
    .replace(/来源[:：][^\n>]*/g, "")
    .replace(/SuperRAG演示整理版/g, "")
    .replace(/本文件为课程项目演示用途[^\n。；]*[。；]?/g, "")
    .replace(/本文作为课程项目演示用途[^\n。；]*[。；]?/g, "")
    .replace(/悟空CRM帮助中心/g, "")
    .replace(/^\s*\d+[_-][^:：\s]+\.(?:md|markdown|txt|pdf|docx|xlsx|csv)\s*(?:mentions|提到|[:：])?\s*/i, "")
    .replace(/^\s*[^:：\s]+\.(?:md|markdown|txt|pdf|docx|xlsx|csv)\s*(?:mentions|提到|[:：])?\s*/i, "")
    .replace(/Based on the retrieved project evidence, the most relevant findings are:?/gi, "根据当前知识库检索结果：")
    .replace(/\bI could not find grounded project evidence for this question in the current knowledge base\.?/gi, "当前知识库没有检索到足够证据。")
    .replace(/\bNo grounded evidence was found.*$/gim, "当前知识库没有检索到足够证据。")
    .replace(/\bNo evidence was found.*$/gim, "当前知识库没有检索到足够证据。")
    .replace(/\bUnsupported claims?:/gi, "缺少证据支撑的结论：")
    .replace(/\bUncertain claims?:/gi, "需要人工确认的结论：")
    .replace(/\bPipeline version:/gi, "生成链路版本：")
    .replace(/\bReview the cited documents before treating this as a final conclusion\.?/gi, "请先核对引用文档，再将回答作为正式结论。")
    .replace(/\bTreat the cited document content as confirmed facts\.?/gi, "可把已引用的文档内容作为当前回答依据。")
    .replace(/\bTreat any uncited implementation idea as an optional suggestion that still needs review\.?/gi, "未绑定证据的实现想法只能作为待复核建议。")
    .replace(/\bImport the relevant requirement, design, code, or interface document before answering again\.?/gi, "请先补充相关需求、设计、接口或交接文档后再重新提问。")
    .replace(/\bNo major uncertainty was detected in the retrieved evidence\.?/gi, "当前没有识别到明显的不确定项。")
    .replace(/\bRetrieved chunks have low relevance scores; key details may still be missing\.?/gi, "检索片段相关度偏低，关键细节可能仍然缺失。")
    .replace(/\bOnly a small amount of supporting evidence was found\.?/gi, "当前只找到少量支撑证据，建议补充更多项目文档。")
    .replace(/\bvector search unavailable:/gi, "向量检索暂不可用：")
    .replace(/\s+mentions\s+/gi, "：")
    .replace(/[>#*_`]/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return maxLength && text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function stripHtml(value) {
  return String(value || "").replace(/<[^>]+>/g, "");
}

function scheduleDesignDiagramRender(result) {
  if (!result || designState.activeTab !== "diagram") {
    return;
  }
  const host = document.getElementById("design-diagram-host");
  if (!host) {
    return;
  }

  const diagram = String(result.diagram || "").trim();
  if (!diagram) {
    host.innerHTML = '<div class="empty-inline">当前没有可渲染的 Mermaid 图示源码。</div>';
    return;
  }

  const renderToken = `diagram-${Date.now()}`;
  host.dataset.renderToken = renderToken;
  host.innerHTML = '<div class="diagram-loading">正在渲染 Mermaid 图示...</div>';
  renderMermaidIntoHost(host, diagram, renderToken);
}

async function renderMermaidIntoHost(host, source, renderToken) {
  try {
    const mermaid = await ensureMermaidLibrary();
    if (!host.isConnected || host.dataset.renderToken !== renderToken) {
      return;
    }
    const renderId = `superrag-mermaid-${Date.now()}`;
    const { svg } = await mermaid.render(renderId, source);
    if (!host.isConnected || host.dataset.renderToken !== renderToken) {
      return;
    }
    host.innerHTML = `<div class="mermaid-rendered">${svg}</div>`;
  } catch (error) {
    if (!host.isConnected || host.dataset.renderToken !== renderToken) {
      return;
    }
    host.innerHTML = `
      <div class="mermaid-error-state">
        <strong>图示渲染失败</strong>
        <p>${escapeHtml(error.message || String(error))}</p>
      </div>
    `;
  }
}

async function ensureMermaidLibrary() {
  if (window.mermaid) {
    initializeMermaidLibrary(window.mermaid);
    return window.mermaid;
  }

  if (!mermaidLoaderPromise) {
    mermaidLoaderPromise = loadScript("https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js")
      .then(() => {
        if (!window.mermaid) {
          throw new Error("Mermaid 脚本已加载，但全局对象不可用。");
        }
        initializeMermaidLibrary(window.mermaid);
        return window.mermaid;
      })
      .catch((error) => {
        mermaidLoaderPromise = null;
        throw error;
      });
  }

  return mermaidLoaderPromise;
}

function initializeMermaidLibrary(mermaid) {
  if (mermaid.__superragInitialized) {
    return;
  }
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "loose",
    theme: "base",
    themeVariables: {
      primaryColor: "#eef6ff",
      primaryBorderColor: "#8fb8f8",
      primaryTextColor: "#1f2937",
      lineColor: "#4f7db8",
      secondaryColor: "#ffffff",
      tertiaryColor: "#f8fbff",
      fontFamily: "Segoe UI, PingFang SC, Microsoft YaHei, sans-serif",
    },
    flowchart: {
      curve: "basis",
      htmlLabels: true,
    },
  });
  mermaid.__superragInitialized = true;
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-dynamic-src="${src}"]`);
    if (existing) {
      if (existing.dataset.loaded === "true") {
        resolve();
        return;
      }
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("图示脚本加载失败。")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.dataset.dynamicSrc = src;
    script.addEventListener("load", () => {
      script.dataset.loaded = "true";
      resolve();
    }, { once: true });
    script.addEventListener("error", () => reject(new Error("无法加载 Mermaid 渲染库，请检查网络或稍后重试。")), { once: true });
    document.head.appendChild(script);
  });
}

async function renderHistoryPage() {
  const service = getHistoryService();
  if (!service) {
    return;
  }

  if (!historyState.loaded) {
    historyState.options = await service.getHistoryOptions();
    populateHistoryFilters(historyState.options);
    historyState.loaded = true;
  }

  await renderHistoryList();
}

async function renderKnowledgeGapsPage() {
  const summaryNode = document.getElementById("knowledge-gap-summary");
  const countNode = document.getElementById("knowledge-gap-count");
  const tableBody = document.getElementById("knowledge-gap-table-body");
  const exampleNode = document.getElementById("knowledge-gap-examples");
  if (!summaryNode || !tableBody || !exampleNode) {
    return;
  }

  summaryNode.innerHTML = '<div class="empty-inline">正在聚合历史产物中的知识缺口...</div>';
  tableBody.innerHTML = '<tr><td colspan="7">正在加载知识缺口...</td></tr>';

  try {
    const data = await window.SuperRagBackend.requestJson("/knowledge-gaps", {
      timeoutMs: window.SuperRagConfig?.DOCUMENT_API_TIMEOUT_MS || 60000,
    });
    knowledgeGapState.data = data;
    knowledgeGapState.loaded = true;
    const items = sortKnowledgeGapItems(Array.isArray(data.items) ? data.items : []);
    const summary = data.summary || {};
    if (countNode) {
      countNode.textContent = `${items.length} 类缺口`;
    }
    summaryNode.innerHTML = renderKnowledgeGapSummary(summary, items);
    tableBody.innerHTML = items.length
      ? items.map(renderKnowledgeGapRow).join("")
      : '<tr><td colspan="7">暂无知识缺口。生成并保存历史产物后，系统会自动聚合待确认问题和低证据项。</td></tr>';
    exampleNode.innerHTML = renderKnowledgeGapExamples(items);
  } catch (error) {
    summaryNode.innerHTML = `<div class="empty-inline">知识缺口加载失败：${escapeHtml(error.message || error)}</div>`;
    tableBody.innerHTML = '<tr><td colspan="7">知识缺口接口不可用。</td></tr>';
    exampleNode.innerHTML = '<div class="empty-inline">暂无缺口示例。</div>';
  }
}

function sortKnowledgeGapItems(items = []) {
  const severityRank = { high: 3, medium: 2, low: 1 };
  return [...items].sort((a, b) => {
    const severityDelta = (severityRank[String(b.severity || "low").toLowerCase()] || 0) - (severityRank[String(a.severity || "low").toLowerCase()] || 0);
    if (severityDelta) {
      return severityDelta;
    }
    const countDelta = Number(b.count || 0) - Number(a.count || 0);
    if (countDelta) {
      return countDelta;
    }
    return String(b.impactScope || "").length - String(a.impactScope || "").length;
  });
}

function renderKnowledgeGapSummary(summary = {}, items = []) {
  const sceneCounts = summary.sceneCounts || {};
  const highCount = items.filter((item) => String(item.severity || "").toLowerCase() === "high").length || summary.highSeverityCount || 0;
  const mediumCount = items.filter((item) => String(item.severity || "").toLowerCase() === "medium").length;
  const reviewBlockers = items.filter((item) => /评审|设计|接口|需求|验收|证据/.test([item.impactScope, item.suggestion, item.gapType].join(" "))).length;
  const docTypes = inferPriorityDocTypes(items).join("、") || "需求文档 / 接口文档 / 测试记录";
  return `
    ${renderGapSummaryCard("高风险缺口", highCount, "优先补充文档或安排人工复核")}
    ${renderGapSummaryCard("中风险缺口", mediumCount, "建议进入下一轮补证计划")}
    ${renderGapSummaryCard("影响评审", reviewBlockers, "可能影响设计评审或交接结论")}
    ${renderGapSummaryCard("优先补充", docTypes, "建议优先补充的文档类型")}
    ${renderGapSummaryCard("设计缺口", sceneCounts.design || 0, "来自需求设计辅助产物")}
    ${renderGapSummaryCard("交接缺口", sceneCounts.handover || 0, "来自项目交接产物")}
  `;
}

function inferPriorityDocTypes(items = []) {
  const text = items.map((item) => [item.gapType, item.suggestion, item.impactScope].join(" ")).join(" ");
  const types = [];
  if (/接口|字段|错误码|异常/.test(text)) types.push("接口文档");
  if (/需求|规则|业务/.test(text)) types.push("需求文档");
  if (/测试|验收|用例/.test(text)) types.push("测试记录");
  if (/部署|环境|运维/.test(text)) types.push("部署说明");
  if (/负责人|交接|责任/.test(text)) types.push("交接记录");
  return uniqueValues(types).slice(0, 3);
}

function renderGapSummaryCard(label, value, description) {
  return `
    <article class="gap-summary-card dashboard-card">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      <p>${escapeHtml(description)}</p>
    </article>
  `;
}

function renderKnowledgeGapRow(item = {}) {
  const scenes = (item.sourceScenes || []).map((scene) => formatSceneMode(scene === "general" ? "chat" : scene)).join(" / ");
  const docs = (item.relatedDocuments || []).slice(0, 3).join("、") || "暂无明确关联文档";
  return `
    <tr>
      <td><strong>${escapeHtml(cleanDisplayText(item.gapType || "知识缺口", { maxLength: 80 }))}</strong></td>
      <td>${escapeHtml(scenes || "待确认")}</td>
      <td>${escapeHtml(cleanDisplayText(item.impactScope || "待确认影响范围", { maxLength: 120 }))}</td>
      <td>${escapeHtml(docs)}</td>
      <td>${escapeHtml(item.count || 0)}</td>
      <td>${renderGapSeverityBadge(item.severity)}</td>
      <td>${escapeHtml(cleanDisplayText(item.suggestion || "补充相关文档", { maxLength: 120 }))}</td>
    </tr>
  `;
}

function renderGapSeverityBadge(severity) {
  const value = String(severity || "low").toLowerCase();
  const labelMap = { high: "高", medium: "中", low: "低" };
  return `<span class="gap-severity severity-${escapeHtml(value)}">${escapeHtml(labelMap[value] || "低")}</span>`;
}

function renderKnowledgeGapExamples(items = []) {
  const examples = items.flatMap((item) =>
    (item.examples || []).map((example) => ({
      ...example,
      gapType: item.gapType,
      severity: item.severity,
      suggestion: item.suggestion,
    })),
  );
  if (!examples.length) {
    return '<div class="empty-inline">暂无缺口示例。</div>';
  }
  return examples
    .slice(0, 8)
    .map(
      (example) => `
        <article class="gap-example-card">
          <div>
            <span>${escapeHtml(formatHumanReadableItem(example.gapType || "知识缺口", { maxLength: 60 }))} · ${escapeHtml(formatSceneMode(example.scene === "general" ? "chat" : example.scene || "chat"))}</span>
            <strong>${escapeHtml(formatHumanReadableItem(example.description || example, { maxLength: 120 }))}</strong>
            <p>${escapeHtml(formatHumanReadableItem(example.artifactTitle || "历史产物", { maxLength: 80 }))} · ${escapeHtml(formatShortTime(example.createdAt) || "未记录时间")}</p>
          </div>
          ${renderGapSeverityBadge(example.severity)}
        </article>
      `,
    )
    .join("");
}

function populateHistoryFilters(options) {
  populateScenarioSelect("history-scene", options.sceneModes.map(formatSceneOptionValue), "全部");
  populateScenarioSelect("history-project", options.projects, "全部");
  populateScenarioSelect("history-creator", options.creators, "全部");

  const sceneSelect = document.getElementById("history-scene");
  if (sceneSelect) {
    sceneSelect.innerHTML = [
      '<option value="">全部</option>',
      ...options.sceneModes.map((mode) => `<option value="${escapeHtml(mode)}">${escapeHtml(formatSceneMode(mode))}</option>`),
    ].join("");
  }

  ["history-project", "history-creator"].forEach((selectId) => {
    const select = document.getElementById(selectId);
    if (!select) {
      return;
    }
    select.innerHTML = [
      '<option value="">全部</option>',
      ...Array.from(select.options)
        .map((option) => option.value)
        .filter(Boolean)
        .map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`),
    ].join("");
  });
}

function formatSceneOptionValue(value) {
  return value;
}

async function renderHistoryList() {
  const listNode = document.getElementById("history-list");
  const countNode = document.getElementById("history-result-count");
  const service = getHistoryService();
  if (!listNode || !service) {
    return;
  }

  listNode.innerHTML = renderLoadingState("正在加载历史产物...");
  const result = await service.getHistoryRecords(getHistoryQueryParams());
  historyState.records = result.list;
  if (countNode) {
    countNode.textContent = `${result.total} 条产物`;
  }

  if (!result.list.length) {
    listNode.innerHTML = renderEmptyState("暂无符合条件的历史产物。", "调整筛选条件后可以继续查找问答、培训、交接或设计产物。");
    return;
  }

  listNode.innerHTML = result.list.map(renderHistoryItem).join("");
}

function getHistoryQueryParams() {
  return {
    keyword: getInputValue("history-search"),
    dateFrom: getInputValue("history-date-from"),
    dateTo: getInputValue("history-date-to"),
    sceneMode: getInputValue("history-scene"),
    project: getInputValue("history-project"),
    creator: getInputValue("history-creator"),
  };
}

function renderHistoryItem(record) {
  return `
    <article class="history-record-card">
      <div class="history-record-main">
        <div class="history-record-head">
          <div>
            <h3>${escapeHtml(record.title)}</h3>
            <div class="history-record-meta">
              ${renderSceneBadge(record.sceneMode)}
              ${renderReviewStatusBadge(record.reviewStatus)}
              ${record.manualEdited ? '<span class="quality-score-badge quality-score-partial">已人工修订</span>' : ""}
              <span>${escapeHtml(record.project)}</span>
              <span>${escapeHtml(record.creator)}</span>
              <time>${escapeHtml(formatShortTime(record.createdAt))}</time>
            </div>
          </div>
          <span class="citation-count">${escapeHtml(record.citationCount)} 份引用</span>
        </div>
        <p class="history-record-summary">${escapeHtml(cleanDisplayText(record.summary || "当前产物暂无摘要。", { maxLength: 180 }))}</p>
      </div>
      <div class="history-actions">
        <button type="button" data-history-action="view" data-history-id="${escapeHtml(record.id)}">查看</button>
        <button type="button" data-history-action="copy" data-history-id="${escapeHtml(record.id)}">复制</button>
        <button type="button" data-history-action="export" data-history-id="${escapeHtml(record.id)}">导出</button>
        <button class="danger-link" type="button" data-history-action="delete" data-history-id="${escapeHtml(record.id)}">删除</button>
      </div>
    </article>
  `;
}

async function handleHistoryAction(action, id) {
  switch (action) {
    case "view":
      await openHistoryDrawer(id);
      break;
    case "copy":
      await copyHistoryRecord(id);
      break;
    case "export":
      await exportHistoryRecord(id);
      break;
    case "delete":
      await removeHistoryRecord(id);
      break;
    default:
      break;
  }
}

async function openHistoryDrawer(id) {
  const drawer = document.getElementById("history-detail-drawer");
  const titleNode = document.getElementById("history-detail-title");
  const contentNode = document.getElementById("history-detail-content");
  const service = getHistoryService();
  if (!drawer || !titleNode || !contentNode || !service) {
    return;
  }

  const detail = await service.getHistoryRecordDetail(id);
  if (!detail) {
    toast("历史产物不存在或已删除。");
    return;
  }

  titleNode.textContent = detail.title;
  historyState.activeRecordId = id;
  contentNode.innerHTML = renderHistoryDetail(detail);
  drawer.hidden = false;
}

function closeHistoryDrawer() {
  const drawer = document.getElementById("history-detail-drawer");
  if (drawer) {
    drawer.hidden = true;
  }
}

function renderHistoryDetail(detail) {
  return `
    ${renderHistoryArtifactSummaryCard(detail)}
    <section class="history-review-panel">
      <div>
        <p class="eyebrow">Review Workflow</p>
        <h3>产物复核状态</h3>
        <p>将生成结果标记为草稿、待复核、已确认或需补充证据，方便小组协作和答辩说明。</p>
      </div>
      <form class="artifact-review-form" data-history-review-form data-history-id="${escapeHtml(detail.id)}">
        <label>
          复核状态
          <select name="reviewStatus">
            ${renderReviewStatusOptions(detail.reviewStatus)}
          </select>
        </label>
        <label>
          人工复核备注
          <textarea name="humanNotes" rows="4" placeholder="例如：接口异常流程证据不足，进入评审前需要补充接口错误码说明。">${escapeHtml(detail.humanNotes || "")}</textarea>
        </label>
        <div class="review-form-actions">
          <button class="primary-button" type="submit">保存复核意见</button>
          <span>${renderReviewStatusBadge(detail.reviewStatus)}</span>
        </div>
      </form>
    </section>
    <section class="detail-section">
      <h3>原始问题</h3>
      <p>${escapeHtml(detail.originalQuestion)}</p>
    </section>
    <section class="detail-section">
      <h3>输出内容摘要</h3>
      ${renderHistoryOutputSummary(detail)}
    </section>
    <section class="detail-grid">
      ${renderDetailItem("所属场景", renderSceneBadge(detail.sceneMode), true)}
      ${renderDetailItem("所属项目", detail.project)}
      ${renderDetailItem("创建用户", detail.creator)}
      ${renderDetailItem("创建时间", detail.createdAt)}
      ${renderDetailItem("更新时间", detail.updatedAt || detail.createdAt)}
      ${renderDetailItem("当前状态", renderReviewStatusBadge(detail.reviewStatus), true)}
    </section>
    ${renderScenarioQualityAssessment(detail.qualityAssessment, detail.sceneMode === "handover" ? "handover" : "design")}
    <section class="detail-section">
      <h3>结构化产物</h3>
      ${renderHistoryStructuredOutput(detail)}
    </section>
    <section class="detail-section">
      <h3>引用证据</h3>
      <details class="history-citation-details">
        <summary>展开 ${escapeHtml(detail.citations?.length || 0)} 条引用证据</summary>
        <div class="scenario-evidence-list one-column">${detail.citations.length ? detail.citations.map(renderScenarioCitation).join("") : renderEmptyState("暂无引用证据。")}</div>
      </details>
    </section>
    <section class="detail-section">
      <h3>版本记录</h3>
      ${renderArtifactVersionTimeline(detail.versionRecords)}
    </section>
  `;
}

function renderHistoryArtifactSummaryCard(detail = {}) {
  const quality = detail.qualityAssessment || {};
  const score = Number(quality.score || 0);
  const canReview = quality.canEnterReview || detail.reviewStatus === "已确认";
  return `
    <section class="artifact-summary-card">
      <div>
        <p class="eyebrow">Artifact Summary</p>
        <h3>${escapeHtml(detail.title || "历史产物")}</h3>
        <p>${escapeHtml(cleanDisplayText(detail.outputSummary || detail.summary || "当前产物暂无摘要。", { maxLength: 180 }))}</p>
      </div>
      <div class="artifact-summary-metrics">
        ${renderStructuredCountCard("产物类型", detail.artifactType || formatSceneMode(detail.sceneMode))}
        ${renderStructuredCountCard("场景", formatSceneMode(detail.sceneMode))}
        ${renderStructuredCountCard("引用文档", groupCitationsByDocument(detail.citations || []).length)}
        ${renderStructuredCountCard("质量评分", score ? `${Math.round(score * 100)}%` : "待评估")}
        ${renderStructuredCountCard("修订状态", detail.manualEdited ? "已人工修订" : "AI 初稿")}
      </div>
      <div class="artifact-summary-status">
        ${renderReviewStatusBadge(detail.reviewStatus)}
        ${detail.manualEdited ? '<span class="quality-score-badge quality-score-partial">已人工修订</span>' : ""}
        ${detail.modifiedAt ? `<span class="quality-score-badge quality-score-partial">修订：${escapeHtml(formatShortTime(detail.modifiedAt) || detail.modifiedAt)}</span>` : ""}
        <span class="quality-score-badge quality-score-${canReview ? "ready" : "partial"}">${escapeHtml(canReview ? "建议进入评审" : "建议人工复核")}</span>
      </div>
    </section>
  `;
}

/* function renderHistoryItem(record) {
  return `
    <article class="history-record-card">
      <div class="history-record-main">
        <div class="history-record-head">
          <div>
            <h3>${escapeHtml(record.title)}</h3>
            <div class="history-record-meta">
              ${renderSceneBadge(record.sceneMode)}
              ${renderReviewStatusBadge(record.reviewStatus, record.sceneMode)}
              ${record.manualEdited ? '<span class="quality-score-badge quality-score-partial">宸蹭汉宸ヤ慨璁?/span>' : ""}
              <span>${escapeHtml(record.project)}</span>
              <span>${escapeHtml(record.creator)}</span>
              <time>${escapeHtml(formatShortTime(record.createdAt))}</time>
            </div>
          </div>
          <span class="citation-count">${escapeHtml(record.citationCount)} 浠藉紩鐢?/span>
        </div>
        <p class="history-record-summary">${escapeHtml(cleanDisplayText(record.summary || "褰撳墠浜х墿鏆傛棤鎽樿銆?"))}</p>
      </div>
      <div class="history-actions">
        <button type="button" data-history-action="view" data-history-id="${escapeHtml(record.id)}">鏌ョ湅</button>
        <button type="button" data-history-action="copy" data-history-id="${escapeHtml(record.id)}">澶嶅埗</button>
        <button type="button" data-history-action="export" data-history-id="${escapeHtml(record.id)}">瀵煎嚭</button>
        <button class="danger-link" type="button" data-history-action="delete" data-history-id="${escapeHtml(record.id)}">鍒犻櫎</button>
      </div>
    </article>
  `;
}

function renderHistoryDetail(detail) {
  return `
    ${renderHistoryArtifactSummaryCard(detail)}
    <section class="history-review-panel">
      <div>
        <p class="eyebrow">Review Workflow</p>
        <h3>浜х墿澶嶆牳鐘舵€?/h3>
        <p>灏嗙敓鎴愮粨鏋滄爣璁颁负鑽夌銆佸緟澶嶆牳銆佸凡纭鎴栭渶琛ュ厖璇佹嵁锛屾柟渚垮皬缁勫崗浣滃拰绛旇京璇存槑銆?/p>
      </div>
      <form class="artifact-review-form" data-history-review-form data-history-id="${escapeHtml(detail.id)}">
        <label>
          澶嶆牳鐘舵€?
          <select name="reviewStatus">
            ${renderReviewStatusOptions(detail.reviewStatus)}
          </select>
        </label>
        <label>
          浜哄伐澶嶆牳澶囨敞
          <textarea name="humanNotes" rows="4" placeholder="渚嬪锛氭帴鍙ｅ紓甯告祦绋嬭瘉鎹笉瓒筹紝杩涘叆璇勫鍓嶉渶瑕佽ˉ鍏呮帴鍙ｉ敊璇爜璇存槑銆?>${escapeHtml(detail.humanNotes || "")}</textarea>
        </label>
        <div class="review-form-actions">
          <button class="primary-button" type="submit">淇濆瓨澶嶆牳鎰忚</button>
          <span>${renderReviewStatusBadge(detail.reviewStatus, detail.sceneMode)}</span>
        </div>
      </form>
    </section>
    <section class="detail-section">
      <h3>鍘熷闂</h3>
      <p>${escapeHtml(detail.originalQuestion)}</p>
    </section>
    <section class="detail-section">
      <h3>杈撳嚭鍐呭鎽樿</h3>
      ${renderHistoryOutputSummary(detail)}
    </section>
    <section class="detail-grid">
      ${renderDetailItem("鎵€灞炲満鏅?, renderSceneBadge(detail.sceneMode), true)}
      ${renderDetailItem("鎵€灞為」鐩?, detail.project)}
      ${renderDetailItem("鍒涘缓鐢ㄦ埛", detail.creator)}
      ${renderDetailItem("鍒涘缓鏃堕棿", detail.createdAt)}
      ${renderDetailItem("鏇存柊鏃堕棿", detail.updatedAt || detail.createdAt)}
      ${renderDetailItem("褰撳墠鐘舵€?, renderReviewStatusBadge(detail.reviewStatus, detail.sceneMode), true)}
    </section>
    ${renderScenarioQualityAssessment(detail.qualityAssessment, detail.sceneMode === "handover" ? "handover" : "design")}
    <section class="detail-section">
      <h3>缁撴瀯鍖栦骇鐗?/h3>
      ${renderHistoryStructuredOutput(detail)}
    </section>
    <section class="detail-section">
      <h3>寮曠敤璇佹嵁</h3>
      <details class="history-citation-details">
        <summary>灞曞紑 ${escapeHtml(detail.citations?.length || 0)} 鏉″紩鐢ㄨ瘉鎹?/summary>
        <div class="scenario-evidence-list one-column">${detail.citations.length ? detail.citations.map(renderScenarioCitation).join("") : renderEmptyState("鏆傛棤寮曠敤璇佹嵁銆?)}</div>
      </details>
    </section>
    <section class="detail-section">
      <h3>鐗堟湰璁板綍</h3>
      ${renderArtifactVersionTimeline(detail.versionRecords)}
    </section>
  `;
}

function renderHistoryArtifactSummaryCard(detail = {}) {
  const quality = detail.qualityAssessment || {};
  const score = Number(quality.score || 0);
  const canReview = quality.canEnterReview || detail.reviewStatus === "宸茬‘璁?";
  return `
    <section class="artifact-summary-card">
      <div>
        <p class="eyebrow">Artifact Summary</p>
        <h3>${escapeHtml(detail.title || "鍘嗗彶浜х墿")}</h3>
        <p>${escapeHtml(cleanDisplayText(detail.outputSummary || detail.summary || "褰撳墠浜х墿鏆傛棤鎽樿銆?"))}</p>
      </div>
      <div class="artifact-summary-metrics">
        ${renderStructuredCountCard("浜х墿绫诲瀷", detail.artifactType || formatSceneMode(detail.sceneMode))}
        ${renderStructuredCountCard("鍦烘櫙", formatSceneMode(detail.sceneMode))}
        ${renderStructuredCountCard("寮曠敤鏂囨。", groupCitationsByDocument(detail.citations || []).length)}
        ${renderStructuredCountCard("璐ㄩ噺璇勫垎", score ? `${Math.round(score * 100)}%` : "寰呰瘎浼?)}
        ${renderStructuredCountCard("淇鐘舵€?", detail.manualEdited ? "宸蹭汉宸ヤ慨璁?" : "AI 鍒濈")}
      </div>
      <div class="artifact-summary-status">
        ${renderReviewStatusBadge(detail.reviewStatus, detail.sceneMode)}
        ${detail.manualEdited ? '<span class="quality-score-badge quality-score-partial">宸蹭汉宸ヤ慨璁?/span>' : ""}
        ${detail.modifiedAt ? `<span class="quality-score-badge quality-score-partial">淇锛?{escapeHtml(formatShortTime(detail.modifiedAt) || detail.modifiedAt)}</span>` : ""}
        <span class="quality-score-badge quality-score-${canReview ? "ready" : "partial"}">${escapeHtml(canReview ? "寤鸿杩涘叆璇勫" : "寤鸿浜哄伐澶嶆牳")}</span>
      </div>
    </section>
  `;
}

function getReviewStatusLabel(normalized, sceneMode = "") {
  const isDesign = String(sceneMode || "").toLowerCase() === "design";
  if (normalized === "confirmed") {
    return isDesign ? "宸蹭汉宸ュ鏍?" : "宸茬‘璁?";
  }
  const labels = {
    draft: "鑽夌",
    pending: "寰呭鏍?",
    needs_evidence: "闇€琛ュ厖璇佹嵁",
  };
  return labels[normalized] || "鑽夌";
}

function renderReviewStatusBadge(status, sceneMode = "") {
  const normalized = normalizeReviewStatus(status);
  return `<span class="review-status-badge review-${escapeHtml(normalized)}">${escapeHtml(getReviewStatusLabel(normalized, sceneMode))}</span>`;
}

*/

function renderHistoryItem(record) {
  return `
    <article class="history-record-card">
      <div class="history-record-main">
        <div class="history-record-head">
          <div>
            <h3>${escapeHtml(record.title)}</h3>
            <div class="history-record-meta">
              ${renderSceneBadge(record.sceneMode)}
              ${renderReviewStatusBadge(record.reviewStatus, record.sceneMode)}
              ${record.manualEdited ? '<span class="quality-score-badge quality-score-partial">已人工修订</span>' : ""}
              <span>${escapeHtml(record.project)}</span>
              <span>${escapeHtml(record.creator)}</span>
              <time>${escapeHtml(formatShortTime(record.createdAt))}</time>
            </div>
          </div>
          <span class="citation-count">${escapeHtml(record.citationCount)} 条引用</span>
        </div>
        <p class="history-record-summary">${escapeHtml(cleanDisplayText(record.summary || "当前产物暂无摘要。"))}</p>
      </div>
      <div class="history-actions">
        <button type="button" data-history-action="view" data-history-id="${escapeHtml(record.id)}">查看</button>
        <button type="button" data-history-action="copy" data-history-id="${escapeHtml(record.id)}">复制</button>
        <button type="button" data-history-action="export" data-history-id="${escapeHtml(record.id)}">导出</button>
        <button class="danger-link" type="button" data-history-action="delete" data-history-id="${escapeHtml(record.id)}">删除</button>
      </div>
    </article>
  `;
}

function renderHistoryDetail(detail) {
  return `
    ${renderHistoryArtifactSummaryCard(detail)}
    <section class="history-review-panel">
      <div>
        <p class="eyebrow">Review Workflow</p>
        <h3>产物复核状态</h3>
        <p>将生成结果标记为草稿、待复核、已确认或需补充证据，方便小组协作和答辩说明。</p>
      </div>
      <form class="artifact-review-form" data-history-review-form data-history-id="${escapeHtml(detail.id)}">
        <label>
          复核状态
          <select name="reviewStatus">
            ${renderReviewStatusOptions(detail.reviewStatus)}
          </select>
        </label>
        <label>
          人工复核备注
          <textarea name="humanNotes" rows="4" placeholder="例如：接口异常流程证据不足，进入评审前需要补充接口错误码说明。">${escapeHtml(detail.humanNotes || "")}</textarea>
        </label>
        <div class="review-form-actions">
          <button class="primary-button" type="submit">保存复核意见</button>
          <span>${renderReviewStatusBadge(detail.reviewStatus, detail.sceneMode)}</span>
        </div>
      </form>
    </section>
    <section class="detail-section">
      <h3>原始问题</h3>
      <p>${escapeHtml(detail.originalQuestion)}</p>
    </section>
    <section class="detail-section">
      <h3>输出内容摘要</h3>
      ${renderHistoryOutputSummary(detail)}
    </section>
    <section class="detail-grid">
      ${renderDetailItem("所属场景", renderSceneBadge(detail.sceneMode), true)}
      ${renderDetailItem("所属项目", detail.project)}
      ${renderDetailItem("创建用户", detail.creator)}
      ${renderDetailItem("创建时间", detail.createdAt)}
      ${renderDetailItem("更新时间", detail.updatedAt || detail.createdAt)}
      ${renderDetailItem("当前状态", renderReviewStatusBadge(detail.reviewStatus, detail.sceneMode), true)}
    </section>
    ${renderScenarioQualityAssessment(detail.qualityAssessment, detail.sceneMode === "handover" ? "handover" : "design")}
    <section class="detail-section">
      <h3>结构化产物</h3>
      ${renderHistoryStructuredOutput(detail)}
    </section>
    <section class="detail-section">
      <h3>引用证据</h3>
      <details class="history-citation-details">
        <summary>展开 ${escapeHtml(detail.citations?.length || 0)} 条引用证据</summary>
        <div class="scenario-evidence-list one-column">${detail.citations.length ? detail.citations.map(renderScenarioCitation).join("") : renderEmptyState("暂无引用证据。")}</div>
      </details>
    </section>
    <section class="detail-section">
      <h3>版本记录</h3>
      ${renderArtifactVersionTimeline(detail.versionRecords)}
    </section>
  `;
}

function renderHistoryArtifactSummaryCard(detail = {}) {
  const quality = detail.qualityAssessment || {};
  const score = Number(quality.score || 0);
  const canReview = quality.canEnterReview || detail.reviewStatus === "已确认";
  return `
    <section class="artifact-summary-card">
      <div>
        <p class="eyebrow">Artifact Summary</p>
        <h3>${escapeHtml(detail.title || "历史产物")}</h3>
        <p>${escapeHtml(cleanDisplayText(detail.outputSummary || detail.summary || "当前产物暂无摘要。"))}</p>
      </div>
      <div class="artifact-summary-metrics">
        ${renderStructuredCountCard("产物类型", detail.artifactType || formatSceneMode(detail.sceneMode))}
        ${renderStructuredCountCard("场景", formatSceneMode(detail.sceneMode))}
        ${renderStructuredCountCard("引用文档", groupCitationsByDocument(detail.citations || []).length)}
        ${renderStructuredCountCard("质量评分", score ? `${Math.round(score * 100)}%` : "待评估")}
        ${renderStructuredCountCard("修订状态", detail.manualEdited ? "已人工修订" : "AI 初稿")}
      </div>
      <div class="artifact-summary-status">
        ${renderReviewStatusBadge(detail.reviewStatus, detail.sceneMode)}
        ${detail.manualEdited ? '<span class="quality-score-badge quality-score-partial">已人工修订</span>' : ""}
        ${detail.modifiedAt ? `<span class="quality-score-badge quality-score-partial">修订：${escapeHtml(formatShortTime(detail.modifiedAt) || detail.modifiedAt)}</span>` : ""}
        <span class="quality-score-badge quality-score-${canReview ? "ready" : "partial"}">${escapeHtml(canReview ? "建议进入评审" : "建议人工复核")}</span>
      </div>
    </section>
  `;
}

function getReviewStatusLabel(normalized, sceneMode = "") {
  const isDesign = String(sceneMode || "").toLowerCase() === "design";
  if (normalized === "confirmed") {
    return isDesign ? "已人工复核" : "已确认";
  }
  const labels = {
    draft: "草稿",
    pending: "待复核",
    needs_evidence: "需补充证据",
  };
  return labels[normalized] || "草稿";
}

function renderReviewStatusBadge(status, sceneMode = "") {
  const normalized = normalizeReviewStatus(status);
  return `<span class="review-status-badge review-${escapeHtml(normalized)}">${escapeHtml(getReviewStatusLabel(normalized, sceneMode))}</span>`;
}

function renderHistoryOutputSummary(detail = {}) {
  const output = detail.structuredOutput || {};
  if (detail.sceneMode === "design") {
    const risks = Array.isArray(output.risks) ? output.risks : [];
    const openQuestions = Array.isArray(output.openQuestions) ? output.openQuestions : [];
    return `
      <div class="history-summary-panel">
        <div class="history-summary-metrics">
          ${renderStructuredCountCard("功能点", output.functionList?.length || 0)}
          ${renderStructuredCountCard("文本用例", output.useCases?.length || 0)}
          ${renderStructuredCountCard("模块建议", output.moduleSuggestions?.length || 0)}
          ${renderStructuredCountCard("风险项", risks.length)}
          ${renderStructuredCountCard("待确认", openQuestions.length)}
        </div>
        ${renderHistorySummaryBlock("核心结论", detail.outputSummary || "已生成需求设计辅助产物。")}
        ${renderHistorySummaryBlock("待复核事项", [...risks, ...openQuestions].slice(0, 5), "当前产物暂无明显待复核事项。")}
        ${renderRawSummaryDetails(detail.outputSummary)}
      </div>
    `;
  }

  if (detail.sceneMode === "handover") {
    const todoList = output.todoList?.length ? output.todoList : output.todos || [];
    const risks = output.riskRegister?.length ? output.riskRegister : output.risks || [];
    return `
      <div class="history-summary-panel">
        <div class="history-summary-metrics">
          ${renderStructuredCountCard("已完成", output.completedItems?.length || output.completedFeatures?.length || 0)}
          ${renderStructuredCountCard("未完成", output.unfinishedItems?.length || 0)}
          ${renderStructuredCountCard("风险", risks.length)}
          ${renderStructuredCountCard("待办", todoList.length)}
          ${renderStructuredCountCard("信息缺口", output.informationGaps?.length || 0)}
        </div>
        ${renderHistorySummaryBlock("当前进度", output.currentProgress || detail.outputSummary || "暂无当前进度摘要。")}
        ${renderHistorySummaryBlock("接手者优先待办", todoList.slice(0, 5), "暂无待办清单。")}
        ${renderRawSummaryDetails(detail.outputSummary)}
      </div>
    `;
  }

  if (detail.sceneMode === "training") {
    return `
      <div class="history-summary-panel">
        <div class="history-summary-metrics">
          ${renderStructuredCountCard("术语", output.terms?.length || 0)}
          ${renderStructuredCountCard("学习步骤", output.learningPath?.length || 0)}
          ${renderStructuredCountCard("推荐资料", output.recommendedDocs?.length || 0)}
          ${renderStructuredCountCard("引用证据", detail.citations?.length || 0)}
        </div>
        ${renderHistorySummaryBlock("培训主题", output.topic || detail.originalQuestion || "新人培训")}
        ${renderHistorySummaryBlock("学习路径摘要", output.learningPath || [], "暂无学习路径。")}
        ${renderRawSummaryDetails(detail.outputSummary)}
      </div>
    `;
  }

  return `
    <div class="history-summary-panel">
      ${renderHistorySummaryBlock("核心结论", detail.outputSummary || "暂无输出摘要。")}
      ${renderHistorySummaryBlock("证据情况", detail.citations?.length ? `已绑定 ${detail.citations.length} 条引用证据。` : "暂无引用证据，建议人工复核。")}
      ${renderRawSummaryDetails(detail.outputSummary)}
    </div>
  `;
}

function renderHistorySummaryBlock(title, content, emptyText = "暂无数据。") {
  const list = Array.isArray(content) ? content.filter(Boolean) : [];
  return `
    <article class="history-summary-block">
      <h4>${escapeHtml(title)}</h4>
      ${
        Array.isArray(content)
          ? list.length
            ? `<ul>${list.map((item) => `<li>${escapeHtml(stripMarkdownDecorators(formatMarkdownValue(item)))}</li>`).join("")}</ul>`
            : `<p>${escapeHtml(emptyText)}</p>`
          : renderRichTextBlock(content || emptyText, "compact-rich-answer")
      }
    </article>
  `;
}

function renderRawSummaryDetails(summary) {
  const text = cleanDisplayText(summary || "").trim();
  if (!text || text.length < 120) {
    return "";
  }
  return `
    <details class="raw-summary-details">
      <summary>查看原始输出文本</summary>
      ${renderRichTextBlock(text, "compact-rich-answer")}
    </details>
  `;
}

function renderReviewStatusOptions(currentStatus) {
  const statuses = [
    ["草稿", "草稿"],
    ["待复核", "待复核"],
    ["已确认", "已确认"],
    ["需补充证据", "需补充证据"],
  ];
  return statuses
    .map(([value, label]) => `<option value="${escapeHtml(value)}" ${value === currentStatus ? "selected" : ""}>${escapeHtml(label)}</option>`)
    .join("");
}

function renderReviewStatusBadge(status) {
  const normalized = normalizeReviewStatus(status);
  const labels = {
    draft: "草稿",
    pending: "待复核",
    confirmed: "已确认",
    needs_evidence: "需补充证据",
  };
  return `<span class="review-status-badge review-${escapeHtml(normalized)}">${escapeHtml(labels[normalized] || status || "草稿")}</span>`;
}

function normalizeReviewStatus(status) {
  const value = String(status || "草稿").trim().toLowerCase();
  if (["已确认", "confirmed", "approved", "ready"].includes(value)) {
    return "confirmed";
  }
  if (["待复核", "pending", "pending_review", "review"].includes(value)) {
    return "pending";
  }
  if (["需补充证据", "needs_evidence", "need_evidence", "blocked", "evidence"].includes(value)) {
    return "needs_evidence";
  }
  return "draft";
}

function renderReviewStatusBadge(status, sceneMode = "") {
  const normalized = normalizeReviewStatus(status);
  return `<span class="review-status-badge review-${escapeHtml(normalized)}">${escapeHtml(getReviewStatusLabel(normalized, sceneMode))}</span>`;
}

function renderHistoryStructuredOutput(detail) {
  const output = detail.structuredOutput || {};
  if (!output || !Object.keys(output).length) {
    return renderEmptyState("暂无结构化产物。", "该记录可能来自旧版演示数据，或生成时没有返回结构化产物。");
  }
  if (detail.sceneMode === "design") {
    return renderHistoryDesignOutput(output);
  }
  if (detail.sceneMode === "handover") {
    return renderHistoryHandoverOutput(output);
  }
  const entries = Object.entries(output).filter(([, value]) => value !== null && value !== undefined && formatHumanReadableItem(value).trim() !== "");
  return `
    <div class="history-structured-blocks">
      ${
        entries.length
          ? entries.slice(0, 8).map(([key, value]) => renderHistoryMiniList(formatHistoryFieldLabel(key), [value], formatMarkdownValue)).join("")
          : renderEmptyState("暂无可展示的结构化字段。", "该记录可能来自旧版演示数据。")
      }
    </div>
  `;
}

function formatHistoryFieldLabel(key) {
  const labels = {
    conclusion: "结论",
    evidence: "依据",
    suggestion: "建议",
    uncertainty: "不确定性",
    followUpItems: "建议追问",
  };
  return labels[key] || key;
}

function renderHistoryDesignOutput(output = {}) {
  return `
    <div class="history-structured-summary">
      ${renderStructuredCountCard("业务对象", output.businessObjects?.length || 0)}
      ${renderStructuredCountCard("业务规则", output.businessRules?.length || 0)}
      ${renderStructuredCountCard("功能点", output.functionList?.length || 0)}
      ${renderStructuredCountCard("文本用例", output.useCases?.length || 0)}
      ${renderStructuredCountCard("待确认", output.openQuestions?.length || 0)}
    </div>
    <div class="history-structured-blocks">
      ${renderHistoryMiniList("功能清单", output.functionList, (item) => `${item.id || ""} ${item.name || item.description || "未命名功能"}`)}
      ${renderHistoryMiniList("详细文本用例", output.useCases, (item) => `${item.id || ""} ${item.name || "未命名用例"}`)}
      ${renderHistoryMiniList("模块建议", output.moduleSuggestions, (item) => `${item.name || "未命名模块"}：${item.responsibility || ""}`)}
      ${renderHistoryMiniList("风险与待确认", [...(output.risks || []), ...(output.openQuestions || [])], formatMarkdownValue)}
    </div>
  `;
}

function renderHistoryHandoverOutput(output = {}) {
  return `
    <div class="history-structured-summary">
      ${renderStructuredCountCard("已完成", output.completedItems?.length || output.completedFeatures?.length || 0)}
      ${renderStructuredCountCard("未完成", output.unfinishedItems?.length || 0)}
      ${renderStructuredCountCard("风险", output.riskRegister?.length || output.risks?.length || 0)}
      ${renderStructuredCountCard("待办", output.todoList?.length || output.todos?.length || 0)}
      ${renderStructuredCountCard("信息缺口", output.informationGaps?.length || 0)}
    </div>
    <div class="history-structured-blocks">
      ${renderHistoryMiniList("当前进度", [output.currentProgress].filter(Boolean), formatMarkdownValue)}
      ${renderHistoryMiniList("接手者待办", output.todoList?.length ? output.todoList : output.todos, (item) => `${item.taskName || item.task || "待办事项"}（${item.priority || "medium"}）`)}
      ${renderHistoryMiniList("风险登记", output.riskRegister?.length ? output.riskRegister : output.risks, (item) => `${item.risk || item.description || "待确认风险"}：${item.suggestion || "补充文档或人工确认"}`)}
      ${renderHistoryMiniList("信息缺口", output.informationGaps, formatMarkdownValue)}
    </div>
  `;
}

function renderStructuredCountCard(label, value) {
  return `
    <article class="structured-count-card">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </article>
  `;
}

function renderHistoryMiniList(title, items = [], formatter = formatMarkdownValue) {
  const list = (Array.isArray(items) ? items : []).filter(Boolean);
  return `
    <article class="history-structured-block">
      <h4>${escapeHtml(title)}</h4>
      ${
        list.length
          ? `<ul>${list.slice(0, 8).map((item) => `<li>${escapeHtml(stripMarkdownDecorators(formatter(item)))}</li>`).join("")}</ul>`
          : '<div class="empty-inline">暂无数据或当前证据不足。</div>'
      }
    </article>
  `;
}

function renderArtifactVersionTimeline(versionRecords = []) {
  const versions = Array.isArray(versionRecords) ? versionRecords : [];
  if (!versions.length) {
    return renderEmptyState("暂无版本记录。", "新生成或复核后的产物会自动写入版本时间线。");
  }
  return `
    <ol class="artifact-version-timeline">
      ${versions
        .map(
          (item) => `
            <li>
              <div>
                <strong>${escapeHtml(item.version || "v?")}</strong>
                <span>${escapeHtml(formatShortTime(item.time) || item.time || "未记录时间")}</span>
              </div>
              <p>${escapeHtml(item.change || "保存产物版本快照")}</p>
              <small>${escapeHtml(item.operator || "course-demo-user")}</small>
            </li>
          `,
        )
        .join("")}
    </ol>
  `;
}

async function copyHistoryRecord(id) {
  const service = getHistoryService();
  const detail = await service.getHistoryRecordDetail(id);
  if (!detail) {
    toast("历史产物不存在或已删除。");
    return;
  }
  const text = [`# ${detail.title}`, "", `场景：${formatSceneMode(detail.sceneMode)}`, `问题：${detail.originalQuestion}`, "", detail.outputSummary].join("\n");
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    toast("历史产物内容已复制。");
    return;
  }
  toast("当前浏览器不支持自动复制，请手动复制详情内容。");
}

async function exportHistoryRecord(id) {
  const service = getHistoryService();
  const detail = await service.getHistoryRecordDetail(id);
  if (!detail) {
    toast("历史产物不存在或已删除。");
    return;
  }
  const markdown = buildHistoryMarkdown(detail);
  downloadTextFile(markdown, `SuperRAG-历史产物-${detail.id || Date.now()}.md`, "text/markdown;charset=utf-8");
  toast("历史产物 Markdown 已导出。");
}

async function submitHistoryReviewForm(form) {
  const service = getHistoryService();
  const id = form.dataset.historyId || historyState.activeRecordId;
  if (!service || !id) {
    return;
  }
  const formData = new FormData(form);
  const reviewStatus = String(formData.get("reviewStatus") || "待复核");
  const humanNotes = String(formData.get("humanNotes") || "");
  const updated = await service.updateHistoryReview(id, {
    reviewStatus,
    humanNotes,
    operator: "course-demo-user",
    changeSummary: `人工复核状态更新为：${reviewStatus}`,
  });
  if (!updated) {
    toast("复核意见保存失败。");
    return;
  }
  const titleNode = document.getElementById("history-detail-title");
  const contentNode = document.getElementById("history-detail-content");
  if (titleNode) {
    titleNode.textContent = updated.title;
  }
  if (contentNode) {
    contentNode.innerHTML = renderHistoryDetail(updated);
  }
  knowledgeGapState.loaded = false;
  await renderHistoryList();
  toast("复核意见已保存，版本记录已更新。");
}

function buildHistoryMarkdown(detail) {
  const lines = [
    `# ${detail.title}`,
    "",
    `场景：${formatSceneMode(detail.sceneMode)}`,
    `项目：${detail.project}`,
    `创建人：${detail.creator}`,
    `创建时间：${detail.createdAt}`,
    `复核状态：${detail.reviewStatus || "草稿"}`,
    `是否人工修订：${detail.manualEdited ? "是" : "否"}`,
    `修订时间：${detail.modifiedAt || "未修订"}`,
    "",
    "## 原始问题",
    cleanDisplayText(detail.originalQuestion || "暂无原始问题"),
    "",
    "## 输出摘要",
    cleanDisplayText(detail.outputSummary || "暂无输出摘要"),
    "",
    "## 人工复核备注",
    cleanDisplayText(detail.humanNotes || "暂无复核备注"),
    "",
    "## 质量评估",
    formatMarkdownValue(detail.qualityAssessment || {}),
    "",
    "## 结构化产物",
    formatMarkdownValue(detail.structuredOutput || {}),
    "",
    "## 引用证据",
    ...(detail.citations || []).map((item) => `- ${formatMarkdownValue(item.documentTitle || "知识库片段")}：${cleanDisplayText(item.snippet || "", { maxLength: 260 })}`),
    "",
    "## 版本记录",
    ...(detail.versionRecords || []).map((item) => `- ${item.version || "v?"} · ${item.time || ""} · ${item.operator || ""}：${item.change || ""}`),
  ];
  return lines.join("\n");
}

async function removeHistoryRecord(id) {
  const service = getHistoryService();
  const detail = await service.getHistoryRecordDetail(id);
  if (!detail) {
    return;
  }
  const confirmed = window.confirm(`确认删除历史产物“${detail.title}”吗？`);
  if (!confirmed) {
    return;
  }
  await service.deleteHistoryRecord(id);
  closeHistoryDrawer();
  await renderHistoryList();
  toast("历史产物已删除。");
}

async function renderSettingsPage() {
  const service = getSettingsService();
  if (!service) {
    return;
  }

  settingsState.settings = await service.getSettings();
  settingsState.loaded = true;
  renderSettingsContent(settingsState.settings);
}

function renderSettingsContent(settings) {
  renderWorkflowTable(settings.workflows || []);
  populateSettingsForm(settings);
  renderSettingsLogs(settings.logs || []);
}

function renderWorkflowTable(workflows) {
  const tbody = document.getElementById("settings-workflow-body");
  if (!tbody) {
    return;
  }
  tbody.innerHTML = workflows
    .map(
      (workflow) => `
        <tr>
          <td><code>${escapeHtml(workflow.sceneCode)}</code></td>
          <td>${escapeHtml(workflow.sceneName)}</td>
          <td><code>${escapeHtml(workflow.difyAppId)}</code></td>
          <td><code>${escapeHtml(workflow.difyWorkflowId)}</code></td>
          <td>${renderWorkflowStatusBadge(workflow.status)}</td>
          <td>
            <div class="table-actions">
              <button type="button" data-workflow-action="edit" data-workflow-id="${escapeHtml(workflow.sceneCode)}">编辑</button>
              <button type="button" data-workflow-action="test" data-workflow-id="${escapeHtml(workflow.sceneCode)}">测试连接</button>
            </div>
          </td>
        </tr>
      `,
    )
    .join("");
}

function populateSettingsForm(settings) {
  const retrieval = settings.retrieval || {};
  const model = settings.model || {};
  setFieldValue("settings-topk", retrieval.topK);
  setFieldValue("settings-score-threshold", retrieval.scoreThreshold);
  setCheckedValue("settings-rerank", retrieval.rerankEnabled);
  setFieldValue("settings-knowledge-strategy", retrieval.knowledgeStrategy);
  setCheckedValue("settings-low-evidence", retrieval.lowEvidenceHintEnabled);
  setFieldValue("settings-model-name", model.modelName);
  setFieldValue("settings-temperature", model.temperature);
  setFieldValue("settings-max-tokens", model.maxTokens);
  setCheckedValue("settings-stream", model.streamOutput);
}

function renderSettingsLogs(logs) {
  const tbody = document.getElementById("settings-log-body");
  const countNode = document.getElementById("settings-log-count");
  if (!tbody) {
    return;
  }
  if (countNode) {
    countNode.textContent = `最近 ${logs.length} 条`;
  }
  tbody.innerHTML = logs
    .map(
      (log) => `
        <tr>
          <td>${escapeHtml(log.time)}</td>
          <td>${escapeHtml(log.user)}</td>
          <td>${renderSceneBadge(log.sceneMode)}</td>
          <td><code>${escapeHtml(log.workflow)}</code></td>
          <td>${renderBooleanBadge(log.success, "成功", "失败")}</td>
          <td>${escapeHtml(log.durationMs)} ms</td>
          <td>${escapeHtml(log.errorReason || "-")}</td>
        </tr>
      `,
    )
    .join("");
}

async function handleWorkflowAction(action, sceneCode) {
  const service = getSettingsService();
  if (!service) {
    return;
  }

  if (action === "test") {
    const result = await service.testWorkflow(sceneCode);
    settingsState.settings = await service.getSettings();
    renderSettingsContent(settingsState.settings);
    toast(result.success ? "Workflow 连接测试成功。" : "Workflow 测试失败，已写入运行日志。");
    return;
  }

  if (action === "edit") {
    const workflow = settingsState.settings?.workflows?.find((item) => item.sceneCode === sceneCode);
    if (!workflow) {
      return;
    }
    const nextWorkflowId = window.prompt("请输入新的 Dify Workflow ID：", workflow.difyWorkflowId);
    if (nextWorkflowId === null) {
      return;
    }
    await service.updateWorkflow(sceneCode, { difyWorkflowId: nextWorkflowId.trim() || workflow.difyWorkflowId });
    settingsState.settings = await service.getSettings();
    renderSettingsContent(settingsState.settings);
    toast("Workflow 映射已更新，仅本地演示态生效。");
  }
}

async function saveSettingsFromForm() {
  const service = getSettingsService();
  if (!service) {
    return;
  }
  await service.saveSettings({
    retrieval: {
      topK: Number(getInputValue("settings-topk")),
      scoreThreshold: Number(getInputValue("settings-score-threshold")),
      rerankEnabled: getCheckedValue("settings-rerank"),
      knowledgeStrategy: getInputValue("settings-knowledge-strategy"),
      lowEvidenceHintEnabled: getCheckedValue("settings-low-evidence"),
    },
    model: {
      modelName: getInputValue("settings-model-name"),
      temperature: Number(getInputValue("settings-temperature")),
      maxTokens: Number(getInputValue("settings-max-tokens")),
      streamOutput: getCheckedValue("settings-stream"),
    },
  });
  settingsState.settings = await service.getSettings();
  renderSettingsContent(settingsState.settings);
  toast("配置已保存，仅本地演示态生效。");
}

function setFieldValue(id, value) {
  const node = document.getElementById(id);
  if (node) {
    node.value = value ?? "";
  }
}

function setCheckedValue(id, value) {
  const node = document.getElementById(id);
  if (node) {
    node.checked = Boolean(value);
  }
}

function getCheckedValue(id) {
  return Boolean(document.getElementById(id)?.checked);
}

function renderSceneBadge(sceneMode) {
  return `<span class="scene-badge scene-${escapeHtml(sceneMode)}">${escapeHtml(formatSceneMode(sceneMode))}</span>`;
}

function renderWorkflowStatusBadge(status) {
  const labels = {
    enabled: "已启用",
    disabled: "已停用",
    draft: "草稿",
  };
  const tone = status === "enabled" ? "indexed" : status === "disabled" ? "pending" : "indexing";
  return `<span class="status-badge status-${tone}">${escapeHtml(labels[status] || status)}</span>`;
}

function renderBooleanBadge(value, trueLabel, falseLabel) {
  return `<span class="status-badge status-${value ? "indexed" : "failed"}">${escapeHtml(value ? trueLabel : falseLabel)}</span>`;
}

function renderEmptyState(title, description = "") {
  return `
    <div class="empty-state">
      <strong>${escapeHtml(title)}</strong>
      ${description ? `<p>${escapeHtml(description)}</p>` : ""}
    </div>
  `;
}

function renderLoadingState(message) {
  return `
    <div class="scenario-loading">
      <strong>${escapeHtml(message)}</strong>
      <div class="loading-lines">
        <span></span>
        <span></span>
        <span></span>
      </div>
    </div>
  `;
}

function renderScenarioCitation(citation) {
  const score = Number(citation.relevanceScore || 0);
  const title = citation.documentTitle || citation.title || "知识库片段";
  const chunkId = citation.chunkId || citation.segmentId || citation.id || "";
  return `
    <article class="citation-card">
      <div class="citation-card-head">
        <strong>${escapeHtml(title)}</strong>
        <span>${score ? score.toFixed(2) : "0.00"}</span>
      </div>
      ${renderExpandableText(citation.snippet || citation.content || "暂无片段摘要。", { threshold: 160, className: "citation-snippet" })}
      <div class="citation-meta">
        <span>页码/段落：${escapeHtml(citation.page || citation.segmentId || citation.id || "未标注")}</span>
        <button
          type="button"
          data-citation-title="${escapeHtml(title)}"
          data-document-id="${escapeHtml(citation.documentId || citation.document_id || "")}"
          data-source-name="${escapeHtml(citation.sourceName || citation.source_name || title)}"
          data-chunk-id="${escapeHtml(chunkId)}"
        >查看原文</button>
      </div>
    </article>
  `;
}

function renderScenarioLoading(message) {
  return `
    <div class="scenario-loading">
      <strong>${escapeHtml(message)}</strong>
      <div class="loading-lines">
        <span></span>
        <span></span>
        <span></span>
      </div>
    </div>
  `;
}

function populateScenarioSelect(selectId, values, fallbackLabel) {
  const select = document.getElementById(selectId);
  if (!select) {
    return;
  }
  const currentValue = select.value;
  const options = values.length ? values : [fallbackLabel];
  select.innerHTML = options.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("");
  if (fallbackLabel && options.includes(fallbackLabel)) {
    select.value = fallbackLabel;
    return;
  }
  select.value = options.includes(currentValue) ? currentValue : options[0];
}

function getPriorityClass(value) {
  const text = String(value || "");
  if (text.includes("高") || /high/i.test(text)) {
    return "high";
  }
  if (text.includes("低") || /low/i.test(text)) {
    return "low";
  }
  return "medium";
}

function getRiskClass(value) {
  const text = String(value || "");
  if (/高|严重|阻塞|high|critical/i.test(text)) {
    return "high";
  }
  if (/低|low/i.test(text)) {
    return "low";
  }
  return "medium";
}

async function renderDashboardPage() {
  if (dashboardLoaded) {
    return;
  }
  dashboardLoaded = true;

  const service = getDashboardService();
  if (!service) {
    return;
  }

  try {
    const [stats, recentDocuments, recentActivities, documents] = await Promise.all([
      service.getDashboardStats(),
      service.getRecentDocuments({ limit: 5 }),
      service.getRecentActivities({ limit: 3 }),
      service.getKnowledgeDocuments(),
    ]);

    renderStats(stats);
    renderRecentSessions(recentActivities);
    renderRecentDocuments(recentDocuments);
    renderKnowledgeStatus(documents);
  } catch (error) {
    dashboardLoaded = false;
    toast(`首页数据加载失败：${error.message}`);
  }
}

function renderStats(stats) {
  const container = document.getElementById("dashboard-stats");
  if (!container) {
    return;
  }

  const statItems = [
    {
      label: "已入库文档数",
      value: stats.documentCount,
      tone: "blue",
      tip: "企业知识库可检索资料",
    },
    {
      label: "知识分类数",
      value: stats.categoryCount,
      tone: "green",
      tip: "按项目、场景和文档类型治理",
    },
    {
      label: "今日问答次数",
      value: stats.todayQuestionCount,
      tone: "purple",
      tip: "包含通用检索与场景问答",
    },
    {
      label: "生成设计产物数",
      value: stats.designOutputCount,
      tone: "indigo",
      tip: "功能清单、用例和模块建议",
    },
  ];

  if (stats.indexingCount > 0) {
    statItems.push({
      label: "解析中文档",
      value: stats.indexingCount,
      tone: "orange",
      tip: "正在切分、向量化或入库",
    });
  }

  if (stats.failedDocumentCount > 0) {
    statItems.push({
      label: "解析失败文档",
      value: stats.failedDocumentCount,
      tone: "red",
      tip: "需要重新上传或人工处理",
    });
  }

  container.innerHTML = statItems
    .map(
      (item) => `
        <article class="stat-card stat-${item.tone}">
          <div class="stat-top">
            <span>${escapeHtml(item.label)}</span>
          </div>
          <strong>${escapeHtml(item.value)}</strong>
          <p>${escapeHtml(item.tip)}</p>
        </article>
      `,
    )
    .join("");
}

function renderRecentSessions(sessions) {
  const container = document.getElementById("recent-sessions");
  if (!container) {
    return;
  }

  const recent = [...sessions]
    .sort((a, b) => getTimeValue(b.updatedAt) - getTimeValue(a.updatedAt))
    .slice(0, 3);

  if (!recent.length) {
    container.innerHTML = '<div class="empty-inline">暂无最近问答记录。</div>';
    return;
  }

  container.innerHTML = recent
    .map((session) => {
      const route = getSceneRoute(session.sceneMode);
      return `
        <button class="record-item" type="button" data-session-route="${route}">
          <span class="record-main">
            <strong>${escapeHtml(session.title)}</strong>
            <small>${escapeHtml(formatSceneMode(session.sceneMode))}</small>
          </span>
          <span class="record-time">${escapeHtml(formatShortTime(session.updatedAt))}</span>
        </button>
      `;
    })
    .join("");
}

function renderRecentDocuments(documents) {
  const container = document.getElementById("recent-documents");
  if (!container) {
    return;
  }

  const recent = [...documents]
    .sort((a, b) => getTimeValue(b.updatedAt) - getTimeValue(a.updatedAt))
    .slice(0, 5);

  if (!recent.length) {
    container.innerHTML = '<div class="empty-inline">暂无最近上传文档。</div>';
    return;
  }

  container.innerHTML = recent
    .map(
      (documentItem) => `
        <a class="document-item" href="#/documents">
          <span class="doc-file-icon">${escapeHtml(documentItem.type.slice(0, 1))}</span>
          <span class="record-main">
            <strong>${escapeHtml(documentItem.title)}</strong>
            <small>${escapeHtml(documentItem.type)} · ${escapeHtml(formatShortTime(documentItem.updatedAt))}</small>
          </span>
          ${renderStatusBadge(documentItem.status)}
        </a>
      `,
    )
    .join("");
}

function renderKnowledgeStatus(documents) {
  const container = document.getElementById("knowledge-status");
  if (!container) {
    return;
  }

  const total = Math.max(documents.length, 1);
  const statusItems = [
    { status: "indexed", label: "已入库" },
    { status: "indexing", label: "解析中" },
    { status: "failed", label: "解析失败" },
    { status: "pending", label: "待处理" },
  ];

  container.innerHTML = statusItems
    .map((item) => {
      const count = documents.filter((documentItem) => documentItem.status === item.status).length;
      const percent = Math.round((count / total) * 100);
      return `
        <article class="status-card">
          <div class="status-card-head">
            ${renderStatusBadge(item.status, item.label)}
            <strong>${count}</strong>
          </div>
          <div class="progress-bar" aria-label="${escapeHtml(item.label)}占比 ${percent}%">
            <span class="progress-${item.status}" style="width: ${percent}%"></span>
          </div>
          <p>${percent}% 的当前文档处于“${escapeHtml(item.label)}”状态</p>
        </article>
      `;
    })
    .join("");
}

async function renderDemoCenterPage() {
  const service = getDemoCenterService();
  if (!service) {
    return;
  }

  const summaryNode = document.getElementById("demo-summary");
  const flowNode = document.getElementById("demo-flow");
  const titleNode = document.getElementById("demo-center-title");
  const subtitleNode = document.getElementById("demo-center-subtitle");
  const readyScoreNode = document.getElementById("demo-ready-score");
  if (!summaryNode || !flowNode) {
    return;
  }

  summaryNode.innerHTML = renderLoadingState("正在聚合演示准备状态...");
  flowNode.innerHTML = '<div class="empty-inline">正在生成答辩演示路线...</div>';

  try {
    const data = await service.getDemoCenter();
    demoCenterState.data = data;
    demoCenterState.loaded = true;
    if (titleNode) {
      titleNode.textContent = data.title || "SuperRAG 答辩演示中心";
    }
    if (subtitleNode) {
      subtitleNode.textContent = data.subtitle || "从文档入库到结构化产物复核的可解释 RAG 闭环";
    }
    if (readyScoreNode) {
      readyScoreNode.textContent = `${data.summary.readyCount || 0}/${data.summary.checkCount || 0}`;
    }
    summaryNode.innerHTML = renderDemoSummary(data.summary);
    flowNode.innerHTML = renderDemoFlow(data.flowSteps);
    renderDemoDocumentCoverage(data.documentCoverage);
    renderDemoReadiness(data.readinessChecks);
    renderDemoQuestions(data.recommendedQuestions);
    renderDemoTalkingPoints(data.talkingPoints);
    renderDemoArtifactSummary(data.artifactSummary);
    renderDemoGaps(data.topKnowledgeGaps, data.knowledgeGapSummary);
  } catch (error) {
    summaryNode.innerHTML = renderEmptyState("演示中心加载失败。", error.message || String(error));
    flowNode.innerHTML = '<div class="empty-inline">请确认后端服务是否已启动。</div>';
  }
}

function renderDemoSummary(summary = {}) {
  return [
    renderDemoSummaryCard("入库文档", summary.documentCount || 0, "CRM 演示资料与项目文档"),
    renderDemoSummaryCard("知识切片", summary.chunkCount || 0, "可被 RAG 检索的 chunk"),
    renderDemoSummaryCard("历史产物", summary.artifactCount || 0, "问答、交接、设计和培训产物"),
    renderDemoSummaryCard("引用证据", summary.citationCount || 0, "产物中绑定的文档片段"),
    renderDemoSummaryCard("知识缺口", summary.knowledgeGapCount || 0, "低证据或待确认问题"),
    renderDemoSummaryCard("准备检查", `${summary.readyCount || 0}/${summary.checkCount || 0}`, "答辩演示闭环完成度"),
  ].join("");
}

function renderDemoSummaryCard(label, value, description) {
  return `
    <article class="demo-summary-card dashboard-card">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(formatNumberValue(value))}</strong>
      <p>${escapeHtml(description)}</p>
    </article>
  `;
}

function renderDemoFlow(steps = []) {
  if (!steps.length) {
    return renderEmptyState("暂无演示路线。", "请确认 demo-center 服务是否可用。");
  }
  return steps
    .map(
      (item) => `
        <article class="demo-flow-step demo-status-${escapeHtml(item.status || "pending")}">
          <div class="demo-flow-index">${escapeHtml(item.step || "")}</div>
          <div>
            <h3>${escapeHtml(item.title || "演示步骤")}</h3>
            <p>${escapeHtml(item.description || "")}</p>
            <a class="text-link" href="${escapeHtml(item.route || "#/dashboard")}">进入该步骤</a>
          </div>
          ${renderDemoStatusBadge(item.status)}
        </article>
      `,
    )
    .join("");
}

function renderDemoDocumentCoverage(items = []) {
  const node = document.getElementById("demo-doc-coverage");
  if (!node) {
    return;
  }
  if (!items.length) {
    node.innerHTML = renderEmptyState("暂无推荐演示文档。");
    return;
  }
  node.innerHTML = items
    .map((item) => {
      const matched = item.matchedDocument || {};
      return `
        <article class="demo-doc-card">
          <div>
            <strong>${escapeHtml(item.module || item.title || "演示文档")}</strong>
            <span>${escapeHtml(item.title || "")}</span>
            <p>${escapeHtml(item.purpose || "用于支撑演示问题。")}</p>
            ${matched.title ? `<small>已匹配：${escapeHtml(matched.title)} · ${escapeHtml(matched.chunkCount || 0)} chunks</small>` : ""}
          </div>
          ${renderDemoStatusBadge(item.status === "已入库" ? "ready" : "warning", item.status)}
        </article>
      `;
    })
    .join("");
}

function renderDemoReadiness(items = []) {
  const node = document.getElementById("demo-readiness");
  if (!node) {
    return;
  }
  if (!items.length) {
    node.innerHTML = renderEmptyState("暂无准备度检查。");
    return;
  }
  node.innerHTML = items
    .map(
      (item) => `
        <article class="demo-check-card">
          <div>
            <strong>${escapeHtml(item.label || "检查项")}</strong>
            <p>${escapeHtml(item.description || "")}</p>
          </div>
          <a href="${escapeHtml(item.route || "#/dashboard")}">${renderDemoStatusBadge(item.status)}</a>
        </article>
      `,
    )
    .join("");
}

function renderDemoQuestions(items = []) {
  const node = document.getElementById("demo-questions");
  if (!node) {
    return;
  }
  if (!items.length) {
    node.innerHTML = renderEmptyState("暂无推荐问题。");
    return;
  }
  node.innerHTML = items
    .map(
      (item) => `
        <article class="demo-question-card">
          <div class="demo-question-head">
            ${renderSceneBadge(item.scene === "general" ? "chat" : item.scene || "chat")}
            <a class="text-link" href="${escapeHtml(item.route || "#/chat")}">打开场景</a>
          </div>
          <strong>${escapeHtml(item.question || "")}</strong>
          <p>${escapeHtml(item.expectedOutput || "")}</p>
          <button type="button" data-demo-copy-question="${escapeHtml(item.question || "")}">复制问题</button>
        </article>
      `,
    )
    .join("");
}

function renderDemoTalkingPoints(items = []) {
  const node = document.getElementById("demo-talking-points");
  if (!node) {
    return;
  }
  if (!items.length) {
    node.innerHTML = renderEmptyState("暂无讲解要点。");
    return;
  }
  node.innerHTML = `
    <ol class="demo-talking-list">
      ${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
    </ol>
  `;
}

function renderDemoArtifactSummary(summary = {}) {
  const node = document.getElementById("demo-artifact-summary");
  if (!node) {
    return;
  }
  const sceneCounts = summary.sceneCounts || {};
  const reviewCounts = summary.reviewCounts || {};
  const recentArtifacts = summary.recentArtifacts || [];
  node.innerHTML = `
    <div class="demo-artifact-metrics">
      ${renderStructuredCountCard("智能问答", sceneCounts.general || 0)}
      ${renderStructuredCountCard("新人培训", sceneCounts.training || 0)}
      ${renderStructuredCountCard("项目交接", sceneCounts.handover || 0)}
      ${renderStructuredCountCard("需求设计", sceneCounts.design || 0)}
    </div>
    <div class="demo-review-row">
      ${Object.entries(reviewCounts)
        .filter(([, count]) => Number(count) > 0)
        .map(([status, count]) => `<span>${renderReviewStatusBadge(status)} ${escapeHtml(count)}</span>`)
        .join("") || '<span class="empty-inline">暂无复核状态统计。</span>'}
    </div>
    <div class="demo-recent-artifacts">
      ${
        recentArtifacts.length
          ? recentArtifacts
              .map(
                (item) => `
                  <a href="#/history">
                    <strong>${escapeHtml(item.title || "历史产物")}</strong>
                    <span>${escapeHtml(formatSceneMode(item.sceneMode || (item.scene === "general" ? "chat" : item.scene || "chat")))} · ${escapeHtml(formatShortTime(item.createdAt))}</span>
                  </a>
                `,
              )
              .join("")
          : '<div class="empty-inline">暂无历史产物，建议先运行需求设计辅助或项目交接。</div>'
      }
    </div>
  `;
}

function renderDemoGaps(items = [], summary = {}) {
  const node = document.getElementById("demo-gaps");
  if (!node) {
    return;
  }
  if (!items.length) {
    node.innerHTML = renderEmptyState("暂无知识缺口。", "生成并保存设计或交接产物后，系统会聚合低证据项。");
    return;
  }
  node.innerHTML = `
    <div class="demo-gap-summary">
      ${renderStructuredCountCard("缺口类型", summary.gapTypeCount || items.length)}
      ${renderStructuredCountCard("累计出现", summary.totalGapOccurrences || 0)}
      ${renderStructuredCountCard("高风险", summary.highSeverityCount || 0)}
    </div>
    <div class="demo-gap-list">
      ${items
        .map(
          (item) => `
            <article>
              <div>
                <strong>${escapeHtml(item.gapType || "知识缺口")}</strong>
                <p>${escapeHtml(item.suggestion || "建议补充相关文档。")}</p>
              </div>
              ${renderGapSeverityBadge(item.severity)}
            </article>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderDemoStatusBadge(status, customLabel = "") {
  const normalized = normalizeDemoStatus(status);
  const labelMap = {
    ready: "已就绪",
    warning: "需检查",
    pending: "待演示",
  };
  return `<span class="demo-status-badge demo-status-${escapeHtml(normalized)}">${escapeHtml(customLabel || labelMap[normalized] || "待演示")}</span>`;
}

function normalizeDemoStatus(status) {
  const value = String(status || "pending").toLowerCase();
  if (["ready", "done", "completed", "已入库", "已就绪"].includes(value)) {
    return "ready";
  }
  if (["warning", "warn", "needs_check", "需检查", "待上传"].includes(value)) {
    return "warning";
  }
  return "pending";
}

function formatNumberValue(value) {
  return typeof value === "number" ? formatNumber(value) : String(value || 0);
}

function bindDocumentsActions() {
  document.addEventListener("input", (event) => {
    if (event.target.id !== "document-search") {
      return;
    }
    renderDocumentTable();
  });

  document.addEventListener("change", (event) => {
    if (!event.target.matches("#filter-type, #filter-project, #filter-uploader, #filter-status, #filter-visibility")) {
      return;
    }
    renderDocumentTable();
  });

  document.addEventListener("click", async (event) => {
    const placeholderAction = event.target.closest("[data-doc-placeholder-action]");
    if (placeholderAction) {
      toast(`${placeholderAction.dataset.docPlaceholderAction}功能将在后续阶段接入。`);
      return;
    }

    if (event.target.closest("#open-upload-dialog")) {
      openUploadDialog();
      return;
    }

    if (event.target.closest("[data-close-upload]")) {
      closeUploadDialog();
      return;
    }

    const documentAction = event.target.closest("[data-document-action]");
    if (!documentAction) {
      return;
    }

    const { documentAction: action, documentId } = documentAction.dataset;
    await handleDocumentAction(action, documentId);
  });

  document.addEventListener("submit", async (event) => {
    if (event.target.id !== "upload-form") {
      return;
    }
    event.preventDefault();
    try {
      await submitMockUpload(event.target);
    } catch (error) {
      toast(`上传失败：${error.message || error}`);
    }
  });

  const closeDrawerButton = document.getElementById("close-document-drawer");
  if (closeDrawerButton) {
    closeDrawerButton.addEventListener("click", closeDocumentDrawer);
  }
}

async function renderDocumentsPage() {
  const service = getDocumentService();
  if (!service) {
    return;
  }

  if (!documentState.loaded) {
    await refreshDocumentBaseData();
  }

  await renderDocumentTable();
}

async function refreshDocumentBaseData() {
  const service = getDocumentService();
  if (!service) {
    return;
  }
  const result = await service.getDocuments();
  documentState.documents = result.list;
  documentState.loaded = true;
  populateDocumentFilters();
}

function populateDocumentFilters() {
  setFilterOptions("filter-type", uniqueValues(documentState.documents.map((item) => item.type)));
  setFilterOptions("filter-project", uniqueValues(documentState.documents.map((item) => item.project)));
  setFilterOptions("filter-uploader", uniqueValues(documentState.documents.map((item) => item.uploader)));
  setFilterOptions("filter-visibility", uniqueValues(documentState.documents.map((item) => item.visibilityScope)));
}

function setFilterOptions(selectId, values) {
  const select = document.getElementById(selectId);
  if (!select) {
    return;
  }
  const currentValue = select.value;
  select.innerHTML = [
    '<option value="">全部</option>',
    ...values.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`),
  ].join("");
  select.value = values.includes(currentValue) ? currentValue : "";
}

async function renderDocumentTable() {
  const tbody = document.getElementById("document-table-body");
  const countNode = document.getElementById("document-result-count");
  if (!tbody) {
    return;
  }

  const service = getDocumentService();
  if (!service) {
    return;
  }

  const result = await service.getDocuments(getDocumentQueryParams());
  const documents = result.list;
  if (countNode) {
    countNode.textContent = `${result.total} 条文档`;
  }

  if (!documents.length) {
    tbody.innerHTML = '<tr><td colspan="9">没有符合条件的文档。</td></tr>';
    return;
  }

  tbody.innerHTML = documents
    .map(
      (documentItem) => `
        <tr>
          <td>
            <div class="table-doc-title">
              <span class="doc-file-icon">${escapeHtml(documentItem.type.slice(0, 1))}</span>
              <div>
                <strong>${escapeHtml(documentItem.title)}</strong>
                <small>${escapeHtml(documentItem.summary)}</small>
              </div>
            </div>
          </td>
          <td>${escapeHtml(documentItem.type)}</td>
          <td>${escapeHtml(documentItem.scene || "通用")}</td>
          <td>
            <div class="rag-table-cell">
              <strong>${escapeHtml(documentItem.chunkCount || documentItem.ragInfo?.chunkCount || 0)} chunks</strong>
              <small>${escapeHtml(formatNumber(documentItem.charCount || documentItem.ragInfo?.charCount || 0))} 字符</small>
              <small>${escapeHtml(documentItem.ragInfo?.retrievalMethod || "本地检索")}</small>
            </div>
          </td>
          <td>${renderQualityStatusBadge(documentItem.qualityStatus)}</td>
          <td>${escapeHtml(documentItem.project)}</td>
          <td>${renderStatusBadge(documentItem.status)}</td>
          <td>
            <div class="rag-table-cell">
              <strong>${escapeHtml(documentItem.referenceStats?.total ?? documentItem.referencedQuestionCount ?? 0)} 次</strong>
              <small>${escapeHtml(documentItem.referenceStats?.lastReferencedAt ? formatShortTime(documentItem.referenceStats.lastReferencedAt) : "暂无引用")}</small>
            </div>
          </td>
          <td>
            <div class="table-actions">
              <button type="button" data-document-action="view" data-document-id="${documentItem.id}">查看详情</button>
              ${
                documentItem.status === "failed"
                  ? `<button type="button" data-document-action="reindex" data-document-id="${documentItem.id}">重新入库</button>`
                  : ""
              }
              <button type="button" data-document-action="tags" data-document-id="${documentItem.id}">编辑标签</button>
              <button class="danger-link" type="button" data-document-action="delete" data-document-id="${documentItem.id}">删除</button>
            </div>
          </td>
        </tr>
      `,
    )
    .join("");
}

function getDocumentQueryParams() {
  return {
    keyword: getInputValue("document-search"),
    type: getInputValue("filter-type"),
    project: getInputValue("filter-project"),
    uploader: getInputValue("filter-uploader"),
    status: getInputValue("filter-status"),
    visibilityScope: getInputValue("filter-visibility"),
  };
}

function renderTagList(tags = []) {
  if (!tags.length) {
    return '<span class="muted-text">未打标</span>';
  }
  return `<div class="tag-list">${tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</div>`;
}

function renderQualityStatusBadge(status = {}) {
  const normalized = typeof status === "string" ? { label: status, level: "warn" } : status || {};
  const label = normalized.label || "待检查";
  const level = normalized.level || "warn";
  return `<span class="quality-status-badge quality-status-${escapeHtml(level)}">${escapeHtml(label)}</span>`;
}

function openUploadDialog() {
  const dialog = document.getElementById("upload-dialog");
  if (dialog) {
    dialog.hidden = false;
  }
}

function closeUploadDialog() {
  const dialog = document.getElementById("upload-dialog");
  if (dialog) {
    dialog.hidden = true;
  }
}

async function submitMockUpload(form) {
  const service = getDocumentService();
  if (!service) {
    return;
  }
  const formData = new FormData(form);
  const file = formData.get("file");
  const tags = splitTags(formData.get("tags"));
  const fileName = file?.name || "前端模拟上传文档.md";

  await service.uploadDocument({
    title: fileName,
    type: formData.get("type"),
    project: String(formData.get("project") || "企业知识库").trim(),
    tags,
    visibilityScope: formData.get("visibilityScope"),
    file,
  });

  dashboardLoaded = false;
  form.reset();
  await refreshDocumentBaseData();
  await renderDocumentTable();
  closeUploadDialog();
  toast("文档已提交上传，正在进入解析与入库队列。");
}

async function handleDocumentAction(action, documentId) {
  switch (action) {
    case "view":
      await openDocumentDrawer(documentId);
      break;
    case "reindex":
      await submitReindexTask(documentId);
      break;
    case "tags":
      await editDocumentTags(documentId);
      break;
    case "delete":
      await deleteDocument(documentId);
      break;
    default:
      break;
  }
}

async function openDocumentDrawer(documentId) {
  const drawer = document.getElementById("document-detail-drawer");
  const titleNode = document.getElementById("drawer-document-title");
  const contentNode = document.getElementById("document-detail-content");
  const service = getDocumentService();

  if (!drawer || !titleNode || !contentNode || !service) {
    return;
  }

  const documentItem = await service.getDocumentDetail(documentId);

  titleNode.textContent = documentItem.title;
  contentNode.innerHTML = renderDocumentDetail(documentItem);
  drawer.hidden = false;
}

function closeDocumentDrawer() {
  const drawer = document.getElementById("document-detail-drawer");
  if (drawer) {
    drawer.hidden = true;
  }
}

function renderDocumentDetail(documentItem) {
  const linkedQuestionCount = documentItem.referencedQuestionCount ?? 0;
  const category = documentItem.knowledgeCategory || "通用项目知识 / 待细分";
  const accessWarning =
    documentItem.visibilityScope === "管理员"
      ? `
        <section class="access-warning">
          <strong>无权限访问部分文档内容</strong>
          <p>该文档可见范围为管理员。当前项目成员只能查看治理元数据，原文预览和敏感片段需要向管理员申请权限。</p>
        </section>
      `
      : "";

  return `
    ${accessWarning}
    <section class="detail-section">
      <h3>文档基本信息</h3>
      <div class="detail-grid">
        ${renderDetailItem("标题", documentItem.title)}
        ${renderDetailItem("文档类型", documentItem.type)}
        ${renderDetailItem("所属项目", documentItem.project)}
        ${renderDetailItem("版本", documentItem.version)}
        ${renderDetailItem("适用场景", documentItem.scene || "通用")}
        ${renderDetailItem("上传者", documentItem.uploader || "后端导入")}
        ${renderDetailItem("可见范围", documentItem.visibilityScope || "项目成员")}
        ${renderDetailItem("上传时间", formatShortTime(documentItem.createdAt || documentItem.updatedAt) || "未记录")}
        ${renderDetailItem("入库状态", renderStatusBadge(documentItem.status), true)}
        ${renderDetailItem("质量状态", renderQualityStatusBadge(documentItem.qualityStatus), true)}
      </div>
    </section>
    <section class="detail-section">
      <h3>文档摘要</h3>
      <p>${escapeHtml(documentItem.summary || "暂无摘要。建议补充文档用途、覆盖范围和关键业务规则，便于检索和答辩说明。")}</p>
    </section>
    <section class="detail-section">
      <h3>RAG 入库信息</h3>
      ${renderDocumentRagInfo(documentItem)}
    </section>
    <section class="detail-section">
      <h3>Chunk 预览</h3>
      ${renderChunkPreview(documentItem.chunksPreview)}
    </section>
    <section class="detail-section">
      <h3>文档质量检查</h3>
      ${renderDocumentQualityChecks(documentItem.qualityChecks)}
    </section>
    <section class="detail-section">
      <h3>关联知识分类</h3>
      <p>${escapeHtml(category)}</p>
    </section>
    <section class="detail-section">
      <h3>标签与关键词</h3>
      ${renderTagList([...(documentItem.tags || []), ...(documentItem.keywords || [])])}
    </section>
    <section class="detail-section">
      <h3>Dify Dataset 映射状态</h3>
      <div class="mapping-card">
        <span>${documentItem.difyDatasetId ? "已关联 Dataset" : "待建立 Dataset 映射"}</span>
        <code>${escapeHtml(documentItem.difyDatasetId || "未映射")}</code>
      </div>
      <div class="mapping-card">
        <span>Dify document 映射 ID</span>
        <code>${escapeHtml(documentItem.difyDocumentId || "等待解析后生成")}</code>
      </div>
    </section>
    <section class="detail-section">
      <h3>最近入库日志</h3>
      <ol class="log-list">
        ${renderDocumentLogs(documentItem)
          .map((log) => `<li><strong>${escapeHtml(log.time)}</strong><span>${escapeHtml(log.message || log.text)}</span></li>`)
          .join("")}
      </ol>
    </section>
    <section class="detail-section">
      <h3>引用记录 / 使用记录</h3>
      ${renderReferenceStats(documentItem.referenceStats, linkedQuestionCount)}
      ${renderReferencedArtifacts(documentItem.referencedArtifacts)}
    </section>
  `;
}

function renderDocumentRagInfo(documentItem) {
  const ragInfo = documentItem.ragInfo || {};
  const vectorEnabled = ragInfo.vectorIndexEnabled ? "已启用外部向量索引" : "使用本地向量近似";
  const lexicalFallback = ragInfo.lexicalFallback ? "已参与融合排序" : "未参与";
  return `
    <div class="detail-grid">
      ${renderDetailItem("Chunk 数量", `${ragInfo.chunkCount ?? documentItem.chunkCount ?? 0}`)}
      ${renderDetailItem("字符数", `${formatNumber(ragInfo.charCount ?? documentItem.charCount ?? 0)}`)}
      ${renderDetailItem("检索方式", ragInfo.retrievalMethod || "本地检索")}
      ${renderDetailItem("向量索引", vectorEnabled)}
      ${renderDetailItem("词法融合", lexicalFallback)}
      ${renderDetailItem("chunk_size", ragInfo.chunkSize || "默认")}
      ${renderDetailItem("chunk_overlap", ragInfo.chunkOverlap || "默认")}
      ${renderDetailItem("vector_store", ragInfo.vectorStore || "local")}
    </div>
  `;
}

function renderChunkPreview(chunks = []) {
  if (!chunks.length) {
    return '<div class="empty-inline">暂无 chunk 预览。请确认文档已上传并完成入库。</div>';
  }
  return `
    <div class="chunk-preview-list">
      ${chunks
        .slice(0, 5)
        .map((chunk) => {
          const position = Number(chunk.position ?? 0) + 1;
          return `
            <article class="chunk-preview-card">
              <div class="chunk-preview-head">
                <strong>Chunk ${position}</strong>
                <span>${escapeHtml(chunk.searchable === false ? "不可检索" : "可检索")}</span>
              </div>
              <p>${escapeHtml(chunk.snippet || chunk.content || "暂无片段内容。")}</p>
              <div class="chunk-preview-meta">
                <span>${escapeHtml(chunk.charCount || String(chunk.content || "").length)} 字符</span>
                <span>${escapeHtml(chunk.tokenCount || 0)} tokens</span>
                <span>${escapeHtml(chunk.sourceDocument || chunk.sourceName || "当前文档")}</span>
              </div>
            </article>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderDocumentQualityChecks(checks = []) {
  if (!checks.length) {
    return '<div class="empty-inline">暂无质量检查结果。</div>';
  }
  return `
    <div class="quality-check-list">
      ${checks
        .map((check) => {
          const level = check.level || "warn";
          const className = level === "ok" ? "quality-ok" : level === "bad" ? "quality-bad" : "quality-warn";
          return `
            <div class="quality-check-item ${className}">
              <span>${escapeHtml(check.label || "质量检查")}</span>
              <strong>${escapeHtml(check.message || "待补充检查说明")}</strong>
            </div>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderReferenceStats(referenceStats = {}, fallbackTotal = 0) {
  const stats = referenceStats || {};
  const total = stats.total ?? fallbackTotal ?? 0;
  return `
    <div class="reference-stats-grid">
      ${renderReferenceStat("总引用", total)}
      ${renderReferenceStat("通用问答", stats.general || 0)}
      ${renderReferenceStat("新人培训", stats.training || 0)}
      ${renderReferenceStat("项目交接", stats.handover || 0)}
      ${renderReferenceStat("需求设计", stats.design || 0)}
    </div>
    <p>${escapeHtml(stats.note || (total ? "已记录引用统计。" : "暂无引用记录，后续可从历史产物 citations 中扩展统计。"))}</p>
  `;
}

function renderReferenceStat(label, value) {
  return `
    <div class="reference-stat-card">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </div>
  `;
}

function renderReferencedArtifacts(artifacts = []) {
  if (!artifacts?.length) {
    return '<div class="empty-inline">暂无历史产物引用该文档。生成问答、设计或交接结果后会自动沉淀引用记录。</div>';
  }
  return `
    <div class="referenced-artifact-list">
      ${artifacts
        .slice(0, 6)
        .map(
          (item) => `
            <article class="referenced-artifact-card">
              <div>
                <strong>${escapeHtml(item.title || "历史产物")}</strong>
                <span>${escapeHtml(formatSceneMode(item.scene === "general" ? "chat" : item.scene || "chat"))} · ${escapeHtml(item.citationCount || 0)} 条引用</span>
              </div>
              <small>${escapeHtml(formatShortTime(item.createdAt) || "未记录时间")}</small>
            </article>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderDetailItem(label, value, isHtml = false) {
  return `
    <div class="detail-item">
      <span>${escapeHtml(label)}</span>
      <strong>${isHtml ? value : escapeHtml(value)}</strong>
    </div>
  `;
}

function renderDocumentLogs(documentItem) {
  return documentItem.ingestionLogs || [];
}

async function submitReindexTask(documentId) {
  const service = getDocumentService();
  if (!service) {
    return;
  }
  await service.reindexDocument(documentId);
  dashboardLoaded = false;
  await refreshDocumentBaseData();
  await renderDocumentTable();
  toast("已提交重新入库任务。");
}

async function editDocumentTags(documentId) {
  const service = getDocumentService();
  if (!service) {
    return;
  }
  const documentItem = await service.getDocumentDetail(documentId);
  if (!documentItem) {
    return;
  }
  const input = window.prompt("请输入标签，多个标签用逗号分隔：", documentItem.tags.join(", "));
  if (input === null) {
    return;
  }
  await service.updateDocumentTags(documentId, splitTags(input));
  await refreshDocumentBaseData();
  await renderDocumentTable();
  toast("文档标签已更新。");
}

async function deleteDocument(documentId) {
  const service = getDocumentService();
  if (!service) {
    return;
  }
  const documentItem = await service.getDocumentDetail(documentId);
  if (!documentItem) {
    return;
  }
  const confirmed = window.confirm(`确认删除“${documentItem.title}”吗？当前仅删除前端 mock 数据。`);
  if (!confirmed) {
    return;
  }
  await service.deleteDocument(documentId);
  dashboardLoaded = false;
  await refreshDocumentBaseData();
  await renderDocumentTable();
  closeDocumentDrawer();
  toast("文档已从前端 mock 列表删除。");
}

function splitTags(value) {
  return String(value || "")
    .split(/,|，/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function uniqueValues(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, "zh-CN"));
}

function getInputValue(id) {
  return document.getElementById(id)?.value || "";
}

function getDocumentService() {
  if (!window.documentService) {
    toast("Document service 未加载。");
    return null;
  }
  return window.documentService;
}

function getDashboardService() {
  if (!window.dashboardService) {
    toast("Dashboard service 未加载。");
    return null;
  }
  return window.dashboardService;
}

function getDemoCenterService() {
  if (!window.demoCenterService) {
    toast("Demo center service 未加载。");
    return null;
  }
  return window.demoCenterService;
}

function getChatService() {
  if (!window.chatService) {
    toast("Chat service 未加载。");
    return null;
  }
  return window.chatService;
}

function getTrainingService() {
  if (!window.trainingService) {
    toast("Training service 未加载。");
    return null;
  }
  return window.trainingService;
}

function getHandoverService() {
  if (!window.handoverService) {
    toast("Handover service 未加载。");
    return null;
  }
  return window.handoverService;
}

function getDesignService() {
  if (!window.designService) {
    toast("Design service 未加载。");
    return null;
  }
  return window.designService;
}

function getHistoryService() {
  if (!window.historyService) {
    toast("History service 未加载。");
    return null;
  }
  return window.historyService;
}

function getSettingsService() {
  if (!window.settingsService) {
    toast("Settings service 未加载。");
    return null;
  }
  return window.settingsService;
}

function renderStatusBadge(status, customLabel) {
  const label = customLabel || getDocumentStatusLabel(status);
  return `<span class="status-badge status-${status}">${escapeHtml(label)}</span>`;
}

function getDocumentStatusLabel(status) {
  const labels = {
    indexed: "已入库",
    indexing: "解析中",
    failed: "解析失败",
    pending: "待处理",
  };
  return labels[status] || status;
}

function getSceneRoute(sceneMode) {
  const routeMap = {
    chat: "#/chat",
    training: "#/training",
    handover: "#/handover",
    design: "#/design-assistant",
  };
  return routeMap[sceneMode] || "#/history";
}

function formatSceneMode(sceneMode) {
  const labels = {
    chat: "智能问答",
    training: "新人培训",
    handover: "项目交接",
    design: "需求设计辅助",
  };
  return labels[sceneMode] || sceneMode;
}

function formatShortTime(value) {
  if (!value) {
    return "";
  }
  const normalized = String(value).replace(" ", "T");
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatNumber(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) {
    return "0";
  }
  return new Intl.NumberFormat("zh-CN").format(number);
}

function getTimeValue(value) {
  const normalized = String(value || "").replace(" ", "T");
  const time = new Date(normalized).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function getRouteFromLocation() {
  const hash = window.location.hash.trim();
  if (hash) {
    return hash.replace(/^#/, "");
  }

  const path = window.location.pathname;
  if (routes[path]) {
    return path;
  }

  return defaultRoute;
}

function normalizeRoute(route) {
  let nextRoute = route || defaultRoute;

  if (!nextRoute.startsWith("/")) {
    nextRoute = `/${nextRoute}`;
  }

  nextRoute = legacyRouteMap[nextRoute] || nextRoute;
  return routes[nextRoute] ? nextRoute : defaultRoute;
}

function replaceHash(route) {
  const nextHash = `#${route}`;
  if (window.location.hash === nextHash) {
    renderCurrentRoute();
    return;
  }
  window.location.replace(nextHash);
}

function toast(message) {
  const node = document.createElement("div");
  node.className = "toast";
  node.textContent = message;
  document.body.appendChild(node);

  window.setTimeout(() => {
    node.classList.add("visible");
  }, 10);

  window.setTimeout(() => {
    node.classList.remove("visible");
    window.setTimeout(() => node.remove(), 180);
  }, 1800);
}

function escapeHtml(input) {
  return String(input)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatErrorMessage(error) {
  if (error && typeof error === "object") {
    if (typeof error.message === "string" && error.message.trim()) {
      return error.message;
    }
    if (typeof error.error === "string" && error.error.trim()) {
      return error.error;
    }
  }

  const fallback = String(error || "").trim();
  return fallback || "未知错误，请检查后端服务或浏览器控制台。";
}

function renderDesignIntermediateDocument(result) {
  const doc = result?.intermediateDocument;
  if (!doc || !doc.content) {
    return "";
  }

  return `
    <section class="scenario-section">
      <details class="diagram-source-panel">
        <summary>查看中间文档</summary>
        <div class="design-summary-meta" style="margin-top: 12px;">
          <span>${escapeHtml(doc.filename || "design-intermediate.md")}</span>
          <span>${escapeHtml(doc.path || "")}</span>
        </div>
        <pre class="diagram-source-code">${escapeHtml(doc.content)}</pre>
      </details>
    </section>
  `;
}
