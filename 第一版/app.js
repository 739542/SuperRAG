const STORAGE_KEYS = {
  documents: "course_v1_documents",
  history: "course_v1_history",
  settings: "course_v1_settings",
  health: "course_v1_health",
};

const defaultDocuments = [
  {
    id: crypto.randomUUID(),
    title: "企业私有知识驱动的软件工程辅助系统设计书",
    type: "设计文档",
    project: "企业软件工程辅助系统",
    version: "v1.0",
    scene: "设计",
    summary: "描述课题目标、系统分层、MVP 范围和课程交付路线。",
    status: "已入库",
  },
  {
    id: crypto.randomUUID(),
    title: "库存模块交接说明",
    type: "交接文档",
    project: "企业软件工程辅助系统",
    version: "v0.9",
    scene: "交接",
    summary: "记录库存模块当前进度、接口依赖、风险和待办清单。",
    status: "待同步 Dify",
  },
  {
    id: crypto.randomUUID(),
    title: "新人培训提纲",
    type: "培训资料",
    project: "企业软件工程辅助系统",
    version: "v1.0",
    scene: "培训",
    summary: "整理 RAG、知识库、Dify、工作流等基础概念，方便新人快速进入项目。",
    status: "已入库",
  },
];

const defaultSettings = {
  baseUrl: "http://localhost/v1",
  user: "course-demo-user",
  generalKey: "",
  trainingKey: "",
  handoverKey: "",
  designKey: "",
};

const state = {
  documents: readStorage(STORAGE_KEYS.documents, defaultDocuments),
  history: readStorage(STORAGE_KEYS.history, []),
  settings: readStorage(STORAGE_KEYS.settings, defaultSettings),
  health: normalizeHealthState(readStorage(STORAGE_KEYS.health, createDefaultHealthState())),
};

const sceneNames = {
  general: "通用检索",
  training: "培训模式",
  handover: "交接模式",
  design: "设计辅助",
};

const sceneTargets = {
  general: {
    resultId: "general-result",
    key: "generalKey",
    endpoint: "chat",
  },
  training: {
    resultId: "training-result",
    key: "trainingKey",
    endpoint: "workflow",
  },
  handover: {
    resultId: "handover-result",
    key: "handoverKey",
    endpoint: "workflow",
  },
  design: {
    resultId: "design-result",
    key: "designKey",
    endpoint: "workflow",
  },
};

function createDefaultHealthState() {
  return {
    lastDebug: "还没有执行连接测试。",
    scenes: {
      general: {
        status: "pending",
        configured: false,
        message: "等待检测",
        source: "Mock",
        lastChecked: "",
      },
      training: {
        status: "pending",
        configured: false,
        message: "等待检测",
        source: "Mock",
        lastChecked: "",
      },
      handover: {
        status: "pending",
        configured: false,
        message: "等待检测",
        source: "Mock",
        lastChecked: "",
      },
      design: {
        status: "pending",
        configured: false,
        message: "等待检测",
        source: "Mock",
        lastChecked: "",
      },
    },
  };
}

function normalizeHealthState(raw) {
  const fallback = createDefaultHealthState();
  return {
    lastDebug: raw?.lastDebug || fallback.lastDebug,
    scenes: {
      general: { ...fallback.scenes.general, ...(raw?.scenes?.general || {}) },
      training: { ...fallback.scenes.training, ...(raw?.scenes?.training || {}) },
      handover: { ...fallback.scenes.handover, ...(raw?.scenes?.handover || {}) },
      design: { ...fallback.scenes.design, ...(raw?.scenes?.design || {}) },
    },
  };
}

document.addEventListener("DOMContentLoaded", () => {
  bindNavigation();
  bindDashboardActions();
  bindDocumentForm();
  bindScenarioForms();
  bindSettings();
  bindHistoryActions();
  hydrateSettingsForm();
  renderAll();
});

function bindNavigation() {
  const links = [...document.querySelectorAll(".nav-link")];
  links.forEach((link) => {
    link.addEventListener("click", () => {
      const target = link.dataset.target;
      links.forEach((item) => item.classList.toggle("active", item === link));
      document.querySelectorAll(".panel").forEach((panel) => {
        panel.classList.toggle("active", panel.id === target);
      });
    });
  });
}

function bindDashboardActions() {
  document.getElementById("seed-demo").addEventListener("click", () => {
    state.documents = structuredClone(defaultDocuments);
    state.history = [];
    persistState();
    renderAll();
    toast("已恢复演示数据。");
  });

  document.getElementById("open-settings").addEventListener("click", () => {
    activatePanel("settings");
  });
}

function bindDocumentForm() {
  const form = document.getElementById("document-form");
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    state.documents.unshift({
      id: crypto.randomUUID(),
      title: String(formData.get("title") || "").trim(),
      type: String(formData.get("type") || "").trim(),
      project: String(formData.get("project") || "").trim(),
      version: String(formData.get("version") || "").trim(),
      scene: String(formData.get("scene") || "").trim(),
      summary: String(formData.get("summary") || "").trim(),
      status: "待同步 Dify",
    });
    persistState();
    renderDocuments();
    renderStats();
    form.reset();
    form.querySelector("[name=version]").value = "v1.0";
    toast("文档元数据已加入本地知识库列表。");
  });
}

function bindScenarioForms() {
  document.querySelectorAll(".scenario-form").forEach((form) => {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const scene = form.dataset.scene;
      const target = sceneTargets[scene];
      const container = document.getElementById(target.resultId);
      const formData = new FormData(form);
      const payload = Object.fromEntries(formData.entries());
      container.classList.remove("empty-state");
      container.classList.add("loading");
      container.textContent = "系统正在整理结果，请稍候...";

      try {
        const result = await runScene(scene, payload);
        container.classList.remove("loading");
        renderResult(container, result);
        state.history.unshift({
          id: crypto.randomUUID(),
          scene,
          query: payload.query || payload.focus || "未命名问题",
          createdAt: new Date().toISOString(),
          source: result.source,
          summary: result.summary,
        });
        state.history = state.history.slice(0, 16);
        persistState();
        renderDashboard();
        renderHistory();
        renderStats();
      } catch (error) {
        container.classList.remove("loading");
        container.classList.add("empty-state");
        container.textContent = `请求失败：${error.message}`;
      }
    });
  });
}

function bindSettings() {
  const form = document.getElementById("settings-form");
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    state.settings = {
      baseUrl: normalizeBaseUrl(String(formData.get("baseUrl") || "").trim()) || defaultSettings.baseUrl,
      user: String(formData.get("user") || "").trim() || defaultSettings.user,
      generalKey: String(formData.get("generalKey") || "").trim(),
      trainingKey: String(formData.get("trainingKey") || "").trim(),
      handoverKey: String(formData.get("handoverKey") || "").trim(),
      designKey: String(formData.get("designKey") || "").trim(),
    };
    for (const scene of getSceneOrder()) {
      const configured = Boolean(state.settings[sceneTargets[scene].key]);
      state.health.scenes[scene] = {
        ...state.health.scenes[scene],
        configured,
        status: "pending",
        message: configured ? "配置已更新，建议重新测试连接。" : "等待检测",
        source: configured ? "Dify" : "Mock",
      };
    }
    state.health.lastDebug = "配置已更新，建议重新执行连接测试。";
    persistState();
    renderStats();
    renderDashboard();
    renderHealth();
    toast("Dify 配置已保存。");
  });

  document.getElementById("test-all-connections").addEventListener("click", async () => {
    await testAllConnections();
  });

  document.getElementById("health-check-list").addEventListener("click", async (event) => {
    const button = event.target.closest("[data-test-scene]");
    if (!button) {
      return;
    }
    const { testScene } = button.dataset;
    if (!testScene) {
      return;
    }
    await testConnection(testScene);
  });

  document.getElementById("reset-settings").addEventListener("click", () => {
    state.settings = structuredClone(defaultSettings);
    state.health = createDefaultHealthState();
    persistState();
    hydrateSettingsForm();
    renderStats();
    renderDashboard();
    renderHealth();
    toast("已切回 mock 模式。");
  });
}

function bindHistoryActions() {
  document.getElementById("clear-history").addEventListener("click", () => {
    state.history = [];
    persistState();
    renderHistory();
    renderDashboard();
    renderStats();
    toast("历史记录已清空。");
  });

  document.getElementById("export-data").addEventListener("click", () => {
    const blob = new Blob(
      [
        JSON.stringify(
          {
            exportedAt: new Date().toISOString(),
            documents: state.documents,
            history: state.history,
            settings: {
              ...state.settings,
              generalKey: maskSecret(state.settings.generalKey),
              trainingKey: maskSecret(state.settings.trainingKey),
              handoverKey: maskSecret(state.settings.handoverKey),
              designKey: maskSecret(state.settings.designKey),
            },
          },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "first-version-export.json";
    anchor.click();
    URL.revokeObjectURL(url);
  });
}

function renderAll() {
  renderDocuments();
  renderStats();
  renderHistory();
  renderDashboard();
  renderHealth();
}

function renderDocuments() {
  const tbody = document.getElementById("document-table");
  if (!state.documents.length) {
    tbody.innerHTML = '<tr><td colspan="5">当前没有文档，请先录入资料。</td></tr>';
    return;
  }

  tbody.innerHTML = state.documents
    .map(
      (doc) => `
        <tr>
          <td>
            <strong>${escapeHtml(doc.title)}</strong>
            <div class="muted">${escapeHtml(doc.version)}</div>
          </td>
          <td>${escapeHtml(doc.type)}</td>
          <td>${escapeHtml(doc.project)}</td>
          <td>${escapeHtml(doc.scene)}</td>
          <td><span class="status-tag">${escapeHtml(doc.status)}</span></td>
        </tr>
      `,
    )
    .join("");
}

function renderStats() {
  document.getElementById("doc-count").textContent = String(state.documents.length);
  document.getElementById("history-count").textContent = String(state.history.length);
  document.getElementById("runtime-mode").textContent = getRuntimeModeLabel();
}

function renderDashboard() {
  const recent = document.getElementById("recent-results");
  renderIntegrationOverview();
  if (!state.history.length) {
    recent.className = "recent-results empty-state";
    recent.textContent = "暂无结果。可以先去“培训模式”或“设计辅助”生成一条演示记录。";
    return;
  }

  recent.className = "recent-results";
  recent.innerHTML = state.history
    .slice(0, 3)
    .map(
      (item) => `
        <article class="history-item">
          <div class="history-top">
            <p class="history-query">${escapeHtml(item.query)}</p>
            <span class="status-tag">${escapeHtml(sceneNames[item.scene])}</span>
          </div>
          <p class="history-meta">${formatTime(item.createdAt)} · ${escapeHtml(item.source)}</p>
          <p class="muted">${escapeHtml(item.summary)}</p>
        </article>
      `,
    )
    .join("");
}

function renderHistory() {
  const container = document.getElementById("history-list");
  if (!state.history.length) {
    container.className = "history-list empty-state";
    container.textContent = "当前还没有保存的结果记录。";
    return;
  }

  container.className = "history-list";
  container.innerHTML = state.history
    .map(
      (item) => `
        <article class="history-item">
          <div class="history-top">
            <div>
              <p class="history-query">${escapeHtml(item.query)}</p>
              <p class="history-meta">${formatTime(item.createdAt)} · ${escapeHtml(sceneNames[item.scene])}</p>
            </div>
            <span class="status-tag">${escapeHtml(item.source)}</span>
          </div>
          <p class="muted">${escapeHtml(item.summary)}</p>
        </article>
      `,
    )
    .join("");
}

function hydrateSettingsForm() {
  const form = document.getElementById("settings-form");
  form.baseUrl.value = state.settings.baseUrl;
  form.user.value = state.settings.user;
  form.generalKey.value = state.settings.generalKey;
  form.trainingKey.value = state.settings.trainingKey;
  form.handoverKey.value = state.settings.handoverKey;
  form.designKey.value = state.settings.designKey;
}

function renderIntegrationOverview() {
  const container = document.getElementById("integration-overview");
  container.innerHTML = getSceneOrder()
    .map((scene) => {
      const health = state.health.scenes[scene];
      const configured = Boolean(state.settings[sceneTargets[scene].key]);
      return `
        <article class="integration-item">
          <div class="integration-top">
            <p class="integration-title">${escapeHtml(sceneNames[scene])}</p>
            <span class="status-tag ${getStatusClassName(health.status)}">${escapeHtml(getStatusLabel(health.status))}</span>
          </div>
          <p class="integration-meta">配置状态：${configured ? "已配置" : "未配置"}</p>
          <p class="integration-meta">数据来源：${escapeHtml(health.source || "Mock")}</p>
          <p class="integration-meta">最近状态：${escapeHtml(health.message || "等待检测")}</p>
        </article>
      `;
    })
    .join("");
}

function renderHealth() {
  const list = document.getElementById("health-check-list");
  list.innerHTML = getSceneOrder()
    .map((scene) => {
      const health = state.health.scenes[scene];
      const configured = Boolean(state.settings[sceneTargets[scene].key]);
      return `
        <article class="health-item">
          <div class="health-top">
            <p class="health-title">${escapeHtml(sceneNames[scene])}</p>
            <span class="status-tag ${getStatusClassName(health.status)}">${escapeHtml(getStatusLabel(health.status))}</span>
          </div>
          <p class="health-meta">配置状态：${configured ? "已配置 API Key" : "未配置 API Key"}</p>
          <p class="health-meta">最近检测：${escapeHtml(health.lastChecked ? formatTime(health.lastChecked) : "尚未检测")}</p>
          <p class="health-meta">最近结果：${escapeHtml(health.message || "等待检测")}</p>
          <div class="health-actions">
            <button class="ghost-button" type="button" data-test-scene="${scene}">测试${escapeHtml(sceneNames[scene])}</button>
          </div>
        </article>
      `;
    })
    .join("");

  const debugNode = document.getElementById("health-debug");
  debugNode.innerHTML = `
    <p class="code-title">最近一次连接诊断</p>
    <code>${escapeHtml(state.health.lastDebug || "还没有执行连接测试。")}</code>
  `;
}

async function runScene(scene, payload) {
  return requestScene(scene, payload, { fallbackToMock: true });
}

async function requestScene(scene, payload, options = {}) {
  const { fallbackToMock = false } = options;
  const config = sceneTargets[scene];
  const key = state.settings[config.key];
  const query = String(payload.query || "").trim();
  const baseUrl = normalizeBaseUrl(state.settings.baseUrl);

  if (!key || !baseUrl) {
    const message = "未配置基础地址或对应 API Key，已使用 mock。";
    updateHealth(scene, {
      status: fallbackToMock ? "mock" : "error",
      configured: false,
      message,
      source: "Mock",
      lastChecked: new Date().toISOString(),
    });
    setHealthDebug(`${sceneNames[scene]}：${message}`);
    if (fallbackToMock) {
      return buildMockResult(scene, payload, "Mock");
    }
    throw new Error(message);
  }

  try {
    if (config.endpoint === "chat") {
      const response = await fetch(`${baseUrl}/chat-messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          inputs: {
            scene_mode: scene,
            project: payload.project || "企业软件工程辅助系统",
            focus: payload.focus || "",
          },
          query,
          response_mode: "blocking",
          user: state.settings.user,
        }),
      });
      const result = extractDifyResult(scene, await parseJson(response), "Dify Chat");
      updateHealth(scene, {
        status: "ok",
        configured: true,
        message: "真实 chat 返回成功。",
        source: result.source,
        lastChecked: new Date().toISOString(),
      });
      setHealthDebug(`${sceneNames[scene]}：真实 chat 返回成功。`);
      return result;
    }

    const response = await fetch(`${baseUrl}/workflows/run`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        inputs: {
          question: query,
          role: payload.role || "",
          module: payload.module || "",
          focus: payload.focus || "",
          project: payload.project || "企业软件工程辅助系统",
        },
        response_mode: "blocking",
        user: state.settings.user,
      }),
    });
    const result = extractDifyResult(scene, await parseJson(response), "Dify Workflow");
    updateHealth(scene, {
      status: "ok",
      configured: true,
      message: "真实 workflow 返回成功。",
      source: result.source,
      lastChecked: new Date().toISOString(),
    });
    setHealthDebug(`${sceneNames[scene]}：真实 workflow 返回成功。`);
    return result;
  } catch (error) {
    const message = `真实接口失败：${error.message}`;
    updateHealth(scene, {
      status: fallbackToMock ? "mock" : "error",
      configured: true,
      message,
      source: "Dify",
      lastChecked: new Date().toISOString(),
    });
    setHealthDebug(`${sceneNames[scene]}：${message}`);
    if (fallbackToMock) {
      return buildMockResult(scene, payload, `Mock（接口回退：${error.message}）`);
    }
    throw error;
  }
}

async function testAllConnections() {
  for (const scene of getSceneOrder()) {
    await testConnection(scene);
  }
  toast("全部连接测试已完成。");
}

async function testConnection(scene) {
  const button = document.querySelector(`[data-test-scene="${scene}"]`);
  if (button) {
    button.disabled = true;
    button.textContent = "测试中...";
  }

  updateHealth(scene, {
    status: "pending",
    configured: Boolean(state.settings[sceneTargets[scene].key]),
    message: "正在执行连接测试...",
    source: "Dify",
    lastChecked: new Date().toISOString(),
  });
  renderHealth();
  renderDashboard();

  try {
    await requestScene(scene, buildProbePayload(scene), { fallbackToMock: false });
    toast(`${sceneNames[scene]}连接成功。`);
  } catch (error) {
    toast(`${sceneNames[scene]}连接失败，请检查配置。`);
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = `测试${sceneNames[scene]}`;
    }
    renderHealth();
    renderDashboard();
    renderStats();
  }
}

function buildProbePayload(scene) {
  switch (scene) {
    case "training":
      return {
        query: "请用培训模式说明 Dify 在本系统中的角色。",
        role: "课程项目成员",
        focus: "突出背景和学习建议",
        project: "企业软件工程辅助系统",
      };
    case "handover":
      return {
        query: "请用交接模式整理当前项目的关键风险和待办。",
        role: "接手开发同学",
        focus: "强调风险和待办",
        project: "企业软件工程辅助系统",
      };
    case "design":
      return {
        query: "请生成培训模式模块的功能清单和模块建议。",
        module: "培训模式模块",
        focus: "输出功能清单和模块建议",
        project: "企业软件工程辅助系统",
      };
    default:
      return {
        query: "请简要说明当前系统主线功能。",
        project: "企业软件工程辅助系统",
        focus: "突出知识库、检索、设计三段主线",
      };
  }
}

function extractDifyResult(scene, response, source) {
  const outputs =
    response?.data?.outputs ||
    response?.outputs ||
    response?.data?.data?.outputs ||
    response?.answer ||
    {};

  const textSummary =
    response?.answer ||
    response?.data?.answer ||
    outputs.answer ||
    outputs.summary ||
    outputs.result ||
    outputs.conclusion ||
    safeStringify(outputs);

  const evidence = toList(
    outputs.evidence ||
      outputs.references ||
      outputs.key_points ||
      response?.metadata?.retriever_resources?.map((item) => item.title),
  );

  const risks = toList(outputs.risks || outputs.risk || outputs.attentions);
  const nextActions = toList(outputs.next_actions || outputs.todo || outputs.actions);
  const artifacts = normalizeArtifacts(outputs, scene);
  const citations = normalizeCitations(response?.metadata?.retriever_resources || outputs.citations || []);

  return {
    scene,
    source,
    title: `${sceneNames[scene]}结果`,
    summary: textSummary || "接口已返回，但没有提取到明确文本内容。",
    evidence: evidence.length ? evidence : buildMockResult(scene, { query: "" }, source).evidence,
    risks: risks.length ? risks : buildMockResult(scene, { query: "" }, source).risks,
    nextActions: nextActions.length ? nextActions : buildMockResult(scene, { query: "" }, source).nextActions,
    artifacts: artifacts.length ? artifacts : buildMockResult(scene, { query: "" }, source).artifacts,
    citations: citations.length ? citations : buildMockCitations(scene),
  };
}

function buildMockResult(scene, payload, source) {
  const query = String(payload.query || "当前问题").trim();
  const project = String(payload.project || "企业软件工程辅助系统").trim();
  const relatedDocs = state.documents.filter(
    (doc) =>
      doc.project === project ||
      doc.scene === "通用" ||
      doc.scene === sceneNames[scene]?.replace("模式", "") ||
      doc.scene === scene,
  );
  const citations = buildMockCitations(scene, relatedDocs);

  const common = {
    scene,
    source,
    title: `${sceneNames[scene]}结果`,
    citations,
  };

  if (scene === "training") {
    return {
      ...common,
      summary: `围绕“${query}”，系统建议先理解业务背景，再掌握术语和调用链。Dify 在这套方案中承担知识检索与工作流编排底座，你们自己的系统负责把这些能力组织成培训页面和结构化输出。`,
      evidence: [
        "设计书强调项目目标是企业私有知识驱动的软件工程辅助，而不是普通聊天。",
        "当前方案采用 Dify 作为知识库、检索、工作流底座，减少重复造轮子。",
        "培训模式的重点是术语解释、背景梳理、学习路径和重点资料推荐。",
      ],
      risks: [
        "如果培训回答只是一段自由文本，老师会更难看出你们的业务设计价值。",
        "如果知识库分类过于随意，培训内容容易缺少上下文和证据支撑。",
      ],
      nextActions: [
        "把培训模式中的输出固定成“结论-背景-术语-学习建议-引用”。",
        "优先上传设计书、模块说明、交接文档作为训练素材。",
      ],
      artifacts: [
        {
          title: "建议展示结构",
          items: ["结论摘要", "背景说明", "核心术语", "学习路径", "引用依据"],
        },
      ],
    };
  }

  if (scene === "handover") {
    return {
      ...common,
      summary: `围绕“${query}”，系统建议把交接结果拆成当前进度、待办事项、外部依赖和风险提示四段。这样接手人既知道现在做到哪，也知道下一步该从哪里继续。`,
      evidence: [
        "交接模式的目标是让新接手成员快速获得当前状态、风险和责任边界。",
        "项目主线仍然是知识库 -> 检索 -> 设计，交接模式是其中的业务封装。",
        "当前第一版适合先把交接结果标准化，再逐步对接真实检索接口。",
      ],
      risks: [
        "如果没有对“未完成事项”和“接口依赖”单独列出，交接价值会明显下降。",
        "如果系统没有保存历史交接结果，后续回看会比较困难。",
      ],
      nextActions: [
        "把交接结果固定成“背景-当前进度-风险-待办-引用”。",
        "后续给每条交接结果关联一个来源文档和更新时间。",
      ],
      artifacts: [
        {
          title: "交接模板字段",
          items: ["当前完成度", "未完成任务", "风险项", "外部依赖", "责任建议"],
        },
      ],
    };
  }

  if (scene === "design") {
    return {
      ...common,
      summary: `围绕“${query}”，系统建议把第一版重点放在知识库管理、场景化检索、设计辅助三块。底层直接复用 Dify，上层用自己的页面组织业务流程，这样最符合课程项目节奏。`,
      evidence: [
        "设计书要求系统能够从私有知识中提炼设计准备所需信息，并输出结构化结果。",
        "Dify 已经具备知识库、RAG、工作流和模型调用，不需要在课设阶段重写底层。",
        "你们真正要体现的价值是培训模式、交接模式和设计产物生成。",
      ],
      risks: [
        "如果直接把 Dify 默认页面当成最终成品，项目辨识度会不够。",
        "如果第一版同时追求复杂权限和多租户，会超出课程作业节奏。",
      ],
      nextActions: [
        "先完成你们自己的前端业务壳，再逐步接 Dify 真接口。",
        "下一步优先把设计辅助输出固定成清晰的结构化卡片。",
      ],
      artifacts: [
        {
          title: "功能清单",
          items: ["知识库管理页", "通用检索页", "培训模式页", "交接模式页", "设计辅助页"],
        },
        {
          title: "文本用例草稿",
          items: [
            "用户选择设计辅助模式并输入设计目标",
            "系统检索相关资料并整理关键依据",
            "系统输出功能清单、用例、模块建议和风险",
          ],
        },
        {
          title: "模块划分建议",
          items: ["前端展示层", "业务封装层", "Dify 能力层", "知识治理与记录层"],
        },
      ],
    };
  }

  return {
    ...common,
    summary: `围绕“${query}”，系统先给出结论，再附带引用依据。第一版建议你们继续采用 Dify 作为底层知识检索能力，把重心放在业务页面和场景化输出上。`,
    evidence: [
      "课程项目更适合复用 Dify 的知识库与检索能力，而不是从零开发 RAG 框架。",
      "你们的项目主线是知识库 -> 检索 -> 设计，因此第一版更需要跑通闭环。",
      "结构化输出比普通聊天形式更能体现软件工程辅助系统的价值。",
    ],
    risks: [
      "如果通用检索没有引用依据，答辩时可信度会偏弱。",
      "如果没有明确场景模式，系统会看起来像普通聊天机器人。",
    ],
    nextActions: [
      "继续把通用检索和三种场景模式的结果结构统一。",
      "后续为通用检索接入 Dify Chat App 或 Workflow App。",
    ],
    artifacts: [
      {
        title: "建议输出结构",
        items: ["结论", "关键依据", "风险提示", "后续动作", "引用片段"],
      },
    ],
  };
}

function buildMockCitations(scene, docs = state.documents.slice(0, 2)) {
  return docs.slice(0, 3).map((doc) => ({
    title: doc.title,
    snippet: `${doc.summary}（适用场景：${doc.scene}，版本：${doc.version}）`,
    scene: doc.scene,
  }));
}

function renderResult(container, result) {
  const template = document.getElementById("result-template");
  const fragment = template.content.cloneNode(true);
  fragment.querySelector(".mode-pill").textContent = sceneNames[result.scene];
  fragment.querySelector(".source-pill").textContent = result.source;
  fragment.querySelector(".result-title").textContent = result.title;
  fragment.querySelector(".result-summary").textContent = result.summary;

  renderList(fragment.querySelector(".result-evidence"), result.evidence);
  renderList(fragment.querySelector(".result-risks"), result.risks);
  renderList(fragment.querySelector(".result-actions"), result.nextActions);

  const designOutput = fragment.querySelector(".design-output");
  designOutput.innerHTML = result.artifacts
    .map(
      (artifact) => `
        <div class="artifact">
          <h6>${escapeHtml(artifact.title)}</h6>
          ${
            artifact.items?.length
              ? `<ul class="bullet-list">${artifact.items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
              : `<p>${escapeHtml(artifact.content || "暂无")}</p>`
          }
        </div>
      `,
    )
    .join("");

  const citationList = fragment.querySelector(".citation-list");
  citationList.innerHTML = result.citations
    .map(
      (item) => `
        <div class="citation">
          <strong>${escapeHtml(item.title)}</strong>
          <span>${escapeHtml(item.snippet)}</span>
        </div>
      `,
    )
    .join("");

  container.innerHTML = "";
  container.appendChild(fragment);
}

function renderList(container, items) {
  container.innerHTML = items.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
}

function normalizeArtifacts(outputs, scene) {
  const artifacts = [];
  if (Array.isArray(outputs.artifacts)) {
    return outputs.artifacts.map((item, index) => ({
      title: item.title || `产物 ${index + 1}`,
      items: toList(item.items || item.content || item),
    }));
  }

  if (outputs.function_list || outputs.features) {
    artifacts.push({
      title: "功能清单",
      items: toList(outputs.function_list || outputs.features),
    });
  }

  if (outputs.use_cases || outputs.text_cases) {
    artifacts.push({
      title: "文本用例",
      items: toList(outputs.use_cases || outputs.text_cases),
    });
  }

  if (outputs.modules || outputs.module_suggestion) {
    artifacts.push({
      title: "模块建议",
      items: toList(outputs.modules || outputs.module_suggestion),
    });
  }

  if (!artifacts.length && scene === "design") {
    artifacts.push({
      title: "设计建议",
      items: toList(outputs),
    });
  }
  return artifacts;
}

function normalizeCitations(input) {
  if (!input || !Array.isArray(input)) {
    return [];
  }

  return input
    .map((item) => ({
      title: item.title || item.document_name || item.dataset_name || "引用资料",
      snippet: item.content || item.snippet || item.segment || item.text || "",
    }))
    .filter((item) => item.title || item.snippet);
}

function toList(value) {
  if (!value) {
    return [];
  }
  if (Array.isArray(value)) {
    return value.map((item) => String(item));
  }
  if (typeof value === "string") {
    return value
      .split(/\n|；|;/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  if (typeof value === "object") {
    return Object.entries(value).map(([key, item]) => `${key}：${item}`);
  }
  return [String(value)];
}

function activatePanel(id) {
  document.querySelectorAll(".nav-link").forEach((item) => {
    item.classList.toggle("active", item.dataset.target === id);
  });
  document.querySelectorAll(".panel").forEach((panel) => {
    panel.classList.toggle("active", panel.id === id);
  });
}

function persistState() {
  writeStorage(STORAGE_KEYS.documents, state.documents);
  writeStorage(STORAGE_KEYS.history, state.history);
  writeStorage(STORAGE_KEYS.settings, state.settings);
  writeStorage(STORAGE_KEYS.health, state.health);
}

function getSceneOrder() {
  return ["general", "training", "handover", "design"];
}

function updateHealth(scene, patch) {
  state.health.scenes[scene] = {
    ...state.health.scenes[scene],
    ...patch,
  };
  persistState();
}

function setHealthDebug(message) {
  state.health.lastDebug = message;
  persistState();
}

function getStatusLabel(status) {
  switch (status) {
    case "ok":
      return "已连通";
    case "mock":
      return "Mock 兜底";
    case "error":
      return "连接失败";
    default:
      return "待检测";
  }
}

function getStatusClassName(status) {
  switch (status) {
    case "ok":
      return "status-ok";
    case "mock":
      return "status-mock";
    case "error":
      return "status-error";
    default:
      return "status-pending";
  }
}

function getRuntimeModeLabel() {
  const statuses = getSceneOrder().map(scene => state.health.scenes[scene]?.status);
  if (statuses.some(status => status === "ok")) {
    return "Dify / Mock";
  }
  if (hasAnyKey()) {
    return "Dify Pending";
  }
  return "Mock";
}

function readStorage(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : structuredClone(fallback);
  } catch (error) {
    return structuredClone(fallback);
  }
}

function writeStorage(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function hasAnyKey() {
  return ["generalKey", "trainingKey", "handoverKey", "designKey"].some((key) => Boolean(state.settings[key]));
}

function normalizeBaseUrl(url) {
  if (!url) {
    return "";
  }
  return url.replace(/\/+$/, "");
}

async function parseJson(response) {
  const text = await response.text();
  if (!response.ok) {
    throw new Error(text || `HTTP ${response.status}`);
  }
  try {
    return text ? JSON.parse(text) : {};
  } catch (error) {
    return { answer: text };
  }
}

function safeStringify(value) {
  try {
    return JSON.stringify(value, null, 2);
  } catch (error) {
    return String(value || "");
  }
}

function escapeHtml(input) {
  return String(input)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatTime(iso) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function maskSecret(value) {
  if (!value) {
    return "";
  }
  if (value.length <= 6) {
    return "***";
  }
  return `${value.slice(0, 3)}***${value.slice(-3)}`;
}

function toast(message) {
  const node = document.createElement("div");
  node.textContent = message;
  node.style.position = "fixed";
  node.style.right = "20px";
  node.style.bottom = "20px";
  node.style.padding = "12px 14px";
  node.style.borderRadius = "14px";
  node.style.background = "rgba(31, 27, 23, 0.92)";
  node.style.color = "#fff3ea";
  node.style.boxShadow = "0 18px 38px rgba(31, 27, 23, 0.22)";
  node.style.zIndex = "9999";
  document.body.appendChild(node);
  setTimeout(() => {
    node.remove();
  }, 1800);
}
