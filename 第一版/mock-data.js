/**
 * SuperRAG mock data layer.
 *
 * This project is plain HTML/CSS/JS for now, so the shared mock dataset is
 * exposed on window.SuperRagMock. Future real API integration should keep
 * these field names stable and replace only api.js.
 */
(function () {
  const mockStats = {
    documentCount: 128,
    categoryCount: 16,
    todayQuestionCount: 42,
    designOutputCount: 19,
    indexingCount: 3,
    failedDocumentCount: 2,
  };

  const mockDocuments = [
    {
      id: "doc-001",
      title: "企业新人培训流程说明.docx",
      type: "Word",
      project: "企业知识库",
      tags: ["培训", "入职", "知识库"],
      uploader: "张晨",
      version: "v2.1",
      status: "indexed",
      visibilityScope: "项目成员",
      updatedAt: "2026-05-20 10:21",
      summary: "说明新人进入项目后的学习路径、关键术语、知识库使用方式和培训验收要求。",
      keywords: ["新人培训", "学习路径", "RAG", "知识库"],
      difyDatasetId: "ds_superrag_core",
      difyDocumentId: "dify_doc_training_v21",
    },
    {
      id: "doc-002",
      title: "项目交接规范.md",
      type: "Markdown",
      project: "交接知识库",
      tags: ["交接", "规范", "风险"],
      uploader: "李想",
      version: "v1.3",
      status: "indexed",
      visibilityScope: "项目成员",
      updatedAt: "2026-05-19 16:42",
      summary: "定义项目交接时需要整理的背景、进度、接口依赖、风险和待办项。",
      keywords: ["交接", "待办", "风险", "责任边界"],
      difyDatasetId: "ds_superrag_handover",
      difyDocumentId: "dify_doc_handover_spec",
    },
    {
      id: "doc-003",
      title: "需求分析说明书.pdf",
      type: "PDF",
      project: "阳光用药管控系统",
      tags: ["需求", "分析", "业务规则"],
      uploader: "王星",
      version: "v1.0",
      status: "indexing",
      visibilityScope: "团队内部",
      updatedAt: "2026-05-20 11:05",
      summary: "描述用药管控系统的业务目标、用户角色、功能边界和主要业务规则。",
      keywords: ["需求分析", "用户角色", "业务规则"],
      difyDatasetId: "ds_sunshine_medication",
      difyDocumentId: "dify_doc_requirement_pdf",
    },
    {
      id: "doc-004",
      title: "接口设计文档.xlsx",
      type: "Excel",
      project: "阳光用药管控系统",
      tags: ["接口", "设计", "API"],
      uploader: "陈涛",
      version: "v2.0",
      status: "indexed",
      visibilityScope: "项目成员",
      updatedAt: "2026-05-18 14:33",
      summary: "列出订单、用户、通知等模块的接口地址、鉴权方式、请求参数和响应字段。",
      keywords: ["接口", "JWT", "API Key", "响应字段"],
      difyDatasetId: "ds_sunshine_medication",
      difyDocumentId: "dify_doc_api_design",
    },
    {
      id: "doc-005",
      title: "系统部署手册.md",
      type: "Markdown",
      project: "企业知识库",
      tags: ["部署", "运维", "环境"],
      uploader: "刘洋",
      version: "v1.2",
      status: "failed",
      visibilityScope: "管理员",
      updatedAt: "2026-05-18 09:18",
      summary: "记录部署依赖、服务启动、环境变量和常见故障处理方式。",
      keywords: ["部署", "环境变量", "故障处理"],
      difyDatasetId: "ds_superrag_ops",
      difyDocumentId: "",
    },
    {
      id: "doc-006",
      title: "详细文本用例模板.docx",
      type: "Word",
      project: "测试知识库",
      tags: ["测试", "模板", "用例"],
      uploader: "赵敏",
      version: "v1.1",
      status: "pending",
      visibilityScope: "项目成员",
      updatedAt: "2026-05-17 17:26",
      summary: "提供功能用例、异常用例、前置条件、后置条件和验收口径的写作模板。",
      keywords: ["文本用例", "测试", "验收"],
      difyDatasetId: "ds_superrag_design",
      difyDocumentId: "",
    },
  ];

  const mockCitations = [
    {
      id: "cit-001",
      documentTitle: "企业新人培训流程说明.docx",
      snippet: "新人培训应先理解业务背景，再学习项目术语、数据流和关键接口调用链。",
      relevanceScore: 0.94,
      page: 3,
      segmentId: "seg-training-003",
    },
    {
      id: "cit-002",
      documentTitle: "项目交接规范.md",
      snippet: "交接结果需要包含当前进度、未完成事项、风险、依赖和责任人建议。",
      relevanceScore: 0.91,
      page: 2,
      segmentId: "seg-handover-002",
    },
    {
      id: "cit-003",
      documentTitle: "接口设计文档.xlsx",
      snippet: "用户中心接口使用 JWT 鉴权，订单中心接口需要检查支付状态和库存状态。",
      relevanceScore: 0.87,
      page: 1,
      segmentId: "seg-api-001",
    },
    {
      id: "cit-004",
      documentTitle: "需求分析说明书.pdf",
      snippet: "系统角色包括管理员、业务人员和项目成员，不同角色拥有不同可见范围。",
      relevanceScore: 0.82,
      page: 12,
      segmentId: "seg-requirement-012",
    },
    {
      id: "cit-005",
      documentTitle: "详细文本用例模板.docx",
      snippet: "文本用例应描述参与者、前置条件、主成功场景、异常场景和验收标准。",
      relevanceScore: 0.89,
      page: 5,
      segmentId: "seg-usecase-005",
    },
  ];

  const mockSessions = [
    {
      id: "sess-001",
      title: "智能灯状态上报机制是什么？",
      sceneMode: "chat",
      createdAt: "2026-05-20 10:12",
      updatedAt: "2026-05-20 10:21",
    },
    {
      id: "sess-002",
      title: "新人应优先理解哪些文档？",
      sceneMode: "training",
      createdAt: "2026-05-19 09:40",
      updatedAt: "2026-05-19 09:55",
    },
    {
      id: "sess-003",
      title: "订单模块交接风险梳理",
      sceneMode: "handover",
      createdAt: "2026-05-18 15:10",
      updatedAt: "2026-05-18 15:32",
    },
    {
      id: "sess-004",
      title: "培训模式页面设计建议",
      sceneMode: "design",
      createdAt: "2026-05-17 16:20",
      updatedAt: "2026-05-17 16:45",
    },
  ];

  const mockMessages = [
    {
      id: "msg-001",
      sessionId: "sess-001",
      role: "user",
      content: "智能灯状态上报机制是什么？需要哪些关键字段？",
      createdAt: "2026-05-20 10:20",
      citations: [],
    },
    {
      id: "msg-002",
      sessionId: "sess-001",
      role: "assistant",
      content: "智能灯通过 MQTT 上报运行状态，重点字段包括设备编号、时间戳、状态码、亮度、色温和电量等。建议结合接口设计文档核对字段类型和异常状态枚举。",
      createdAt: "2026-05-20 10:21",
      citations: ["cit-003", "cit-004"],
    },
    {
      id: "msg-003",
      sessionId: "sess-002",
      role: "user",
      content: "新人第一天应该先看哪些资料？",
      createdAt: "2026-05-19 09:40",
      citations: [],
    },
    {
      id: "msg-004",
      sessionId: "sess-002",
      role: "assistant",
      content: "建议先看企业新人培训流程说明，再阅读项目交接规范和接口设计文档。学习顺序应从业务背景、项目术语、核心流程到接口调用链逐步推进。",
      createdAt: "2026-05-19 09:55",
      citations: ["cit-001", "cit-002", "cit-003"],
    },
    {
      id: "msg-005",
      sessionId: "sess-003",
      role: "assistant",
      content: "订单模块交接的主要风险在于支付状态、库存状态和通知接口的联动验证不足，需要优先补充接口自测和异常场景说明。",
      createdAt: "2026-05-18 15:32",
      citations: ["cit-002", "cit-003"],
    },
  ];

  const mockDesignOutputs = [
    {
      id: "design-001",
      title: "培训模式模块设计初稿",
      inputQuestion: "基于企业私有知识，生成培训模式模块的功能清单和文本用例草稿。",
      project: "SuperRAG 企业软件工程知识助手",
      outputType: "module-design",
      createdAt: "2026-05-20 10:45",
      evidenceLevel: "high",
      functionList: [
        "培训问题输入与场景标签选择",
        "术语解释与背景说明生成",
        "学习路径和推荐资料展示",
        "引用证据追溯与证据不足提示",
      ],
      useCases: [
        "项目新人输入不理解的模块概念，系统返回背景、术语和学习建议。",
        "管理员选择培训主题，系统基于知识库生成阶段性学习路径。",
      ],
      moduleSuggestions: [
        "TrainingQueryForm",
        "LearningPathPanel",
        "RecommendedDocsList",
        "CitationPanel",
      ],
      risks: [
        "知识库资料不足时可能给出泛化建议。",
        "培训内容需要区分已确认事实和系统推断。",
      ],
      nextActions: [
        "补充新人培训提纲和模块说明文档。",
        "为培训模式 Workflow 固定结构化输出字段。",
      ],
      citations: ["cit-001", "cit-005"],
    },
    {
      id: "design-002",
      title: "交接模式页面结构建议",
      inputQuestion: "请为交接模式设计进度、风险、待办和证据追溯页面结构。",
      project: "SuperRAG 企业软件工程知识助手",
      outputType: "page-design",
      createdAt: "2026-05-19 14:30",
      evidenceLevel: "medium",
      functionList: [
        "交接问题输入",
        "进度摘要卡片",
        "待办表格",
        "风险监管卡片",
        "引用证据列表",
      ],
      useCases: [
        "接手人输入模块名后，系统汇总当前进度、风险和待办。",
        "项目负责人查看交接结果并补充责任人信息。",
      ],
      moduleSuggestions: ["HandoverSummary", "TodoTable", "RiskCard", "EvidenceCard"],
      risks: ["部分当前进度可能缺少明确更新时间。"],
      nextActions: ["增加文档更新时间和责任人字段。"],
      citations: ["cit-002", "cit-003"],
    },
  ];

  const mockTrainingResult = {
    id: "training-result-001",
    title: "新人培训说明",
    project: "SuperRAG 企业软件工程知识助手",
    topic: "项目背景",
    summary: "SuperRAG 面向企业软件工程知识治理，把文档入库、RAG 检索、场景化 Workflow 和引用证据追溯串成一个新人可理解、可复盘的学习入口。",
    background: "系统底层复用 Dify 的知识库、RAG 检索、Workflow 编排和 LLM 调用能力，但前端需要呈现企业业务系统，而不是直接展示 Dify 控制台或普通聊天机器人。",
    terms: [
      {
        term: "企业私有知识库",
        explanation: "由需求、接口、交接、培训和设计资料组成的内部知识集合，是问答和培训输出的依据来源。",
      },
      {
        term: "RAG 检索",
        explanation: "先从知识库召回相关片段，再组织回答，避免凭空生成无法追溯的结论。",
      },
      {
        term: "引用证据",
        explanation: "每个回答关联命中文档和片段，帮助新人判断结论是否可信。",
      },
      {
        term: "场景化 Workflow",
        explanation: "围绕培训、交接、设计辅助等具体场景固定输入输出结构，降低理解成本。",
      },
    ],
    learningPath: [
      {
        day: "第 1 天",
        title: "阅读项目说明和需求文档",
        description: "先理解系统目标、用户角色和核心业务闭环。",
      },
      {
        day: "第 2 天",
        title: "理解核心模块和数据流",
        description: "重点看文档管理、知识检索、智能问答和证据追溯。",
      },
      {
        day: "第 3 天",
        title: "阅读接口文档",
        description: "关注文档上传、列表、问答和 Workflow 输出字段。",
      },
      {
        day: "第 4 天",
        title: "运行本地环境",
        description: "启动前端和 dify-lite，验证文档入库与 mock fallback。",
      },
      {
        day: "第 5 天",
        title: "完成一个简单功能修改",
        description: "在已有页面中补一个小交互，并保留引用证据展示。",
      },
    ],
    recommendedDocs: [
      {
        title: "企业新人培训流程说明.docx",
        reason: "覆盖新人学习路径、术语理解和培训验收要求。",
        priority: "高",
        estimatedReadTime: "25 分钟",
      },
      {
        title: "项目交接规范.md",
        reason: "帮助理解项目背景、风险、待办和责任边界。",
        priority: "高",
        estimatedReadTime: "18 分钟",
      },
      {
        title: "接口设计文档.xlsx",
        reason: "用于熟悉核心模块接口和鉴权方式。",
        priority: "中",
        estimatedReadTime: "30 分钟",
      },
    ],
    citations: ["cit-001", "cit-002", "cit-003"],
  };

  const mockHandoverResult = {
    id: "handover-result-001",
    title: "项目交接摘要",
    project: "SuperRAG 企业软件工程知识助手",
    scope: "功能模块",
    projectBackground: "当前项目围绕企业私有知识库构建软件工程知识助手，核心闭环是文档上传入库、RAG 检索问答、场景化 Workflow 输出和引用证据追溯。",
    currentProgress: "已完成基础布局、文档管理页、mock/API 占位层、文档管理接口契约、文档管理真实后端小范围接入和智能问答页 mock 版本。",
    completedFeatures: [
      "首页 / 控制台基础展示",
      "文档管理页列表、筛选、上传弹窗和详情抽屉",
      "文档管理 service/adapter 与真实后端列表、上传接口预接入",
      "智能问答页三栏结构和引用证据面板",
    ],
    unfinishedItems: [
      "培训模式与交接模式需要结构化 mock 页面",
      "设计辅助页仍是占位",
      "历史记录和后台配置页仍是占位",
      "后端暂缺文档详情、删除、重新入库和标签更新接口",
    ],
    todos: [
      {
        taskName: "补齐培训模式结构化页面",
        priority: "高",
        riskLevel: "中",
        owner: "前端",
        dueDate: "2026-05-09",
        status: "进行中",
      },
      {
        taskName: "补齐后端文档详情接口",
        priority: "高",
        riskLevel: "高",
        owner: "后端",
        dueDate: "2026-05-12",
        status: "待处理",
      },
      {
        taskName: "统一 citations 与 evidenceLevel 字段",
        priority: "中",
        riskLevel: "中",
        owner: "前后端",
        dueDate: "2026-05-13",
        status: "待确认",
      },
    ],
    risks: [
      {
        type: "文档缺失",
        description: "当前后端没有文档详情、入库日志和标签更新接口，前端只能通过 adapter 和 mock 兜底。",
        impact: "文档治理闭环展示不完整",
        suggestion: "优先补 GET /api/documents/{id}、DELETE 和 reindex 接口。",
        evidenceSource: "文档管理接口契约 V0.1",
      },
      {
        type: "接口未确认",
        description: "AI 场景结果字段还未完全统一，结构化输出和证据充分度需要后端确认。",
        impact: "培训、交接、设计辅助后续联调可能需要字段适配",
        suggestion: "后端 Workflow 输出保留 citations、evidenceLevel 和 structuredOutput。",
        evidenceSource: "智能问答 service adapter",
      },
      {
        type: "测试覆盖不足",
        description: "当前主要通过 node --check 做语法检查，还没有端到端页面测试。",
        impact: "复杂交互可能在浏览器中出现边界问题",
        suggestion: "后续增加 Playwright 冒烟测试，覆盖路由和核心按钮。",
        evidenceSource: "阶段检查记录",
      },
    ],
    roles: [
      {
        role: "前端负责人",
        responsibility: "页面实现、service/adapter、mock 数据和视觉还原。",
      },
      {
        role: "后端负责人",
        responsibility: "dify-lite 接口、文档入库、Workflow 封装和字段契约确认。",
      },
      {
        role: "项目接手者",
        responsibility: "阅读交接摘要、确认待办优先级并补充缺失资料。",
      },
    ],
    dependentDocs: [
      "docs/document-api-contract.md",
      "企业新人培训流程说明.docx",
      "项目交接规范.md",
      "接口设计文档.xlsx",
    ],
    citations: ["cit-002", "cit-003", "cit-004"],
  };

  const mockWorkflows = [
    {
      sceneCode: "chat",
      sceneName: "智能问答",
      difyAppId: "app_general_chat",
      difyWorkflowId: "wf_general_chat_v1.2",
      status: "enabled",
    },
    {
      sceneCode: "training",
      sceneName: "培训模式",
      difyAppId: "app_training_mode",
      difyWorkflowId: "wf_training_mode_v1.2",
      status: "enabled",
    },
    {
      sceneCode: "handover",
      sceneName: "交接模式",
      difyAppId: "app_handover_mode",
      difyWorkflowId: "wf_handoff_mode_v1.1",
      status: "enabled",
    },
    {
      sceneCode: "design",
      sceneName: "设计辅助",
      difyAppId: "app_design_assistant",
      difyWorkflowId: "wf_design_assist_v1.3",
      status: "enabled",
    },
  ];

  window.SuperRagMock = {
    mockStats,
    mockDocuments,
    mockSessions,
    mockMessages,
    mockCitations,
    mockTrainingResult,
    mockHandoverResult,
    mockDesignOutputs,
    mockWorkflows,
  };
})();
