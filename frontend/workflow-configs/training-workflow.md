# Training Workflow

## 目标

让系统围绕企业私有知识，输出适合新人快速理解项目的培训型结果。

这个 workflow 的重点不是“直接给结论”，而是：

- 背景说明
- 术语解释
- 学习路径
- 重点资料建议
- 引用依据

## 节点结构

`Start -> Knowledge Retrieval -> LLM -> End`

## Start 节点配置

变量建议如下：

| variable | 类型 | required | 说明 |
| --- | --- | --- | --- |
| `question` | `paragraph` | 是 | 培训问题 |
| `role` | `text-input` | 否 | 学习对象，例如“新加入项目的开发同学” |
| `focus` | `text-input` | 否 | 培训重点，例如“先懂概念，再知道怎么上手” |
| `project` | `text-input` | 否 | 项目名，默认可填“企业软件工程辅助系统” |

## Knowledge Retrieval 节点配置

### 基础设置

- `query_variable_selector`: `Start.question`
- `dataset_ids`: 选择设计书、培训资料、交接文档、模块说明
- `retrieval_mode`: `multiple`

### multiple retrieval config

- `top_k`: `4`
- `score_threshold`: `0.4`
- `reranking_enable`: `false`

第一版先不要把检索链路做复杂，先保证结果稳定可解释。

## LLM 节点配置

### 推荐参数

- `temperature`: `0.3`
- `context.enabled`: `true`
- `context.variable_selector`: `Knowledge Retrieval.result`
- `structured_output_enabled`: `true`

### System Prompt

下面这段里的尖括号内容，不要手敲成固定字符串。

要在 Dify 提示词编辑器里，用变量选择器插入对应的 Start 节点变量。

```text
你是“企业私有知识驱动的软件工程辅助系统”中的培训助手。

你的任务不是普通聊天，而是基于企业私有知识，为项目新人生成结构化培训结果。

请严格遵守以下规则：
1. 优先依据知识检索结果回答，不要脱离资料随意发挥。
2. 输出要适合“刚接触项目的人”阅读，语言清楚、分层明确。
3. 如果证据不足，要明确指出“不足以确认”的地方。
4. 不要只给结论，要补充背景、术语、学习建议。
5. evidence、risks、next_actions 都要尽量输出为短句列表。

你当前面对的学习对象：<插入 Start.role 变量>
当前培训重点：<插入 Start.focus 变量>
所属项目：<插入 Start.project 变量>
用户问题：<插入 Start.question 变量>
```

### User Prompt

```text
请围绕上面的用户问题，结合检索到的企业知识，输出培训型结果。
```

### Structured Output Schema

建议在可视化编辑器里配置成这些字段：

```json
{
  "type": "object",
  "properties": {
    "summary": { "type": "string", "description": "给新人的结论摘要，2到4句话" },
    "evidence": {
      "type": "array",
      "description": "关键依据列表",
      "items": { "type": "string" }
    },
    "risks": {
      "type": "array",
      "description": "理解风险或信息不足点",
      "items": { "type": "string" }
    },
    "next_actions": {
      "type": "array",
      "description": "学习建议或后续动作",
      "items": { "type": "string" }
    }
  },
  "required": ["summary", "evidence", "risks", "next_actions"],
  "additionalProperties": false
}
```

## End 节点配置

输出字段按下面配置：

| variable | value_selector | value_type |
| --- | --- | --- |
| `summary` | `LLM.structured_output.summary` | `string` |
| `evidence` | `LLM.structured_output.evidence` | `array[string]` |
| `risks` | `LLM.structured_output.risks` | `array[string]` |
| `next_actions` | `LLM.structured_output.next_actions` | `array[string]` |
| `citations` | `Knowledge Retrieval.result` | `array[object]` |

## 测试问题建议

1. 请解释我们系统中的 RAG 流程和 Dify 在其中承担什么角色？
2. 新人接手这个课设，第一天最该先理解哪些概念？
3. 为什么我们不直接重写一个 RAG 框架，而是复用 Dify？

## 达标标准

如果这个 workflow 配对了，前端“培训模式”页应该能看到：

- 结果摘要
- 关键依据
- 风险提示
- 后续动作
- 引用片段
