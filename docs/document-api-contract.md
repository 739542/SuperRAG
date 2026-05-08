# 文档管理模块接口契约

版本：V0.1

状态：前端 mock 阶段，待后端确认

适用模块：文档管理页

维护人：前端与后端共同维护

## 一、总体说明

本文档用于约定 SuperRAG 文档管理页与后端之间的接口契约。

文档管理页的目标不是普通文件列表，而是支撑以下知识库治理流程：

`文档上传入库 -> 文档解析 -> 知识库映射 -> 可被 RAG 检索`

前端当前已使用 mock 数据实现页面交互。后续接真实后端时，前端希望主要替换 `documentService` 内部实现，并通过 adapter 处理后端字段差异，尽量不大改页面组件。

## 二、统一响应格式

建议后端统一返回：

```json
{
  "code": 0,
  "message": "success",
  "data": {}
}
```

错误格式建议：

```json
{
  "code": 40001,
  "message": "document not found",
  "error": {
    "type": "DOCUMENT_NOT_FOUND",
    "detail": "The document id does not exist."
  }
}
```

常见错误码建议：

| code | type | 含义 |
| --- | --- | --- |
| `40001` | `DOCUMENT_NOT_FOUND` | 文档不存在 |
| `40002` | `INVALID_FILE_TYPE` | 文件类型不支持 |
| `40003` | `UPLOAD_FAILED` | 上传失败 |
| `40004` | `INGESTION_TASK_FAILED` | 入库任务创建失败 |
| `40101` | `UNAUTHORIZED` | 未登录或登录失效 |
| `40301` | `FORBIDDEN` | 无权限访问该文档 |
| `50001` | `SERVER_ERROR` | 服务端异常 |

## 三、文档状态枚举

统一使用以下状态值：

| 状态值 | 中文展示 | 含义 |
| --- | --- | --- |
| `indexed` | 已入库 | 文档已解析并完成知识库 / Dify 映射，可被 RAG 检索。 |
| `indexing` | 解析中 | 文档已上传，正在解析、切分、向量化或同步 Dify。 |
| `failed` | 解析失败 | 文档上传或解析失败，需要重新入库或人工处理。 |
| `pending` | 待处理 | 文档已登记，但尚未进入解析 / 入库流程。 |

## 四、接口列表

### 1. 文档列表接口

接口作用：

获取文档管理页表格数据，支持搜索、筛选、分页。

请求方法：

`GET`

建议 URL：

`/api/documents`

查询参数：

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `keyword` | `string` | 否 | 搜索关键词，匹配名称、标签、摘要等 |
| `type` | `string` | 否 | 文档类型，如 Word、PDF、Excel、Markdown |
| `project` | `string` | 否 | 所属项目 |
| `uploader` | `string` | 否 | 上传者名称或 ID，后端可自行决定 |
| `status` | `string` | 否 | `indexed` / `indexing` / `failed` / `pending` |
| `visibilityScope` | `string` | 否 | 可见范围 |
| `page` | `number` | 否 | 页码，默认 1 |
| `pageSize` | `number` | 否 | 每页条数，默认 10 |

返回 JSON 示例：

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "total": 128,
    "page": 1,
    "pageSize": 10,
    "list": [
      {
        "id": "doc-001",
        "title": "企业新人培训流程说明.docx",
        "type": "Word",
        "project": "企业知识库",
        "tags": ["培训", "入职", "知识库"],
        "uploader": "张晨",
        "uploaderId": "user-001",
        "version": "v2.1",
        "status": "indexed",
        "visibilityScope": "项目成员",
        "visibilityScopeCode": "project_member",
        "updatedAt": "2026-05-20 10:21",
        "summary": "说明新人进入项目后的学习路径、关键术语、知识库使用方式和培训验收要求。",
        "keywords": ["新人培训", "学习路径", "RAG"],
        "difyDatasetId": "ds_superrag_core",
        "difyDocumentId": "dify_doc_training_v21"
      }
    ]
  }
}
```

前端使用位置：

- 文档表格
- 搜索框
- 筛选区
- 状态 badge
- 右侧详情入口

### 2. 文档上传接口

接口作用：

上传企业私有文档，并创建解析 / 入库任务。

请求方法：

`POST`

建议 URL：

`/api/documents/upload`

请求类型：

`multipart/form-data`

请求参数：

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `file` | `File` | 是 | 用户选择的文件 |
| `type` | `string` | 是 | 文档类型 |
| `project` | `string` | 是 | 所属项目 |
| `tags` | `string[]` 或 `string` | 否 | 标签数组或逗号分隔字符串 |
| `visibilityScope` | `string` | 是 | 可见范围 |

返回 JSON 示例：

```json
{
  "code": 0,
  "message": "uploaded",
  "data": {
    "id": "doc-007",
    "title": "接口联调记录.md",
    "type": "Markdown",
    "project": "企业知识库",
    "tags": ["接口", "联调"],
    "uploader": "胡俊熙",
    "uploaderId": "user-frontend-001",
    "version": "v1.0",
    "status": "indexing",
    "visibilityScope": "项目成员",
    "visibilityScopeCode": "project_member",
    "updatedAt": "2026-05-20 14:22",
    "summary": "文档已上传，等待解析生成摘要。",
    "keywords": [],
    "difyDatasetId": "ds_superrag_core",
    "difyDocumentId": null
  }
}
```

前端上传后状态更新：

前端收到返回后，将新文档插入表格顶部，状态显示 `indexing / 解析中`。后续可通过列表接口轮询，或通过 WebSocket / SSE 更新为 `indexed` 或 `failed`。

### 3. 文档详情接口

接口作用：

获取右侧详情抽屉所需的完整文档治理信息。

请求方法：

`GET`

建议 URL：

`/api/documents/{documentId}`

返回字段要求：

- 文档基础字段
- 摘要
- 关键词
- 关联知识分类
- Dify dataset 映射 ID
- Dify document 映射 ID
- 最近入库日志
- 引用该文档的问答次数

返回 JSON 示例：

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "id": "doc-001",
    "title": "企业新人培训流程说明.docx",
    "type": "Word",
    "project": "企业知识库",
    "tags": ["培训", "入职", "知识库"],
    "uploader": "张晨",
    "uploaderId": "user-001",
    "version": "v2.1",
    "status": "indexed",
    "visibilityScope": "项目成员",
    "visibilityScopeCode": "project_member",
    "updatedAt": "2026-05-20 10:21",
    "summary": "说明新人进入项目后的学习路径、关键术语、知识库使用方式和培训验收要求。",
    "keywords": ["新人培训", "学习路径", "RAG"],
    "knowledgeCategory": "新人培训知识 / 学习路径",
    "difyDatasetId": "ds_superrag_core",
    "difyDocumentId": "dify_doc_training_v21",
    "referencedQuestionCount": 12,
    "ingestionLogs": [
      {
        "time": "2026-05-20 10:18",
        "status": "indexing",
        "message": "文档已进入解析队列。"
      },
      {
        "time": "2026-05-20 10:21",
        "status": "indexed",
        "message": "文档解析完成，已写入 Dify Dataset。"
      }
    ]
  }
}
```

### 4. 文档重新入库接口

接口作用：

对解析失败或需要更新索引的文档重新提交解析、切分、向量化和 Dify Dataset 同步任务。

请求方法：

`POST`

建议 URL：

`/api/documents/{documentId}/reindex`

请求参数：

```json
{
  "reason": "manual_retry",
  "force": true
}
```

返回 JSON 示例：

```json
{
  "code": 0,
  "message": "reindex task submitted",
  "data": {
    "id": "doc-005",
    "status": "indexing",
    "updatedAt": "2026-05-20 14:30",
    "taskId": "task_reindex_001"
  }
}
```

前端行为：

点击成功后，将当前行状态临时改为 `indexing`，并提示“已提交重新入库任务”。

### 5. 文档删除接口

接口作用：

删除系统中的文档记录，并建议后端同步删除或解绑 Dify document 映射。

请求方法：

`DELETE`

建议 URL：

`/api/documents/{documentId}`

返回 JSON 示例：

```json
{
  "code": 0,
  "message": "deleted",
  "data": {
    "id": "doc-005",
    "deleted": true,
    "difyDocumentUnlinked": true
  }
}
```

前端行为：

确认弹窗后调用接口，成功后从表格移除该行，并刷新统计状态。

### 6. 更新文档标签接口

接口作用：

更新文档标签，用于后续知识治理和检索过滤。

请求方法：

`PATCH`

建议 URL：

`/api/documents/{documentId}/tags`

请求参数：

```json
{
  "tags": ["接口", "联调", "后端"]
}
```

返回 JSON 示例：

```json
{
  "code": 0,
  "message": "tags updated",
  "data": {
    "id": "doc-004",
    "tags": ["接口", "联调", "后端"],
    "updatedAt": "2026-05-20 14:36"
  }
}
```

## 五、前端字段与后端字段映射

当前前端文档模型字段如下：

| 前端字段 | 建议后端字段 | 说明 |
| --- | --- | --- |
| `id` | `id` / `documentId` / `document_id` | 文档主键 |
| `title` | `title` / `name` / `fileName` | 文档名称 |
| `type` | `type` / `documentType` / `fileType` | 文档类型 |
| `project` | `project` / `projectName` | 所属项目名称 |
| `tags` | `tags` / `tagList` | 标签数组 |
| `uploader` | `uploader` / `uploaderName` / `createdByName` | 上传者展示名 |
| `uploaderId` | `uploaderId` / `createdBy` | 上传者 ID |
| `version` | `version` | 文档版本 |
| `status` | `status` / `ingestionStatus` | 入库状态，需通过枚举映射 |
| `visibilityScope` | `visibilityScope` / `scopeName` | 可见范围展示名 |
| `visibilityScopeCode` | `visibilityScopeCode` / `scope` | 可见范围编码 |
| `updatedAt` | `updatedAt` / `updated_at` / `updateTime` | 更新时间 |
| `summary` | `summary` / `description` | 文档摘要 |
| `keywords` | `keywords` / `keywordList` | 自动关键词 |
| `knowledgeCategory` | `knowledgeCategory` / `categoryName` | 关联知识分类 |
| `difyDatasetId` | `difyDatasetId` / `dify_dataset_id` / `datasetId` | Dify Dataset 映射 |
| `difyDocumentId` | `difyDocumentId` / `dify_document_id` / `difyDocId` | Dify 文档映射 |
| `ingestionLogs` | `ingestionLogs` / `logs` | 入库日志 |
| `referencedQuestionCount` | `referencedQuestionCount` / `questionCount` | 引用问答次数 |

字段不一致时，前端在 `document-service.js` 的 adapter 中处理：

- `mapBackendDocumentToDocument()`
- `mapBackendDocumentDetailToDocumentDetail()`
- `mapDocumentStatus()`

## 六、后端实现优先级

第一优先级：

1. 文档列表接口：`GET /api/documents`
2. 文档上传接口：`POST /api/documents/upload`
3. 文档详情接口：`GET /api/documents/{documentId}`

第二优先级：

4. 文档重新入库接口：`POST /api/documents/{documentId}/reindex`
5. 文档删除接口：`DELETE /api/documents/{documentId}`

第三优先级：

6. 更新文档标签接口：`PATCH /api/documents/{documentId}/tags`
7. 文档状态实时推送：WebSocket / SSE，可后续再做

## 七、后端需要重点确认的问题

1. 是否采用本文档中的 URL 命名。
2. 文档状态枚举是否统一为 `indexed`、`indexing`、`failed`、`pending`。
3. 上传后是否立即返回文档记录，并将状态置为 `indexing`。
4. Dify Dataset ID 和 Dify Document ID 由后端何时生成。
5. 删除文档时是否同步删除 / 解绑 Dify 中的文档。
6. 标签字段是数组还是字符串，建议使用数组。
7. 是否需要同时返回展示名和 ID，例如 `project` + `projectId`、`uploader` + `uploaderId`。
