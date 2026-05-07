# Design Workflow

## 目标

让系统围绕“设计准备”场景，从企业私有知识中提炼出设计初稿，而不是只返回一段聊天文本。

这个 workflow 的重点是：

- 功能清单
- 文本用例
- 模块边界
- 风险与后续动作
- 可追溯引用

## 节点结构

`Start -> Knowledge Retrieval -> LLM -> End`

## Start 节点配置

| variable | 类型 | required | 说明 |
| --- | --- | --- | --- |
| `question` | `paragraph` | 是 | 设计目标或设计问题 |
| `module` | `text-input` | 否 | 目标模块，例如“培训模式模块” |
| `focus` | `text-input` | 否 | 设计重点，例如“生成功能清单、用例、模块边界和风险” |
| `project` | `text-input` | 否 | 所属项目 |

## Knowledge Retrieval 节点配置

### 基础设置

- `query_variable_selector`: `Start.question`
- `dataset_ids`: 设计文档、需求文档、交接文档、会议纪要
- `retrieval_mode`: `multiple`

### multiple retrieval config

- `top_k`: `6`
- `score_threshold`: `0.35`
- `reranking_enable`: `false`

设计模式需要相对更完整的上下文，因此 `top_k` 建议略高。

## LLM 节点配置

### 推荐参数

- `temperature`: `0.25`
- `context.enabled`: `true`
- `context.variable_selector`: `Knowledge Retrieval.result`
- `structured_output_enabled`: `true`

### System Prompt

下面这段里的尖括号内容，需要在 Dify 提示词编辑器中用变量选择器插入，不要把尖括号一起粘进去当普通文字。

```text
你是“企业私有知识驱动的软件工程辅助系统”中的设计辅助助手。

你的任务是依据企业私有知识和用户给出的设计目标，生成结构化的设计准备结果。

请严格遵守以下规则：
1. 你输出的是“设计初稿”，不是最终定稿。
2. 所有建议都必须尽量依据检索到的资料，不要脱离上下文随意扩展。
3. 如果资料不足，请在 summary 或 risks 中明确提示。
4. function_list、use_cases、modules 都要尽量写得具体且可展示。
5. next_actions 要体现“接下来应该补什么、确认什么、实现什么”。

目标模块：<插入 Start.module 变量>
设计重点：<插入 Start.focus 变量>
所属项目：<插入 Start.project 变量>
用户问题：<插入 Start.question 变量>
```

### User Prompt

```text
请基于检索到的企业私有知识，输出设计辅助结果。
```

### Structured Output Schema

```json
{
  "type": "object",
  "properties": {
    "summary": { "type": "string", "description": "设计摘要，说明设计目标和总体判断" },
    "evidence": {
      "type": "array",
      "description": "支撑设计结论的依据",
      "items": { "type": "string" }
    },
    "risks": {
      "type": "array",
      "description": "设计风险、信息缺口或实现难点",
      "items": { "type": "string" }
    },
    "next_actions": {
      "type": "array",
      "description": "下一步建议",
      "items": { "type": "string" }
    },
    "function_list": {
      "type": "array",
      "description": "建议实现的功能清单",
      "items": { "type": "string" }
    },
    "use_cases": {
      "type": "array",
      "description": "文本用例或关键使用场景",
      "items": { "type": "string" }
    },
    "modules": {
      "type": "array",
      "description": "模块划分建议",
      "items": { "type": "string" }
    }
  },
  "required": [
    "summary",
    "evidence",
    "risks",
    "next_actions",
    "function_list",
    "use_cases",
    "modules"
  ],
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
| `function_list` | `LLM.structured_output.function_list` | `array[string]` |
| `use_cases` | `LLM.structured_output.use_cases` | `array[string]` |
| `modules` | `LLM.structured_output.modules` | `array[string]` |
| `citations` | `Knowledge Retrieval.result` | `array[object]` |

## 测试问题建议

1. 基于企业私有知识，生成“培训模式”模块的功能清单和文本用例草稿。
2. 请为我们的系统设计“交接模式”模块的主要页面与模块边界。
3. 围绕“知识库 -> 检索 -> 设计”主线，给出第一版系统的模块划分建议。

## 达标标准

如果这个 workflow 配对了，前端“设计辅助”页应该能看到：

- 设计摘要
- 功能清单
- 用例草稿
- 模块建议
- 风险和后续动作
- 引用片段
