/**
 * Settings service and adapter layer.
 * Reads dify-lite public config and keeps editable UI settings local.
 */
(function () {
  const mock = window.SuperRagMock || {};
  let settings = clone(mock.mockSettings || {});
  let workflows = clone(mock.mockWorkflows || []);
  let logs = clone(mock.mockLogs || []);

  function clone(value) {
    return structuredClone(value);
  }

  async function getSettings() {
    const config = await getBackendConfig();
    return clone({
      workflows: workflows.map(mapBackendWorkflowToWorkflow),
      retrieval: mapBackendRetrievalToRetrieval(config || settings.retrieval || {}),
      model: mapBackendModelToModel(config || settings.model || {}),
      logs: logs.map(mapBackendLogToLog),
    });
  }

  async function saveSettings(payload = {}) {
    settings = {
      ...settings,
      retrieval: {
        ...(settings.retrieval || {}),
        ...(payload.retrieval || {}),
      },
      model: {
        ...(settings.model || {}),
        ...(payload.model || {}),
      },
    };
    return {
      success: true,
      savedAt: nowText(),
      settings: clone(settings),
    };
  }

  async function testWorkflow(sceneCode) {
    let success = true;
    let errorReason = "";
    try {
      await window.SuperRagBackend?.requestJson?.("/health");
    } catch (error) {
      success = false;
      errorReason = error.message || String(error);
    }
    logs = [
      {
        id: `log-${Date.now()}`,
        time: nowText(),
        user: "course-demo-user",
        sceneMode: sceneCode,
        workflow: sceneCode,
        success,
        durationMs: 0,
        errorReason,
      },
      ...logs,
    ].slice(0, 20);
    return clone(logs[0]);
  }

  async function updateWorkflow(sceneCode, patch = {}) {
    workflows = workflows.map((workflow) =>
      workflow.sceneCode === sceneCode
        ? {
            ...workflow,
            ...patch,
          }
        : workflow,
    );
    return clone(workflows.find((workflow) => workflow.sceneCode === sceneCode));
  }

  function mapBackendWorkflowToWorkflow(raw = {}) {
    return {
      sceneCode: raw.sceneCode || raw.scene_code || "",
      sceneName: raw.sceneName || raw.scene_name || "",
      difyAppId: raw.difyAppId || raw.dify_app_id || "",
      difyWorkflowId: raw.difyWorkflowId || raw.dify_workflow_id || "",
      status: raw.status || "disabled",
    };
  }

  function mapBackendRetrievalToRetrieval(raw = {}) {
    return {
      topK: Number(raw.topK ?? raw.top_k ?? raw.max_context_chunks ?? 8),
      scoreThreshold: Number(raw.scoreThreshold ?? raw.score_threshold ?? 0.35),
      rerankEnabled: Boolean(raw.rerankEnabled ?? raw.rerank_enabled ?? true),
      knowledgeStrategy: raw.knowledgeStrategy || raw.knowledge_strategy || raw.embedding_engine || "hybrid",
      lowEvidenceHintEnabled: Boolean(raw.lowEvidenceHintEnabled ?? raw.low_evidence_hint_enabled ?? true),
    };
  }

  function mapBackendModelToModel(raw = {}) {
    return {
      modelName: raw.modelName || raw.model_name || (raw.model_enabled ? "configured-model" : "mock-rag-summary"),
      temperature: Number(raw.temperature ?? 0.3),
      maxTokens: Number(raw.maxTokens ?? raw.max_tokens ?? 2048),
      streamOutput: Boolean(raw.streamOutput ?? raw.stream_output ?? false),
    };
  }

  function mapBackendLogToLog(raw = {}) {
    return {
      id: raw.id || `log-${Date.now()}`,
      time: raw.time || raw.createdAt || raw.created_at || "",
      user: raw.user || raw.userName || raw.user_name || "course-demo-user",
      sceneMode: raw.sceneMode || raw.scene_mode || "",
      workflow: raw.workflow || raw.workflowId || raw.workflow_id || "",
      success: Boolean(raw.success),
      durationMs: Number(raw.durationMs ?? raw.duration_ms ?? 0),
      errorReason: raw.errorReason || raw.error_reason || "",
    };
  }

  async function getBackendConfig() {
    try {
      return await window.SuperRagBackend?.requestJson?.("/config");
    } catch (error) {
      return null;
    }
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

  window.settingsService = {
    getSettings,
    saveSettings,
    testWorkflow,
    updateWorkflow,
    mapBackendWorkflowToWorkflow,
    mapBackendRetrievalToRetrieval,
    mapBackendModelToModel,
    mapBackendLogToLog,
  };

  window.settingsApi = window.settingsService;
})();
