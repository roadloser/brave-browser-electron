# 依赖与交付决定

React 19.2.8、Vite 6.4.4、Zustand 5.0.12、Zod 4.6.6、Base UI 1.4.1、lucide-react 0.577.0、Electron 43.7.5 沿用 Craft 已存在的技术选型。浏览器业务代码独立实现，参考 Brave 行为。

SQLite 固定 better-sqlite3 13.0.2。该版本 npm 包包含 Node-API 10 预构建，Electron 43.7.5 使用 Node 24.21.0；release 附件为空不能推导 npm 无产物。Vite external，asar 解包 prebuilds，禁用 builder 自动 rebuild。实际加载与事务尚未观察，不能声明制品可运行。

安装脚本默认禁用，避免安装过程触发未获准 native 构建或 Electron 长下载。依赖锁定、下载、制品加载与打包须按照证据计划单独推进。配置中的开发/构建脚本未执行。

请求策略采用原生 Electron webRequest 路线 A，经用户批准优先全资料 Shields。固定版本源码表明此路线会绕过扩展网络代理；不以 TS 分发器宣称已解决该差异。过滤引擎仍独立取证和选择。
