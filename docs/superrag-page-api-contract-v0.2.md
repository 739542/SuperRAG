# SuperRAG 按功能页划分的前后端接口契约

版本：V0.2

状态：基于当前已实现前端页面、mock 数据和 service / adapter 层整理，待后端确认

适用系统：SuperRAG 企业软件工程知识助手

维护人：前端与后端共同维护

## 0. 总体说明

当前前端已经实现以下页面：

1. 首页 / 控制台：`/dashboard`
2. 文档管理页：`/documents`
3. 智能问答页：`/chat`
4. 培训模式页：`/training`
5. 交接模式页：`/handover`
6. 设计辅助页：`/design-assistant`
7. 历史记录页：`/history`
8. 后台配置页：`/settings`

前端当前使用 mock 数据和 service / adapter 层运行。后端接入时，前端希望只替换以下 service 内部实现，尽量不改页面组件：

| 页面 | 前端 service |
| --- | --- |
| 文档管理 | `documentService` |
| 智能问答 | `chatService` |
| 培训模式 | `trainingService` |
| 交接模式 | `handoverService` |
| 设计辅助 | `designService` |
| 历史记录 | `historyService` |
| 后台配置 | `settingsService` |

重要原则：

- 前端不能直接调用 Dify API。
- Dify API Key、Workflow Key、模型 Key 不能暴露到前端。
- 前端只调用我们自己的后端接口。
- Dify 知识库、RAG 检索、Workflow 编排、LLM 调用、数据库记录由后端统一封装。
- 所有 AI 生成类接口必须返回引用证据 `citations`。
- 设计辅助接口必须返回结构化设计产物，不要只返回一段纯文本。

建议统一 API 前缀：

```text
/api
```

## 1. 通用约定

### 1.1 成功响应格式

```json
{
  "code": 0,
  "message": "success",
  "data": {},
  "traceId": "req-20260511-0001"
}
```

### 1.2 错误响应格式

```json
{
  "code": 40001,
  "message": "文档不存在",
  "error": {
    "type": "DOCUMENT_NOT_FOUND",
    "detail": "document id not found"
  },
  "traceId": "req-20260511-0002"
}
```

### 1.3 常见错误码

| code | type | 说明 |
| --- | --- | --- |
| `40001` | `DOCUMENT_NOT_FOUND` | 文档不存在 |
| `40002` | `INVALID_FILE_TYPE` | 文件类型不支持 |
| `40003` | `UPLOAD_FAILED` | 上传失败 |
| `40004` | `INGESTION_TASK_FAILED` | 入库任务创建失败 |
| `40005` | `VALIDATION_ERROR` | 请求参数错误 |
| `40101` | `UNAUTHORIZED` | 未登录或登录失效 |
| `40301` | `FORBIDDEN` | 无权限访问 |
| `50001` | `SERVER_ERROR` | 服务端异常 |
| `50002` | `DIFY_REQUEST_FAILED` | Dify 调用失败 |
| `50003` | `WORKFLOW_FAILED` | Workflow 执行失败 |

### 1.4 文档状态枚举

| 状态值 | 前端展示 | 说明 |
| --- | --- | --- |
| `indexed` | 已入库 | 已解析并完成知识库映射，可被 RAG 检索 |
| `indexing` | 解析中 | 正在解析、切分、向量化或同步 Dify |
| `failed` | 解析失败 | 入库失败，需要重新入库或人工处理 |
| `pending` | 待处理 | 已登记但尚未进入入库流程 |

### 1.5 场景模式枚举

| 值 | 前端展示 | 对应页面 |
| --- | --- | --- |
| `chat` | 智能问答 | `/chat` |
| `training` | 培训模式 | `/training` |
| `handover` | 交接模式 | `/handover` |
| `design` | 设计辅助 | `/design-assistant` |

### 1.6 证据充分度枚举

后端建议统一返回：

| 值 | 前端展示 | 说明 |
| --- | --- | --- |
| `sufficient` | 充分 | 引用证据较充分，可进入常规人工复核 |
| `partial` | 部分充分 | 有证据但不完整，建议人工确认 |
| `low` | 不足 | 证据不足，仅可作为初步参考 |

说明：当前前端 mock 内部有 `high / medium / low`，后端正式接口建议使用 `sufficient / partial / low`。如果后端返回后者，前端可在 adapter 层映射。

### 1.7 Citation 引用证据结构

所有 AI 生成结果都必须返回 `citations`。

```json
{
  "id": "cit-001",
  "documentId": "doc-001",
  "documentTitle": "企业新人培训流程说明.docx",
  "snippet": "新人培训应先理解业务背景，再学习项目术语、数据流和关键接口调用链。",
  "relevanceScore": 0.94,
  "page": 3,
  "segmentId": "seg-training-003"
}
```

## 2. 首页 / 控制台 `/dashboard`

页面用途：展示系统定位、数据概览、最近问答记录、最近上传文档、知识库状态。

### 2.1 获取首页统计数据

| 项 | 内容 |
| --- | --- |
| 接口名称 | 获取首页统计数据 |
| 请求方法 | `GET` |
| 建议 URL | `/api/dashboard/stats` |
| 前端使用位置 | 首页数据概览卡片 |
| 当前是否有 mock | 有，`mockStats` |
| 后端优先级 | P0 |

请求参数：无

返回示例：

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "documentCount": 128,
    "categoryCount": 16,
    "todayQuestionCount": 42,
    "designOutputCount": 19,
    "indexingCount": 3,
    "failedDocumentCount": 2
  }
}
```

### 2.2 获取最近文档

| 项 | 内容 |
| --- | --- |
| 接口名称 | 获取最近上传文档 |
| 请求方法 | `GET` |
| 建议 URL | `/api/dashboard/recent-documents` |
| 前端使用位置 | 首页最近上传文档 |
| 当前是否有 mock | 有，来自 `mockDocuments` |
| 后端优先级 | P0 |

查询参数：

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `limit` | number | 否 | 返回条数，默认 5 |

返回示例：

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "list": [
      {
        "id": "doc-001",
        "title": "企业新人培训流程说明.docx",
        "type": "Word",
        "status": "indexed",
        "updatedAt": "2026-05-20 10:21"
      }
    ]
  }
}
```

### 2.3 获取最近问答 / 场景产物

| 项 | 内容 |
| --- | --- |
| 接口名称 | 获取最近活动记录 |
| 请求方法 | `GET` |
| 建议 URL | `/api/dashboard/recent-activities` |
| 前端使用位置 | 首页最近问答记录 |
| 当前是否有 mock | 有，来自 `mockSessions` / `mockDesignOutputs` |
| 后端优先级 | P1 |

查询参数：

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `limit` | number | 否 | 返回条数，默认 5 |
| `sceneMode` | string | 否 | `chat` / `training` / `handover` / `design` |

返回示例：

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "list": [
      {
        "id": "sess-001",
        "title": "智能灯状态上报机制是什么？",
        "sceneMode": "chat",
        "updatedAt": "2026-05-20 10:21"
      },
      {
        "id": "design-001",
        "title": "设计辅助模块详细文本用例初稿",
        "sceneMode": "design",
        "updatedAt": "2026-05-20 10:45"
      }
    ]
  }
}
```

## 3. 文档管理 `/documents`

页面用途：企业私有知识库治理，体现“文档上传入库 → 文档解析 → 知识库映射 → 可被 RAG 检索”。

### 3.1 文档列表

| 项 | 内容 |
| --- | --- |
| 接口名称 | 获取文档列表 |
| 请求方法 | `GET` |
| 建议 URL | `/api/documents` |
| 前端使用位置 | 文档管理表格、筛选、搜索 |
| 当前是否有 mock | 有，`mockDocuments` |
| 后端优先级 | P0 |

查询参数：

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `keyword` | string | 否 | 搜索标题、摘要、标签 |
| `type` | string | 否 | 文档类型 |
| `project` | string | 否 | 所属项目 |
| `uploader` | string | 否 | 上传者 |
| `status` | string | 否 | `indexed` / `indexing` / `failed` / `pending` |
| `visibilityScope` | string | 否 | 可见范围 |
| `page` | number | 否 | 页码 |
| `pageSize` | number | 否 | 每页条数 |

返回示例：

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
        "version": "v2.1",
        "status": "indexed",
        "visibilityScope": "项目成员",
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

### 3.2 文档上传

| 项 | 内容 |
| --- | --- |
| 接口名称 | 上传文档 |
| 请求方法 | `POST` |
| 建议 URL | `/api/documents/upload` |
| 请求类型 | `multipart/form-data` |
| 前端使用位置 | 上传文档弹窗 |
| 当前是否有 mock | 有 |
| 后端优先级 | P0 |

请求参数：

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `file` | File | 是 | 文档文件 |
| `type` | string | 是 | Word / PDF / Excel / Markdown / TXT / PPT |
| `project` | string | 是 | 所属项目 |
| `tags` | string[] | 否 | 标签 |
| `visibilityScope` | string | 是 | 可见范围 |

返回示例：

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
    "version": "v1.0",
    "status": "indexing",
    "visibilityScope": "项目成员",
    "updatedAt": "2026-05-20 14:22",
    "difyDatasetId": "ds_superrag_core",
    "difyDocumentId": null
  }
}
```

### 3.3 文档详情

| 项 | 内容 |
| --- | --- |
| 接口名称 | 获取文档详情 |
| 请求方法 | `GET` |
| 建议 URL | `/api/documents/{id}` |
| 前端使用位置 | 右侧详情抽屉 |
| 当前是否有 mock | 有 |
| 后端优先级 | P0 |

路径参数：

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `id` | string | 是 | 文档 ID |

返回示例：

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
    "version": "v2.1",
    "status": "indexed",
    "visibilityScope": "项目成员",
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

### 3.4 文档重新入库

| 项 | 内容 |
| --- | --- |
| 接口名称 | 文档重新入库 |
| 请求方法 | `POST` |
| 建议 URL | `/api/documents/{id}/reindex` |
| 前端使用位置 | 解析失败文档操作 |
| 当前是否有 mock | 有 |
| 后端优先级 | P1 |

请求示例：

```json
{
  "reason": "manual_retry",
  "force": true
}
```

返回示例：

```json
{
  "code": 0,
  "message": "reindex task submitted",
  "data": {
    "id": "doc-005",
    "status": "indexing",
    "taskId": "task-reindex-001",
    "updatedAt": "2026-05-20 14:30"
  }
}
```

### 3.5 文档删除

| 项 | 内容 |
| --- | --- |
| 接口名称 | 删除文档 |
| 请求方法 | `DELETE` |
| 建议 URL | `/api/documents/{id}` |
| 前端使用位置 | 文档表格删除按钮 |
| 当前是否有 mock | 有 |
| 后端优先级 | P1 |

返回示例：

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

### 3.6 文档标签更新

| 项 | 内容 |
| --- | --- |
| 接口名称 | 更新文档标签 |
| 请求方法 | `PATCH` |
| 建议 URL | `/api/documents/{id}/tags` |
| 前端使用位置 | 编辑标签操作 |
| 当前是否有 mock | 有 |
| 后端优先级 | P2 |

请求示例：

```json
{
  "tags": ["接口", "联调", "后端"]
}
```

返回示例：

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

## 4. 智能问答 `/chat`

页面用途：通用知识库检索问答，并突出“回答必须绑定引用证据”。

### 4.1 创建会话

| 项 | 内容 |
| --- | --- |
| 接口名称 | 创建问答会话 |
| 请求方法 | `POST` |
| 建议 URL | `/api/chat/sessions` |
| 前端使用位置 | 新建会话按钮 |
| 当前是否有 mock | 有，本地 mock |
| 后端优先级 | P1 |

请求示例：

```json
{
  "title": "新的知识检索会话",
  "knowledgeBaseId": "ds_superrag_core",
  "project": "企业知识库"
}
```

返回示例：

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "id": "sess-001",
    "title": "新的知识检索会话",
    "sceneMode": "chat",
    "createdAt": "2026-05-20 10:12",
    "updatedAt": "2026-05-20 10:12"
  }
}
```

### 4.2 获取会话列表

| 项 | 内容 |
| --- | --- |
| 接口名称 | 获取问答会话列表 |
| 请求方法 | `GET` |
| 建议 URL | `/api/chat/sessions` |
| 前端使用位置 | 左侧会话列表 |
| 当前是否有 mock | 有，`mockSessions` |
| 后端优先级 | P1 |

查询参数：

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `keyword` | string | 否 | 搜索会话标题 |
| `page` | number | 否 | 页码 |
| `pageSize` | number | 否 | 每页条数 |

返回示例：

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "total": 4,
    "list": [
      {
        "id": "sess-001",
        "title": "智能灯状态上报机制是什么？",
        "sceneMode": "chat",
        "createdAt": "2026-05-20 10:12",
        "updatedAt": "2026-05-20 10:21"
      }
    ]
  }
}
```

### 4.3 获取会话详情

| 项 | 内容 |
| --- | --- |
| 接口名称 | 获取问答会话详情 |
| 请求方法 | `GET` |
| 建议 URL | `/api/chat/sessions/{sessionId}` |
| 前端使用位置 | 中间问答主区域 |
| 当前是否有 mock | 有，`mockMessages` |
| 后端优先级 | P1 |

返回示例：

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "id": "sess-001",
    "title": "智能灯状态上报机制是什么？",
    "messages": [
      {
        "id": "msg-001",
        "role": "user",
        "content": "智能灯状态上报机制是什么？",
        "createdAt": "2026-05-20 10:20"
      },
      {
        "id": "msg-002",
        "role": "assistant",
        "answer": "智能灯通过 MQTT 上报运行状态。",
        "structuredAnswer": {
          "conclusion": "智能灯通过 MQTT 上报运行状态。",
          "evidence": "接口文档中提到设备状态字段。",
          "suggestion": "建议结合接口设计文档核对字段类型。",
          "uncertainty": "异常状态枚举证据不足。"
        },
        "evidenceLevel": "partial",
        "citations": []
      }
    ]
  }
}
```

### 4.4 发送问题

| 项 | 内容 |
| --- | --- |
| 接口名称 | 发送知识库问题 |
| 请求方法 | `POST` |
| 建议 URL | `/api/chat/sessions/{sessionId}/messages` |
| 前端使用位置 | 底部输入区、快捷问题 |
| 当前是否有 mock | 有，`generateMockAnswer()` |
| 后端优先级 | P0 |

请求示例：

```json
{
  "question": "请总结文档入库流程",
  "answerMode": "evidence",
  "knowledgeBaseId": "ds_superrag_core",
  "project": "企业知识库",
  "history": []
}
```

返回示例：

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "id": "msg-002",
    "sessionId": "sess-001",
    "role": "assistant",
    "answer": "文档入库流程包括上传、解析、切分、向量化、写入 Dify Dataset 和状态回写。",
    "structuredAnswer": {
      "conclusion": "文档入库流程应按上传、解析、切分、向量化、映射和状态回写组织。",
      "evidence": "相关资料提到文档解析、知识库入库和引用证据追溯。",
      "suggestion": "优先保证上传后状态可见，并在失败时支持重新入库。",
      "uncertainty": "如果后端没有返回入库日志，前端只能展示 mock 日志。"
    },
    "evidenceLevel": "partial",
    "citations": [
      {
        "id": "cit-001",
        "documentTitle": "企业新人培训流程说明.docx",
        "snippet": "新人培训应先理解业务背景，再学习项目术语、数据流和关键接口调用链。",
        "relevanceScore": 0.94,
        "page": 3,
        "segmentId": "seg-training-003"
      }
    ],
    "createdAt": "2026-05-20 10:21"
  }
}
```

### 4.5 获取引用证据

| 项 | 内容 |
| --- | --- |
| 接口名称 | 获取消息引用证据 |
| 请求方法 | `GET` |
| 建议 URL | `/api/chat/messages/{messageId}/citations` |
| 前端使用位置 | 右侧引用证据面板 |
| 当前是否有 mock | 有，`mockCitations` |
| 后端优先级 | P0 |

返回示例：

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "list": [
      {
        "id": "cit-003",
        "documentTitle": "接口设计文档.xlsx",
        "snippet": "用户中心接口使用 JWT 鉴权，订单中心接口需要检查支付状态和库存状态。",
        "relevanceScore": 0.87,
        "page": 1,
        "segmentId": "seg-api-001"
      }
    ]
  }
}
```

## 5. 培训模式 `/training`

页面用途：面向新人生成术语解释、背景梳理、学习路径和推荐资料。

### 5.1 获取培训选项

| 项 | 内容 |
| --- | --- |
| 接口名称 | 获取培训页面选项 |
| 请求方法 | `GET` |
| 建议 URL | `/api/training/options` |
| 前端使用位置 | 培训主题、关联项目选择 |
| 当前是否有 mock | 有，service 从文档项目中生成 |
| 后端优先级 | P2 |

返回示例：

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "topics": ["项目背景", "核心术语", "模块职责", "开发流程", "接口规范", "测试流程"],
    "projects": ["企业知识库", "阳光用药管控系统"]
  }
}
```

### 5.2 提交培训问题

| 项 | 内容 |
| --- | --- |
| 接口名称 | 生成培训结构化结果 |
| 请求方法 | `POST` |
| 建议 URL | `/api/training/generate` |
| 前端使用位置 | 培训模式输出结果区 |
| 当前是否有 mock | 有，`mockTrainingResult` |
| 后端优先级 | P1 |

请求示例：

```json
{
  "query": "请给我一周学习路径",
  "topic": "项目背景",
  "project": "企业知识库"
}
```

返回示例：

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "id": "training-result-001",
    "title": "新人培训说明",
    "project": "SuperRAG 企业软件工程知识助手",
    "topic": "项目背景",
    "summary": "SuperRAG 面向企业软件工程知识治理，把文档入库、RAG 检索、场景化 Workflow 和引用证据追溯串成一个新人可理解、可复盘的学习入口。",
    "background": "系统底层复用 Dify 的知识库、RAG 检索、Workflow 编排和 LLM 调用能力。",
    "terms": [
      {
        "term": "企业私有知识库",
        "explanation": "由需求、接口、交接、培训和设计资料组成的内部知识集合。"
      }
    ],
    "learningPath": [
      {
        "day": "第 1 天",
        "title": "阅读项目说明和需求文档",
        "description": "先理解系统目标、用户角色和核心业务闭环。"
      }
    ],
    "recommendedDocs": [
      {
        "title": "企业新人培训流程说明.docx",
        "reason": "覆盖新人学习路径、术语理解和培训验收要求。",
        "priority": "高",
        "estimatedReadTime": "25 分钟"
      }
    ],
    "evidenceLevel": "sufficient",
    "citations": []
  }
}
```

## 6. 交接模式 `/handover`

页面用途：围绕任务交接收敛项目背景、进度、风险、待办、角色和依赖文档。

### 6.1 获取交接选项

| 项 | 内容 |
| --- | --- |
| 接口名称 | 获取交接页面选项 |
| 请求方法 | `GET` |
| 建议 URL | `/api/handover/options` |
| 前端使用位置 | 所属项目、交接范围 |
| 当前是否有 mock | 有，service 从文档项目中生成 |
| 后端优先级 | P2 |

返回示例：

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "scopes": ["功能模块", "接口开发", "测试任务", "部署运维", "文档整理"],
    "projects": ["企业知识库", "阳光用药管控系统"]
  }
}
```

### 6.2 提交交接问题

| 项 | 内容 |
| --- | --- |
| 接口名称 | 生成交接结构化结果 |
| 请求方法 | `POST` |
| 建议 URL | `/api/handover/generate` |
| 前端使用位置 | 交接模式输出结果区 |
| 当前是否有 mock | 有，`mockHandoverResult` |
| 后端优先级 | P1 |

请求示例：

```json
{
  "query": "请生成接手者待办清单",
  "project": "企业知识库",
  "scope": "功能模块"
}
```

返回示例：

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "id": "handover-result-001",
    "title": "项目交接摘要",
    "project": "SuperRAG 企业软件工程知识助手",
    "scope": "功能模块",
    "projectBackground": "当前项目围绕企业私有知识库构建软件工程知识助手。",
    "currentProgress": "已完成基础布局、文档管理页、智能问答页、培训模式、交接模式和设计辅助页。",
    "completedFeatures": ["首页", "文档管理", "智能问答"],
    "unfinishedItems": ["历史记录", "后台配置"],
    "todos": [
      {
        "taskName": "补齐后端文档详情接口",
        "priority": "高",
        "riskLevel": "高",
        "owner": "后端",
        "dueDate": "2026-05-12",
        "status": "待处理"
      }
    ],
    "risks": [
      {
        "type": "文档缺失",
        "description": "当前后端没有文档详情、入库日志和标签更新接口。",
        "impact": "文档治理闭环展示不完整",
        "suggestion": "优先补 GET /api/documents/{id}。",
        "evidenceSource": "文档管理接口契约 V0.1"
      }
    ],
    "roles": [
      {
        "role": "前端负责人",
        "responsibility": "页面实现、service/adapter、mock 数据和视觉还原。"
      }
    ],
    "dependentDocs": ["项目交接规范.md"],
    "evidenceLevel": "partial",
    "citations": []
  }
}
```

## 7. 设计辅助 `/design-assistant`

页面用途：从企业文档知识生成软件工程设计产物，包括功能清单、详细文本用例、模块划分建议、风险和后续动作。

这是系统最重要的差异化页面。后端不能只返回一段 `answer` 字符串，必须返回结构化字段。

### 7.1 获取设计辅助选项

| 项 | 内容 |
| --- | --- |
| 接口名称 | 获取设计辅助页面选项 |
| 请求方法 | `GET` |
| 建议 URL | `/api/design-assistant/options` |
| 前端使用位置 | 产物类型、项目、输出粒度 |
| 当前是否有 mock | 有，`designService.getDesignOptions()` |
| 后端优先级 | P2 |

返回示例：

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "outputTypes": ["功能清单", "详细文本用例", "模块划分建议", "接口设计建议", "风险分析", "答辩说明稿"],
    "projects": ["企业知识助手系统", "新人培训平台", "任务交接管理模块", "需求设计辅助模块"],
    "granularities": ["简要", "标准", "详细"]
  }
}
```

### 7.2 提交设计目标并生成设计产物

| 项 | 内容 |
| --- | --- |
| 接口名称 | 生成设计辅助结构化产物 |
| 请求方法 | `POST` |
| 建议 URL | `/api/design-assistant/generate` |
| 前端使用位置 | 设计辅助页主输出区 |
| 当前是否有 mock | 有，`mockDesignOutputs` / `generateMockDesignOutput()` |
| 后端优先级 | P0 |

请求示例：

```json
{
  "inputQuestion": "基于现有需求文档，为设计辅助模块生成详细文本用例。",
  "outputType": "详细文本用例",
  "project": "企业知识助手系统",
  "granularity": "标准"
}
```

返回示例：

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "id": "design-001",
    "title": "设计辅助模块详细文本用例初稿",
    "inputQuestion": "基于现有需求文档，为设计辅助模块生成详细文本用例。",
    "project": "企业知识助手系统",
    "outputType": "详细文本用例",
    "outputTypeLabel": "详细文本用例",
    "granularity": "标准",
    "createdAt": "2026-05-20 10:45",
    "evidenceLevel": "sufficient",
    "functionList": [
      {
        "id": "F-001",
        "name": "设计目标输入与产物类型选择",
        "description": "支持用户输入设计目标，并选择功能清单、详细文本用例、模块划分建议、接口设计建议、风险分析或答辩说明稿。",
        "priority": "高",
        "relatedDocument": "需求分析说明书.pdf"
      }
    ],
    "useCases": [
      {
        "id": "UC-001",
        "name": "生成详细文本用例初稿",
        "actor": "项目成员",
        "preconditions": ["需求文档、接口文档和用例模板已入库", "用户已进入设计辅助页"],
        "mainSuccessScenario": ["用户输入设计目标", "系统检索企业知识库", "系统生成结构化设计建议"],
        "extensionScenarios": ["用户切换输出粒度为详细后重新生成"],
        "exceptionScenarios": ["引用证据不足时显示证据不足提示"],
        "postconditions": "生成的设计初稿可被人工复核。"
      }
    ],
    "moduleSuggestions": [
      {
        "name": "DesignInputPanel",
        "responsibility": "负责采集设计目标、产物类型、关联项目和输出粒度。",
        "input": ["用户设计目标", "产物类型", "项目范围"],
        "output": ["结构化生成请求 payload"],
        "dependencies": ["designService.generateDesignOutput"]
      }
    ],
    "risks": [
      {
        "description": "知识库资料不足时可能生成泛化设计建议。",
        "impact": "影响设计初稿可信度。",
        "supplement": "补充需求分析说明、接口文档和真实业务流程。",
        "confidence": "中",
        "needsReview": true
      }
    ],
    "nextActions": [
      {
        "action": "确认 Workflow 结构化输出字段",
        "priority": "高",
        "owner": "前后端共同",
        "dependentDocument": "文档管理模块接口契约 V0.1",
        "doneDefinition": "后端返回 functionList、useCases、moduleSuggestions、risks、nextActions、citations 和 evidenceLevel。"
      }
    ],
    "qualityChecks": {
      "hasUncitedContent": false,
      "hasRequirementGap": false,
      "requiresHumanReview": false,
      "readyForReview": true
    },
    "citations": []
  }
}
```

后端也可以把结构化字段包在 `structuredOutput` 下。若采用这种格式，前端 adapter 可统一映射：

```json
{
  "data": {
    "id": "design-001",
    "title": "设计辅助模块详细文本用例初稿",
    "evidenceLevel": "sufficient",
    "structuredOutput": {
      "functionList": [],
      "useCases": [],
      "moduleSuggestions": [],
      "risks": [],
      "nextActions": [],
      "qualityChecks": {}
    },
    "citations": []
  }
}
```

### 7.3 保存设计产物

| 项 | 内容 |
| --- | --- |
| 接口名称 | 保存设计产物 |
| 请求方法 | `POST` |
| 建议 URL | `/api/design-outputs` |
| 前端使用位置 | 保存到历史记录按钮 |
| 当前是否有 mock | 仅前端 toast |
| 后端优先级 | P1 |

请求示例：

```json
{
  "sourceId": "design-001",
  "title": "设计辅助模块详细文本用例初稿",
  "project": "企业知识助手系统",
  "outputType": "详细文本用例",
  "structuredOutput": {
    "functionList": [],
    "useCases": [],
    "moduleSuggestions": [],
    "risks": [],
    "nextActions": []
  },
  "citations": []
}
```

返回示例：

```json
{
  "code": 0,
  "message": "saved",
  "data": {
    "id": "design-saved-001",
    "saved": true,
    "createdAt": "2026-05-20 15:10"
  }
}
```

### 7.4 获取设计产物详情

| 项 | 内容 |
| --- | --- |
| 接口名称 | 获取设计产物详情 |
| 请求方法 | `GET` |
| 建议 URL | `/api/design-outputs/{id}` |
| 前端使用位置 | 历史记录详情、设计产物复用 |
| 当前是否有 mock | 部分有 |
| 后端优先级 | P2 |

返回示例：

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "id": "design-001",
    "title": "设计辅助模块详细文本用例初稿",
    "project": "企业知识助手系统",
    "outputType": "详细文本用例",
    "evidenceLevel": "sufficient",
    "structuredOutput": {},
    "citations": []
  }
}
```

## 8. 历史记录 `/history`

页面用途：复用过去的问答结果、培训结果、交接摘要和设计产物。

### 8.1 获取历史记录列表

| 项 | 内容 |
| --- | --- |
| 接口名称 | 获取历史记录列表 |
| 请求方法 | `GET` |
| 建议 URL | `/api/history` |
| 前端使用位置 | 历史记录列表和筛选 |
| 当前是否有 mock | 有，`mockHistoryRecords` |
| 后端优先级 | P1 |

查询参数：

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `keyword` | string | 否 | 搜索标题、问题、摘要 |
| `sceneMode` | string | 否 | `chat` / `training` / `handover` / `design` |
| `project` | string | 否 | 所属项目 |
| `creator` | string | 否 | 创建用户 |
| `dateFrom` | string | 否 | 开始日期 |
| `dateTo` | string | 否 | 结束日期 |
| `page` | number | 否 | 页码 |
| `pageSize` | number | 否 | 每页条数 |

返回示例：

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "total": 4,
    "list": [
      {
        "id": "hist-001",
        "title": "设计辅助模块详细文本用例初稿",
        "sceneMode": "design",
        "project": "企业知识助手系统",
        "creator": "胡俊熙",
        "createdAt": "2026-05-20 10:45",
        "summary": "基于需求文档、接口文档和用例模板生成设计辅助模块的设计产物。",
        "citationCount": 4
      }
    ]
  }
}
```

### 8.2 获取历史记录详情

| 项 | 内容 |
| --- | --- |
| 接口名称 | 获取历史记录详情 |
| 请求方法 | `GET` |
| 建议 URL | `/api/history/{id}` |
| 前端使用位置 | 历史详情抽屉 |
| 当前是否有 mock | 有 |
| 后端优先级 | P1 |

返回示例：

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "id": "hist-001",
    "title": "设计辅助模块详细文本用例初稿",
    "sceneMode": "design",
    "project": "企业知识助手系统",
    "creator": "胡俊熙",
    "createdAt": "2026-05-20 10:45",
    "originalQuestion": "基于现有需求文档，为设计辅助模块生成详细文本用例。",
    "outputSummary": "产出 5 个功能项、2 个详细文本用例、3 个模块划分建议、3 个风险点和 4 个后续动作建议。",
    "citations": [],
    "versionRecords": [
      {
        "version": "v1.0",
        "time": "2026-05-20 10:45",
        "operator": "胡俊熙",
        "change": "生成设计辅助模块初稿。"
      }
    ]
  }
}
```

### 8.3 删除历史记录

| 项 | 内容 |
| --- | --- |
| 接口名称 | 删除历史记录 |
| 请求方法 | `DELETE` |
| 建议 URL | `/api/history/{id}` |
| 前端使用位置 | 历史记录删除按钮 |
| 当前是否有 mock | 有 |
| 后端优先级 | P2 |

返回示例：

```json
{
  "code": 0,
  "message": "deleted",
  "data": {
    "id": "hist-001",
    "deleted": true
  }
}
```

## 9. 后台配置 `/settings`

页面用途：为管理员提供系统运行参数、Dify Workflow 映射、检索参数、模型参数和运行日志的前端界面。

注意：API Key 和 Dify 密钥必须由后端保存，前端不得返回或展示敏感密钥明文。

### 9.1 获取后台配置总览

| 项 | 内容 |
| --- | --- |
| 接口名称 | 获取后台配置总览 |
| 请求方法 | `GET` |
| 建议 URL | `/api/settings` |
| 前端使用位置 | 后台配置页初始化 |
| 当前是否有 mock | 有，`mockWorkflows` / `mockSettings` / `mockLogs` |
| 后端优先级 | P1 |

返回示例：

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "workflows": [],
    "retrieval": {
      "topK": 8,
      "scoreThreshold": 0.35,
      "rerankEnabled": true,
      "knowledgeStrategy": "hybrid",
      "lowEvidenceHintEnabled": true
    },
    "model": {
      "modelName": "qwen-max",
      "temperature": 0.3,
      "maxTokens": 2048,
      "streamOutput": true
    },
    "logs": []
  }
}
```

### 9.2 获取 Workflow 映射

| 项 | 内容 |
| --- | --- |
| 接口名称 | 获取 Workflow 映射 |
| 请求方法 | `GET` |
| 建议 URL | `/api/settings/workflows` |
| 前端使用位置 | Workflow 映射配置表 |
| 当前是否有 mock | 有，`mockWorkflows` |
| 后端优先级 | P1 |

返回示例：

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "list": [
      {
        "sceneCode": "design",
        "sceneName": "设计辅助",
        "difyAppId": "app_design_assistant",
        "difyWorkflowId": "wf_design_assist_v1.3",
        "status": "enabled"
      }
    ]
  }
}
```

### 9.3 更新 Workflow 映射

| 项 | 内容 |
| --- | --- |
| 接口名称 | 更新 Workflow 映射 |
| 请求方法 | `PATCH` |
| 建议 URL | `/api/settings/workflows/{sceneCode}` |
| 前端使用位置 | Workflow 编辑按钮 |
| 当前是否有 mock | 有 |
| 后端优先级 | P2 |

请求示例：

```json
{
  "difyWorkflowId": "wf_design_assist_v1.4",
  "status": "enabled"
}
```

返回示例：

```json
{
  "code": 0,
  "message": "updated",
  "data": {
    "sceneCode": "design",
    "difyWorkflowId": "wf_design_assist_v1.4",
    "status": "enabled"
  }
}
```

### 9.4 测试 Workflow 连接

| 项 | 内容 |
| --- | --- |
| 接口名称 | 测试 Workflow 连接 |
| 请求方法 | `POST` |
| 建议 URL | `/api/settings/workflows/{sceneCode}/test` |
| 前端使用位置 | 测试连接按钮 |
| 当前是否有 mock | 有 |
| 后端优先级 | P2 |

返回示例：

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "sceneCode": "design",
    "success": true,
    "durationMs": 1280,
    "checkedAt": "2026-05-20 15:30",
    "errorReason": ""
  }
}
```

### 9.5 保存检索和模型参数

| 项 | 内容 |
| --- | --- |
| 接口名称 | 保存系统配置 |
| 请求方法 | `PUT` |
| 建议 URL | `/api/settings` |
| 前端使用位置 | 保存配置按钮 |
| 当前是否有 mock | 有 |
| 后端优先级 | P1 |

请求示例：

```json
{
  "retrieval": {
    "topK": 8,
    "scoreThreshold": 0.35,
    "rerankEnabled": true,
    "knowledgeStrategy": "hybrid",
    "lowEvidenceHintEnabled": true
  },
  "model": {
    "modelName": "qwen-max",
    "temperature": 0.3,
    "maxTokens": 2048,
    "streamOutput": true
  }
}
```

返回示例：

```json
{
  "code": 0,
  "message": "saved",
  "data": {
    "saved": true,
    "savedAt": "2026-05-20 15:31"
  }
}
```

### 9.6 获取运行日志

| 项 | 内容 |
| --- | --- |
| 接口名称 | 获取运行日志 |
| 请求方法 | `GET` |
| 建议 URL | `/api/settings/logs` |
| 前端使用位置 | 运行日志表 |
| 当前是否有 mock | 有，`mockLogs` |
| 后端优先级 | P2 |

查询参数：

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `sceneMode` | string | 否 | 场景模式 |
| `success` | boolean | 否 | 是否成功 |
| `limit` | number | 否 | 返回条数，默认 100 |

返回示例：

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "list": [
      {
        "id": "log-001",
        "time": "2026-05-20 10:45",
        "user": "胡俊熙",
        "sceneMode": "design",
        "workflow": "wf_design_assist_v1.3",
        "success": true,
        "durationMs": 8320,
        "errorReason": ""
      }
    ]
  }
}
```

## 10. 后端实现优先级建议

### P0：最先完成，支撑核心演示闭环

1. `GET /api/documents`
2. `POST /api/documents/upload`
3. `GET /api/documents/{id}`
4. `POST /api/chat/sessions/{sessionId}/messages`
5. `GET /api/chat/messages/{messageId}/citations`
6. `POST /api/design-assistant/generate`

### P1：支撑 MVP 完整性

1. `GET /api/dashboard/stats`
2. `GET /api/dashboard/recent-documents`
3. `GET /api/dashboard/recent-activities`
4. `GET /api/chat/sessions`
5. `GET /api/chat/sessions/{sessionId}`
6. `POST /api/training/generate`
7. `POST /api/handover/generate`
8. `GET /api/history`
9. `GET /api/history/{id}`
10. `GET /api/settings`
11. `PUT /api/settings`

### P2：后续完善

1. `POST /api/documents/{id}/reindex`
2. `DELETE /api/documents/{id}`
3. `PATCH /api/documents/{id}/tags`
4. `GET /api/training/options`
5. `GET /api/handover/options`
6. `GET /api/design-assistant/options`
7. `POST /api/design-outputs`
8. `GET /api/design-outputs/{id}`
9. `DELETE /api/history/{id}`
10. `GET /api/settings/workflows`
11. `PATCH /api/settings/workflows/{sceneCode}`
12. `POST /api/settings/workflows/{sceneCode}/test`
13. `GET /api/settings/logs`

## 11. 前端 adapter 对接建议

如果后端字段和本文档字段不一致，前端不要大改页面，优先在 service / adapter 层处理：

| 模块 | adapter 位置 |
| --- | --- |
| 文档管理 | `document-service.js` |
| 智能问答 | `chat-service.js` |
| 培训模式 | `training-service.js` |
| 交接模式 | `handover-service.js` |
| 设计辅助 | `design-service.js` |
| 历史记录 | `history-service.js` |
| 后台配置 | `settings-service.js` |

建议后端同学实现接口时优先保证：

1. 字段命名稳定。
2. AI 生成结果必须带 citations。
3. 设计辅助必须返回结构化字段。
4. Dify 相关密钥只存后端。
5. 错误响应格式统一。
6. 文档状态和证据充分度枚举统一。
