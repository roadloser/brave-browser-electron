# Brave Electron

直接依据 Brave 的功能和行为实现的独立 Electron 浏览器。采用 TypeScript、React、Electron/Node 与成熟依赖，业务代码不来自 Craft 浏览器。

## 结构与维护

- BrowserCore 是窗口、标签、导航、资料与布局的唯一状态来源。
- 功能按目录包含主进程、页面适配和 UI；共享契约集中于 shared。
- 业务语义通过模块内 port 映射到供应商 adapter，替换依赖不牵动通用 UI 和用户数据。
- 管理 preload 仅用于可信本地 UI；网页凭据、过滤和翻译使用独立受限资源。

架构见 [模块边界](docs/module-map.md)、[映射层](docs/adapter-mapping.md)、[依赖决定](docs/dependency-decisions.md)。

## 当前状态

项目持续实施中。核心、外壳、收藏、历史、标签组、下载、权限、凭据、新页、页面工具、扩展、Shields 与 Leo 已有业务实现和装配，后续模块与已知缺口继续推进。已实现、已集成、已观察运行分别记录；当前没有本项目运行验收证据。

请求过滤使用 Ghostery，保留与 Brave 同源规则引擎的差异。原生请求路线会限制扩展网络拦截。官方服务资格、指纹执行上下文、Tor/VPN 组件是独立能力条件，详见 [能力状态](docs/capability-matrix.md)。

## 工具链

固定 pnpm 10.27.0、Electron 43.7.5，Node 24；依赖版本与完整性由 pnpm-lock.yaml 管理。SQLite 使用 better-sqlite3 13.0.2 包内 Node-API 预构建，不默认建立 native 重编译流程。

配置提供 dev、build、start、package 脚本；这些脚本未在本次实施中执行。安装生命周期默认禁用，首次 Electron 制品准备、运行和打包须先满足对应证据计划与授权条件。行为观察口径见 [观察指南](docs/observation-guide.md)。
