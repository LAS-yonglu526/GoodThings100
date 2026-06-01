# 好事100 — 项目交接状态文档

> 最后更新: 2026-06-01 20:20 (Asia/Shanghai)  
> Expo SDK 54 / React Native 0.81 / TypeScript 5.9

---

## 1. 项目愿景与架构

### 项目定位
《好事100》(GoodThings100) 是一款基于 React Native + Expo 的精美数字清单 App。核心理念是用**果冻毛玻璃**视觉语言记录和追踪日常好事。

### 技术栈
| 层级 | 技术 |
|------|------|
| 框架 | React Native 0.81 + Expo Managed Workflow (SDK 54) |
| UI 组件 | 纯 React Native + `expo-blur` (iOS 原生毛玻璃) |
| 动画引擎 | `Animated.Value/ValueXY` + `PanResponder` + `LayoutAnimation` |
| 数据库 | SQLite (`expo-sqlite`, 单文件 `goodthings.db`) |
| 触觉反馈 | `expo-haptics` |
| 图片 | `expo-image-picker` + `expo-file-system/legacy` |
| 后端 | Supabase (Email OTP 登录，Phone OTP 废弃) |
| Apple 登录 | `expo-apple-authentication` (前端 UI 占坑，后端注释待激活) |

### 文件结构
```
d:\GoodThings100\
├── App.tsx                           # overlay 架构根导航（非 React Navigation）
├── HANDOFF.md                        # 本文件
├── start-tunnel.js                   # 自动化 bore 隧道 + qrcode-terminal 调试脚本
├── package.json                      # 零 reanimated 依赖
├── tsconfig.json
└── src/
    ├── config/
    │   └── supabase.ts               # Supabase client 配置
    ├── services/
    │   ├── database.ts               # SQLite CRUD (lists + good_items) + updateListTitle
    │   ├── imageStorage.ts           # 图片选择 + 本地持久化
    │   ├── templates.ts              # 8套主题模板 (各125条左右)
    │   └── auth.ts                   # Supabase Email OTP 登录 + 备份恢复
    ├── screens/
    │   ├── ListHomeScreen.tsx        # 首页: 清单目录网格 + 浮动球 + 长按编辑/删除菜单 + 果冻删除动画
    │   ├── ListDetailScreen.tsx      # 详情: 胶囊列表 + 批量选择(原地暗化) + 5秒撤销缓存池 + 品牌化流体彩纸庆祝动画 + 双段果冻物理学长按高亮 + 里程碑
    │   └── SettingsScreen.tsx        # 设置: Email 登录 + Sign in with Apple 占坑 + 备份恢复
    └── components/
        ├── MemoryModal.tsx           # 手记编辑弹窗 (文字+图片)
        └── AddItemOverlay.tsx        # 添加面板 (建议生成+主题感知+重复检测+果冻高亮色)
```

### 页面导航架构 (非 React Navigation)
采用自定义 overlay 架构，`App.tsx` 通过 `useState<Overlay>` 条件渲染实现页面切换，使用 `slideAnim` + `PanResponder` 实现右滑返回。**首页始终保持渲染**（不卸载），返回时通过 `homeRefreshKey++` 触发数据重新查询。

---

## 2. 绝对红线与开发禁忌

### 2.1 动画引擎底线
```
🚫 绝对禁止 react-native-reanimated
   原因: iOS Hermes 不支持 # 私有属性语法 → 红屏 NativeWorklets
   项目中无此依赖，package.json 也不应有
```

所有动画必须使用纯原生 `Animated` API：
- `Animated.Value` / `Animated.ValueXY`
- `PanResponder`（手势捕获）
- `LayoutAnimation`（布局弹簧动画）

### 2.2 useNativeDriver 防报错准则

| 动画属性 | useNativeDriver | 说明 |
|----------|----------------|------|
| `transform` (translateX/Y, scale, rotate) | **必须 `true`** | 原生驱动支持 |
| `opacity` | **必须 `true`** | 原生驱动支持 |
| `top`, `left`, `right`, `bottom` | **必须 `false`** | 布局属性，原生驱动不支持 |
| `width`, `height` | **必须 `false`** | 布局属性，原生驱动不支持 |

**关键规则**：同一个 `Animated.Value` 节点一旦被 `useNativeDriver: true` 动画驱动过，就不能再用 `useNativeDriver: false` 驱动。**layout 属性和 transform 属性必须使用不同的 Animated.Value 节点，严禁混用。**

---

## 3. 全自动化真机网络调试链路

### 3.1 脚本说明
`start-tunnel.js` 实现了以下流水线：
1. `npx expo start --localhost --port 8081` — 启动本地 Expo
2. `npx bore local 8081 --to bore.pub` — 打通公网隧道（Ngrok/Localtunnel 在国内不稳定，已弃用）
3. 捕获 bore 输出的端口号 → 拼接 `exp://bore.pub:<port>`
4. `npx qrcode-terminal` 在终端打印可扫描二维码

### 3.2 已知限制
- bore 在大陆网络下偶发连接超时
- Expo 原生 `--tunnel` (Ngrok) 同样受 GFW 影响
- 建议：真机调试优先使用同一 Wi-Fi LAN 模式

### 3.3 启动命令
```bash
# LAN 模式（推荐同一 Wi-Fi）
cd d:\GoodThings100 && npx expo start -c

# 隧道模式（远程扫码，可能超时）
cd d:\GoodThings100 && npx expo start -c --tunnel
```

---

## 4. Sign in with Apple 前端占坑

### 4.1 当前状态
- 已安装 `expo-apple-authentication` SDK 54
- `SettingsScreen.tsx` 渲染了官方的黑色 `AppleAuthenticationButton`（仅 iOS）
- 点击按钮调用 `handleAppleSignIn`，弹出 `Alert.alert('🍎 敬请期待', ...)`
- 真实的 `signInAsync` + `supabase.auth.signInWithIdToken` 逻辑已写好并**完整注释**

### 4.2 激活方式
1. 获取 Apple Developer 账号并配置 App ID + Services ID
2. 在 Supabase 后台启用 Apple OAuth provider
3. 取消 `handleAppleSignIn` 中注释代码的注释
4. 替换 `Alert.alert` 占坑为真实调用

---

## 5. 高性能批量选择模式（防误删架构）

### 5.1 设计原则
**彻底废弃了旧的 `LayoutAnimation` 批量模式**，原因：100 个胶囊同时触发位移重排导致严重掉帧。

### 5.2 原地沉浸方案
- `selectDimAnim` 驱动未选中胶囊 `opacity: 0.5`（`Animated.timing`，`useNativeDriver: true`）
- 选中的胶囊恢复 `opacity: 1.0`
- 无需任何 `LayoutAnimation` 或 width/height 变化

### 5.3 5秒撤销缓存池
- `batchComplete` / `batchDelete` 先乐观更新 UI（立即修改/移除条目）
- 操作数据存入 `batchCacheRef`
- 复用 `undoFloater` 毛玻璃提示条，显示 "已删除 N 项 [撤销]"
- 5 秒内点击撤销 → 从缓存恢复 `prevItems`
- 5 秒后自动执行真实的 SQLite `deleteItem` / `updateItemStatus`

### 5.4 关键函数
| 函数 | 说明 |
|------|------|
| `toggleSelectMode` | 进入/退出选择模式，驱动暗化动画 |
| `toggleSelectItem` | 单点选中/取消 |
| `batchComplete` | 批量完成（延迟写DB） |
| `batchDelete` | 批量删除（延迟写DB） |
| `handleBatchUndo` | 撤销批量操作 |
| `executeBatchInDB` | 真实数据库操作（5秒后调用） |

---

## 6. 🎉 品牌化流体彩纸庆祝动画（废弃Emoji，纯原生）

### 6.1 设计理念
**彻底废弃系统 Emoji**（✨💫🌟⭐），改用纯 `Animated.View` 渲染的品牌基因图形，从 App JELLY 色系随机取色。视觉语言统一、克制、高级。

### 6.2 粒子基因
| 图形 | 实现 | 形态 |
|------|------|------|
| 小圆点 dot | `borderRadius: 99` | 圆点 |
| 微型胶囊 pill | `borderRadius: 8`, `width: size*2.5` | 呼应胶囊主题 |
| 四芒星 star | `borderRadius: 1` | 简洁十字星 |

### 6.3 色彩限定
从 JELLY 色系加深为材质级色板：
```
'#FF9AA2', '#6EB5FF', '#7BC67E', '#FFB347', '#FFD54F',
'#4FC3F7', '#F48FB1', '#B39DDB', '#FFAB91', '#80CBC4',
'#F06292', '#AED581'
```

### 6.4 动画三阶段（纯 `useNativeDriver: true`）

| 阶段 | 时间 | 实现 |
|------|------|------|
| 瞬间爆发 | 0~300ms | `Animated.spring` 炸开至半径 100~170，`Animated.stagger(18)` 次第弹射，scale `spring` 至1，opacity `timing` 至0.85 |
| 微浮淡出 | 300~2000ms | Y轴 +22 微浮，opacity→0，scale→0.5，rotate 至随机±10°，全程 `timing` |
| 向外散开+清场 | 2000~2600ms | 粒子 X/Y ×1.3 向外散开，整体 overlay fade + scale，setShowCelebration(false) |

### 6.5 完整生命周期
~3 秒（300ms 爆发 + 1700ms 微浮 + 600ms 散开），快速收场归还用户焦点。

### 6.6 层级与安全区
- 粒子容器 `pointerEvents="none"`，不拦截用户触摸
- 散布半径 100~170，避开中心白色卡片文字区

---

## 7. 双段果冻物理学长按高亮（零损耗光晕）

### 7.1 架构决策
**绝对禁止对 `shadowOpacity`/`shadowRadius` 进行动画**（不支持 `useNativeDriver`）。采用"剥离式重构"——在胶囊底层绝对定位 `glowLayer`（`Animated.View`），只对 opacity 和 scale 做动画，完美支持 Native Driver。

### 7.2 双层光晕呼吸
| 层 | 变量 | opacity 范围 | scale 范围 | 效果 |
|----|------|-------------|-----------|------|
| 外层 | `glowOuterOpacity/Scale` | 0↔0.22 | 0.88↔1.12 | 大面积扩散光晕 |
| 内层 | `glowOpacity/Scale` | 0↔0.55 | 0.92↔1.08 | 核心呼吸光晕 |

`Animated.loop` 交替循环（各900ms），菜单关闭时 `stopGlow()` 快速归零。

### 7.3 双段果冻触感 (Press-n-Pop)

| 阶段 | 触发 | 效果 | 触觉反馈 |
|------|------|------|----------|
| 蓄力 | `onPressIn` | `jellyScale` spring 至 0.95 | `ImpactFeedbackStyle.Light` |
| 爆发 | `onLongPress` | `jellyScale` spring 至 1.08 + `startGlow()` | `ImpactFeedbackStyle.Medium` |
| 回弹 | 菜单关闭 | `jellyScale` spring 回 1.0 + `stopGlow()` | — |

所有动画 `useNativeDriver: true`，光晕零 JS 线程开销。

---

## 8. 果冻删除动画体系

### 7.1 首页目录卡片删除
`LayoutAnimation.Presets.spring` — 被删卡片缩小淡出 + 其余卡片 Q 弹补位。

### 7.2 胶囊删除
三段式原生弹簧：
1. `Animated.spring(scale→0.6)` + `Animated.timing(opacity→0)` — 280ms 果冻淡出
2. `InteractionManager.runAfterInteractions` + `setTimeout(100ms)` 等布局稳定
3. `scheduleBounceIn` — 其余胶囊 `Animated.spring(friction:4, tension:80)` 原生弹簧补位

---

## 9. 登录系统

### 8.1 当前方案
- **Email OTP**：`sendEmailOTP` / `verifyEmailOTP`（Supabase 免费额度）
- 已废弃 Phone OTP（需 Twilio 付费配置）

### 8.2 新增 API
- `updateListTitle(listId, title)` — 编辑清单名称

---

## 10. 数据库结构

### lists 表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | 清单 ID |
| title | TEXT | 清单名称 |
| iconEmoji | TEXT | 图标 emoji |
| coverColor | TEXT | 封面颜色 |
| itemLimit | INTEGER | 容量上限 (10/50/100) |
| createdAt | TEXT | 创建时间 |

### good_items 表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | 胶囊 ID |
| listId | TEXT | 所属清单 |
| title | TEXT | 胶囊标题 |
| status | TEXT | `pending` / `completed` |
| completedAt | TEXT | 完成时间 |
| memoryText | TEXT | 手记文字 |
| mediaUris | TEXT | 手记图片 JSON 数组 |

---

## 11. 启动方式

```bash
cd d:\GoodThings100
npx expo start -c      # LAN 模式（清缓存，推荐）
node start-tunnel.js    # 自动化 bore 隧道调试
```

使用 **Expo Go** (iOS/Android) 扫描终端中的二维码。

---

**文档版本**: 5.0  
**生成者**: Cline (Claude)