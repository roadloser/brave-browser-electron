# 仅指纹：跨设备执行补充

2026-11-17 18:56（北京时间）。覆盖旧任务队列中非指纹继续开发的安排。

- A：平台traditional UA默认/Runtime原生布局元数据，只在codex/platform-modules。
- B：每API webcompat策略/站点例外/持久化/UI，只在codex/service-modules；不再开发任何服务模块。
- C：指纹runtime、Canvas/几何/首读与资源闭环，只在codex/fingerprint-coverage。
- M：main集成与仓库交接维护，不逐接口放行，不重复冻结。

所有新指纹case-cr、未完项和下一步必须落本仓库docs/handoff，不依赖本机run-01。三路分支各自可修改必要契约、提交无签名完整小模块，M处理冲突合main。非指纹未完不合未闭合代码，不留草稿依赖；VPN半成品已删除。

用户最新AGENTS已替换：中文、模块化、不做构建/tsc/校验/测试/格式化或收尾静态检查、不过度研究、已批准架构直接实施。任务其他已明确约束和映射层要求仍保持。

## 完成口径
仅有源码实现或case-cr并不代表等效已验证。指纹全覆盖仍以HANDOFF与fingerprint.md列出的真实API/上下文/异常链为目标；未解决字体/paint/native行为不得静默删去或写成完成。禁止运行验证的限制同时保留，明确区分源码闭环与未观察行为。
