# 第一版

这是你们课程项目的第一版可演示原型，围绕主线：

`知识库 -> 检索 -> 设计`

这版的定位不是重写 Dify，而是先把你们自己的业务系统外壳做出来：

- `知识库管理`
- `通用检索`
- `培训模式`
- `交接模式`
- `设计辅助`
- `结果记录`
- `Dify 配置`

## 运行方式

最省事的方式是直接运行：

```powershell
cd C:\Users\JunxiHu\Desktop\综合设计\第一版
.\start.cmd
```

如果你希望手动走 PowerShell，也可以执行：

```powershell
cd C:\Users\JunxiHu\Desktop\综合设计\第一版
powershell -ExecutionPolicy Bypass -File .\start.ps1
```

运行后会直接用默认浏览器打开：

`index.html`

## 当前实现说明

这版默认可以直接演示，因为带了本地 mock 数据和 mock 结果逻辑。

也就是说：

- 还没配置 Dify 时，页面照样能完整跑流程
- 配好 Dify 地址和 API Key 后，系统会优先尝试调真实接口
- 如果真实接口失败，会自动回退到 mock，不会卡住演示

如果浏览器对本地文件访问远程接口有限制，也没关系：

- 第一版的 mock 演示不受影响
- 第二版可以把这套前端接到你们自己的轻量后端或静态服务里

## 如何接 Dify

建议在 Dify 中准备 4 个应用：

1. `通用检索`：建议接 Chat App
2. `培训模式`：建议接 Workflow App
3. `交接模式`：建议接 Workflow App
4. `设计辅助`：建议接 Workflow App

然后把各自的 Service API Key 填到页面里的 `Dify 配置` 区域。

默认推荐地址：

```text
http://localhost/v1
```

## 这版最适合的用途

1. 课程答辩演示
2. 梳理你们最终要做的页面结构
3. 明确后续哪些部分接 Dify，哪些部分自己做
4. 作为后续二次开发的基础壳

## 后续建议

下一步最值得做的是：

1. 在 Dify 里先建好培训 / 交接 / 设计三个 workflow
2. 把现在的 mock 输出逐步替换成真实 API 返回
3. 再补一个轻量后端，用于保存用户、记录、文档映射和日志

## 已补充的 workflow 方案

如果你准备开始在 Dify 里配置真实工作流，可以直接看：

- `workflow-configs/README.md`
- `workflow-configs/training-workflow.md`
- `workflow-configs/handover-workflow.md`
- `workflow-configs/design-workflow.md`

## 第三步已经补上的内容

当前这一版已经不只是纯 mock 原型，还额外补了联调支持：

1. 首页增加了 `联调状态`
2. `Dify 配置` 页增加了每个模式的连接测试
3. 可以直接看到最近一次连接诊断信息
4. 配置保存后会提示你重新测试连接
5. 真实接口失败时，仍然会自动回退到 mock，避免演示中断

## 建议现在怎么用

1. 先在 Dify 里配好培训 / 交接 / 设计三个 workflow
2. 把 API Key 填到页面里的 `Dify 配置`
3. 点击 `测试全部连接`
4. 看每个模式是否显示 `已连通`
5. 再回到对应页面执行真实问题测试
