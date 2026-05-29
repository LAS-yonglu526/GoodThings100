# 好事100 — 项目交接状态文档

> 最后更新: 2026-05-29 14:38 (Asia/Shanghai)
> 当前 Commit: `bc7297d`

---

## 1. 开发环境底线

- **架构**: React Native + Expo Managed Workflow (SDK 54)
- **UI 框架**: 纯 React Native 组件 + `expo-blur` (iOS 原生毛玻璃)
- **动画引擎**: 纯原生 `Animated.Value/ValueXY` + `PanResponder` + `LayoutAnimation`
- **严格禁止**: `react-native-reanimated` (iOS Hermes 引擎不支持 `#` 私有属性语法, 导致红屏 `NativeWorklets`)
- **依赖库**: `expo-sqlite`, `expo-haptics`, `expo-blur`, `expo-image-picker`, `expo-file-system/legacy`
- **无 C++ 编译, 零原生模块扩展**

---

## 2. 核心交互架构

### 拖拽排序: "悬停触发流体让位 (Lift and Flow)"

**手势**: `PanResponder` 挂载在详情页的根 View

**流程**:
1. **触碰 (Grant)**: 计算触摸点所属的胶囊索引 → 识别 item → 把完整的布局参数存入 `dragRef` (itemColor, fontSz, padH, padV, minH, cardW, isGallery)
2. **激活拖拽**: 按住 500ms 且位移 < 5px → `dragActive.current = true` → 覆盖层出现
3. **拖拽移动**: `Animated.Value.setValue(gs.dy)` (native driver) 驱动覆盖层跟随手指
4. **松手 (Release)**: 计算目标索引 → splice 数组 → `LayoutAnimation.Presets.spring` → 原生弹簧让位动画填补
5. **防抖**: 200ms 禁止重新激活拖拽

**覆盖层**: 从 `dragRef` 读取所有样式参数（不依赖组件渲染周期），完美克隆原胶囊的果冻色、圆角、padding，加 `scale: 1.05` 微放大 + iOS 阴影。

**布局模式**:
- ≤15 条: Gallery — 宽大圆角卡片竖排居中
- ≥16 条: Fluid — 指数衰减胶囊 FlexWrap 瀑布流

---

## 3. 视觉质感红线

| 管控项 | 标准 |
|--------|------|
| 胶囊圆角 | Fluid: `borderRadius: 999`; Gallery: `borderRadius: 20` |
| 色彩体系 | JELLY 12色果冻色板, 随机分配, 玻璃边框 + 柔和阴影 |
| 拖拽悬浮层 | **严禁白色无样式硬编码**; 必须从 dragRef 克隆原胶囊的完整 UI |
| 悬浮微放大 | `transform: [{ scale: 1.05 }]` |
| 悬浮阴影 | iOS 物理阴影: `shadowColor/Offset/Opacity/Radius` |

---

## 4. 当前开发断点

### 4.1 已完成的模块
- [x] 纯原生拖拽排序 (PanResponder + Animated.ValueXY + LayoutAnimation)
- [x] Reanimated 回滚 (彻底卸载 + node_modules 重建)
- [x] Gallery/Fluid 双模布局自适应切换
- [x] dragRef 完整存储布局参数 (覆盖层不再透明/白条)
- [x] AddItemOverlay 全屏毛玻璃输入面板
- [x] 三页顶栏 borderRadius 32px + expo-blur
- [x] 连续流体胶囊尺寸 (指数衰减算法)

### 4.2 下一对话需要优先修复/推进

**Bug 修复**:
- 长按激活拖拽偶尔不灵敏 (500ms 计时器在快速操作时可能未触发; 可考虑改用 400ms)
- `itemsRef.current` 在数组中某些元素的 `i?.id` 查找时可能因状态更新时序产生瞬间不匹配
- 覆盖层在 Fluid 模式下的位置计算 (`top: startPageY - 80`) 可能未考虑滚动偏移

**功能推进**:
- 拖拽时胶囊的"水流让位"动画可增加视觉反馈 (如被替换的胶囊微微变亮)
- 添加"撤销排序"功能
- 批量操作 (多选后批量完成/删除)

---

## 5. 项目文件结构

```
d:\GoodThings100\
├── App.tsx                               # 根导航 (覆盖层架构)
├── babel.config.js                       # presets: ['babel-preset-expo']
├── package.json                          # Expo SDK 54, 零 reanimated
├── HANDOFF.md                            # 本文件
└── src/
    ├── services/
    │   ├── database.ts                   # SQLite CRUD (lists + items)
    │   ├── imageStorage.ts               # 图片选择 + 本地持久化
    │   ├── templates.ts                  # 5套主题模板 (各100条)
    │   └── auth.ts                       # Supabase 手机验证码登录 (待完善)
    ├── screens/
    │   ├── ListHomeScreen.tsx            # 首页: 清单目录网格 + 浮动球
    │   ├── ListDetailScreen.tsx          # 详情: 胶囊列表 + 拖拽排序 + AddItemOverlay
    │   └── SettingsScreen.tsx            # 设置: 登录 + 备份恢复
    └── components/
        ├── MemoryModal.tsx               # 手记编辑弹窗
        └── AddItemOverlay.tsx            # 全屏毛玻璃输入面板
```

---

## 6. 启动方式

```bash
cd d:\GoodThings100
npx expo start --tunnel -c
```

使用 Expo Go (iOS) 扫描二维码。无需 Xcode 或 Android Studio。

---

**文档版本**: 1.0
**生成者**: Cline (AI 架构师)