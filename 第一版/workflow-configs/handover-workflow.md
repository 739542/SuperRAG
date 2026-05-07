# Handover Workflow

## 目标

让系统围绕项目交接问题，输出适合“接手人”阅读的结构化交接结果。

这个 workflow 的重点是：

- 当前进度
- 风险
- 待办
- 外部依赖
- 责任边界

## 节点结构

`Start -> Knowledge Retrieval -> LLM -> End`

## Start 节点配置

| variable | 类型 | required | 说明 |
| --- | --- | --- | --- |
| `question` | `paragraph` | 是 | 交接问题 |
| `role` | `text-input` | 否 | 接手角色，例如“后端接手开发” |
| `focus` | `text-input` | 否 | 交接重点，例如“强调风险和未完成事项” |
| `project` | `text-input` | 否 | 所属项目 |

## Knowledge Retrieval 节点配置

### 基础设置

- `query_variable_selector`: `Start.question`
- `dataset_ids`: 交接文档、设计文档、会议纪要、需求文档
- `retrieval_mode`: `multiple`

### multiple retrieval config

- `top_k`: `5`
- `score_threshold`: `0.35`
- `reranking_enable`: `false`

交接类问题对信息完整度要求更高，所以 `top_k` 可以比培训模式稍大一点。

## LLM 节点配置

### 推荐参数

- `temperature`: `0.2`
- `context.enabled`: `true`
- `context.variable_selector`: `Knowledge Retrieval.result`
- `structured_output_enabled`: `true`

### System Prompt

下面这段里的尖括号内容，请在 Dify 提示词编辑器中通过变量选择器插入，不要直接照抄成普通文本。

```text
你是“企业私有知识驱动的软件工程辅助系统”中的交接助手。

你的任务是把分散在企业资料中的项目状态、风险、待办和依赖梳理成一份适合接手人阅读的交接结果。

请严格遵守以下规则：
1. 优先使用检索证据，不要编造当前进度。
2. 明确区分“已知事实”和“无法确认”。
3. 输出风格要偏交接文档，而不是普通问答。
4. risks 和 next_actions 必须尽量具体。
5. summary 中要突出“现在做到哪、接下来做什么”。

接手角色：<插入 Start.role 变量>
交接重点：<插入 Start.focus 变量>
所属项目：<插入 Start.project 变量>
用户问题：<插入 Start.question 变量>
```

### User Prompt

```text
请基于检索到的项目资料，输出适合交接场景的结构化结果。
```

### Structured Output Schema

```json
{
  "type": "object",
  "properties": {
    "summary": { "type": "string", "description": "交接摘要，说明当前进度与整体状态" },
    "evidence": {
      "type": "array",
      "description": "能够支撑交接结论的依据",
      "items": { "type": "string" }
    },
    "risks": {
      "type": "array",
      "description": "风险、阻塞点、信息不明确之处",
      "items": { "type": "string" }
    },
    "next_actions": {
      "type": "array",
      "description": "接手后的优先待办",
      "items": { "type": "string" }
    }
  },
  "required": ["summary", "evidence", "risks", "next_actions"],
  "additionalProperties": false
}
```

## End 节点配置

| variable | value_selector | value_type |
| --- | --- | --- |
| `summary` | `LLM.structured_output.summary` | `string` |
| `evidence` | `LLM.structured_output.evidence` | `array[string]` |
| `risks` | `LLM.structured_output.risks` | `array[string]` |
| `next_actions` | `LLM.structured_output.next_actions` | `array[string]` |
| `citations` | `Knowledge Retrieval.result` | `array[object]` |

## 测试问题建议

1. 请整理库存模块交接时必须知道的当前进度、风险和待办。
2. 如果由新的后端同学接手当前项目，他最先要关注哪些未完成事项？
3. 目前项目推进中有哪些对外依赖和不确定因素？

## 达标标准

如果这个 workflow 配对了，前端“交接模式”页应该能看到：

- 进度摘要
- 风险列表
- 待办列表
- 引用片段
