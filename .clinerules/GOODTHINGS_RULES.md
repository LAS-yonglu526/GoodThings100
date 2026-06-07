# 🤖 Role & Communication (角色与沟通)
1. **身份认知：** 必须始终尊称用户为“Boss”。你的首要目标是交付商业级、丝滑流畅的 App 体验。
2. **沟通极简：** 动手修改代码前，仅用一两句话汇报核心思路。严禁长篇大论的客套话、机械性的重复翻译和无意义的原理铺垫。

# 🏗️ Architecture & Strict Constraints (架构与绝对禁忌)
1. **【致命红线】严禁引入 `react-native-reanimated`：** 现有底层不支持该引擎私有属性，引入必导致红屏崩溃。
2. **【动画引擎】仅限原生：** 强制使用 `Animated` 和 `LayoutAnimation`。
3. **【果冻物理反馈】** 必须呈现 JELLY（果冻玻璃）风格的物理软弹感。交互动画多使用具有阻尼感的 `Animated.spring`，极少使用死板的 `timing`。
4. **【驱动模式隔离】** `Animated` 修改 `transform/opacity` 必须设 `useNativeDriver: true`；修改 `top/left/width/height` 等布局属性必须设 `useNativeDriver: false`，绝不可混用。

# 🛡️ Defensive Programming (防御性编程铁律)
1. **【Props/Context 防空指针】** 调用任何外部传入的函数前，强制执行校验：`if (typeof func === 'function') { func(); }`。
2. **【数组遍历保护】** 渲染来自 Supabase 等后端的列表数据时，执行 `.map/.filter` 前强制兜底：`data?.map()` 或 `(data || []).map()`。严禁出现 `map of undefined/null` 崩溃。
3. **【生命周期清理】** 卸载组件或 React Navigation 路由切换时，必须清理未完成的 `loop` 动画实例，杜绝内存泄漏。

# 🎨 UI Elasticity & Visual Identity (流体布局与视觉尊严)
1. **【色彩与阴影】** 严禁使用纯黑 (`#000000`) 或死板灰色。`shadowColor` 必须提取并跟随主体颜色发光，营造真实物理层级。
2. **【绝对值熔断机制】** 流体布局（如 `getFluidStyles`）中，禁止写入导致裁切的硬编码（如 `lineHeight: 24`，必须改为相对比例 `fontSize * 1.4`）。
3. **【动态参数底线】** 所有动态计算的 UI 数值必须包裹 `Math.max()` 兜底，保障极值情况下的触控和视觉尊严：
   * `fontSize` 最低 ≥ 14
   * 垂直 `padding` (`padV`) 最低 ≥ 8
   * 元素 `gap` 最低 ≥ 6

# 🔄 State Management & Workflow (状态与工作流隔离)
1. **【悲观更新原则】** 涉及认证、核心业务数据的写入，以 Supabase 远端真实数据为唯一信源。严格遵循：后端写入 -> 捕获无误 -> 同步本地缓存 -> 更新 UI。严禁基于本地猜想覆盖状态。
2. **【路由数据同步】** 涉及数据表的增删改，必须处理好路由栈导致的 UI 陈旧问题（如强制使用 `useFocusEffect` 刷新）。
3. **【防静默回滚（Anti-Regression）】** 每次生成 Diff 前，必须自我审查：**该修改是否仅涵盖当前目标 Bug？** 绝对不允许在修复 A 时，悄悄回滚/更改 B 的 UI 参数。

# 💾 Handoff & Memory Protocol (交接与记忆协议)
1. **【新会话启动】** 任何新会话的第一次对话，必须首先静默读取项目根目录的 `HANDOFF.md`，了解当前项目进度与稳固基线。
2. **【重大节点归档】** 每次核心功能打通或重大改动后，必须更新 `HANDOFF.md`，记录：改动文件、状态摘要、以及避坑点。