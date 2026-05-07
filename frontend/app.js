const STORAGE_KEYS = {
  history: "course_v1_history",
  settings: "course_v1_settings",
  health: "course_v1_health",
};

const defaultSettings = {
  baseUrl: "http://127.0.0.1:8088/api",
  user: "course-demo-user",
  defaultProject: "企业软件工程辅助系统",
};

const state = {
  documents: [],
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
  general: { resultId: "general-result" },
  training: { resultId: "training-result" },
  handover: { resultId: "handover-result" },
  design: { resultId: "design-result" },
};

document.addEventListener("DOMContentLoaded", async () => {
  bindNavigation();
  bindDashboardActions();
  bindDocumentForm();
  bindScenarioForms();
  bindSettings();
  bindHistoryActions();
  hydrateSettingsForm();
  renderAll();

  try {
    await syncBackendState();
  } catch (error) {
    setHealthDebug(`初始化失败: ${error.message}`);
    renderDashboard();
    renderHealth();
    toast(`初始化失败: ${error.message}`);
  }
});

function createDefaultHealthState() {
  return {
    backend: {
      status: "pending",
      message: "等待检测",
    },
    lastDebug: "还没有执行连接测试。",
    scenes: {
      general: { status: "pending", configured: false, message: "等待检测", source: "Dify Lite", lastChecked: "" },
      training: { status: "pending", configured: false, message: "等待检测", source: "Dify Lite", lastChecked: "" },
      handover: { status: "pending", configured: false, message: "等待检测", source: "Dify Lite", lastChecked: "" },
      design: { status: "pending", configured: false, message: "等待检测", source: "Dify Lite", lastChecked: "" },
    },
  };
}

function normalizeHealthState(raw) {
  const fallback = createDefaultHealthState();
  return {
    backend: {
      ...fallback.backend,
      ...(raw?.backend || {}),
    },
    lastDebug: raw?.lastDebug || fallback.lastDebug,
    scenes: {
      general: { ...fallback.scenes.general, ...(raw?.scenes?.general || {}) },
      training: { ...fallback.scenes.training, ...(raw?.scenes?.training || {}) },
      handover: { ...fallback.scenes.handover, ...(raw?.scenes?.handover || {}) },
      design: { ...fallback.scenes.design, ...(raw?.scenes?.design || {}) },
    },
  };
}

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
  document.getElementById("seed-demo").addEventListener("click", async () => {
    await syncBackendState();
    toast("已同步后端数据。");
  });

  document.getElementById("open-settings").addEventListener("click", () => {
    activatePanel("settings");
  });
}

function bindDocumentForm() {
  const form = document.getElementById("document-form");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const fileInput = form.querySelector("[name=file]");
    const file = fileInput.files?.[0];
    if (!file) {
      toast("请先选择文件。");
      return;
    }

    const button = form.querySelector("button[type=submit]");
    button.disabled = true;
    button.textContent = "上传中...";

    try {
      const payload = new FormData(form);
      if (!String(payload.get("project") || "").trim()) {
        payload.set("project", state.settings.defaultProject);
      }

      const result = await requestJson(`${normalizeBaseUrl(state.settings.baseUrl)}/documents/import`, {
        method: "POST",
        body: payload,
      });

      await syncBackendState();
      form.reset();
      form.querySelector("[name=version]").value = "v1.0";
      form.querySelector("[name=project]").value = state.settings.defaultProject;
      toast(`文档已入库，共切分 ${result.chunks_indexed || 0} 个片段。`);
    } catch (error) {
      toast(`上传失败: ${error.message}`);
    } finally {
      button.disabled = false;
      button.textContent = "上传并入库";
    }
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
      if (!payload.project) {
        payload.project = state.settings.defaultProject;
      }

      container.classList.remove("empty-state");
      container.classList.add("loading");
      container.textContent = "系统正在整理结果，请稍候...";

      try {
        const result = await runScene(scene, payload);
        container.classList.remove("loading");
        renderResult(container, result);
        rememberResult(scene, payload, result);
        updateHealth(scene, {
          status: "ok",
          configured: hasBackendConfigured(),
          message: result.warning || "真实接口返回成功。",
          source: result.source || "Dify Lite",
          lastChecked: new Date().toISOString(),
        });
        if (result.warning) {
          setHealthDebug(`${sceneNames[scene]}: ${result.warning}`);
        }
      } catch (error) {
        container.classList.remove("loading");
        container.classList.add("empty-state");
        container.textContent = `请求失败: ${error.message}`;
        updateHealth(scene, {
          status: "error",
          configured: hasBackendConfigured(),
          message: error.message,
          source: "Dify Lite",
          lastChecked: new Date().toISOString(),
        });
        setHealthDebug(`${sceneNames[scene]}: ${error.message}`);
      } finally {
        renderDashboard();
        renderHistory();
        renderStats();
        renderHealth();
        persistState();
      }
    });
  });
}

function bindSettings() {
  const form = document.getElementById("settings-form");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    state.settings = {
      baseUrl: normalizeBaseUrl(String(formData.get("baseUrl") || "").trim()) || defaultSettings.baseUrl,
      user: String(formData.get("user") || "").trim() || defaultSettings.user,
      defaultProject: String(formData.get("defaultProject") || "").trim() || defaultSettings.defaultProject,
    };
    markHealthPending("配置已更新，建议重新执行连接测试。");
    persistState();
    renderStats();
    renderDashboard();
    renderHealth();
    await syncBackendState();
    toast("后端配置已保存。");
  });

  document.getElementById("test-all-connections").addEventListener("click", async () => {
    await testAllConnections();
  });

  document.getElementById("health-check-list").addEventListener("click", async (event) => {
    const button = event.target.closest("[data-test-scene]");
    if (!button) {
      return;
    }
    await testConnection(button.dataset.testScene);
  });

  document.getElementById("reset-settings").addEventListener("click", async () => {
    state.settings = structuredClone(defaultSettings);
    state.health = createDefaultHealthState();
    persistState();
    hydrateSettingsForm();
    await syncBackendState();
    toast("已恢复默认配置。");
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
            settings: state.settings,
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
    anchor.download = "frontend-export.json";
    anchor.click();
    URL.revokeObjectURL(url);
  });
}

async function syncBackendState() {
  await refreshBackendHealth();
  await refreshDocuments();
  renderAll();
}

async function refreshBackendHealth() {
  const baseUrl = normalizeBaseUrl(state.settings.baseUrl);
  if (!baseUrl) {
    throw new Error("请先配置后端 API 地址。");
  }

  try {
    const data = await requestJson(`${baseUrl}/health`);
    state.health.backend = {
      status: "ok",
      message: `服务正常，集合 ${data.collections ?? 0} 个，文档 ${data.documents ?? 0} 个。`,
    };
    if (!state.health.lastDebug || state.health.lastDebug === "还没有执行连接测试。") {
      setHealthDebug("后端健康检查成功。");
    }
  } catch (error) {
    state.health.backend = {
      status: "error",
      message: error.message,
    };
    setHealthDebug(`后端健康检查失败: ${error.message}`);
    throw error;
  } finally {
    persistState();
  }
}

async function refreshDocuments() {
  const baseUrl = normalizeBaseUrl(state.settings.baseUrl);
  const data = await requestJson(`${baseUrl}/documents`);
  state.documents = Array.isArray(data.items) ? data.items : [];
}

async function runScene(scene, payload) {
  const baseUrl = normalizeBaseUrl(state.settings.baseUrl);
  if (!baseUrl) {
    throw new Error("请先配置后端 API 地址。");
  }

  return requestJson(`${baseUrl}/scenes/${scene}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      ...payload,
      user: state.settings.user,
      project: String(payload.project || state.settings.defaultProject || "").trim(),
    }),
  });
}

async function testAllConnections() {
  await refreshBackendHealth();
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
    configured: hasBackendConfigured(),
    message: "正在执行连接测试...",
    source: "Dify Lite",
    lastChecked: new Date().toISOString(),
  });
  renderHealth();
  renderDashboard();

  try {
    await runScene(scene, buildProbePayload(scene));
    updateHealth(scene, {
      status: "ok",
      configured: true,
      message: "场景接口可用。",
      source: "Dify Lite",
      lastChecked: new Date().toISOString(),
    });
    setHealthDebug(`${sceneNames[scene]}: 连接成功。`);
    toast(`${sceneNames[scene]}连接成功。`);
  } catch (error) {
    updateHealth(scene, {
      status: "error",
      configured: hasBackendConfigured(),
      message: error.message,
      source: "Dify Lite",
      lastChecked: new Date().toISOString(),
    });
    setHealthDebug(`${sceneNames[scene]}: ${error.message}`);
    toast(`${sceneNames[scene]}连接失败，请检查文档和配置。`);
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = `测试${sceneNames[scene]}`;
    }
    renderHealth();
    renderDashboard();
    renderStats();
    persistState();
  }
}

function buildProbePayload(scene) {
  const project = state.settings.defaultProject;
  switch (scene) {
    case "training":
      return {
        query: "请用培训模式说明当前系统中的知识库、检索和场景问答分别做什么。",
        role: "课程项目新成员",
        focus: "突出整体理解和上手顺序",
        project,
      };
    case "handover":
      return {
        query: "请用交接模式整理当前项目最重要的风险和待办。",
        role: "接手开发同学",
        focus: "强调进度、风险和待办",
        project,
      };
    case "design":
      return {
        query: "请为培训模式模块给出功能清单和模块边界建议。",
        module: "培训模式模块",
        focus: "输出功能清单和模块边界",
        project,
      };
    default:
      return {
        query: "请概括当前系统的主线能力。",
        focus: "突出知识库、检索和设计辅助的主线",
        project,
      };
  }
}

function rememberResult(scene, payload, result) {
  state.history.unshift({
    id: crypto.randomUUID(),
    scene,
    query: payload.query || payload.focus || "未命名问题",
    createdAt: new Date().toISOString(),
    source: result.source || "Dify Lite",
    summary: result.summary || "",
  });
  state.history = state.history.slice(0, 16);
  persistState();
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
    tbody.innerHTML = '<tr><td colspan="5">当前没有文档，请先导入资料。</td></tr>';
    return;
  }

  tbody.innerHTML = state.documents
    .map(
      (doc) => `
        <tr>
          <td>
            <strong>${escapeHtml(doc.title)}</strong>
            <div class="muted">${escapeHtml(doc.version || "v1.0")} / ${escapeHtml(doc.originalName || "")}</div>
          </td>
          <td>${escapeHtml(doc.type || "未分类")}</td>
          <td>${escapeHtml(doc.project || doc.collectionName || "默认项目")}</td>
          <td>${escapeHtml(doc.scene || "通用")}</td>
          <td><span class="status-tag">${escapeHtml(doc.status || "已入库")}</span></td>
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
    recent.textContent = "暂无结果。先去运行一个场景试试看。";
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
          <p class="history-meta">${formatTime(item.createdAt)} / ${escapeHtml(item.source)}</p>
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
              <p class="history-meta">${formatTime(item.createdAt)} / ${escapeHtml(sceneNames[item.scene])}</p>
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
  form.defaultProject.value = state.settings.defaultProject;

  const projectInput = document.querySelector('#document-form [name="project"]');
  if (projectInput && !projectInput.value) {
    projectInput.value = state.settings.defaultProject;
  }
  const generalProject = document.querySelector('#general [name="project"]');
  if (generalProject) {
    generalProject.value = state.settings.defaultProject;
  }
}

function renderIntegrationOverview() {
  const container = document.getElementById("integration-overview");
  container.innerHTML = getSceneOrder()
    .map((scene) => {
      const health = state.health.scenes[scene];
      return `
        <article class="integration-item">
          <div class="integration-top">
            <p class="integration-title">${escapeHtml(sceneNames[scene])}</p>
            <span class="status-tag ${getStatusClassName(health.status)}">${escapeHtml(getStatusLabel(health.status))}</span>
          </div>
          <p class="integration-meta">配置状态：${hasBackendConfigured() ? "已配置后端地址" : "未配置后端地址"}</p>
          <p class="integration-meta">数据来源：${escapeHtml(health.source || "Dify Lite")}</p>
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
      return `
        <article class="health-item">
          <div class="health-top">
            <p class="health-title">${escapeHtml(sceneNames[scene])}</p>
            <span class="status-tag ${getStatusClassName(health.status)}">${escapeHtml(getStatusLabel(health.status))}</span>
          </div>
          <p class="health-meta">后端状态：${escapeHtml(state.health.backend.message || "等待检测")}</p>
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

function renderResult(container, result) {
  const template = document.getElementById("result-template");
  const fragment = template.content.cloneNode(true);
  fragment.querySelector(".mode-pill").textContent = sceneNames[result.scene] || result.scene;
  fragment.querySelector(".source-pill").textContent = result.source || "Dify Lite";
  fragment.querySelector(".result-title").textContent = result.title || "结果";
  fragment.querySelector(".result-summary").textContent = result.summary || "";

  renderList(fragment.querySelector(".result-evidence"), result.evidence || []);
  renderList(fragment.querySelector(".result-risks"), result.risks || []);
  renderList(fragment.querySelector(".result-actions"), result.nextActions || []);

  const designOutput = fragment.querySelector(".design-output");
  designOutput.innerHTML = (result.artifacts || [])
    .map(
      (artifact) => `
        <div class="artifact">
          <h6>${escapeHtml(artifact.title || "产物")}</h6>
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
  citationList.innerHTML = (result.citations || [])
    .map(
      (item) => `
        <div class="citation">
          <strong>${escapeHtml(item.title || "引用资料")}</strong>
          <span>${escapeHtml(item.snippet || "")}</span>
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

function activatePanel(target) {
  document.querySelectorAll(".nav-link").forEach((item) => {
    item.classList.toggle("active", item.dataset.target === target);
  });
  document.querySelectorAll(".panel").forEach((panel) => {
    panel.classList.toggle("active", panel.id === target);
  });
}

function updateHealth(scene, patch) {
  state.health.scenes[scene] = {
    ...state.health.scenes[scene],
    ...patch,
  };
}

function setHealthDebug(message) {
  state.health.lastDebug = message;
}

function markHealthPending(message) {
  for (const scene of getSceneOrder()) {
    updateHealth(scene, {
      status: "pending",
      configured: hasBackendConfigured(),
      message,
      source: "Dify Lite",
      lastChecked: state.health.scenes[scene].lastChecked || "",
    });
  }
  setHealthDebug(message);
}

function getRuntimeModeLabel() {
  if (state.health.backend.status === "error") {
    return "后端异常";
  }
  const statuses = getSceneOrder().map((scene) => state.health.scenes[scene]?.status);
  if (statuses.some((status) => status === "ok")) {
    return "真实后端";
  }
  if (statuses.some((status) => status === "error")) {
    return "部分异常";
  }
  return "待检测";
}

function getStatusLabel(status) {
  switch (status) {
    case "ok":
      return "已连通";
    case "error":
      return "失败";
    default:
      return "待检测";
  }
}

function getStatusClassName(status) {
  switch (status) {
    case "ok":
      return "status-ok";
    case "error":
      return "status-error";
    default:
      return "status-pending";
  }
}

function getSceneOrder() {
  return ["general", "training", "handover", "design"];
}

function hasBackendConfigured() {
  return Boolean(normalizeBaseUrl(state.settings.baseUrl));
}

function persistState() {
  writeStorage(STORAGE_KEYS.history, state.history);
  writeStorage(STORAGE_KEYS.settings, state.settings);
  writeStorage(STORAGE_KEYS.health, state.health);
}

function normalizeBaseUrl(value) {
  return String(value || "").replace(/\/+$/, "");
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const payload = await parseJson(response);
  if (!response.ok) {
    throw new Error(payload.error || payload.message || `HTTP ${response.status}`);
  }
  return payload;
}

async function parseJson(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch (error) {
    return { message: text };
  }
}

function readStorage(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (error) {
    return fallback;
  }
}

function writeStorage(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function escapeHtml(input) {
  return String(input ?? "")
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
