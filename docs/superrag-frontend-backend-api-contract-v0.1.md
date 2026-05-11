# SuperRAG 前后端接口契约

版本：V0.1

状态：基于当前前端 mock / api / service 层整理，待后端确认

适用范围：首页、文档管理、智能问答、培训模式、交接模式、设计辅助、历史记录、后台配置

维护人：前端与后端共同维护

## 1. 总体约定

SuperRAG 前端不能直接调用 Dify API，Dify API Key 不能暴露在前端。前端只调用我们自己的后端接口，由后端统一封装：

- Dify 知识库
- RAG 检索
- Workflow 编排
- LLM 调用
- 数据库记录
- 文档入库与映射

建议统一 API 前缀：

```text
/api
```

## 2. 统一响应格式

成功响应：

```json
{
  "code": 0,
  "message": "success",
  "data": {},
  "traceId": "req-20260508-001"
}
```

错误响应：

```json
{
  "code": 40001,
  "message": "文档不存在",
  "error": {
    "type": "DOCUMENT_NOT_FOUND",
    "detail": "document id not found"
  },
  "traceId": "req-20260508-002"
}
```

常见错误类型建议：

| code | type | 说明 |
| --- | --- | --- |
| 40001 | DOCUMENT_NOT_FOUND | 文档不存在 |
| 40002 | INVALID_FILE_TYPE | 文件类型不支持 |
| 40003 | UPLOAD_FAILED | 上传失败 |
| 40004 | INGESTION_TASK_FAILED | 入库任务创建失败 |
| 40005 | VALIDATION_ERROR | 请求参数错误 |
| 40101 | UNAUTHORIZED | 未登录或登录失效 |
| 40301 | FORBIDDEN | 无权限访问 |
| 50001 | SERVER_ERROR | 服务端异常 |
| 50002 | DIFY_REQUEST_FAILED | Dify 调用失败 |
| 50003 | WORKFLOW_FAILED | Workflow 执行失败 |

## 3. 统一枚举

### 3.1 文档状态

| 状态值 | 中文展示 | 说明 |
| --- | --- | --- |
| indexed | 已入库 | 已解析并完成知识库映射，可被 RAG 检索 |
| indexing | 解析中 | 正在解析、切分、向量化或同步 Dify |
| failed | 解析失败 | 入库失败，需要重新入库或人工处理 |
| pending | 待处理 | 已登记但尚未进入入库流程 |

### 3.2 证据充分度

所有 AI 生成类接口必须返回 `evidenceLevel`。

| 状态值 | 中文展示 | 说明 |
| --- | --- | --- |
| sufficient | 充分 | 引用证据较充分，可进入常规人工复核 |
| partial | 部分充分 | 有证据但不完整，建议人工确认 |
| low | 不足 | 证据不足，仅可作为初步参考 |

### 3.3 场景模式

| 值 | 页面 |
| --- | --- |
| chat | 智能问答 |
| training | 培训模式 |
| handover | 交接模式 |
| design | 设计辅助 |

## 4. 引用证据 Citation 统一结构

所有 AI 生成类接口都必须返回 `citations`。

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

## 5. 首页 / 控制台

### 5.1 获取统计数据

| 项 | 内容 |
| --- | --- |
| 接口名称 | 获取首页统计数据 |
| 请求方法 | GET |
| 建议 URL | `/api/dashboard/stats` |
| 请求参数 | 无 |
| 前端页面 | 首页 / 控制台 |
| 当前 mock | 有，`mockStats` |
| 优先级 | P0 |

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

### 5.2 获取最近文档

| 项 | 内容 |
| --- | --- |
| 接口名称 | 获取最近上传文档 |
| 请求方法 | GET |
| 建议 URL | `/api/dashboard/recent-documents` |
| 请求参数 | `limit`，默认 5 |
| 前端页面 | 首页 / 控制台 |
| 当前 mock | 有，来自 `mockDocuments` |
| 优先级 | P0 |

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

### 5.3 获取最近问答或设计产物

| 项 | 内容 |
| --- | --- |
| 接口名称 | 获取最近活动记录 |
| 请求方法 | GET |
| 建议 URL | `/api/dashboard/recent-activities` |
| 请求参数 | `limit`、`type`，例如 `chat,design` |
| 前端页面 | 首页 / 控制台 |
| 当前 mock | 部分有，来自 `mockSessions` / `mockDesignOutputs` |
| 优先级 | P1 |

返回示例：

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "list": [
      {
        "id": "sess-001",
        "title": "新人应优先理解哪些文档？",
        "sceneMode": "training",
        "updatedAt": "2026-05-19 09:55"
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

## 6. 文档管理

### 6.1 文档列表

| 项 | 内容 |
| --- | --- |
| 接口名称 | 获取文档列表 |
| 请求方法 | GET |
| 建议 URL | `/api/documents` |
| 请求参数 | `keyword`、`type`、`project`、`uploader`、`status`、`visibilityScope`、`page`、`pageSize` |
| 前端页面 | 文档管理页 |
| 当前 mock | 有，`mockDocuments` |
| 优先级 | P0 |

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

### 6.2 文档上传

| 项 | 内容 |
| --- | --- |
| 接口名称 | 上传文档 |
| 请求方法 | POST |
| 建议 URL | `/api/documents/upload` |
| 请求类型 | `multipart/form-data` |
| 请求参数 | `file`、`type`、`project`、`tags`、`visibilityScope` |
| 前端页面 | 文档管理页 |
| 当前 mock | 有 |
| 优先级 | P0 |

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
    "updatedAt": "2026-05-20 14:22"
  }
}
```

### 6.3 文档详情

| 项 | 内容 |
| --- | --- |
| 接口名称 | 获取文档详情 |
| 请求方法 | GET |
| 建议 URL | `/api/documents/{id}` |
| 请求参数 | path: `id` |
| 前端页面 | 文档详情抽屉 |
| 当前 mock | 有 |
| 优先级 | P0 |

返回示例：

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "id": "doc-001",
    "title": "企业新人培训流程说明.docx",
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

### 6.4 文档重新入库

| 项 | 内容 |
| --- | --- |
| 接口名称 | 文档重新入库 |
| 请求方法 | POST |
| 建议 URL | `/api/documents/{id}/reindex` |
| 请求参数 | path: `id`；body: `reason`、`force` |
| 前端页面 | 文档管理页 |
| 当前 mock | 有 |
| 优先级 | P1 |

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

### 6.5 文档删除

| 项 | 内容 |
| --- | --- |
| 接口名称 | 删除文档 |
| 请求方法 | DELETE |
| 建议 URL | `/api/documents/{id}` |
| 请求参数 | path: `id` |
| 前端页面 | 文档管理页 |
| 当前 mock | 有 |
| 优先级 | P1 |

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

### 6.6 文档标签更新

| 项 | 内容 |
| --- | --- |
| 接口名称 | 更新文档标签 |
| 请求方法 | PATCH |
| 建议 URL | `/api/documents/{id}/tags` |
| 请求参数 | path: `id`；body: `tags` |
| 前端页面 | 文档管理页 |
| 当前 mock | 有 |
| 优先级 | P2 |

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

## 7. 智能问答

### 7.1 创建会话

| 项 | 内容 |
| --- | --- |
| 接口名称 | 创建问答会话 |
| 请求方法 | POST |
| 建议 URL | `/api/chat/sessions` |
| 前端页面 | 智能问答页 |
| 当前 mock | 本地 mock |
| 优先级 | P1 |

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

### 7.2 获取会话列表

| 项 | 内容 |
| --- | --- |
| 接口名称 | 获取问答会话列表 |
| 请求方法 | GET |
| 建议 URL | `/api/chat/sessions` |
| 请求参数 | `keyword`、`page`、`pageSize` |
| 前端页面 | 智能问答页 |
| 当前 mock | 有，`mockSessions` |
| 优先级 | P1 |

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
        "updatedAt": "2026-05-20 10:21"
      }
    ]
  }
}
```

### 7.3 获取会话详情

| 项 | 内容 |
| --- | --- |
| 接口名称 | 获取问答会话详情 |
| 请求方法 | GET |
| 建议 URL | `/api/chat/sessions/{sessionId}` |
| 请求参数 | path: `sessionId` |
| 前端页面 | 智能问答页 |
| 当前 mock | 有，`mockMessages` |
| 优先级 | P1 |

返回示例：

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "id": "sess-001",
    "messages": [
      {
        "id": "msg-001",
        "role": "user",
        "content": "智能灯状态上报机制是什么？",
        "createdAt": "2026-05-20 10:20"
      }
    ]
  }
}
```

### 7.4 发送问题

| 项 | 内容 |
| --- | --- |
| 接口名称 | 发送知识库问题 |
| 请求方法 | POST |
| 建议 URL | `/api/chat/sessions/{sessionId}/messages` |
| 请求参数 | path: `sessionId`；body: `question`、`answerMode`、`knowledgeBaseId`、`project` |
| 前端页面 | 智能问答页 |
| 当前 mock | 有，`generateMockAnswer()` |
| 优先级 | P0 |

请求示例：

```json
{
  "question": "请总结文档入库流程",
  "answerMode": "evidence",
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
    "id": "msg-002",
    "role": "assistant",
    "answer": "根据当前知识库，文档入库流程包括上传、解析、切分、向量化、写入 Dify Dataset 和状态回写。",
    "structuredAnswer": {
      "conclusion": "文档入库流程应按上传、解析、切分、向量化、映射和状态回写组织。",
      "evidence": "相关资料多次提到文档解析、知识库入库和引用证据追溯。",
      "suggestion": "优先保证上传后状态可见，并在失败时支持重新入库。",
      "uncertainty": "若后端没有返回入库日志，前端只能展示 mock 日志。"
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
    ]
  }
}
```

### 7.5 获取引用证据

| 项 | 内容 |
| --- | --- |
| 接口名称 | 获取消息引用证据 |
| 请求方法 | GET |
| 建议 URL | `/api/chat/messages/{messageId}/citations` |
| 请求参数 | path: `messageId` |
| 前端页面 | 智能问答页右侧证据面板 |
| 当前 mock | 有，`mockCitations` |
| 优先级 | P0 |

返回示例：

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "list": [
      {
        "id": "cit-001",
        "documentTitle": "接口设计文档.xlsx",
        "snippet": "用户中心接口使用 JWT 鉴权。",
        "relevanceScore": 0.87,
        "page": 1,
        "segmentId": "seg-api-001"
      }
    ]
  }
}
```

## 8. 培训模式

### 8.1 提交培训问题

| 项 | 内容 |
| --- | --- |
| 接口名称 | 生成培训结构化结果 |
| 请求方法 | POST |
| 建议 URL | `/api/training/generate` |
| 请求参数 | `query`、`topic`、`project` |
| 前端页面 | 培训模式页 |
| 当前 mock | 有，`mockTrainingResult` |
| 优先级 | P1 |

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
    "id": "training-001",
    "summary": "SuperRAG 面向企业软件工程知识治理。",
    "background": "系统底层复用 Dify 的知识库、RAG 检索和 Workflow 能力。",
    "terms": [
      {
        "term": "RAG 检索",
        "explanation": "先从知识库召回相关片段，再组织回答。"
      }
    ],
    "learningPath": [
      {
        "day": "第 1 天",
        "title": "阅读项目说明和需求文档",
        "description": "理解系统目标、用户角色和核心业务闭环。"
      }
    ],
    "recommendedDocs": [
      {
        "title": "企业新人培训流程说明.docx",
        "reason": "覆盖新人学习路径和术语理解。",
        "priority": "高",
        "estimatedReadTime": "25 分钟"
      }
    ],
    "evidenceLevel": "sufficient",
    "citations": []
  }
}
```

## 9. 交接模式

### 9.1 提交交接问题

| 项 | 内容 |
| --- | --- |
| 接口名称 | 生成交接结构化结果 |
| 请求方法 | POST |
| 建议 URL | `/api/handover/generate` |
| 请求参数 | `query`、`project`、`scope` |
| 前端页面 | 交接模式页 |
| 当前 mock | 有，`mockHandoverResult` |
| 优先级 | P1 |

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
    "id": "handover-001",
    "projectBackground": "当前项目围绕企业私有知识库构建软件工程知识助手。",
    "currentProgress": "已完成基础布局、文档管理页、智能问答页和设计辅助页。",
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

## 10. 设计辅助

设计辅助是当前系统最重要的差异化页面。后端不能只返回一段 `answer` 字符串，必须返回 `structuredOutput`。

### 10.1 提交设计目标并生成设计产物

| 项 | 内容 |
| --- | --- |
| 接口名称 | 生成设计辅助结构化产物 |
| 请求方法 | POST |
| 建议 URL | `/api/design-assistant/generate` |
| 请求参数 | `inputQuestion`、`outputType`、`project`、`granularity` |
| 前端页面 | 设计辅助页 |
| 当前 mock | 有，`mockDesignOutputs` / `generateMockDesignOutput()` |
| 优先级 | P0 |

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
    "granularity": "标准",
    "evidenceLevel": "sufficient",
    "structuredOutput": {
      "functionList": [
        {
          "id": "F-001",
          "name": "设计目标输入与产物类型选择",
          "description": "支持用户输入设计目标，并选择功能清单、详细文本用例等产物类型。",
          "priority": "高",
          "relatedDocument": "需求分析说明书.pdf"
        }
      ],
      "useCases": [
        {
          "id": "UC-001",
          "name": "生成详细文本用例初稿",
          "actor": "项目成员",
          "preconditions": ["需求文档、接口文档和用例模板已入库"],
          "mainSuccessScenario": ["用户输入设计目标", "系统检索企业知识库", "系统生成结构化设计建议"],
          "extensionScenarios": ["用户切换输出粒度后重新生成"],
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
      }
    },
    "citations": []
  }
}
```

### 10.2 保存设计产物

| 项 | 内容 |
| --- | --- |
| 接口名称 | 保存设计产物 |
| 请求方法 | POST |
| 建议 URL | `/api/design-outputs` |
| 请求参数 | `sourceId`、`title`、`structuredOutput`、`citations` |
| 前端页面 | 设计辅助页 / 历史记录页 |
| 当前 mock | 暂无，仅前端提示 |
| 优先级 | P1 |

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

### 10.3 获取设计产物详情

| 项 | 内容 |
| --- | --- |
| 接口名称 | 获取设计产物详情 |
| 请求方法 | GET |
| 建议 URL | `/api/design-outputs/{id}` |
| 请求参数 | path: `id` |
| 前端页面 | 设计辅助页 / 历史记录页 |
| 当前 mock | 部分有 |
| 优先级 | P2 |

返回示例：

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "id": "design-001",
    "title": "设计辅助模块详细文本用例初稿",
    "structuredOutput": {},
    "evidenceLevel": "sufficient",
    "citations": []
  }
}
```

## 11. 历史记录

### 11.1 获取历史记录列表

| 项 | 内容 |
| --- | --- |
| 接口名称 | 获取历史记录列表 |
| 请求方法 | GET |
| 建议 URL | `/api/history` |
| 请求参数 | `keyword`、`sceneMode`、`dateFrom`、`dateTo`、`page`、`pageSize` |
| 前端页面 | 历史记录页 |
| 当前 mock | 部分可由 `mockSessions` / `mockDesignOutputs` 拼接 |
| 优先级 | P2 |

返回示例：

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "total": 28,
    "list": [
      {
        "id": "hist-001",
        "title": "设计辅助模块用例生成",
        "sceneMode": "design",
        "createdAt": "2026-05-20 10:21",
        "citationCount": 12
      }
    ]
  }
}
```

### 11.2 获取历史记录详情

| 项 | 内容 |
| --- | --- |
| 接口名称 | 获取历史记录详情 |
| 请求方法 | GET |
| 建议 URL | `/api/history/{id}` |
| 请求参数 | path: `id` |
| 前端页面 | 历史记录页 |
| 当前 mock | 暂无 |
| 优先级 | P2 |

返回示例：

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "id": "hist-001",
    "title": "设计辅助模块用例生成",
    "sceneMode": "design",
    "input": "基于现有需求文档，为设计辅助模块生成详细文本用例。",
    "output": {},
    "citations": []
  }
}
```

### 11.3 删除历史记录

| 项 | 内容 |
| --- | --- |
| 接口名称 | 删除历史记录 |
| 请求方法 | DELETE |
| 建议 URL | `/api/history/{id}` |
| 请求参数 | path: `id` |
| 前端页面 | 历史记录页 |
| 当前 mock | 暂无 |
| 优先级 | P3 |

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

## 12. 后台配置

### 12.1 获取 Workflow 映射

| 项 | 内容 |
| --- | --- |
| 接口名称 | 获取 Workflow 映射 |
| 请求方法 | GET |
| 建议 URL | `/api/settings/workflows` |
| 请求参数 | 无 |
| 前端页面 | 后台配置页 |
| 当前 mock | 有，`mockWorkflows` |
| 优先级 | P1 |

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

### 12.2 获取检索参数

| 项 | 内容 |
| --- | --- |
| 接口名称 | 获取检索参数 |
| 请求方法 | GET |
| 建议 URL | `/api/settings/retrieval` |
| 请求参数 | 无 |
| 前端页面 | 后台配置页 |
| 当前 mock | 暂无 |
| 优先级 | P2 |

返回示例：

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "topK": 8,
    "scoreThreshold": 0.35,
    "rerankEnabled": true,
    "knowledgeScope": "hybrid"
  }
}
```

### 12.3 获取模型参数

| 项 | 内容 |
| --- | --- |
| 接口名称 | 获取模型参数 |
| 请求方法 | GET |
| 建议 URL | `/api/settings/model` |
| 请求参数 | 无 |
| 前端页面 | 后台配置页 |
| 当前 mock | 暂无 |
| 优先级 | P2 |

返回示例：

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "modelName": "qwen-max",
    "temperature": 0.3,
    "maxTokens": 2048
  }
}
```

### 12.4 获取运行日志

| 项 | 内容 |
| --- | --- |
| 接口名称 | 获取运行日志 |
| 请求方法 | GET |
| 建议 URL | `/api/settings/logs` |
| 请求参数 | `module`、`level`、`limit` |
| 前端页面 | 后台配置页 |
| 当前 mock | 暂无 |
| 优先级 | P2 |

返回示例：

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "list": [
      {
        "time": "2026-05-20 10:45",
        "module": "design",
        "level": "INFO",
        "message": "workflow success",
        "durationMs": 8320
      }
    ]
  }
}
```

## 13. 后端实现优先级建议

### P0：必须优先完成

1. 文档列表：`GET /api/documents`
2. 文档上传：`POST /api/documents/upload`
3. 文档详情：`GET /api/documents/{id}`
4. 智能问答发送问题：`POST /api/chat/sessions/{sessionId}/messages`
5. 获取消息引用证据：`GET /api/chat/messages/{messageId}/citations`
6. 设计辅助生成：`POST /api/design-assistant/generate`

### P1：MVP 演示闭环建议完成

1. 首页统计与最近数据
2. 会话列表与会话详情
3. 培训模式生成
4. 交接模式生成
5. Workflow 映射配置
6. 设计产物保存
7. 文档重新入库与删除

### P2：后续完善

1. 历史记录列表与详情
2. 检索参数、模型参数
3. 运行日志
4. 设计产物详情
5. 标签更新

### P3：增强能力

1. 历史记录删除
2. WebSocket / SSE 文档入库状态推送
3. Markdown / Word 导出
4. 权限与审计日志

## 14. 如果后端已经有接口

如果后端同学此时已经实现了一部分接口，建议插入第 10.6 步：

1. 读取真实 Controller / Router / API 文件。
2. 提取真实 URL、方法、字段。
3. 与本文档逐条对比。
4. 输出字段映射表。
5. 决定前端 adapter 如何适配。

不要直接大改页面组件。字段差异优先在 `documentService`、`chatService`、`trainingService`、`handoverService`、`designService` 的 adapter 层处理。
