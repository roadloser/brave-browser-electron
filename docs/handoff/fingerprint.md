# 指纹唯一续接任务

状态：未完成。当前用户只要求继续这一模块；其他模块停止新增实现。所有能力observed=false，没有verified。

## 已实现源码

| 领域 | 主文件 | 已写链路 |
| --- | --- | --- |
| 策略与作用域 | main/privacy-service.ts、token-provider.ts、chromium-nonce-hash.ts；runtime/policy-scope.ts、storage-key.ts | 站点随机128位token XOR会话熵；顶层策略site与frame安全origin分离；frame nonce使用固定CityHash v111 |
| 算法 | runtime/algorithms/ | Abseil Randen/AES轮表、HMAC-SHA256/LFSR、Byte/BigInt映射；固定来源NOTICE |
| API | runtime/brave-*-adapter.ts | AudioBuffer/Analyser、Navigator、Canvas、WebGL、Screen/窗口几何/Pointer、HTML严格measureText |
| Canvas | runtime/canvas-context-*、canvas-export-adapter.ts | 真实context属性、原生空context/参数语义、色域/colorType/alpha、输出副本；仍非完整SkPixmap保真 |
| 首读与生命周期 | runtime/cdp-context-adapter.ts、bootstrap-pause-controller.ts、child-target-runtime.ts、runtime-deadline.ts | 自有nonce bootstrap定点暂停；Worker启动暂停；deadline拒绝迟到成功；finally恢复 |
| 状态与异常 | main/coverage-ledger.ts、runtime-registry.ts；runtime/installation-guard.ts | 多context聚合、不掩盖失败；关闭/并发/失联重建；逐域描述符回滚 |
| 私有控制器 | runtime/world-entry.ts、world-controller-host.ts | IIFE自包含依赖；CDP objectId控制report/updateZoom、导航释放，无页面全局token |
| 原生身份 | platform/runtime/user-agent/、shared/user-agent-port.ts、runtime/native-user-agent-controller.ts | 原生metadata采样、统一UA/CH品牌版本、root/child接线，不单独伪造UAData Proxy |

## 正在推进的明确剩余

| ID | 真实缺口 | 已取得事实与下一动作 |
| --- | --- | --- |
| FP-ZOOM | pageZoom快照不等于Blink LayoutZoomFactor；跨来源top可读性不等于LocalDOMWindow | 固定150 LocalFrame::DevicePixelRatio=InspectorDeviceScaleFactorOverride×LayoutZoomFactor；项目无设备仿真时override=1。捕获原生getter并按访问实时读取可获得DSF/browserZoom/iframe CSS zoom。A将准确调用点交C，按源实现而非盲乘devicePixelRatio |
| FP-CANVAS | JS clone的premul往返、native backing colorType/channel/rowBytes、encoder clamp不完全透明 | getImageData ImageData raw buffer可直接HMAC；toDataURL先unpremul，toBlob经MakeUnaccelerated/peekPixels并保rowBytes。不要混一个字节假设。先保原生错误/空canvas/taint，再选择可证实格式映射；未知不能静默量化srgb |
| FP-SCREEN | cross-origin local与OOPIF remote顶层的不同返回值 | 用固定frame/world关系或原生getter获取正确分支，不能只用JS跨源异常判断，更不能扩大成通用特权桥 |
| FP-POLICY | Brave每API BRAVE_WEBCOMPAT例外不是一个总mode | 显式类型化每域策略并沿已有站点存储/迁移，保持私密、Shields、fingerprint归属独立；源证据决定默认值 |
| FP-UA | 官方例外列表、子目标首次请求/导航/redirect一致性 | 已有统一native port。官方brave-checks.txt普通文本由签名组件提供，未ready默认showBrave；不要从任意URL下载冒充官方数据。首请求时间与继承按CDP/Chromium来源明确 |
| FP-IDL | JS descriptor/内部slot/参数验证与错误顺序 | 不patch Function.toString伪装native。使用真实构造器/原生接口可保持的语义，不能以假对象宣称完整TextMetrics或ShaderPrecision原生brand |

## 已具体取证的运行时边界

### 字体布局
Brave AllowFontFamily同步介入LocalFontFaceSource(local()可用性)和FontFallbackList(系统family fallback)，按平台/语言名单及Randen候选5%准入；generic/webfont另有分支。默认ReduceLanguage feature与pref开启。
stock CDP CSS.setLocalFontsEnabled只控制local源bool，不拦直接CSS系统family；Page.setFontFamilies/Electron defaultFontFamily只映射generic；FontAccess权限只控制枚举。FontFaceSet.check在没有匹配字体时仍可能true，按名单强制false会造差异。
完整等效需要现成同步family/context过滤入口；当前候选不足。禁止私建Chromium/native维护体系、全禁字体或CSS重写伪装解决。继续只能走有新证据的成熟runtime/adapter路线，不重复旧失败。

### Main-thread Paint首读
Page.newDocument只覆盖DOMWindow，不能直接覆盖main-thread Paint world。真实PaintRenderingContext2D暴露isPointInPath/isPointInStroke，Brave最大防护返回false；不能把这一真实缺口标not-applicable。
线程型Worklet可在Target启动暂停；main Paint的contextCreated异步注入仍有首模块竞态。单入口URL断点漏依赖，全站beforeScriptExecution/黑箱新context有竞态；全URL条件断点有词法遮蔽和debugger语义成本，未采纳。

### API适用面
AudioBuffer只Window，不存在于普通Worker/Worklet；OffscreenCanvas为Window/Worker；WorkerNavigator不含Worklet。矩阵必须按实际IDL，不能把不存在API列blocked，也不能推广threaded成功到main Paint。

## 固定来源导航

Brave参考文件（相对brave-core）：
- third_party/blink/renderer/core/farbling/brave_session_cache.cc：token、Randen种子、Canvas像素/字符串、font规则。
- chromium_src/chrome/browser/content_settings/content_settings_manager_delegate.cc：outermost主frame策略与基础token；components/content_settings/renderer/brave_content_settings_agent_impl.cc：webcompat例外。
- chromium_src/third_party/blink/renderer/modules/canvas/canvas2d/base_rendering_context_2d.cc；core/html/canvas/html_canvas_element.cc、canvas_async_blob_creator.cc：不同像素导出路径。
- chromium_src/third_party/blink/renderer/platform/fonts/font_fallback_list.cc、core/css/local_font_face_source.cc；third_party/blink/renderer/core/farbling/brave_font_whitelist.cc：字体双层hook。
- chromium_src/components/embedder_support/user_agent_utils.cc、browser/brave_content_browser_client.cc、components/brave_user_agent/browser/：UA/CH及例外。

运行时固定官方来源：
- https://github.com/chromium/chromium/tree/150.0.7871.250/third_party/blink/renderer
- https://github.com/abseil/abseil-cpp/tree/8fb4507d10a24a1204e98f77ad19c27c291e13e9/absl/random/internal
- https://github.com/electron/electron/tree/v43.7.5
- Chromium150 base/hash/hash.cc、base/third_party/cityhash/city.cc、base/token.h：release64 nonce hash与high/low little-endian内存字节。DCHECK scramble与release不同。

## 执行与完成标准

C负责fingerprint完整功能；A仅必要平台及准确源证据；M最终集成。独立分支可自行补必要共享port/装配，在自己的worktree按模块无签名提交，M合main。无需每行问用户；先case-cr防漂移。

每域必须贯穿：Brave行为→真实scope/policy→算法与runtime→数据/状态→UI→失败/取消/恢复→可观察验收→版本维护。未运行只能写implemented/integrated，不得写verified。当前禁止自动运行任何构建/tsc/test/format/static-check，故源码收口后仍需明确保留验收未完成；不能靠改状态完成用户目标。
