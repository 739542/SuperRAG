# Workflow Configs

这组文档用于把 `第一版` 前端真正接到 Dify Workflow App。

推荐做法：

1. 在 Dify 里新建 `Workflow App`
2. 按本文档配置 `培训模式 / 交接模式 / 设计辅助` 三个 workflow
3. 为每个 workflow 发布应用并复制对应的 `Service API Key`
4. 把 Key 填到 [Dify 配置](../index.html) 对应位置

## 为什么这里统一用 Workflow App

你们当前前端已经预留了 `/v1/workflows/run` 的调用方式，并且会优先读取这些输出字段：

- `summary`
- `evidence`
- `risks`
- `next_actions`
- `function_list`
- `use_cases`
- `modules`
- `citations`

所以这三个场景建议都使用 `Workflow App`，而不是普通 Chat App。

## 通用配置原则

### 1. 节点链路

第一版统一采用最稳的四段式：

`Start -> Knowledge Retrieval -> LLM -> End`

这样好处是：

- 配置简单，适合课程项目节奏
- 易于联调
- 输出结构清晰
- 后续可以再插入 `IF/ELSE`、`Question Classifier`、`Code` 节点增强

### 2. Start 节点变量

尽量保持和前端一致：

- `question`
- `role`
- `focus`
- `module`（设计辅助专用）
- `project`

前端当前调用 workflow 时会把这些字段作为 `inputs` 传入。

### 3. Knowledge Retrieval 节点

建议：

- `query_variable_selector` 选择 `Start.question`
- `retrieval_mode` 先用 `multiple`
- `top_k` 先设为 `4` 到 `6`
- `score_threshold` 先设为 `0.35` 到 `0.45`
- `reranking_enable` 第一版可先关闭
- `metadata_filtering_mode` 第一版先用 `disabled`

### 4. LLM 节点

建议：

- 选择你已经在 Dify 中成功配置好的 `chat` 模型
- `temperature` 设为 `0.2` 到 `0.4`
- 打开 `context.enabled`
- `context.variable_selector` 指向 `Knowledge Retrieval.result`
- 打开 `structured_output`

### 5. End 节点

End 节点要直接对齐前端字段名，这样前端不用再改：

| 输出字段 | 作用 |
| --- | --- |
| `summary` | 结果摘要 |
| `evidence` | 关键依据列表 |
| `risks` | 风险提示列表 |
| `next_actions` | 后续动作列表 |
| `citations` | 检索到的引用片段 |
| `function_list` | 设计模式的功能清单 |
| `use_cases` | 设计模式的文本用例 |
| `modules` | 设计模式的模块建议 |

## 数据集选择建议

三个 workflow 共用一批企业私有资料即可，优先加入：

1. 课程设计说明书
2. 模块设计文档
3. 交接文档
4. 培训资料
5. 需求文档
6. 会议纪要

如果想提升效果，可以在 Dify 的数据集中加元数据标签：

- `scene=training`
- `scene=handover`
- `scene=design`
- `project=企业软件工程辅助系统`
- `doc_type=设计文档/交接文档/培训资料`

## 这三份配置文档怎么用

- [training-workflow.md](./training-workflow.md)：培训模式
- [handover-workflow.md](./handover-workflow.md)：交接模式
- [design-workflow.md](./design-workflow.md)：设计辅助

建议顺序：

1. 先配培训模式
2. 再配交接模式
3. 最后配设计辅助

原因是培训和交接都属于“结构化说明”，设计辅助的输出结构更复杂，放最后最稳。
