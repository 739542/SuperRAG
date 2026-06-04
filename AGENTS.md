## SuperRAG diagram generation rules

When creating diagrams for this repository, follow these rules.

### Primary diagram tool

Use the repository-level draw.io skill when the task involves:

- SuperRAG system architecture diagrams
- RAG workflow diagrams
- document ingestion flowcharts
- retrieval and reranking flowcharts
- citation tracing diagrams
- permission and audit flowcharts
- user manual process diagrams
- system design document diagrams
- project report diagrams

Prefer editable `.drawio` sources for official project documents.

### Output locations

Save editable source files under:

```text
docs/figures/source/
```

Save exported images under:

```text
docs/figures/export/
```

Temporary or experimental outputs may go under:

```text
outputs/figures/
```

### Style requirements for SuperRAG official documents

For Chinese system design documents, user manuals, project reports, and roadshow materials:

- Use Chinese labels.
- Use a blue-white light technology style.
- Use clean rounded rectangles.
- Use clear directional arrows.
- Keep layout readable and not crowded.
- Avoid dark cyberpunk style.
- Avoid dashboard-like visual noise.
- Avoid excessive glowing effects.
- Avoid fake 3D effects.
- Avoid inventing modules that do not exist in the project.

### Editable source requirement

Every official diagram must preserve an editable source file:

- Preferred: `.drawio`
- Acceptable for technical markdown: `.mmd`
- Acceptable for UML or sequence diagrams: `.puml`

For draw.io diagrams, export SVG or PNG only as a presentation copy. The `.drawio` file is the source of truth.

### Data and privacy rules

Do not read private enterprise documents unless explicitly asked.
Do not upload local documents.
Do not use online diagram services when local generation is possible.
Do not delete existing figures.
Do not overwrite existing figures unless explicitly requested.

### Recommended SuperRAG diagram modules

When drawing the SuperRAG system, use these module names consistently:

- 文档上传
- 文档解析
- 文本切片
- 向量化
- 向量库
- 检索召回
- 重排序
- 大模型生成
- 引用溯源
- 权限控制
- 日志审计
- 智能问答
- 培训模式
- 交接模式
- 辅助设计
