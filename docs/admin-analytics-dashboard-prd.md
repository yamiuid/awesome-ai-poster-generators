# 产品需求文档：跨项目综合运营数据看板（/admin）

**版本**：1.1（多项目综合版）
**日期**：2026-08-27
**作者**：Sarah（Product Owner）
**质量评分**：93/100
**范围**：跨 texttoposter / designhint(PromptBox) / mistriagifts 三个项目的综合运营看板，仅 Owner 可见

---

## 一、执行摘要

你需要一个**综合数据看板**，不止看 Text to Poster，还要看另外两个项目 **designhint（= PromptBox，GitHub: prompt-peek-gallery）** 与 **mistriagifts（= mistria-gift-guide）**。

经代码调研发现，这三个项目**技术栈与数据结构高度异构**（见第二节），无法用「一个 SQL 跨三库」实现。本方案采用 **项目切换器 + 每项目数据适配器（adapter）+ 统一指标契约** 的架构：看板页面（建在 Text to Poster 仓库的 `/admin`）顶部用下拉切换项目，一次看一个；每个项目由各自的 adapter 从其真实数据源产出**统一格式**的指标，UI 用同一套面板与图表渲染。另配一个轻量「跨项目总览」对比三者的核心数字。

预期影响：把分散在 3 个后台（Waffo / GA4 / Umami / 各 Supabase）的运营复盘，收敛到一个入口。

---

## 二、三个项目的真实数据画像（调研结论）

> 以下内容基于实际读取各仓库 `package.json` 与 Supabase migration 得出。

### 2.1 texttoposter（本仓库 awesome-ai-poster-generators）
- **栈**：Next.js 16 + Supabase + Waffo + Cloudflare R2 + GPT Image 2.5
- **分析**：Umami（`.env` 已含）
- **核心表**：`profiles`、`subscriptions`(plan monthly/yearly, tier creator/studio, status)、`generations`(mode guest/free/pro, style, aspect_ratio, resolution, quality, status, submitted_at/completed_at)、`generated_assets`、`credit_transactions`(kind consume/refund)、`credit_reservations`、`entitlement_periods`、`payment_events`(Waffo webhook, 金额 USD)
- **可算指标**：注册/付费用户、MRR、套餐分布、退款率、转化漏斗（含 guest→注册）、生成量/成功率/style 分布、积分消耗

### 2.2 designhint = PromptBox（GitHub: yamiuid/prompt-peek-gallery）
- **栈**：**Vite + React + shadcn/ui**（非 Next.js）+ Supabase + **zpay/wxpay** + **Creem** + **GA4** + Midjourney
- **支付通道更正**：凭据库 `prompt-peek-gallery` scope 仅含 `CREEM_*` 系列（无 Waffo）；DB `credit_orders.provider` 默认 `zpay`、`payment_method` 默认 `wxpay`。即营收实际走 **zpay/Creem 积分包（CNY）**，并非 Waffo 订阅。
- **分析**：**GA4**（有 `supabase/functions/admin-ga-stats` 云函数 + `ga:report` 脚本）
- **核心表**（已读 migration）：
  - `ai_generations`：`user_id`(NOT NULL，无 guest)、`prompt`、`model`、`provider`、`aspect_ratio`、`image_count`(1-4)、`images jsonb`、`created_at`、后续加 `status` —— **无 style / 无 mode 字段**
  - `user_credits`(balance)、`credit_transactions`(type 如 signup_bonus/consume, balance_after)、`daily_checkins`(签到)
  - `credit_orders`：`credits`、`amount_cny`(NUMERIC)、`payment_method`(wxpay)、`provider`(zpay)、`status`(pending/paid/failed/cancelled)、`paid_at` —— **营收主源，货币为 CNY**
  - `artworks`(作品发布)、`profiles`、`likes`、`favorites`、`notifications`、`feedback`
- **可算指标**：注册用户、活跃用户、生成量(by model/provider/aspect_ratio)、积分消耗、营收(= credit_orders 已支付 CNY 求和)、作品发布数、签到活跃
- **差异提示**：① 货币 CNY（非 USD）；② 无 guest 生成（做不了访客漏斗）；③ 营收来自积分包（一次性）而非订阅；④ 分析用 GA4 而非 Umami

### 2.3 mistriagifts（GitHub: yamiuid/mistriagifts）
- **栈**：Next.js + **MDX 内容站**（依赖 `@mdx-js`、`opencc-js` 简繁转换），**无 Supabase、无数据库**
- **分析**：Umami（流量）
- **可算指标**：**仅流量**——PV/访客/来源/地区/设备/页面（来自 Umami）；可选内容量（MDX 礼物条目数，需确认有无计数接口）
- **差异提示**：无任何业务数据库，看板只展示 Umami 流量面板

### 2.4 异构小结（决定架构）
| 维度 | texttoposter | designhint/PromptBox | mistriagifts |
|------|--------------|----------------------|--------------|
| 数据库 | Supabase | Supabase（不同表名） | 无 |
| 生成表 | `generations` | `ai_generations` | — |
| 营收源 | Waffo 订阅(USD) | zpay 积分包(CNY) | — |
| 货币 | USD | CNY | — |
| 访客生成 | 有(guest) | 无 | — |
| 分析 | Umami | GA4 | Umami |

→ **必须**按项目分别取数，再做指标归一。

---

## 三、架构方案

### 3.1 项目注册表（Project Registry）
在 `.env` / 配置中声明每个项目的连接信息（仅服务端）：
```ts
const PROJECTS = {
  texttoposter: {
    label: "Text to Poster",
    supabaseUrl: process.env.T2P_SUPABASE_URL,
    serviceRoleKey: process.env.T2P_SUPABASE_SERVICE_ROLE,
    analytics: { type: "umami", websiteId: process.env.T2P_UMAMI_ID, token: process.env.UMAMI_TOKEN },
    currency: "USD",
  },
  designhint: {
    label: "DesignHint / PromptBox",
    supabaseUrl: process.env.PROMPTPEEK_SUPABASE_URL,
    serviceRoleKey: process.env.PROMPTPEEK_SUPABASE_SERVICE_ROLE,
    analytics: { type: "ga4", propertyId: process.env.PROMPTPEEK_GA4_PROPERTY, credentials: process.env.GA4_CREDENTIALS },
    currency: "CNY",
  },
  mistriagifts: {
    label: "Mistria Gifts",
    supabaseUrl: null,
    analytics: { type: "umami", websiteId: process.env.MISTRIA_UMAMI_ID, token: process.env.UMAMI_TOKEN },
    currency: null,
  },
};
```

### 3.2 统一指标契约（Unified Metric Contract）
每个 adapter 实现同一接口，返回归一化结构，UI 不感知底层差异：
```ts
interface ProjectSummary {
  projectId: string;
  displayName: string;
  currency: "USD" | "CNY" | null;
  totalUsers: number;
  newUsersPeriod: number;
  activeUsersPeriod: number;        // 周期内去重生成用户
  totalGenerations: number;
  generationsPeriod: number;
  revenuePeriod: number | null;     // 按项目货币
  revenueTotal: number | null;
  creditsConsumedPeriod: number | null;
}
```
各项目再提供 `getDetail(projectId, filters)` 返回该项目的专项面板数据（生成分布、营收构成等）。

### 3.3 Adapter 职责（关键映射）
- **texttoposter adapter**：直连本仓库 Supabase（已具备），映射 `generations`/`subscriptions`/`payment_events`/`credit_*` → 契约。
- **designhint adapter**：连 PromptBox 的 Supabase（独立 URL+service_role），映射 `ai_generations`→generations、`credit_orders`(status='paid' 的 `amount_cny` 求和)→revenue、`credit_transactions`(type='consume')→creditsConsumed、`auth.users`→users。GA4 流量走 `admin-ga-stats` 或 GA4 Data API。
- **mistriagifts adapter**：无 Supabase；仅调用 Umami API 取流量指标；可选读构建产物统计 MDX 条目数。

### 3.4 跨项目总览（轻量）
首页（或独立 tab）调用三个 adapter 的 `getSummary`，对比：`总用户 / 周期内生成量 / 周期内营收（标注货币）/ 活跃用户`。流量因 Umami(GA4) 异构，跨项目流量对比列为 Phase 2。

---

## 四、用户角色与权限

- **唯一角色：Owner（杨明）**。仅 `ADMIN_EMAILS` 白名单可访问 `/admin`。
- 数据查询一律用 `service_role` / 分析 API token，**仅服务端**，绝不暴露客户端。
- 非 Owner → 404 / 重定向首页。
- （可选）`admin_audit_log` 记录访问。

---

## 五、查看模式（用户确认）

**项目切换器**：顶部下拉切换项目，一次看一个项目的完整看板；另含轻量「跨项目总览」对比核心数字。

---

## 六、各项目看板面板（数据展示方案）

> 复用同一套 UI 外壳与图表组件（KPI 卡片 / 折线 / 面积 / 环形 / 柱状 / 漏斗 / 表格），按项目可用数据渲染。

### 6.1 texttoposter（完整业务看板，同 v1.0）
- KPI：累计注册 / 近7日新增 / 付费用户 / MRR(USD) / 本月生成量 / 转化率
- 用户增长：日新增折线、累计面积、套餐(creator/studio)环形、新增vs流失柱状
- 营收：MRR 趋势折线、Creator/Studio 占比环形、每月新增付费/退款柱状、订阅事件表
- 转化漏斗：访客(guest)→注册→首次生成→付费（**独有，因有 guest**）
- 生成使用：生成量堆叠折线、style 环形、比例/清晰度柱状、mode 堆叠柱状、Top Prompts/用户表
- 流量（Umami）：PV/访客/来源/地区/设备

### 6.2 designhint / PromptBox（业务看板，适配其字段）
- KPI：累计注册 / 近7日新增 / 活跃用户 / 营收(CNY) / 生成量 / 积分消耗
- 用户增长：日新增折线、累计面积
- 营收：营收(CNY)趋势折线（按 `credit_orders.paid_at`）、支付渠道(wxpay/zpay)环形、订单状态分布
- 生成使用：`ai_generations` 按 **model / provider** 环形（**无 style**）、aspect_ratio 柱状、image_count 分布、Top Prompts 表
- 社区/粘性：作品发布数(`artworks`)、签到活跃(`daily_checkins`)
- 流量（GA4）：PV/访客/来源/地区/设备（走 admin-ga-stats 或 GA4 API）
- **无**：访客漏斗（无 guest）、订阅套餐分布（积分制）

### 6.3 mistriagifts（流量看板）
- KPI：PV / 独立访客 / 平均停留 / 跳出率（Umami）
- 流量趋势：PV/访客折线
- 来源(referrer)环形、设备环形、地区地图/柱状、热门页面表
- （可选）内容量：MDX 礼物条目数

### 6.4 跨项目总览
- 三项目并排对比卡：总用户 / 周期生成 / 周期营收(标注 USD·CNY) / 活跃用户
- 柱状对比图（各项目生成量/用户量）

---

## 七、图表类型（统一）
KPI 卡片（带环比箭头，绿涨红跌）｜折线（趋势）｜面积（累计）｜环形（占比）｜柱状（对比/分布）｜堆叠柱状（分层）｜漏斗（转化）｜表格（明细）｜地图（地区，可选）。

---

## 八、筛选维度
- **全局**：时间范围（今日/7天/30天/90天/自定义）——联动当前项目所有面板
- **texttoposter 局部**：套餐 tier、模式 mode、style/比例/清晰度
- **designhint 局部**：model/provider、aspect_ratio
- **地区/渠道**：来自各项目分析（Umami 或 GA4），仅流量面板

---

## 九、数据来源与更新频率
| 项目 | 业务数据 | 流量数据 | 刷新 |
|------|----------|----------|------|
| texttoposter | 本仓库 Supabase（service_role） | Umami API | 服务端缓存 15 分钟 + 手动刷新 |
| designhint | PromptBox Supabase（独立 service_role） | GA4 Data API / admin-ga-stats | 同上 |
| mistriagifts | 无 | Umami API | 同上 |

- 聚合查询服务端执行，结果缓存 10–15 分钟；大范围用预聚合/采样防超时。
- 分析 API 不可达 → 仅隐藏该地区/渠道面板，其余正常。

---

## 十、技术约束
- **安全**：所有 `service_role` key、GA4 凭证、Umami token 仅服务端环境变量；严格不分发客户端；查询参数化防注入。
- **栈**：Next.js 16 App Router（`/admin` Server Component 取数 + Client 图表组件）；图表库建议 `recharts`（React 19 兼容、轻量），漏斗/地图可用 `echarts-for-react` 补充；Tailwind v4 + 项目设计令牌；TypeScript + Zod 校验。
- **Supabase RLS**：保持不变；看板走独立 service_role，不影响用户侧策略。
- **多币种**：总览中营收按各项目货币分别展示（USD/CNY），不做强制换算（如需换算在 Phase 2 加汇率）。

---

## 十一、MVP 范围与分期

### Phase 1（MVP）
- 项目注册表 + 项目切换器 + Owner 权限
- 三项目 `getSummary` 跨项目总览
- texttoposter 完整业务看板（同 v1.0）
- designhint 业务看板（适配字段，GA4 流量）
- mistriagifts Umami 流量看板
- 全局时间筛选 + 15 分钟缓存

### Phase 2（增强）
- 跨项目流量对比（统一 Umami/GA4 取数层）
- 多币种换算总览
- 图表下钻、数据导出 CSV

### 未来
- 多角色权限、阈值告警、实时刷新

---

## 十二、风险
| 风险 | 概率 | 影响 | 缓解 |
|------|------|------|------|
| 三库 schema 演进导致 adapter 失效 | 中 | 中 | adapter 隔离 + 类型校验 + 单测 |
| service_role / GA4 凭证误暴露 | 低 | 高 | 仅服务端 + 评审 + lint |
| GA4 API 限流/授权复杂 | 中 | 中 | 优先用已有 `admin-ga-stats` 云函数 |
| 多币种对比歧义 | 中 | 低 | 总览标注货币，Phase2 再换算 |
| 大范围聚合超时 | 中 | 中 | 预聚合 + 缓存 |

---

## 十三、依赖与待办（凭据库核对结果 @ 2026-08-27）

> 已用 api-credentials 技能核对 `~/.workbuddy/secrets/credentials.json`。✅= 凭据库已有，可立即接入；❌= 缺失，需 Owner 提供。

| # | 项目 | 需要的凭证 | store 状态 | 位置(scope) | 对看板的影响 |
|---|------|-----------|-----------|------------|------------|
| 1 | texttoposter | Supabase URL + `service_role` | ✅ 已有 | `awesome-ai-poster-generators` | 核心指标可直接出 |
| 2 | PromptBox | Supabase URL + `service_role` | ✅ 已有 (`VITE_SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`) | `prompt-peek-gallery` | 用户/生成/营收(CNY)可直接出 |
| 3 | PromptBox | 支付（营收） | ✅ 已有 `CREEM_*` 系列；DB `credit_orders.provider` 默认 `zpay` / `payment_method` wxpay | `prompt-peek-gallery` | 营收走 `credit_orders`(CNY) 聚合即可，与通道无关 |
| 4 | PromptBox | GA4 Property ID + 服务账号(JSON) | ❌ 缺失 | 无 | 流量/地区/渠道面板暂不可出（核心业务指标不受影响） |
| 5 | mistriagifts | Umami Website ID（+ Umami base/token） | ❌ 缺失 | `mistriagifts` scope 为空，全局也无 Umami | 该项目无任何数据源，看板暂时无法展示（仅 Umami 流量，且无 ID） |
| 6 | texttoposter | Umami base URL + token | ❌ 缺失 | 全局无 Umami | 仅影响 T2P 地区/渠道面板（核心指标不受影响） |

**结论**：
- 可**立即实现**的部分：texttoposter + PromptBox 的**核心业务指标**（用户 / 生成 / 营收 / 产品使用）。这两块的 Supabase 与支付凭证齐全。
- **暂缓**的部分：所有「地区 / 渠道 / 流量」面板（依赖 Umami 或 GA4，两者凭证都缺）；mistriagifts 整个项目（无 DB 且缺 Umami ID）。
- 实现时，PromptBox 的 `SUPABASE_SERVICE_ROLE_KEY` + `VITE_SUPABASE_URL` 需作为 **T2P 仓库服务端环境变量**注入（跨项目查询），绝不进客户端 bundle。

**待 Owner 补齐**：
- [ ] **PromptBox** GA4 服务账号凭证（`GA_CLIENT_EMAIL` / `GA_PRIVATE_KEY`）—— 用于流量面板
- [ ] **mistriagifts** Umami Website ID（+ Umami 共享实例的 base/token）—— 用于该项目接入
- [ ] **texttoposter** Umami base/token —— 用于 T2P 地区/渠道面板（可选）
- [x] **图表库最终选型**：recharts（PRD 原定）。**实际落地改为零依赖内置 SVG 图表**——本机 pnpm 安装被 safe-delete shim 拦截无法装包，故用自写 SVG/CSS 实现折线/面积/环形/条形/漏斗/表格，完全贴合 DESIGN.md 设计令牌，构建更稳、零外部依赖。

---

## 十四、附录：指标→源映射速查
- **注册用户**：各项目 `auth.users` / `profiles`
- **活跃用户**：texttoposter `generations.user_id` 去重；designhint `ai_generations.user_id` 去重
- **营收**：texttoposter `payment_events.payload`(USD, Waffo)；designhint `credit_orders`(CNY, status='paid' 求和)
- **生成量**：texttoposter `generations`；designhint `ai_generations`
- **积分消耗**：texttoposter `credit_transactions(kind='consume')`；designhint `credit_transactions(type='consume')`
- **流量/地区/渠道**：texttoposter & mistriagifts → Umami；designhint → GA4
- **作品/社区**：designhint `artworks` / `daily_checkins`
