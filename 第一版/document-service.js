/**
 * Document service and adapter layer.
 *
 * The document management page should call window.documentService only. This
 * layer attempts to use the real dify-lite backend for document list/import,
 * and falls back to the existing mock API when the backend is unavailable or
 * an endpoint does not exist yet.
 */
(function () {
  const localDocumentOverrides = new Map();
  const locallyDeletedDocumentIds = new Set();

  function clone(value) {
    return structuredClone(value);
  }

  function getConfig() {
    return {
      API_BASE_URL: window.SuperRagConfig?.API_BASE_URL || "http://127.0.0.1:8088/api",
      DOCUMENT_API_TIMEOUT_MS: window.SuperRagConfig?.DOCUMENT_API_TIMEOUT_MS || 60000,
      USE_REAL_DOCUMENT_API: window.SuperRagConfig?.USE_REAL_DOCUMENT_API !== false,
    };
  }

  function getApi() {
    if (!window.SuperRagApi) {
      throw new Error("SuperRagApi is not loaded");
    }
    return window.SuperRagApi;
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

  function mapDocumentStatus(status) {
    const text = String(status || "").trim();
    const lower = text.toLowerCase();

    if (!text) {
      return "pending";
    }
    if (["indexed", "completed", "done"].includes(lower) || text.includes("已入库")) {
      return "indexed";
    }
    if (["indexing", "parsing", "processing"].includes(lower) || text.includes("解析中") || text.includes("处理中")) {
      return "indexing";
    }
    if (["failed", "error"].includes(lower) || text.includes("失败") || text.includes("异常")) {
      return "failed";
    }
    if (["pending", "waiting"].includes(lower) || text.includes("待处理") || text.includes("等待")) {
      return "pending";
    }

    return "pending";
  }

  function mapBackendDocumentToDocument(raw = {}) {
    const collectionId = raw.collectionId || raw.collection_id || raw.difyDatasetId || raw.dify_dataset_id || "";
    const id = raw.id || raw.documentId || raw.document_id || raw.difyDocumentId || raw.dify_document_id || "";
    const title =
      raw.title ||
      raw.name ||
      raw.fileName ||
      raw.file_name ||
      raw.originalName ||
      raw.original_name ||
      raw.filename ||
      "未命名文档";
    const type = raw.type || raw.doc_type || raw.documentType || raw.document_type || raw.fileType || raw.file_type || "Unknown";
    const project =
      raw.project ||
      raw.projectName ||
      raw.project_name ||
      raw.collectionName ||
      raw.collection_name ||
      "未归属项目";

    return {
      id,
      collectionId,
      collectionName: raw.collectionName || raw.collection_name || project,
      title,
      type,
      project,
      tags: normalizeStringList(raw.tags || raw.tagList || raw.tag_list),
      uploader: raw.uploader || raw.uploaderName || raw.uploader_name || raw.createdByName || "后端导入",
      uploaderId: raw.uploaderId || raw.uploader_id || raw.createdBy || "",
      version: raw.version || "v1.0",
      status: mapDocumentStatus(raw.status || raw.ingestionStatus || raw.ingestion_status),
      rawStatus: raw.status || raw.ingestionStatus || raw.ingestion_status || "",
      visibilityScope: raw.visibilityScope || raw.visibility_scope || raw.scopeName || "项目成员",
      visibilityScopeCode: raw.visibilityScopeCode || raw.visibility_scope_code || raw.scope || "",
      updatedAt: raw.updatedAt || raw.updated_at || raw.updateTime || raw.update_time || raw.createdAt || raw.created_at || "",
      createdAt: raw.createdAt || raw.created_at || "",
      summary: raw.summary || raw.description || "",
      keywords: normalizeStringList(raw.keywords || raw.keywordList || raw.keyword_list),
      difyDatasetId: raw.difyDatasetId || raw.dify_dataset_id || raw.datasetId || raw.dataset_id || collectionId,
      difyDocumentId: raw.difyDocumentId || raw.dify_document_id || raw.difyDocId || raw.dify_doc_id || id,
      originalName: raw.originalName || raw.original_name || raw.filename || "",
      chunkCount: raw.chunkCount ?? raw.chunk_count ?? 0,
      charCount: raw.charCount ?? raw.char_count ?? 0,
      scene: raw.scene || "通用",
      ragInfo: normalizeRagInfo(raw.ragInfo || raw.rag_info || raw.retrievalInfo || raw.retrieval_info),
      qualityChecks: normalizeQualityChecks(raw.qualityChecks || raw.quality_checks),
      qualityStatus: normalizeQualityStatus(raw.qualityStatus || raw.quality_status),
      qualityIssues: normalizeStringList(raw.qualityIssues || raw.quality_issues),
      referenceStats: normalizeReferenceStats(raw.referenceStats || raw.reference_stats),
    };
  }

  function mapBackendDocumentDetailToDocumentDetail(raw = {}) {
    const documentItem = mapBackendDocumentToDocument(raw);

    return {
      ...documentItem,
      knowledgeCategory:
        raw.knowledgeCategory ||
        raw.knowledge_category ||
        raw.categoryName ||
        raw.collectionName ||
        raw.collection_name ||
        inferKnowledgeCategory(documentItem),
      ingestionLogs: raw.ingestionLogs || raw.ingestion_logs || raw.logs || buildMockIngestionLogs(documentItem),
      chunksPreview: normalizeChunks(raw.chunksPreview || raw.chunks_preview || raw.chunks || []),
      referencedQuestionCount:
        raw.referencedQuestionCount ??
        raw.referenced_question_count ??
        raw.questionCount ??
        documentItem.referenceStats.total ??
        getMockCitationCount(documentItem.title),
    };
  }

  function normalizeRagInfo(value = {}) {
    const raw = value && typeof value === "object" ? value : {};
    return {
      chunkCount: Number(raw.chunkCount ?? raw.chunk_count ?? 0),
      charCount: Number(raw.charCount ?? raw.char_count ?? 0),
      retrievalMethod: raw.retrievalMethod || raw.retrieval_method || "本地检索",
      vectorStore: raw.vectorStore || raw.vector_store || "",
      vectorIndexEnabled: Boolean(raw.vectorIndexEnabled ?? raw.vector_index_enabled),
      lexicalFallback: Boolean(raw.lexicalFallback ?? raw.lexical_fallback),
      chunkSize: raw.chunkSize ?? raw.chunk_size ?? "",
      chunkOverlap: raw.chunkOverlap ?? raw.chunk_overlap ?? "",
    };
  }

  function normalizeQualityChecks(value = []) {
    if (!Array.isArray(value)) {
      return [];
    }
    return value
      .filter(Boolean)
      .map((item) => ({
        label: item.label || item.name || "质量检查",
        level: item.level || item.tone || "warn",
        message: item.message || item.description || "",
      }));
  }

  function normalizeQualityStatus(value = {}) {
    if (typeof value === "string") {
      return { label: value, level: value.includes("适合") ? "ok" : "warn" };
    }
    if (value && typeof value === "object") {
      return {
        label: value.label || value.name || "待检查",
        level: value.level || value.tone || "warn",
      };
    }
    return { label: "待检查", level: "warn" };
  }

  function normalizeReferenceStats(value = {}) {
    const raw = value && typeof value === "object" ? value : {};
    return {
      total: Number(raw.total ?? raw.referencedQuestionCount ?? 0),
      general: Number(raw.general ?? 0),
      training: Number(raw.training ?? 0),
      handover: Number(raw.handover ?? 0),
      design: Number(raw.design ?? 0),
      lastReferencedAt: raw.lastReferencedAt || raw.last_referenced_at || "",
      note: raw.note || "",
    };
  }

  function normalizeChunks(value = []) {
    if (!Array.isArray(value)) {
      return [];
    }
    return value.filter(Boolean).map((item) => ({
      id: item.id || item.chunkId || item.chunk_id || "",
      documentId: item.documentId || item.document_id || "",
      position: Number(item.position ?? item.index ?? 0),
      content: item.content || "",
      snippet: item.snippet || item.content || "",
      tokenCount: Number(item.tokenCount ?? item.token_count ?? 0),
      charCount: Number(item.charCount ?? item.char_count ?? String(item.content || "").length),
      sourceName: item.sourceName || item.source_name || item.sourceDocument || item.source_document || "",
      sourceDocument: item.sourceDocument || item.source_document || item.sourceName || item.source_name || "",
      searchable: item.searchable !== false,
      metadata: item.metadata || {},
    }));
  }

  function normalizeStringList(value) {
    if (Array.isArray(value)) {
      return value.filter(Boolean).map(String);
    }
    if (typeof value === "string" && value.trim()) {
      return value
        .split(/[,，、\s]+/)
        .map((item) => item.trim())
        .filter(Boolean);
    }
    return [];
  }

  function applyLocalDocumentState(documentItem) {
    const patch = localDocumentOverrides.get(documentItem.id);
    return patch ? { ...documentItem, ...patch } : documentItem;
  }

  function filterLocallyDeleted(documentItem) {
    return !locallyDeletedDocumentIds.has(documentItem.id);
  }

  function matchesText(documentItem, keyword) {
    if (!keyword) {
      return true;
    }

    const haystack = [
      documentItem.title,
      documentItem.type,
      documentItem.project,
      documentItem.uploader,
      documentItem.summary,
      ...(documentItem.tags || []),
      ...(documentItem.keywords || []),
    ]
      .join(" ")
      .toLowerCase();

    return haystack.includes(String(keyword).toLowerCase());
  }

  function matchesParams(documentItem, params = {}) {
    return (
      matchesText(documentItem, params.keyword) &&
      (!params.type || documentItem.type === params.type) &&
      (!params.project || documentItem.project === params.project) &&
      (!params.uploader || documentItem.uploader === params.uploader) &&
      (!params.status || documentItem.status === params.status) &&
      (!params.visibilityScope || documentItem.visibilityScope === params.visibilityScope)
    );
  }

  function sortByUpdatedAtDesc(a, b) {
    return getTimeValue(b.updatedAt) - getTimeValue(a.updatedAt);
  }

  async function getDocuments(params = {}) {
    const rawDocuments = await getDocumentsWithFallback(params);
    const list = rawDocuments
      .map(mapBackendDocumentToDocument)
      .map(applyLocalDocumentState)
      .filter(filterLocallyDeleted)
      .filter((documentItem) => matchesParams(documentItem, params))
      .sort(sortByUpdatedAtDesc);

    return {
      total: list.length,
      list: clone(list),
    };
  }

  async function getDocumentsWithFallback(params = {}) {
    try {
      const backendDocuments = await fetchBackendDocuments(params);
      if (backendDocuments) {
        return backendDocuments;
      }
    } catch (error) {
      warnFallback("获取真实文档列表失败，已回退到 mock 数据", error);
    }

    return getApi().getDocuments();
  }

  async function fetchBackendDocuments(params = {}) {
    const config = getConfig();
    if (!config.USE_REAL_DOCUMENT_API || !config.API_BASE_URL) {
      return null;
    }

    const query = new URLSearchParams();
    const collectionId = params.collectionId || params.collection_id || params.difyDatasetId;
    if (collectionId) {
      query.set("collection_id", collectionId);
    }

    const path = `/documents${query.toString() ? `?${query.toString()}` : ""}`;
    const response = await requestBackendJson(path);
    return Array.isArray(response.items) ? response.items : [];
  }

  async function getDocumentDetail(id) {
    try {
      const backendDetail = await fetchBackendDocumentDetail(id);
      if (backendDetail) {
        const mappedDetail = mapBackendDocumentDetailToDocumentDetail(backendDetail);
        if (!mappedDetail.chunksPreview?.length) {
          mappedDetail.chunksPreview = await fetchBackendDocumentChunks(id, 5);
        }
        const references = await fetchBackendDocumentReferences(id);
        if (references) {
          mappedDetail.referenceStats = normalizeReferenceStats({
            total: references.totalReferences,
            lastReferencedAt: references.lastReferencedAt,
            ...(references.referencesByScene || {}),
          });
          mappedDetail.referencedArtifacts = references.referencedArtifacts || [];
          mappedDetail.topReferencedChunks = references.topReferencedChunks || [];
          mappedDetail.referencedQuestionCount = references.totalReferences || 0;
        }
        return clone(applyLocalDocumentState(mappedDetail));
      }
    } catch (error) {
      warnFallback("获取真实文档详情失败，已回退到文档列表推导", error);
    }

    const rawDocuments = await getDocumentsWithFallback();
    const rawDocument = rawDocuments.find((documentItem) => {
      const mapped = mapBackendDocumentToDocument(documentItem);
      return mapped.id === id;
    });

    if (!rawDocument) {
      throw new Error("Document not found");
    }

    return clone(applyLocalDocumentState(mapBackendDocumentDetailToDocumentDetail(rawDocument)));
  }

  async function fetchBackendDocumentDetail(id) {
    const config = getConfig();
    if (!config.USE_REAL_DOCUMENT_API || !config.API_BASE_URL || !id) {
      return null;
    }
    return requestBackendJson(`/documents/${encodeURIComponent(id)}`);
  }

  async function fetchBackendDocumentChunks(id, limit = 5) {
    const config = getConfig();
    if (!config.USE_REAL_DOCUMENT_API || !config.API_BASE_URL || !id) {
      return [];
    }
    const response = await requestBackendJson(`/documents/${encodeURIComponent(id)}/chunks?limit=${encodeURIComponent(limit)}`);
    return normalizeChunks(response.items || []);
  }

  async function fetchBackendDocumentReferences(id) {
    const config = getConfig();
    if (!config.USE_REAL_DOCUMENT_API || !config.API_BASE_URL || !id) {
      return null;
    }
    try {
      return await requestBackendJson(`/documents/${encodeURIComponent(id)}/references`);
    } catch (error) {
      warnFallback("获取文档引用统计失败，继续展示基础详情", error);
      return null;
    }
  }

  async function uploadDocument(payload) {
    try {
      const backendDocument = await uploadDocumentToBackend(payload);
      if (backendDocument) {
        const mapped = mapBackendDocumentToDocument(backendDocument);
        const localPatch = buildUploadLocalPatch(payload);
        if (Object.keys(localPatch).length) {
          localDocumentOverrides.set(mapped.id, { ...(localDocumentOverrides.get(mapped.id) || {}), ...localPatch });
        }
        return clone(applyLocalDocumentState(mapped));
      }
    } catch (error) {
      warnFallback("真实上传接口失败，已回退到 mock 上传", error);
    }

    if (resolveUploadFile(payload)) {
      throw new Error("真实文档上传失败：请检查文件格式、后端状态或上传解析日志。");
    }

    const rawDocument = await getApi().createDocument({
      title: payload.title,
      type: payload.type,
      project: payload.project,
      tags: payload.tags,
      visibilityScope: payload.visibilityScope,
      status: "indexing",
    });

    return clone(mapBackendDocumentToDocument(rawDocument));
  }

  async function uploadDocumentToBackend(payload) {
    const config = getConfig();
    if (!config.USE_REAL_DOCUMENT_API || !config.API_BASE_URL) {
      return null;
    }

    const file = resolveUploadFile(payload);
    if (!file) {
      return null;
    }

    const formData = new FormData();
    formData.append("file", file);
    formData.append("title", payload.title || file.name || "未命名文档");
    formData.append("type", payload.type || "");
    formData.append("project", payload.project || "");
    formData.append("version", payload.version || "v1.0");
    formData.append("scene", payload.scene || "通用");
    formData.append("summary", payload.summary || "");
    formData.append("clean_enabled", String(payload.cleanEnabled ?? payload.clean_enabled ?? true));

    if (payload.chunkSize || payload.chunk_size) {
      formData.append("chunk_size", String(payload.chunkSize || payload.chunk_size));
    }
    if (payload.chunkOverlap || payload.chunk_overlap) {
      formData.append("chunk_overlap", String(payload.chunkOverlap || payload.chunk_overlap));
    }

    const response = await requestBackendJson("/documents/import", {
      method: "POST",
      body: formData,
    });

    return response.document || response;
  }

  function resolveUploadFile(payload) {
    if (payload.file) {
      return payload.file;
    }
    if (payload.upload) {
      return payload.upload;
    }
    // Compatibility with the current static page: the call site passes form
    // fields but not the File object yet, so the service reads the selected
    // file without changing UI behavior.
    return document.querySelector("#upload-form input[name='file']")?.files?.[0] || null;
  }

  function buildUploadLocalPatch(payload) {
    const patch = {};
    if (payload.tags?.length) {
      patch.tags = payload.tags;
    }
    if (payload.visibilityScope) {
      patch.visibilityScope = payload.visibilityScope;
    }
    return patch;
  }

  async function reindexDocument(id) {
    // TODO: backend currently has no POST /api/documents/{id}/reindex.
    // Keep the frontend interaction alive with a local/mock state transition.
    const detail = await getDocumentDetail(id);
    const patch = {
      status: "indexing",
      updatedAt: nowText(),
      summary: `${detail.summary || ""}（已提交重新入库任务）`,
    };
    localDocumentOverrides.set(id, { ...(localDocumentOverrides.get(id) || {}), ...patch });

    try {
      await getApi().updateDocument(id, patch);
    } catch (error) {
      warnFallback("mock 重新入库状态同步失败，仅保留本地状态", error);
    }

    return clone({ ...detail, ...patch });
  }

  async function deleteDocument(id) {
    try {
      await deleteDocumentFromBackend(id);
      locallyDeletedDocumentIds.add(id);
      return { success: true, id };
    } catch (error) {
      warnFallback("真实删除接口失败，仅保留本地删除状态", error);
    }

    locallyDeletedDocumentIds.add(id);
    try {
      await getApi().deleteDocument(id);
    } catch (error) {
      warnFallback("mock 删除同步失败，仅保留本地删除状态", error);
    }
    return { success: true, id };
  }

  async function deleteDocumentFromBackend(id) {
    const config = getConfig();
    if (!config.USE_REAL_DOCUMENT_API || !config.API_BASE_URL) {
      return null;
    }
    return requestBackendJson(`/documents/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
  }

  async function updateDocumentTags(id, tags) {
    // TODO: backend currently has no PATCH /api/documents/{id}/tags.
    // Store tag changes locally so the page behavior remains unchanged.
    const patch = { tags, updatedAt: nowText() };
    localDocumentOverrides.set(id, { ...(localDocumentOverrides.get(id) || {}), ...patch });

    try {
      const rawDocument = await getApi().updateDocument(id, patch);
      if (rawDocument) {
        return clone(applyLocalDocumentState(mapBackendDocumentToDocument(rawDocument)));
      }
    } catch (error) {
      warnFallback("mock 标签更新失败，仅保留本地标签状态", error);
    }

    const detail = await getDocumentDetail(id);
    return clone({ ...detail, ...patch });
  }

  async function requestBackendJson(path, options = {}) {
    const config = getConfig();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), config.DOCUMENT_API_TIMEOUT_MS);

    try {
      const response = await fetch(`${config.API_BASE_URL}${path}`, {
        ...options,
        signal: controller.signal,
      });
      const payload = await parseJson(response);
      if (!response.ok) {
        throw new Error(payload.error || payload.message || `HTTP ${response.status}`);
      }
      return payload;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async function parseJson(response) {
    const text = await response.text();
    if (!text) {
      return {};
    }
    try {
      return JSON.parse(text);
    } catch (error) {
      return { message: text };
    }
  }

  function inferKnowledgeCategory(documentItem) {
    if (documentItem.tags.includes("培训") || documentItem.scene === "training") {
      return "新人培训知识 / 学习路径";
    }
    if (documentItem.tags.includes("交接") || documentItem.scene === "handover") {
      return "项目交接知识 / 风险待办";
    }
    if (documentItem.tags.includes("接口")) {
      return "架构设计知识 / 接口规范";
    }
    if (documentItem.tags.includes("需求")) {
      return "需求分析知识 / 业务规则";
    }
    return documentItem.collectionName || "通用项目知识 / 待细分";
  }

  function buildMockIngestionLogs(documentItem) {
    const logs = {
      indexed: ["文档解析完成，已写入知识库检索索引。", "当前后端未提供入库日志接口，此处为前端兼容展示。"],
      indexing: ["文档已进入解析队列。", "等待后端补充重新入库接口后可展示真实任务进度。"],
      failed: ["解析任务失败，疑似格式异常或权限不足。", "等待重新入库或人工处理。"],
      pending: ["文档已登记，等待提交解析任务。", "尚未进入知识库索引。"],
    };

    return (logs[documentItem.status] || logs.pending).map((message, index) => ({
      time: index === 0 ? documentItem.updatedAt : "最近",
      message,
      status: documentItem.status,
    }));
  }

  function getMockCitationCount(documentTitle) {
    const citations = window.SuperRagMock?.mockCitations || [];
    return citations.filter((citation) => citation.documentTitle === documentTitle).length;
  }

  function getTimeValue(value) {
    const normalized = String(value || "").replace(" ", "T");
    const time = new Date(normalized).getTime();
    return Number.isNaN(time) ? 0 : time;
  }

  function warnFallback(message, error) {
    console.warn(`[SuperRAG DocumentService] ${message}: ${error.message || error}`);
  }

  window.documentService = {
    getDocuments,
    getDocumentDetail,
    uploadDocument,
    reindexDocument,
    deleteDocument,
    updateDocumentTags,
    mapBackendDocumentToDocument,
    mapBackendDocumentDetailToDocumentDetail,
    mapDocumentStatus,
  };

  window.documentApi = window.documentService;
})();
