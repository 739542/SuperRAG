# SuperRAG 绘图说明

## 1. 本项目绘图工具选择

本仓库优先使用仓库级 draw.io skill 生成可编辑的 `.drawio` 图源文件。

- 首选产物：`.drawio`
- 条件允许时导出：`.svg`、`.png`、`.pdf`
- 当前仓库不依赖在线绘图服务作为主流程

## 2. draw.io Skill 安装位置

仓库级 skill 位于：

```text
.agents/skills/drawio/
```

官方参考仓库位于：

```text
tools/drawio-mcp/
```

## 3. 图源文件目录

可编辑图源统一保存到：

```text
docs/figures/source/
```

## 4. 导出文件目录

导出的展示文件统一保存到：

```text
docs/figures/export/
```

临时测试或实验性产物可保存到：

```text
outputs/figures/
```

## 5. 如何让 Codex 生成新图

在仓库根目录中向 Codex 明确说明：

- 图的主题
- 需要包含的模块或流程
- 输出格式
- 保存目录
- 视觉风格

可直接复制下面的示例：

```text
$drawio

请为 SuperRAG 生成一张中文“文档入库与向量化流程图”，输出 .drawio 和 svg。
图中包含：文档上传、格式解析、文本清洗、文本切片、元数据提取、Embedding、向量库写入、索引更新。
风格：蓝白浅科技风，适合系统设计书正文。
保存到 docs/figures/source/ 和 docs/figures/export/。
```

## 6. 如何手动打开 `.drawio`

优先使用本地 `draw.io Desktop` 或 `diagrams.net Desktop` 打开：

1. 启动桌面应用
2. 选择 `Open` 或 `File -> Open From -> Device`
3. 打开 `docs/figures/source/` 下的 `.drawio` 文件

## 7. 没有 draw.io Desktop 时怎么办

没有桌面版时，本仓库仍然可以先生成并保留 `.drawio` 源文件。

- 先把 `.drawio` 作为正式图源保存
- 后续安装 `draw.io Desktop` 后再打开和导出
- 只有在本地方案不可行且你明确允许时，再考虑手动导入在线编辑器

## 8. 后续建议

- 以后所有正式项目图统一保留 `.drawio` 源文件
- 导出图仅作为展示副本，不替代源文件
- 新图命名尽量使用稳定英文文件名，图内标签使用中文
- 同类图尽量复用 SuperRAG 统一模块命名和蓝白浅科技风样式
