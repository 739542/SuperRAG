# 第一版

这是 SuperRAG 的静态前端原型页，当前默认连接本地 `dify-lite` 后端运行。

## 运行方式

```powershell
cd 第一版
.\start.cmd
```

或：

```powershell
powershell -ExecutionPolicy Bypass -File .\start.ps1
```

页面会打开 [index.html](/E:/Dify/第一版/index.html)。

## 当前约束

- 前端不再内置 `mock-data.js` 或 `api.js`
- 智能问答、培训、交接、设计、文档管理都优先走真实后端接口
- 后端不可用时，页面显示空态或明确报错，不再回退到本地 mock 数据
- 尚未提供真实接口的能力，例如“文档重新入库”“文档标签更新”，前端会直接提示未支持

## 后端地址

前端默认读取 [api-config.js](/E:/Dify/第一版/api-config.js) 中的：

```text
http://127.0.0.1:8088/api
```

## 建议

- 先确保 `dify-lite` 后端正常启动
- 再导入真实文档并现场生成问答、培训、交接和设计结果
- 如果页面报错，优先检查后端接口是否已经提供对应能力
