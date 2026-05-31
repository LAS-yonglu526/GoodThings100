# 好事100 — 项目交接状态文档

> 最后更新: 2026-05-31 14:37 (Asia/Shanghai)  
> 当前 Commit: `74ae5f4`  
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
| 后端 | Supabase (auth.ts 待完善) |

### 文件结构
```
d:\GoodThings100\
├── App.tsx                           # overlay 架构根导航（非 React Navigation）
├── HANDOFF.md                        # 本文件
├── package.json                      # 零 reanimated 依赖
├── tsconfig.json
└── src/
    ├── services/
    │   ├── database.ts               # SQLite CRUD (lists + good_items)
    │   ├── imageStorage.ts           # 图片选择 + 本地持久化
    │   ├── templates.ts              # 5套主题模板 (各100条)
    │   └── auth.ts                   # Supabase 手机验证码登录 (待完善)
    ├── screens/
    │   ├── ListHomeScreen.tsx        # 首页: 清单目录网格 + 浮动球 + refreshKey 数据同步
    │   ├── ListDetailScreen.tsx      # 详情: 胶囊列表 + 拖拽排序 + 菜单 + 深海水母光晕 + 里程碑
    │   └── SettingsScreen.tsx        # 设置: 登录 + 备份恢复
    └── components/
        ├── MemoryModal.tsx           # 手记编辑弹窗 (文字+图片)
        └── AddItemOverlay.tsx        # 全屏毛玻璃输入面板
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

**这是导致红屏的最高频原因，必须严格遵守：**

| 动画属性 | useNativeDriver | 说明 |
|----------|----------------|------|
| `transform` (translateX/Y, scale, rotate) | **必须 `true`** | 原生驱动支持 |
| `opacity` | **必须 `true`** | 原生驱动支持 |
| `top`, `left`, `right`, `bottom` | **必须 `false`** | 布局属性，原生驱动不支持 |
| `width`, `height` | **必须 `false`** | 布局属性，原生驱动不支持 |

**关键规则**：同一个 `Animated.Value` 节点一旦被 `useNativeDriver: true` 动画驱动过，就不能再用 `useNativeDriver: false` 驱动，也不能用 `interpolate` 在 JS 线程读取。**layout 属性和 transform 属性必须使用不同的 Animated.Value 节点，严禁混用。**

## 3. 视觉与交互规范

### 3.1 JELLY 果冻玻璃视觉体系
- **色彩**: 12 色果冻色板 `['#FFE0E5', '#E0EEFF', '#D5F5E3', ...]`（取标题 hash 随机分配）
- **胶囊圆角**: Fluid 模式 `borderRadius: 999`（完全圆角）；Gallery 模式 `borderRadius: 20`
- **拖拽悬浮层**: 必须从 `dragItemColor.current` ref 克隆原胶囊完整果冻色，严禁白色/灰色硬编码
- **悬浮微放大**: `transform: [{ scale: 1.12 }]`
- **长按选中光晕**: 深海水母 Bioluminescent Halo — 胶囊背后同色 shadow 扩散 + scale 呼吸脉冲

### 3.2 拖拽插位指示器
指示器是**果冻发光条**，取被拖拽胶囊的果冻色：
- **Gallery 模式**: 水平横条，位于目标胶囊上方缝隙 (`top: ly.y - gap/2 - 3`)
- **Fluid 模式**: 垂直竖条，位于目标胶囊左侧 (`left: ly.x - gap/2 - 3`)
- **样式**: `shadowOpacity: 0.8, shadowRadius: 6, shadowColor: dragItemColor`

### 3.3 布局自适应
- ≤15 条: Gallery 竖排（宽大圆角卡片居中）
- ≥16 条: Fluid FlexWrap 瀑布流（指数衰减算法：数量越多胶囊越小）

---

## 4. 数据库结构

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

### 关键 DB API
- `updateListItemLimit(listId, newLimit)` — 里程碑升级时修改容量上限
- `getItemCount(listId)` / `getCompletedCount(listId)` — 首页聚合查询

---

## 5. 最新已完成功能

### 5.1 手记菱形标识条件渲染修复
```typescript
// ListDetailScreen.tsx
const mem = !!(item.memoryText || (item.mediaUris && item.mediaUris !== '[]' && item.mediaUris !== ''));
```
手记图标 (✦) 同时检查文字和图片字段，任意一个存在有效内容即显示。

### 5.2 MemoryModal 保存闪退修复
`handleSave` 先调 `onClose()` 关闭 Modal，再 `requestAnimationFrame(() => onSaved())` 延迟刷新数据库，避免状态冲突导致闪退。

### 5.3 拖拽指示器双模态设计
- 坐标算法基于 `layoutMapRef` 中每个胶囊的 `{x, y, w, h}` 布局参数
- Gallery / Fluid 分别计算横条/竖条位置
- `moveDropIndicator` 在 `PanResponder.onMove` 中被实时调用
- 松手时 opacity 自动归零隐藏
- 指示器渲染在胶囊 ScrollView 之外（根 View 层），使用绝对定位

### 5.4 插位正确性修复
`onPanResponderRelease` 的 splice 逻辑修正：
```typescript
const [moved] = next.splice(srcIdx, 1);
const insertIdx = targetIdx > srcIdx ? targetIdx - 1 : targetIdx;
next.splice(insertIdx, 0, moved);
```
当目标索引大于源索引时，移除元素后目标位置前移了一位，必须减 1 补偿。

### 5.5 10/50/100 三级动态里程碑系统
- 达到当前 `itemLimit` 且 < 100 时弹窗询问升级
- 10 件时提供「升级至 50」和「直接挑战 100」两个选项
- 50 件时提供「升级至 100」选项
- 同意后调用 `updateListItemLimit()` 更新数据库上限 → 放行新增
- 达到 100 件硬拦截：弹窗 "已达满载上限"

### 5.6 首页数据同步
- `App.tsx` 的 `closeOverlay()` 触发 `homeRefreshKey++`
- 右滑返回也触发 `homeRefreshKey++`
- `ListHomeScreen` 监听 `refreshKey` 变化，重新从 SQLite 查询数据
- 首页进度分母按 `done / itemLimit` 显示

### 5.7 页面返回卡顿修复
- 移除原有的 `scaleAnim` 卡片折叠动画，统一改为纯右滑平推
- `ListDetailScreen` 退出时 `isExiting` 守卫禁用 `LayoutAnimation`

---

## 6. 当前开发断点与下一步

### 6.1 待彻底验证
| 项目 | 状态 |
|------|------|
| Fluid 模式拖拽指示器是否在所有胶囊数量下都正确显示 | 需验证 |
| Gallery 模式插位逻辑（10→50→100 档位切换时布局变化） | 需验证 |
| 里程碑升级后首页卡片分母是否立即从 /10 变成 /50 | 需验证 |
| 长按选中光晕在快速操作时的动画流畅度 | 待优化 |

### 6.2 新对话头等任务
1. **启动开发服务器**: `cd d:\GoodThings100 && npx expo start -c`
2. **完整测试拖拽排序**: 分别在 Gallery (≤15条) 和 Fluid (≥16条) 模式下拖拽胶囊，确认插入位置正确 + 指示器正常显示
3. **完整测试里程碑**: 创建一个 itemLimit=10 的清单，添加 10 条后验证弹窗→升级→首页分母更新→可继续添加
4. **验证首页数据同步**: 在胶囊页完成/添加胶囊后返回首页，确认卡片进度条和计数刷新

### 6.3 已知小问题
- 拖拽指示器在 Fluid 模式下位置计算可能偏移（需在不同胶囊数量下微调）
- 首页 loading 状态在 refreshKey 变化时会短暂全屏 loading，可优化为静默更新

---

## 7. 启动方式

```bash
cd d:\GoodThings100
npx expo start -c      # LAN 模式（清缓存，推荐）
npx expo start --tunnel -c  # 隧道模式（远程扫码）
```

使用 **Expo Go** (iOS/Android) 扫描终端中的二维码。无需 Xcode 或 Android Studio。

---

**文档版本**: 3.0  
**生成者**: Cline (Claude)