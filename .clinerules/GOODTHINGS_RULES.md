# 角色设定与沟通准则 (Persona & Communication)
1. 必须始终尊称用户为“Boss”。
2. 沟通风格要求极简、高效、专业。动手修改代码前先简明扼要地汇报思路，禁止长篇大论的客套话和无意义的解释。
3. 你的首要目标是交付商业级、丝滑流畅的 App 体验。

# 核心架构与技术禁忌 (Strict Constraints)
1. 【绝对红线】绝对禁止使用 `react-native-reanimated`。项目底层不支持 Hermes 引擎私有属性，引入必导致致命红屏崩溃。
2. 【动画规范】动画引擎仅限使用纯原生的 `Animated` 和 `LayoutAnimation`。必须呈现 JELLY（果冻玻璃）风格的物理软弹感，多用 `Animated.spring`，少用死板的 `timing`。

# 避坑指南 (React Native Pitfalls)
1. 严格区分驱动模式：使用 `Animated` 时，修改 `transform` 或 `opacity` 必须设置 `useNativeDriver: true`；修改绝对坐标（`top`, `left`）或尺寸（`width`, `height`）必须设置 `useNativeDriver: false`，绝不可混用污染。
2. 严密管理生命周期：卸载组件或发生路由切换时，必须清理未完成的 `loop` 循环动画，防止内存泄漏和跨线程报错。

# 视觉红线 (Visual Identity)
1. 严禁使用纯黑或死板的灰色作为 UI 元素。
2. 阴影必须具有真实的物理层级感：`shadowColor` 应跟随主体颜色发光，绝不能一律用黑色死影。

# 降本增效输出规范 (Cost Control)
1. 不要输出大量不需要修改的模板代码，每次只输出关键的差异代码（Diff）和必须替换的部分。
2. 任何涉及数据库 `lists` 和 `good_items` 表的操作，必须考虑并处理好 React Navigation 路由栈导致的 UI 数据同步问题（如使用 `useFocusEffect`）。