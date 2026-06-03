const routes = {
  "/login": "登录",
  "/dashboard": "首页 / 控制台",
  "/demo-center": "答辩演示中心",
  "/documents": "文档管理",
  "/chat": "智能问答",
  "/training": "培训模式",
  "/handover": "交接模式",
  "/design-assistant": "设计辅助",
  "/knowledge-gaps": "知识缺口与证据",
  "/history": "历史产物",
  "/settings": "后台配置",
};

const legacyRouteMap = {
  "/general": "/chat",
  "/design": "/design-assistant",
};

const defaultRoute = "/dashboard";
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
  activeTab: "functions",
  loading: false,
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
      toast("登录成功，已进入 SuperRAG 工作台。");
      window.location.hash = "#/dashboard";
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

  document.addEventListener("change", (event) => {
    if (!event.target.matches("#chat-knowledge-select, #chat-project-select, #chat-answer-mode")) {
      return;
    }
    renderChatConversation();
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
        <button class="chat-session-item ${session.id === chatState.activeSessionId ? "active" : ""}" type="button" data-chat-session-id="${escapeHtml(session.id)}">
          <span>
            <strong>${escapeHtml(session.title)}</strong>
            <small>${escapeHtml(formatSceneMode(session.sceneMode))}</small>
          </span>
          <time>${escapeHtml(formatShortTime(session.updatedAt))}</time>
        </button>
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

  return `
    <article class="answer-card chat-message">
      <div class="answer-card-head">
        <div>
          <p class="eyebrow">RAG Answer</p>
          <h2>企业知识检索回答</h2>
        </div>
        <div class="answer-card-tags">
          <span>${escapeHtml(answerMode)}</span>
          ${renderEvidenceLevelBadge(evidenceLevel)}
        </div>
      </div>
      <div class="answer-section conclusion">
        <h3>结论</h3>
        <div class="rich-answer">${renderRichText(sections.conclusion)}</div>
      </div>
      <div class="answer-grid">
        <section class="answer-section">
          <h3>依据</h3>
          <div class="rich-answer">${renderRichText(sections.evidence)}</div>
        </section>
        <section class="answer-section">
          <h3>建议</h3>
          <div class="rich-answer">${renderRichText(sections.suggestion)}</div>
        </section>
      </div>
      <section class="answer-section uncertainty">
        <h3>不确定性</h3>
        <div class="rich-answer">${renderRichText(sections.uncertainty)}</div>
      </section>
    </article>
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
  return String(value || "")
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
    evidence: citationSummary || "当前 mock 消息没有绑定足够引用片段。",
    suggestion: message.nextActions?.[0] || "建议继续补充相关文档，并在正式结论前核对引用证据。",
    uncertainty: message.risks?.[0] || "该回答基于当前知识库片段生成，未入库资料不会被覆盖。",
  };
}

function renderChatLoading() {
  return `
    <article class="answer-card chat-message loading-answer">
      <div class="answer-card-head">
        <div>
          <p class="eyebrow">Retrieving</p>
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
    listNode.innerHTML = '<div class="empty-inline">暂无引用证据。</div>';
    return;
  }

  listNode.innerHTML = chatState.citations.map(renderCitationCard).join("");
}

function renderCitationCard(citation) {
  const score = Number(citation.relevanceScore ?? citation.score ?? 0);
  const displayScore = score ? score.toFixed(2) : "0.00";
  const title = citation.documentTitle || citation.title || "知识库片段";
  const chunkId = citation.chunkId || citation.segmentId || citation.id || "";
  return `
    <article class="citation-card">
      <div class="citation-card-head">
        <strong>${escapeHtml(title)}</strong>
        <span>${escapeHtml(displayScore)}</span>
      </div>
      <p>${escapeHtml(citation.snippet || citation.content || "暂无片段摘要。")}</p>
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
    await generateTrainingResult("这个项目主要解决什么问题？", { silent: true });
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
      <div class="term-grid">${result.terms.map(renderTermCard).join("")}</div>
    </section>
    <section class="scenario-section">
      <h3>学习路径</h3>
      <div class="learning-timeline">${result.learningPath.map(renderLearningStep).join("")}</div>
    </section>
    <section class="scenario-section">
      <h3>推荐阅读资料</h3>
      <div class="recommended-doc-grid">${result.recommendedDocs.map(renderRecommendedDoc).join("")}</div>
    </section>
    <section class="scenario-section">
      <h3>引用证据</h3>
      <div class="scenario-evidence-list">${result.citations.map(renderScenarioCitation).join("")}</div>
    </section>
  `;
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
    await generateHandoverResult("请总结当前项目进度", { silent: true });
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

  const warningText = retriever.warning || result.warning || "";
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
      <p>${escapeHtml(item.snippet || item.content || "暂无片段摘要。")}</p>
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
                <tr>
                  <td>${escapeHtml(todo.taskName)}</td>
                  <td><span class="priority-badge priority-${getPriorityClass(todo.priority)}">${escapeHtml(todo.priority)}</span></td>
                  <td>${escapeHtml(todo.riskLevel)}</td>
                  <td>${escapeHtml(todo.suggestedOwner || todo.owner)}</td>
                  <td>${escapeHtml(todo.dependentDocument || todo.evidenceSource || "待确认文档")}</td>
                  <td>${escapeHtml(todo.status)}</td>
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
            <tr>
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
  const list = Array.isArray(items) ? items.filter((item) => item !== null && item !== undefined && String(item).trim()) : [];
  if (!list.length) {
    return '<div class="empty-inline">当前文档证据不足，暂未生成检查清单。</div>';
  }
  return `
    <div class="handover-checklist">
      ${list.map((item) => `
        <label>
          <input type="checkbox">
          <span>${renderRichTextBlock(item, "compact-rich-answer inline-rich-answer")}</span>
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
              <td>${renderRichTextBlock(item.conclusion || "待确认结论", "compact-rich-answer inline-rich-answer")}</td>
              <td>${escapeHtml(stripMarkdownDecorators(item.sourceDocument || "待关联文档"))}</td>
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
    designState.activeTab = "functions";
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

  container.innerHTML = `
    <section class="design-summary-card">
      <div>
        <p class="eyebrow">${escapeHtml(result.outputTypeLabel || result.outputType)}</p>
        <h3>${escapeHtml(stripMarkdownDecorators(result.title))}</h3>
        ${renderRichTextBlock(result.inputQuestion, "compact-rich-answer")}
      </div>
      <div class="design-summary-meta">
        <span>${escapeHtml(result.project)}</span>
        <span>${escapeHtml(result.granularity || "标准")}</span>
        ${renderGenerationModeBadge(result.generationMode || result.source)}
        ${renderEvidenceLevelBadge(result.evidenceLevel)}
      </div>
    </section>
    ${result.fallbackNotice ? `<div class="alert-card warning">${escapeHtml(result.fallbackNotice)}</div>` : ""}
    ${result.warning ? `<div class="alert-card warning">${escapeHtml(result.warning)}</div>` : ""}
    ${renderRetrievalVisibility(result)}
    ${renderScenarioQualityAssessment(result.qualityAssessment, "design")}
    ${renderDesignTabContent(result)}
  `;
  scheduleDesignDiagramRender(result);
}

function renderDesignTabContent(result) {
  const renderers = {
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
  const renderer = renderers[designState.activeTab] || renderDesignFunctionTable;
  return renderer(result);
}

function renderDesignFunctionTable(result) {
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

function renderDesignUseCases(result) {
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
                  <p>${escapeHtml(stripMarkdownDecorators(item.evidenceSnippet || "当前用例缺少明确引用片段，建议补充需求或接口文档。"))}</p>
                </aside>
              </article>
            `,
          )
          .join("")}
      </div>
    </section>
  `;
}

function renderDesignModules(result) {
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

function renderDesignRisks(result) {
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
    <div class="table-wrap">
      <table class="scenario-table design-table">
        <thead>
          <tr>
            <th>需求/业务规则来源</th>
            <th>功能点</th>
            <th>文本用例</th>
            <th>建议模块</th>
            <th>证据片段</th>
            <th>来源文档</th>
            <th>证据等级</th>
          </tr>
        </thead>
        <tbody>
          ${items.map((item) => `
            <tr>
              <td>${escapeHtml(stripMarkdownDecorators(item.requirementSource || "待关联需求"))}</td>
              <td><strong>${escapeHtml(stripMarkdownDecorators(item.functionName || "待关联功能"))}</strong></td>
              <td>${escapeHtml(stripMarkdownDecorators(item.useCaseName || "待关联用例"))}</td>
              <td>${escapeHtml(stripMarkdownDecorators(item.moduleName || "待关联模块"))}</td>
              <td>${renderEvidenceSnippet(item.evidenceSnippet)}</td>
              <td>${escapeHtml(stripMarkdownDecorators(item.sourceDocument || "待关联文档"))}</td>
              <td>${escapeHtml(stripMarkdownDecorators(item.evidenceLevel || resultEvidenceLevelLabel(item)))}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderDesignBusinessAnalysis(result) {
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

function renderBusinessObjectCard(item) {
  return `
    <article class="business-object-card">
      <strong>${escapeHtml(stripMarkdownDecorators(item.name || "未命名对象"))}</strong>
      ${renderRichTextBlock(item.meaning || item.description || "待补充业务含义。", "compact-rich-answer")}
      <dl>
        <div><dt>关联模块</dt><dd>${renderTagList(item.relatedModules, "待关联模块")}</dd></div>
        <div><dt>来源文档</dt><dd>${escapeHtml(stripMarkdownDecorators(item.sourceDocument || "待关联文档"))}</dd></div>
      </dl>
      ${item.evidenceSnippet ? `<p class="evidence-snippet">${escapeHtml(stripMarkdownDecorators(item.evidenceSnippet))}</p>` : ""}
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
      ${item.evidenceSnippet ? `<p class="evidence-snippet">${escapeHtml(stripMarkdownDecorators(item.evidenceSnippet))}</p>` : ""}
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

function formatDisplayValue(value) {
  if (value && typeof value === "object") {
    return value.name || value.title || value.role || value.field || value.description || JSON.stringify(value);
  }
  return String(value || "");
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
  const text = stripMarkdownDecorators(value || "");
  if (!text) {
    return '<span class="muted-inline">暂无证据片段</span>';
  }
  const clipped = text.length > limit ? `${text.slice(0, limit)}...` : text;
  return `<span class="evidence-snippet-inline">${escapeHtml(clipped)}</span>`;
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
    "mock-fallback": "Mock 回退",
    "frontend-mock": "Mock 回退",
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

async function handleDesignAction(action) {
  if (action === "regenerate") {
    await generateDesignOutput();
    return;
  }

  if (!designState.result) {
    toast("请先生成设计初稿。");
    return;
  }

  if (action === "copy") {
    const markdown = buildDesignMarkdown(designState.result);
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(markdown);
      toast("设计结果已复制为 Markdown。");
      return;
    }
    toast("当前浏览器不支持自动复制，请手动复制页面内容。");
    return;
  }

  if (action === "copy-diagram") {
    const diagramText = String(designState.result.diagram || "").trim();
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
    const markdown = buildDesignMarkdown(designState.result);
    downloadTextFile(markdown, `SuperRAG-需求设计产物-${Date.now()}.md`, "text/markdown;charset=utf-8");
    toast("设计产物 Markdown 已导出。");
    return;
  }

  if (action === "save") {
    window.SuperRagBackend?.appendHistoryRecord?.({
      id: designState.result.id,
      title: designState.result.title,
      sceneMode: "design",
      artifactType: "design_output",
      project: designState.result.project,
      summary: designState.result.inputQuestion,
      query: designState.result.inputQuestion,
      originalQuestion: designState.result.inputQuestion,
      outputSummary: designState.result.functionList.map((item) => item.description).join("\n"),
      structuredOutput: designState.result,
      qualityAssessment: designState.result.qualityAssessment || {},
      citations: designState.result.citations,
      changeSummary: "手动保存设计产物",
    });
    toast("设计产物已保存到历史产物。");
  }
}

function buildDesignMarkdown(result) {
  const lines = [
    `# ${result.title}`,
    "",
    `设计目标：${result.inputQuestion}`,
    `关联项目：${result.project}`,
    `证据充分度：${getEvidenceLevelLabel(result.evidenceLevel)}`,
    `生成来源：${stripHtml(renderGenerationModeBadge(result.generationMode || result.source))}`,
    `Pipeline：${result.pipelineVersion || "未标注"}`,
    "",
    "## 业务对象识别",
    ...(result.businessObjects || []).map((item) => `- ${item.name}：${item.meaning || item.description || ""}（来源：${item.sourceDocument || "待关联"}）`),
    "",
    "## 业务规则",
    ...(result.businessRules || []).map((item) => `- ${item.rule || item.description}；影响范围：${item.impactScope || item.impact || "待确认"}；来源：${item.sourceDocument || "待关联"}`),
    "",
    "## 功能清单",
    ...(result.functionList || []).map((item) => `- ${item.id} ${item.name}：${item.description}（${item.priority}，${item.sourceDocument || item.relatedDocument}）`),
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
    ...(result.moduleSuggestions || []).map((item) => `- ${item.name}：${item.responsibility}`),
    "",
    "## 数据对象建议",
    ...(result.dataObjects || []).map((item) => `- ${item.name}：字段 ${formatMarkdownValue(item.fields)}；关联模块 ${formatMarkdownValue(item.relatedModules)}`),
    "",
    "## 权限与角色分析",
    ...(result.permissionAnalysis || []).map((item) => `- ${formatMarkdownValue(item)}`),
    "",
    "## 风险与待确认问题",
    ...(result.risks || []).map((item) => `- ${item.description}；影响：${item.impact}；建议：${item.suggestion || item.supplement}`),
    ...(result.openQuestions || []).map((item) => `- 待确认：${formatMarkdownValue(item)}`),
    "",
    "## 需求追踪矩阵",
    ...(result.traceabilityMatrix || []).map((item) => `- ${item.requirementSource} -> ${item.functionName} -> ${item.useCaseName} -> ${item.moduleName}（${item.sourceDocument}）`),
    "",
    "## 后续动作建议",
    ...(result.nextActions || []).map((item) => `- ${item.action}（${item.priority}，负责人：${item.owner}）`),
    "",
    "## 引用证据",
    ...(result.citations || []).map((item) => `- ${item.documentTitle}：${item.snippet}`),
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
    return Object.entries(value).map(([key, item]) => `${key}: ${formatMarkdownValue(item)}`).join("；");
  }
  return String(value || "待补充");
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
    const items = Array.isArray(data.items) ? data.items : [];
    const summary = data.summary || {};
    if (countNode) {
      countNode.textContent = `${items.length} 类缺口`;
    }
    summaryNode.innerHTML = renderKnowledgeGapSummary(summary);
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

function renderKnowledgeGapSummary(summary = {}) {
  const sceneCounts = summary.sceneCounts || {};
  return `
    ${renderGapSummaryCard("历史产物", summary.artifactCount || 0, "已纳入聚合分析的问答、培训、交接和设计产物")}
    ${renderGapSummaryCard("缺口类型", summary.gapTypeCount || 0, "按缺口描述合并后的问题类别")}
    ${renderGapSummaryCard("缺口出现", summary.totalGapOccurrences || 0, "历史产物中累计出现的缺口次数")}
    ${renderGapSummaryCard("高风险缺口", summary.highSeverityCount || 0, "建议优先补充文档或人工复核")}
    ${renderGapSummaryCard("设计缺口", sceneCounts.design || 0, "来自设计辅助产物")}
    ${renderGapSummaryCard("交接缺口", sceneCounts.handover || 0, "来自项目交接产物")}
  `;
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
      <td><strong>${escapeHtml(item.gapType || "知识缺口")}</strong></td>
      <td>${escapeHtml(scenes || "待确认")}</td>
      <td>${escapeHtml(item.impactScope || "待确认影响范围")}</td>
      <td>${escapeHtml(docs)}</td>
      <td>${escapeHtml(item.count || 0)}</td>
      <td>${renderGapSeverityBadge(item.severity)}</td>
      <td>${escapeHtml(item.suggestion || "补充相关文档")}</td>
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
            <span>${escapeHtml(example.gapType || "知识缺口")} · ${escapeHtml(formatSceneMode(example.scene === "general" ? "chat" : example.scene || "chat"))}</span>
            <strong>${escapeHtml(example.description || "待补充缺口描述")}</strong>
            <p>${escapeHtml(example.artifactTitle || "历史产物")} · ${escapeHtml(formatShortTime(example.createdAt) || "未记录时间")}</p>
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
              <span>${escapeHtml(record.project)}</span>
              <span>${escapeHtml(record.creator)}</span>
              <time>${escapeHtml(formatShortTime(record.createdAt))}</time>
            </div>
          </div>
          <span class="citation-count">${escapeHtml(record.citationCount)} 份引用</span>
        </div>
        <p>${escapeHtml(record.summary)}</p>
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
      <p>${escapeHtml(detail.outputSummary)}</p>
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
      <div class="scenario-evidence-list one-column">${detail.citations.length ? detail.citations.map(renderScenarioCitation).join("") : renderEmptyState("暂无引用证据。")}</div>
    </section>
    <section class="detail-section">
      <h3>版本记录</h3>
      ${renderArtifactVersionTimeline(detail.versionRecords)}
    </section>
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

function renderHistoryStructuredOutput(detail) {
  const output = detail.structuredOutput || {};
  if (!output || !Object.keys(output).length) {
    return renderEmptyState("暂无结构化产物。", "该记录可能来自旧版本地 mock，或生成时没有返回 structuredOutput。");
  }
  if (detail.sceneMode === "design") {
    return renderHistoryDesignOutput(output);
  }
  if (detail.sceneMode === "handover") {
    return renderHistoryHandoverOutput(output);
  }
  return `
    <details class="history-json-preview" open>
      <summary>查看结构化 JSON</summary>
      <pre>${escapeHtml(JSON.stringify(output, null, 2).slice(0, 6000))}</pre>
    </details>
  `;
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
    "",
    "## 原始问题",
    detail.originalQuestion || "暂无原始问题",
    "",
    "## 输出摘要",
    detail.outputSummary || "暂无输出摘要",
    "",
    "## 人工复核备注",
    detail.humanNotes || "暂无复核备注",
    "",
    "## 质量评估",
    formatMarkdownValue(detail.qualityAssessment || {}),
    "",
    "## 结构化产物",
    "```json",
    JSON.stringify(detail.structuredOutput || {}, null, 2),
    "```",
    "",
    "## 引用证据",
    ...(detail.citations || []).map((item) => `- ${item.documentTitle || "知识库片段"}：${item.snippet || ""}`),
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
    toast("Workflow 映射已更新，本地 mock 生效。");
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
  toast("配置已保存，本地 mock 生效。");
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
      <p>${escapeHtml(citation.snippet)}</p>
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
  if (text.includes("高")) {
    return "high";
  }
  if (text.includes("低")) {
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
      ${renderStructuredCountCard("设计辅助", sceneCounts.design || 0)}
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
          : '<div class="empty-inline">暂无历史产物，建议先运行设计辅助或交接模式。</div>'
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
  const vectorEnabled = ragInfo.vectorIndexEnabled ? "已启用" : "未启用";
  const lexicalFallback = ragInfo.lexicalFallback ? "已触发 / 可用" : "未触发";
  return `
    <div class="detail-grid">
      ${renderDetailItem("Chunk 数量", `${ragInfo.chunkCount ?? documentItem.chunkCount ?? 0}`)}
      ${renderDetailItem("字符数", `${formatNumber(ragInfo.charCount ?? documentItem.charCount ?? 0)}`)}
      ${renderDetailItem("检索方式", ragInfo.retrievalMethod || "本地检索")}
      ${renderDetailItem("向量索引", vectorEnabled)}
      ${renderDetailItem("词法回退", lexicalFallback)}
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
      ${renderReferenceStat("设计辅助", stats.design || 0)}
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
    training: "培训模式",
    handover: "交接模式",
    design: "设计辅助",
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
  return fallback || "Unknown error";
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

  const debugPanel = renderDesignDebugPanel(result);
  const intermediateDocumentBlock = renderDesignIntermediateDocument(result);

  container.innerHTML = `
    <section class="design-summary-card">
      <div>
        <p class="eyebrow">${escapeHtml(result.outputTypeLabel || result.outputType)}</p>
        <h3>${escapeHtml(stripMarkdownDecorators(result.title))}</h3>
        ${renderRichTextBlock(result.inputQuestion, "compact-rich-answer")}
      </div>
      <div class="design-summary-meta">
        <span>${escapeHtml(result.project)}</span>
        <span>${escapeHtml(result.granularity || "标准")}</span>
        ${renderEvidenceLevelBadge(result.evidenceLevel)}
      </div>
    </section>
    ${debugPanel}
    ${intermediateDocumentBlock}
    ${renderDesignTabContent(result)}
  `;
  scheduleDesignDiagramRender(result);
}

function renderDesignDebugPanel(result) {
  const queryDesigner = result?.queryDesigner || {};
  const evidenceCollector = result?.evidenceCollector || {};
  const answerGenerator = result?.answerGenerator || {};
  const validator = result?.validator || {};
  const pipelineSteps = Array.isArray(result?.pipelineSteps) ? result.pipelineSteps.filter(Boolean) : [];
  const designedQueries = Array.isArray(queryDesigner.queries) ? queryDesigner.queries.filter(Boolean) : [];
  const evidenceItems = Array.isArray(evidenceCollector.evidence) ? evidenceCollector.evidence.filter(Boolean) : [];
  const missingInformation = Array.isArray(result?.missingInformation) ? result.missingInformation.filter(Boolean) : [];
  const uncertainPoints = Array.isArray(result?.uncertainPoints) ? result.uncertainPoints.filter(Boolean) : [];
  const unsupportedClaims = Array.isArray(validator.unsupported_claims) ? validator.unsupported_claims.filter(Boolean) : [];
  const claimMappings = Array.isArray(answerGenerator.evidence_mapping) ? answerGenerator.evidence_mapping.filter(Boolean) : [];
  const citations = Array.isArray(result?.citations) ? result.citations.filter(Boolean) : [];
  const structuredSource = String(result?.structuredSource || "unknown");
  const isFallback = structuredSource.toLowerCase().includes("fallback");
  const answerText = String(answerGenerator.answer || result?.summary || "");
  const evidenceLengthItems = evidenceItems.map((item, index) => {
    const source = item?.source || `evidence-${index + 1}`;
    const section = item?.section || "chunk";
    const contentLength = getTextLength(item?.content);
    const relevanceLength = getTextLength(item?.relevance);
    return `
      <li>
        <strong>${escapeHtml(`${source}#${section}`)}</strong>
        <span>content=${contentLength} chars</span>
        <span>relevance=${relevanceLength} chars</span>
      </li>
    `;
  });

  return `
    <section class="scenario-section">
      <h3>设计调试信息</h3>
      <div class="design-summary-meta">
        <span>${escapeHtml(`structuredSource: ${structuredSource}`)}</span>
        <span>${escapeHtml(`fallback: ${isFallback ? "yes" : "no"}`)}</span>
        <span>${escapeHtml(`evidence: ${evidenceItems.length}`)}</span>
        <span>${escapeHtml(`citations: ${citations.length}`)}</span>
        <span>${escapeHtml(`useCases: ${(result?.useCases || []).length}`)}</span>
        <span>${escapeHtml(`functions: ${(result?.functionList || []).length}`)}</span>
        <span>${escapeHtml(`modules: ${(result?.moduleSuggestions || []).length}`)}</span>
      </div>
      <dl class="design-dl compact">
        <div>
          <dt>Pipeline</dt>
          <dd>${escapeHtml(result?.pipelineVersion || "unknown")}</dd>
        </div>
        <div>
          <dt>Steps</dt>
          <dd>${escapeHtml(pipelineSteps.join(" -> ") || "unknown")}</dd>
        </div>
        <div>
          <dt>Answer Length</dt>
          <dd>${escapeHtml(`${getTextLength(answerText)} chars`)}</dd>
        </div>
      </dl>
      <dl class="design-dl">
        <div>
          <dt>Designed Queries</dt>
          <dd>${renderDebugList(designedQueries, "No designed queries.")}</dd>
        </div>
        <div>
          <dt>Evidence Lengths</dt>
          <dd>${evidenceLengthItems.length ? `<ul class="scenario-bullet-list">${evidenceLengthItems.join("")}</ul>` : '<div class="empty-inline">No evidence items.</div>'}</dd>
        </div>
        <div>
          <dt>Missing Information</dt>
          <dd>${renderDebugList(missingInformation, "No missing-information items.")}</dd>
        </div>
        <div>
          <dt>Uncertain Points</dt>
          <dd>${renderDebugList(uncertainPoints, "No uncertain points.")}</dd>
        </div>
        <div>
          <dt>Unsupported Claims</dt>
          <dd>${renderDebugList(unsupportedClaims, "No unsupported claims.")}</dd>
        </div>
        <div>
          <dt>Claim Mappings</dt>
          <dd>${escapeHtml(`${claimMappings.length}`)}</dd>
        </div>
      </dl>
    </section>
  `;
}

function renderDebugList(items, emptyText) {
  const list = Array.isArray(items) ? items.filter((item) => String(item || "").trim()) : [];
  if (!list.length) {
    return `<div class="empty-inline">${escapeHtml(emptyText)}</div>`;
  }
  return `<ul class="scenario-bullet-list">${list.map((item) => `<li>${renderRichTextBlock(item, "compact-rich-answer inline-rich-answer")}</li>`).join("")}</ul>`;
}

function getTextLength(value) {
  return String(value || "").trim().length;
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

function renderAnswerCard(message) {
  const sections = getAnswerSections(message);
  const evidenceLevel = message.evidenceLevel || inferEvidenceLevel(message.citationItems || []);
  const answerMode = getAnswerModeLabel(message.answerMode || document.getElementById("chat-answer-mode")?.value || "evidence");
  const validatorBlock = renderValidatorSummary(message.validator);
  const pipelineBlock = renderPipelineSummary(message);

  return `
    <article class="answer-card chat-message">
      <div class="answer-card-head">
        <div>
          <p class="eyebrow">RAG Answer</p>
          <h2>Knowledge-grounded answer</h2>
        </div>
        <div class="answer-card-tags">
          <span>${escapeHtml(answerMode)}</span>
          ${renderEvidenceLevelBadge(evidenceLevel)}
        </div>
      </div>
      <div class="answer-section conclusion">
        <h3>Conclusion</h3>
        <div class="rich-answer">${renderRichText(sections.conclusion)}</div>
      </div>
      <div class="answer-grid">
        <section class="answer-section">
          <h3>Evidence</h3>
          <div class="rich-answer">${renderRichText(sections.evidence)}</div>
        </section>
        <section class="answer-section">
          <h3>Suggestions</h3>
          <div class="rich-answer">${renderRichText(sections.suggestion)}</div>
        </section>
      </div>
      <section class="answer-section uncertainty">
        <h3>Uncertainty</h3>
        <div class="rich-answer">${renderRichText(sections.uncertainty)}</div>
      </section>
      ${validatorBlock}
      ${pipelineBlock}
    </article>
  `;
}

function getAnswerSections(message) {
  if (message.structuredAnswer) {
    return message.structuredAnswer;
  }

  const citationSummary = (message.citationItems || [])
    .slice(0, 2)
    .map((citation) => citation.snippet)
    .join("\n");

  return {
    conclusion: message.content || "当前回答为空。",
    evidence: citationSummary || "当前回答没有足够的引用证据。",
    suggestion: message.nextActions?.[0] || "建议继续补充相关文档后再确认结论。",
    uncertainty: message.risks?.[0] || "当前回答基于已有知识库片段生成，未入库资料不会被覆盖。",
  };
}

function renderValidatorSummary(validator = {}) {
  const validClaims = Array.isArray(validator.valid_claims) ? validator.valid_claims.filter(Boolean) : [];
  const unsupportedClaims = Array.isArray(validator.unsupported_claims) ? validator.unsupported_claims.filter(Boolean) : [];
  const uncertainClaims = Array.isArray(validator.uncertain_claims) ? validator.uncertain_claims.filter(Boolean) : [];
  const advice = String(validator.final_revision_advice || "").trim();

  if (!validClaims.length && !unsupportedClaims.length && !uncertainClaims.length && !advice) {
    return "";
  }

  const lines = [];
  if (validClaims.length) {
    lines.push(`Supported claims:\n${validClaims.map((item) => `- ${item}`).join("\n")}`);
  }
  if (unsupportedClaims.length) {
    lines.push(`Unsupported claims:\n${unsupportedClaims.map((item) => `- ${item}`).join("\n")}`);
  }
  if (uncertainClaims.length) {
    lines.push(`Uncertain claims:\n${uncertainClaims.map((item) => `- ${item}`).join("\n")}`);
  }
  if (advice) {
    lines.push(`Revision advice:\n- ${advice}`);
  }

  return `
    <section class="answer-section">
      <h3>Validation</h3>
      <div class="rich-answer">${renderRichText(lines.join("\n\n"))}</div>
    </section>
  `;
}

function renderPipelineSummary(message = {}) {
  const queryDesigner = message.queryDesigner || {};
  const evidenceCollector = message.evidenceCollector || {};
  const answerGenerator = message.answerGenerator || {};
  const pipelineVersion = message.pipelineVersion || "";
  const pipelineSteps = Array.isArray(message.pipelineSteps) ? message.pipelineSteps.filter(Boolean) : [];
  const designedQueries = Array.isArray(queryDesigner.queries) ? queryDesigner.queries.filter(Boolean) : [];
  const evidenceCount = Array.isArray(evidenceCollector.evidence) ? evidenceCollector.evidence.length : 0;
  const mappingCount = Array.isArray(answerGenerator.evidence_mapping) ? answerGenerator.evidence_mapping.length : 0;

  if (!pipelineVersion && !pipelineSteps.length && !designedQueries.length && !evidenceCount && !mappingCount) {
    return "";
  }

  const lines = [];
  if (pipelineVersion) {
    lines.push(`Pipeline version: ${pipelineVersion}`);
  }
  if (pipelineSteps.length) {
    lines.push(`Pipeline steps: ${pipelineSteps.join(" -> ")}`);
  }
  if (designedQueries.length) {
    lines.push(`Designed queries:\n${designedQueries.map((item) => `- ${item}`).join("\n")}`);
  }
  if (typeof queryDesigner.reason === "string" && queryDesigner.reason.trim()) {
    lines.push(`Query rationale:\n- ${queryDesigner.reason.trim()}`);
  }
  lines.push(`Evidence items: ${evidenceCount}`);
  lines.push(`Claim-evidence mappings: ${mappingCount}`);

  return `
    <section class="answer-section">
      <h3>Pipeline</h3>
      <div class="rich-answer">${renderRichText(lines.join("\n\n"))}</div>
    </section>
  `;
}
