# draw.io MCP 检查

- 检查日期：2026-06-02
- 执行命令：`npx @drawio/mcp --help`

## 结果

检查失败。

PowerShell 返回：

```text
npx : 无法将“npx”项识别为 cmdlet、函数、脚本文件或可运行程序的名称。
```

## 原因判断

- 当前环境没有可用的 `npx`
- 当前环境也没有可正常执行的 Node.js + npm 工具链

## 影响评估

这不影响本次主任务完成，因为本次主方案是仓库级 draw.io skill + `.drawio` 源文件落地，而不是强依赖 MCP Tool Server。
