# Brave Electron 交接

更新：2026-11-17 18:53（北京时间）。本稿经[case-cr](docs/handoff/2026-11-17-case-cr.md)自评后整合。

## 当前有效任务

**只继续完成指纹防护。其他模块停止新增实现。** 保留已经合入main的功能，不需要读取旧聊天或本机项目外资料才能续接。

最初目标：直接依据Brave功能/交互/行为实现独立Electron浏览器。Craft仅提供现成依赖选择，不复制Craft浏览器代码。维护以TypeScript/React/Electron/Node和成熟依赖为主；等效实现必须隔离为业务port→adapter，便于替换失败方案，不建立新后端、Chromium/Rust/native维护体系。

## Git与未完成文件

- 交接前main基线：56f509e，已合入全部ready功能提交，包括指纹6ca7b7f和Rewards验证码f21a2e0。
- 工作区中的13个VPN/SKUs官方账户草稿尚缺依赖、持久化、预加载入口和UI。按用户要求已从当前工作树移除，临时草稿分支也已删除，**不要求下一设备恢复或合入它们**。
- 已完成的VPN Guardian/System IKEv2模块在main；官方账户登录激活未完成，继续作为非指纹停工缺口。
- 所有已经交付的功能以main为准；worktree是本机协作设施，不是运行或续接前提。换设备直接使用main和本文件，不依赖绝对路径。
- 未push。提交中文格式为feat(英文模块): 中文描述或对应fix/docs，禁签名。完整小模块及时提交；复杂任务可独立worktree/分支，完成合main。保留已有历史，不amend。

## 实现、集成、运行三种状态

下列“已合”仅表示源码实现与静态装配。**所有模块均无本项目运行验收证据，observed=false。** 没有运行构建、测试、tsc、格式化或收尾静态检查；锁文件解析与Git操作不构成功能验证。

| 模块 | main中已有内容 | 仍有差异/停工内容 |
| --- | --- | --- |
| 核心与外壳 | 多资料/普通私密/Tor上下文、标签/导航/恢复、横纵标签/分屏、查找/缩放/打印/本地文件、界面恢复 | 实际焦点、系统窗口、重启隔离待观察 |
| 收藏/历史/标签组 | 真实增改移删/目录顺序/分组/范围清理/事务事件/私密边界、Sync数据接口 | 实际持久化与恢复待观察 |
| 下载/设置/站点权限与数据 | 下载状态/暂停取消恢复、权限请求与撤销、已观察origin目录、精确Cookie与存储清理/部分失败 | 不宣称全磁盘存储origin枚举；分区/系统权限待观察 |
| 凭据 | safeStorage密文、页面识别/保存确认/来源匹配填充、私密限制 | 复杂表单/密码同步真实观察未做 |
| 新页/页面工具 | 背景/快捷项、Readability阅读、截图、官方主frame翻译/取消恢复 | 翻译需合法服务资格；Brave本身不支持通用subframe翻译 |
| Shields | Ghostery规则/请求/CSP/页面过滤、更新回滚、顶层策略与真实请求来源分离、关闭撤销 | 用户已接受同源规则差异；原生请求路线限制扩展网络拦截；method等差异保留 |
| 扩展 | 目录/商店安装、权限差异确认、更新回滚、action/popup/动态角标图标、取消与存储清除 | 固定库permissions.remove/native动态权限与部分API不等效，不可假成功 |
| 指纹 | 算法、策略token/nonce、各API包装、单一IIFE、CDP首读/Worker、UA/CH、覆盖账本与资源恢复 | **未完成全覆盖，下一工作仅此模块，见下文** |
| Leo/News/Talk | 自定义/官方provider、SSE/内容授权/取消、图像/默认工具；News V2/权重/订阅/RSS/安全图片；Talk网页侧栏 | 官方资格与真实行为未观察；不扩大Agent平台 |
| Sync | 真实Commit/GetUpdates protobuf、Nigori、签名、五类数据、冲突游标事务、取消恢复 | 设置/旧协议/HTML密码等具体映射差异及官方资格 |
| Wallet | 六链基础、BTC双分支发现、EVM/Solana/Cardano provider、确认/签名/RPC/状态 | Zcash软件屏蔽候选存在明文密钥落盘/内建网络/系统支持缺口；硬件/资产等停工 |
| Rewards | 注册/自托管/余额、同源盲签、真实通知广告→匿名确认→payment兑换、三家账户、历史反馈、人工CAPTCHA | 真实资格/到账未观察；个性化资源与其他广告格式、转化链停工 |
| Tor | 固定组件/SAFECOOKIE/独立私密上下文、启动监控/断网阻断/换身份/清理 | 用户接受上下文隔离代替逐站点电路；组件未运行、DNS/WebRTC未验收 |
| VPN | Guardian凭据/地区、系统IKEv2配置/安装状态/连接取消/密文回滚、UI | 系统安装/真实路由未观察；官方账户SKU未完成草稿已移除 |

## 指纹下一步

完整接力见[指纹任务](docs/handoff/fingerprint.md)。优先顺序：

1. 用已取得的原生devicePixelRatio与LayoutZoomFactor固定源码关系，完成动态DSF/browserZoom/iframe CSS zoom与local/remote顶层几何的准确映射。
2. 完成Canvas原生导出与像素格式的可保真实现，保留原生空画布、参数错误、跨域taint、色域与透明度语义；不要用新异常代替保护。
3. 收口per-API webcompat策略、UA/CH子上下文/导航一致性，确认字体与Paint首读确切缺口；完整矩阵不以一个上下文成功覆盖其他失败。
4. 每原子自己case-cr→实现→无签名模块提交→合main；没有运行证据不能把已实现写成已验证。

## 架构与目录

- src/main/browser-core：窗口、标签、导航、资料、布局唯一状态；统一CoreEvent。
- src/main/platform：SQLite、Session请求策略、页面runtime、DebuggerHost、UserAgentHost、SecretStore。远程网页无管理bridge。
- src/shared/contracts、runtime-ports、module-lifecycle：跨进程wire/内部port；wire、schema与revision分别维护。
- src/features/<模块>：完整main/runtime或page/renderer；每模块唯一业务owner，vendor适配集中。
- src/main/bootstrap/feature-manifest.ts、migration-manifest.ts：静态装配与迁移，启动先迁移/注册功能再恢复窗口，退出逆序释放。
- src/renderer/routes.tsx、feature-slots.tsx：管理页和外壳入口装配。
- Vite分目标，独立管理/网页预加载与privacy-world IIFE。Node/native/WASM依赖external，资源解包配置集中。

## 必须保留的执行约束

- 总是中文；长文件不堆新逻辑，新增模块分文件。
- 禁止自动构建、tsc、测试、格式化、实现后静态检查及检查agent。只能实施时必要接口核对；未来用户另行明确授权才改变。
- native/长下载/签名/远端观察先事实、上游依据、候选取舍、成功失败/回滚/最小回传计划，不试错构建。
- 计划内实现选择自行case-cr，不再把常规取舍反复问用户；不静默删功能/降等效，不新增后端/其他平台。
- 不记录或发送密码、seed、token、Cookie值到日志/通用UI状态。真实交易/账号动作只能未来由用户明确界面确认。
- 只按当前任务做指纹，不顺手恢复非指纹开发。遇到明确运行时边界写证据与可行下一分支，不能把blocked改写成已完成。

## 跨设备接力

参考源码可从Brave官方brave-core/brave-browser获取；本地文件定位详见指纹任务。固定目标运行时Electron43.7.5/Chromium150.0.7871.250，Brave行为参考1.101.35（Chromium158.0.8127.22）。不要混淆两者内部API。

main包含交接、自评、源码和pnpm锁文件。不要求恢复旧本机worktree、run-01绝对路径或外部草稿；历史case-cr仅补充材料。首次阅读本稿→指纹任务→相关源码，即可继续。项目目前未提供已经运行验证的二进制。
