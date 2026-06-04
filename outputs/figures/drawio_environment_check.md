# draw.io 环境检查

- 检查日期：2026-06-02
- 当前系统：Windows PowerShell，会话工作目录为 `E:\Dify`
- draw.io Desktop：未检测到
- draw.io CLI：未检测到
- `diagrams.net` CLI：未检测到
- Node.js：检测到 `node.exe` 路径为 `C:\Program Files\WindowsApps\OpenAI.Codex_26.527.3686.0_x64__2p2nqsd0c76g0\app\resources\node.exe`，但在当前会话中执行 `node -v` 返回“拒绝访问”
- npm：未检测到
- npx：未检测到

## 结论

当前环境不适合依赖本机 draw.io Desktop CLI，也不适合依赖 Node.js + npm/npx 做导出或 MCP 启动。

## 建议

- 当前主方案：生成并保留 `.drawio` 源文件
- 当前推荐模式：`.drawio` only
- 如果后续安装了 `draw.io Desktop`，可以再补导出 `SVG/PNG/PDF`
- 如果后续修复了 Node.js/npm/npx 可执行环境，可再尝试 `url` 模式或 `@drawio/mcp`
