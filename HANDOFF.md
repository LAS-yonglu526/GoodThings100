# 好事100 — 项目交接状态文档

> 最后更新: 2026-06-02 15:10 (Asia/Shanghai)  
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
| 分享截图 | `react-native-view-shot` + `expo-sharing` |
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
    │   ├── database.ts               # SQLite CRUD (lists + good_items) + getCompletedItemTitles
    │   ├── imageStorage.ts           # 图片选择 + 本地持久化
    │   ├── templates.ts              # 8套主题模板 (各125条左右)
    │   └── auth.ts                   # Supabase Email OTP 登录 + 备份恢复
    ├── screens/
    │   ├── ListHomeScreen.tsx        # 首页: 清单目录网格 + 浮动球 + 长按编辑/删除菜单 + 分享清单入口 + 果冻删除动画
    │   ├── ListDetailScreen.tsx      # 详情: 胶囊列表 + 批量选择(原地暗化) + 5秒撤销缓存池 + 品牌化流体彩纸庆祝动画 + 双段果冻物理学长按高亮 + 里程碑 + 手记提醒
    │   └── SettingsScreen.tsx        # 设置: Email 登录 + Sign in with Apple 占坑 + 备份恢复
    └── components/
        ├── MemoryModal.tsx           # 手记编辑弹窗 (文字+图片)
        ├── AddItemOverlay.tsx        # 添加面板 (建议生成+主题感知+重复检测+果冻高亮色)
        └── ShareCard.tsx             # 🆕 分享海报生成器 (三样式左右滑动)
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

### 2.3 Rules of Hooks
⚠️ 组件内所有 hook 调用必须在任何条件 return 之前。`if (!visible) return null` 必须放在所有 `useRef`/`useState`/`useEffect`/`useCallback` 之后。

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
- 毛玻璃提示条 "已删除 N 项 [撤销] [✕]"
- 5 秒内点击撤销 → 从缓存恢复 `prevItems`
- 5 秒后自动执行真实的 SQLite

### 5.4 关键函数
| 函数 | 说明 |
|------|------|
| `toggleSelectMode` | 进入/退出选择模式，驱动暗化动画 |
| `toggleSelectItem` | 单点选中/取消 |
| `batchComplete` | 批量完成（延迟写DB） |
| `batchDelete` | 批量删除（延迟写DB） |
| `handleBatchUndo` | 撤销批量操作 |
| `executeBatchInDB` | 真实数据库操作（5秒后调用） |

### 5.5 单条删除手记提醒 🆕
- `memoryWarnedRef`：单次进入清单首次删除有手记内容的胶囊时弹出二次确认 "手记提醒"
- 退出清单一再进入后重置，重新触发

---

## 6. 🎉 品牌化流体彩纸庆祝动画

（内容同上一版本，略）

---

## 7. 双段果冻物理学长按高亮（零损耗光晕）

（内容同上一版本，略）

---

## 8. 果冻删除动画体系

（内容同上一版本，略）

---

## 9. 登录系统

### 9.1 当前方案
- **Email OTP**：`sendEmailOTP` / `verifyEmailOTP`（Supabase 免费额度）
- 已废弃 Phone OTP

### 9.2 ⚠️ Supabase 邮件模板配置
Supabase 默认发 Magic Link，需在后台改为 OTP 验证码格式：
1. 打开 https://supabase.com/dashboard/project/kbkvdsavgsiikscqengi
2. Authentication → Email Templates
3. 在模板中加入 `{{ .Token }}`（6位验证码）
4. 保存

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

### 🆕 新增数据库函数
- `getCompletedItemTitles(listId)` — 获取已完成条目标题列表，用于分享卡片展示

---

## 11. 🆕 分享卡片系统 (ShareCard)

### 11.1 入口
- 首页长按清单卡片 → 弹出菜单中点「📤 分享清单」

### 11.2 技术实现
- `captureRef()`（`react-native-view-shot` 函数式 API）直接对 View 截图
- `expo-sharing` 调用系统分享面板

### 11.3 当前状态

**✅ 已完成：**
- 极简面板：半透明背景 + 三张海报左右滑动 + 分享按钮
- 卡片1（进度概览）：图标 + 标题 + 进度条 + 完成统计
- 卡片2（环绕瀑布）：中心清单名称 + 42 个胶囊沿 4 层同心圆环绕
- 卡片3（紧凑网格）：全部已完成胶囊紧凑双列排布
- 三张卡片自适应内容高度（各论各的，不强行统一）
- 无边框、无毛玻璃外壳、无标题栏

**轨道参数（当前，2026-06-02）：**
| 环 | 半径 | 胶囊数 | fontSize | 弧长 |
|----|------|--------|----------|------|
| 1 | 54 | 2 | 14 | 170px |
| 2 | 82 | 4 | 12 | 129px |
| 3 | 110 | 6 | 10.5 | 115px |
| 4 | 136 | 8 | 9 | 107px |

### 11.4 ⚠️ 已知问题和待优化项

1. **环绕胶囊碰撞风险依然存在**
   - 内环 (r=54) 只放了 2 个胶囊（弧长 170px > 9字标题126px），理论安全系数足够
   - 但外环 (r=136) 8 个 fontSize=9 的胶囊，弧长 107px，9字标题约 81px+16px=97px<107px，处于临界
   - 较长的 12 字中文标题（108px）在第四环可能碰撞
   - **建议**：后续改为按实际文字像素宽度精确计算 x 偏移，或减少每环数量进一步增加安全间距

2. **卡片2 缺少高亮边界**
   - 胶囊颜色继承了 JELLY 色系但无边框，在白底上辨识度下降
   - **建议**：可加 1px 半透明边框回退，或加深背景色不透明度

3. **ScrollView 分页体验**
   - `snapToInterval` 分页在三个卡片高度不一致时，垂直居中对齐偶有跳动
   - **建议**：可尝试 `snapToAlignment="center"` 或给三张卡片统一 `minHeight`

4. **分享截图质量**
   - `captureRef` PNG 输出 0.95 质量，暂未适配 Android 的 `result: 'tmpfile'`
   - **建议**：后续可分平台处理

---

## 12. 模板清单名称空格修复

### 12.1 问题
`TEMPLATE_LIST` 中标题含全角空格 `\u3000`（如 `'　恋爱　'`），用于模板选择器按钮居中。用户不填自定义名时，全角空格直接写入数据库清单名，显示为 `"　恋爱　"` 带多余空白。

### 12.2 修复（`ListHomeScreen.tsx` handleCreate）
```
const tplTitle = TEMPLATE_LIST.find((t) => t.key === selectedTemplate)?.title || '新建清单';
const title = newTitle.trim() || tplTitle.replace(/[\u3000]/g, '').trim();
```
- 用户输入 → 保留原样（含用户主动敲入的空格）
- 模板默认 → 剥离全角空格后写入数据库

---

## 13. 启动方式

```bash
cd d:\GoodThings100
npx expo start -c      # LAN 模式（清缓存，推荐）
node start-tunnel.js    # 自动化 bore 隧道调试
```

---

**文档版本**: 7.0  
**生成者**: Cline (Claude)
