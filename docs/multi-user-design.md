# TokenConnection 多用户设计：登录、认证、安全与人脉分享

> 状态：设计稿 v0.1。A/B/C 期已按本文落地。Passkey 的浏览器仪式需要平台验证器，非浏览器验证用虚拟 authenticator。偏离见 §0.3、§0.4。
> 本文是对 `docs/design.md`（下称「原设计」）的增量设计：把「只给我自己用的人脉库」改成「每个用户各有一个私有人脉库，并且可以把某个人或某个圈子以只读卡片引荐给别人」。原设计中与本文冲突的结论以本文为准（§0 逐条列出），其余照旧。
> 文中的「M-xx」是本文的决策编号，与原设计的「D-xx」并列；「落地指引」段落给出直接可排期的实现要求；标注「待确认」的事实在开工第一天用实际命令或文档核实，不要凭记忆写代码。

---

## 0. 文档状态与覆盖关系

### 0.3 实现说明（A 期，2026-10-19）

- Better Auth `1.7.11`：`advanced.database.generateId: "uuid"` 可用，Postgres 用 `gen_random_uuid()`。Drizzle adapter 按**属性名**（camelCase）找列，所以 `src/db/auth-schema.ts` 的属性是 camelCase、SQL 列名仍是 snake_case。`usePlural: true` 时导出键为 `users` / `sessions` / `accounts` / `verifications`。`nextCookies()` 放在插件最后。`telemetry.enabled` 在该版本默认就是 `false`，配置里仍显式关闭。
- 行级安全的 `NOT NULL` + `FORCE` 写在 `drizzle/0003_owner_not_null_and_rls.sql`，由 `pnpm db:migrate` / `/setup` 在没有无主行时执行，不放进 drizzle journal，避免第一次迁移在领走旧数据之前就把列设成 NOT NULL。
- 无 SMTP：不发信。重置链接写入 `pending_reset_links`，管理员在用户页生成后复制。`/forgot-password` 直接说明请联系管理员。
- 已登录用户访问 `/login` 的跳转做在页面里（查会话），proxy 只在没有会话 cookie 时把受保护页面转到 `/login`，避免失效 cookie 来回跳。
- `tc_owner` 带 `BYPASSRLS`，方便迁移和脚本；应用连接必须是 `tc_app`。生产环境若当前角色绕过 RLS 则拒绝启动。
- 分享外键（`share_recipient_id`、`source_share_item_id`）、Passkey、TOTP、导出/注销、图片魔数、强制 CSP 按分期不做。安全页只放密码和会话，Passkey / 两步验证标明稍后推出。



### 0.4 实现说明（B / C 期，2026-10-20）

- 圈子分享一条 `share_recipients` 对应多条 inbox，因此 inbox 增加了文档未单列的 `share_item_id`，收录时写入 `people.source.share_item_id`。
- `share_items` / `share_recipients` / `share_links` 冗余了 `owner_id`。策略如果互相子查询 `shares`，Postgres 会报 `42P17` 无限递归。
- 分享链接的口令用 scrypt 保存。公开读取每次成功加一 `view_count`。
- 导出是同步 zip（`people.json` 等四份），不是文档里的异步 job。注销要在请求里再输入密码，并确认文案「删除我的账号」。最后一个活跃管理员不能注销。
- 图片魔数和 2500 万像素上限在上传入口校验，用文件头解析尺寸，没有引入 sharp。
- CSP 在 `src/proxy.ts` 强制 nonce。`style-src` 与 `style-src-attr` 仍允许 `'unsafe-inline'`，否则 d3 地图和现有样式会坏。开发环境保留 `'unsafe-eval'`，并且不加 `upgrade-insecure-requests`（http://localhost 会被升到 https）。
- 两步验证用 Better Auth `twoFactor` 插件，表 `two_factors`。信任设备是插件的 `trust_device` cookie，默认 30 天（`trustDeviceMaxAge`）。Passkey 用 `@better-auth/passkey@1.7.11`，表 `passkeys`。浏览器注册走真实 WebAuthn；没有平台验证器时页面会报错，不能当成注册成功。非浏览器验证用 `@simplewebauthn/server` 核对虚拟凭证的 challenge、计数器和公钥。`/admin/settings` 仍只读环境变量。`SMTP_URL` 为空时不发信；配了以后邀请、重置密码、以及接收方打开了「有人分享给我时发邮件」的分享通知会走 `sendMail`。

### 0.1 本文取代原设计中的哪些结论

| 原设计位置 | 原文摘要 | 本文处理 |
| --- | --- | --- |
| §1 一句话 | 「一个只给我自己用的人脉库」 | 改为「每个用户一个私有人脉库，可引荐」。产品形态、录入 / 查找 / 地图 / 提醒不变 |
| §2 非目标 第 1 条 | 「多用户、团队协作」不做 | **取代**：做多用户；仍不做「团队协作」意义上的多人编辑同一条记录（§1） |
| §8 认证 | 「阶段 1：所有 `/api/v1/*` 要求 `Authorization: Bearer <API_TOKEN>`，Web 通过同源 cookie 带同一个 token。阶段 3 上服务器时再加登录页；不提前上 Auth.js」 | **取代**：改为用户会话 + 每用户 Personal Access Token（§3、§4）。「不上 Auth.js」这一点与本文一致——选的是 Better Auth，不是 Auth.js |
| §11 前端 页面列表 | `/`、`/people`、`/people/[id]`、`/search`、`/tags`、`/inbox`、`/map` | **增补**：登录前页面集合、`/shared`、`/s/[token]`、`/settings/*`、`/admin/*`（§10） |
| §13 隐私边界 | 「抽取时原文整句发给 DeepSeek，其中会包含联系方式……阶段 2 可选加固：发送前用正则把手机号 / 微信号替换为占位符」 | **取代**：脱敏从「可选」变成「默认开启、每用户可关」，并加每用户配额与开关（§6.7） |
| §15 阶段 3 部署 | 「同一个 compose 加一个 `app` 服务……」 | **增补**：两个数据库角色（迁移 / 应用）、新增环境变量（§8.5、§6.10） |
| §17 阶段 3 | 「上服务器、登录页、备份、iOS 原生客户端」 | **取代其中的「登录页」**：登录是本文的 A 期范围，不再等阶段 3 |
| D-10 | 「认证阶段 1 只用 bearer token，上服务器再加登录」 | **取代**（M-02、M-06） |
| D-05 中「隐私上接受原文出本机，方便优先」 | 单人时可接受 | **收紧**：多用户后由每个用户自己决定（M-13） |

同时需要跟进修改的非规格文档（本文不改它们，列出来便于 A 期一起处理）：`README.md`「安全」一节（"页面本身不登录"）与「现在做到哪一步」；`docs/api.md` 开头的鉴权说明与示例里的 `API_TOKEN`；`shortcuts/README.md` 的「前置 2」与排查表；`.env.example` 的 `API_TOKEN` 注释。

### 0.2 保留不变的原设计决策

| 决策 | 为什么与多用户不冲突 |
| --- | --- |
| D-01 形态（web + API 优先） | 不变。分享、PAT、管理后台都走 `/api/v1`，页面与 Route Handler 继续共用 `src/lib/services/` |
| D-02 不记人↔人的边 | **保留**。分享收录产生的是「我的记录 ← 来自谁的分享」这一条记录级溯源（`people.source`），不是人与人之间的图边；地图仍是同心圆 |
| D-03 Postgres + pgvector | 不变，并额外用上 Postgres 的行级安全（M-08） |
| D-04 联系方式 jsonb | 不变。分享时按 key 逐项勾选是否共享（§7.3） |
| D-06 技术栈 | 不变。新增依赖只有认证库及其插件（§3.5） |
| D-07 PWA + 快捷指令 | 不变。快捷指令改用 PAT（§4.3） |
| D-08 / D-09 | 不变。收录是单条记录的 fork，不是批量导入 |
| §7.4 向量文本不含联系方式 | 不变，且分享快照里的联系方式默认也不含 |
| §19 已定的开放问题 1–5、7 | 不变 |

> 说明：任务背景里提到「D-02、D-09 明确单人私用」。核对原文后，D-02 是「不记人↔人的边」、D-09 是「不做批量导入通讯录」，二者都与多用户无关，本文保留；真正表达「单人私用」的是 §1、§2 非目标第 1 条、§8 认证和 D-10，已在 0.1 列出。

---

## 1. 目标与非目标

### 1.1 目标

1. **多用户 = 多个互相看不见的私有库**。每个注册用户拥有自己的 people / tags / events / inbox / embeddings；任何读写都必须带上「当前用户是谁」，跨用户一律当作不存在（404），不是无权限（403）。
2. **人脉分享 = 引荐一张只读卡片**。用户 A 把某个人（或某个圈子里的所有人）按自己勾选的字段做成一张卡片，发给站内用户 B，或生成一个可过期、可撤销、可设口令的链接。接收方看到的是卡片，不是 A 的原始记录。
3. **收录 = fork**。接收方可以把卡片「收录到我的人脉」：在自己的库里生成一条**新的、独立的**记录，记下来源（谁、何时、来自哪条分享）。此后两边各改各的，互不影响；重新生成接收方自己的 embedding；收录时做重名 / 疑似同一人提示。
4. **自托管友好**。没有 SMTP 也能完整使用；第一次启动时在浏览器里创建管理员；之后默认邀请制。
5. **手机路径不退化**。PWA 登录态能长期保持；iPhone 快捷指令只需要换一个令牌值。
6. **安全是产品的一部分**。印象（`impression`）、联系方式等私密字段的边界从数据库到 LLM 到分享全程有明确规则，有审计。

### 1.2 非目标（本轮不做）

- 多人协同编辑同一条记录、共享库 / 团队空间、评论、@ 提及。
- 公开目录、按名字搜别人库里的人、「谁认识谁」的图（D-02 继续有效）。
- 推送通知（Web Push / APNs）。分享到达只在站内显示，有 SMTP 时可选邮件。
- 跨实例联邦（A 实例分享到 B 实例）。
- 计费、组织 / 多租户 SaaS 运营功能。
- iOS 原生客户端（仍是原设计阶段 3）。

### 1.3 为什么选「只读卡片 + fork」而不是「共享记录」

| 方案 | 优点 | 缺点 | 结论 |
| --- | --- | --- | --- |
| **只读卡片 + fork（本文）** | 隐私边界清晰（分享什么由 owner 勾选，之后 owner 改了也不会泄露新内容）；接收方的 `tier` / `impression` 是自己的，符合「关系远近是我的主观判断」；撤销简单；RLS 策略简单 | 两边会各自演化、信息不同步；owner 更新后需要「重新分享」 | **采用**（M-01、M-09） |
| 共享记录（同一行多个读者） | 信息同步 | `impression` 必须变成每读者一份；`tier`、`last_contact_at`、events 都是「我和他」的关系数据，天然不可共享；RLS 与缓存复杂；撤销要处理「对方已经看过」 | 不做 |
| 组织 / 团队库（Better Auth organization 插件） | 现成的成员、邀请、角色 | 把「人脉库」变成 CRM，背离原设计原则 1「录入成本决定生死」与「印象是私密的」 | 不做；若将来做团队版，作为独立的租户类型加，不影响本文模型 |

- **M-01** 多用户采用「租户隔离的私有库 + 只读卡片分享 + fork 收录」。取代原设计 §2 非目标第 1 条与 D-10。

---

## 2. 用户与租户模型

### 2.1 概念

```mermaid
erDiagram
  users ||--o{ people : owns
  users ||--o{ tags : owns
  users ||--o{ inbox : owns
  users ||--o{ api_tokens : has
  users ||--o{ sessions : has
  users ||--o{ shares : creates
  shares ||--o{ share_items : "snapshot of"
  shares ||--o{ share_recipients : "sent to"
  shares ||--o{ share_links : "exposed as"
  share_recipients ||--o| inbox : "arrives as"
  people ||--o| share_items : "forked from (people.source)"
```

- `users`：由认证库管理（§3），我们只加业务列（`username`、`role`、`status`）。
- 所有业务表（`people`、`tags`、`events`、`inbox`、`people_embeddings`）增加 `owner_id uuid not null references users(id) on delete cascade`。`people_tags` 不加列，通过 `people` 推导。
- `tags` 的唯一约束从 `(name, kind)` 改为 `(owner_id, name, kind)`：词表按用户隔离（M-19），因为「球友」在每个人的库里含义不同。
- 删除用户 = 级联删除其全部记录、令牌、会话与发出的分享；别人已收录的副本是别人的数据，不受影响（§7.6）。

### 2.2 隔离原则：service 层统一 `ctx`

现状：`src/lib/services/*.ts` 的函数签名没有「当前用户」概念，直接 `import { db } from "@/db"` 查全表（如 `people.ts` 的 `listPeople()`、`getPersonRow(id)`，`inbox.ts` 的 `getPeopleIndex()` 把**全库**人名送进 LLM prompt）。多用户后这是最大的改动面。

落地指引：

1. 新建 `src/lib/auth/context.ts`：

   ```ts
   export type ServiceContext = {
     userId: string;
     role: "admin" | "member";
     via: "session" | "pat";
     /** 仅 via = "pat" 时存在；见 §4.2 */
     scopes?: readonly Scope[];
     sessionId?: string;
     tokenId?: string;
   };
   ```

2. **每个** service 函数的第一个参数都是 `ctx: ServiceContext`（纯函数除外），并且**只能**通过 `withTenant(ctx, async (tx) => ...)` 拿到数据库句柄（§2.3）。`services/*.ts` 不再 `import { db }`；用 ESLint `no-restricted-imports` 把 `@/db` 限制在 `src/lib/auth/tenant.ts`、`src/db/*`、`src/lib/auth/*` 内。
3. 读单条记录的入口（`getPersonRow`、`getTag`、`getInbox`、`listEvents` 等）在 SQL 里必须同时带 `id = ? and owner_id = ctx.userId`；查不到抛 `notFound()`，**不**区分「不存在」与「不是你的」。
4. 带外键的写操作（`applyInbox` 的 `draft.target_person_id`、`PATCH /people/:id` 的 `primary_circle_tag_id`、`PUT /people/:id/tags` 里的标签名、`inbox.person_id` 提示）都要先用 owner 过滤读一遍再引用。现状里 `applyInbox` 直接信任客户端传来的 `target_person_id`，这是一个多用户后立刻成立的 IDOR。
5. `getPeopleIndex(ctx)`、`listTags(ctx)`、`getRadialMapData(ctx)`、`getGeoMapData(ctx)`、`listReminders(ctx)`、`searchPeople(ctx, …)`、`embedPerson(ctx, id)`、`reembedAllPeople()`（脚本，逐用户）全部按 owner 过滤。
6. RSC 页面用 `requireUser()`（React `cache()` 包装，读 cookie 会话，失败 `redirect('/login?next=…')`）得到 `ctx`，再调 service；Route Handler 用 `getAuthContext(request)`（§5.1）。**不要**把鉴权只放在 `(app)/layout.tsx`——Next 16 文档明确：布局在客户端导航时不重跑，且布局不能阻止子段渲染（`node_modules/next/dist/docs/01-app/02-guides/authentication.md`「Layouts and auth checks」）。现状 `src/app/(app)/layout.tsx` 只是读待处理计数，正好不承担鉴权。

- **M-07** `ctx.userId` 是唯一的授权依据；service 层是唯一的数据访问层（Next 文档所称 DAL）；跨租户资源一律 404。

### 2.3 Postgres RLS 作为纵深防御：做，范围限定在内容表

**结论：采用（M-08）。** 理由：这是一个存着「我对别人的私密印象」的库，几十个查询里漏掉一个 `where owner_id` 就是跨用户泄露；RLS 把这类遗漏从「泄露」降级为「查不到 / 写不进」。代价在 A 期重构 service 签名时顺手付掉。

| 项目 | 决定 |
| --- | --- |
| 覆盖的表 | `people`、`tags`、`people_tags`、`events`、`people_embeddings`、`inbox`、`shares`、`share_items`、`share_recipients`、`share_links`。**不**覆盖认证库自己的表（`users`、`sessions`、`accounts`、`verifications`、`passkeys`、`two_factors`）与 `api_tokens`、`invites`、`audit_log`、`llm_usage`、`user_settings`——登录、按哈希查令牌、写审计都发生在「还不知道当前用户是谁」或「管理员跨用户」的时刻，这些表由 service 层按列过滤 |
| 数据库角色 | `tc_owner`：表的 owner，跑 `drizzle-kit`/`pnpm db:migrate`、seed、reembed、geocode、Drizzle Studio。`tc_app`：应用运行角色，`NOBYPASSRLS`，不是表 owner。两个 `DATABASE_URL`（§8.5） |
| 当前用户如何告诉数据库 | 每个 service 调用在一个事务内：`select set_config('app.user_id', $1, true)`（`true` = 事务级，`SET LOCAL` 不能带参数所以用 `set_config`）。策略用 `nullif(current_setting('app.user_id', true), '')::uuid`，避免未设置时的空串转型报错 |
| 链接访客 | 没有 `userId`。service 设置 `app.share_token_hash`，`share_items` 的读策略允许「存在未撤销、未过期、哈希匹配的 `share_links`」（§7.5） |
| `FORCE ROW LEVEL SECURITY` | 开，防止将来有人用 owner 角色跑应用时策略被静默跳过 |
| 启动自检 | 应用启动时执行 `select rolsuper, rolbypassrls from pg_roles where rolname = current_user`，若为真则在生产环境拒绝启动（开发环境打 warning），避免「单 URL 超级用户」让 RLS 形同虚设 |
| Drizzle 表达 | drizzle-orm 0.45 支持 `pgPolicy` 与 `.enableRLS()`（schema 片段见 §8.3），策略随 `pnpm db:generate` 进迁移；角色创建不由 drizzle 管，放在 `docker-compose.yml` 的 init SQL 与部署文档里 |

与 Drizzle + postgres.js 的配合：

```ts
// src/lib/auth/tenant.ts（示意）
export async function withTenant<T>(ctx: ServiceContext, fn: (tx: DbClient) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.user_id', ${ctx.userId}, true)`);
    return fn(tx);
  });
}
```

必须注意的三件事：

1. **不能再在 service 内部调用全局 `db.transaction`**。现状 `createPerson`、`updatePerson`、`applyInbox`、`addEvent` 都这么做；在 `withTenant` 之外另开事务会拿到另一条连接，上面没有 `app.user_id`，RLS 会让它「什么都查不到」而不是报错。规则：service 只用传进来的 `tx`（`services/db-client.ts` 的 `DbClient` 类型已经为此准备好了，现有函数大多已接受 `client` 参数），嵌套事务用 `tx.transaction`（Drizzle 转成 savepoint）。
2. **`refreshPersonEmbedding` 在事务提交后执行**（现状如此，为了不让 LLM 失败回滚入库）。多用户后它也要在 `withTenant` 内读写；把外部 embedding 请求放在事务外、只把 `insert ... on conflict` 放进事务，避免一次 15 秒超时占住连接。
3. 连接池 `max: 10` 不变；`set_config(..., true)` 随事务结束自动清除，连接复用安全。

RLS 的测试方法见 §11.4。

---

## 3. 认证方案选型

### 3.1 三条路线对比

版本与 peerDependencies 于 **2026-10-19** 用 `npm view` 查证（npm registry 可达）。本仓库现状：`next@16.3.6`、`react@19.2.8`、`drizzle-orm@^0.45.3`、`zod@^4.6.5`、`postgres@^3.4.9`、`vitest@^5`（`package.json`）。

| 维度 | Better Auth | Auth.js（next-auth v5） | 自研会话（Lucia 式） |
| --- | --- | --- | --- |
| 版本（2026-10-19） | `better-auth@1.7.11`（latest，当日发布）；`1.8.0-beta.1` | `next-auth@5.0.0-beta.32`（2026-07-20，**仍是 beta**，latest 标签还是 `4.24.15`）；`@auth/drizzle-adapter@1.11.3`、`@auth/core@0.41.3` | `lucia@3.2.2` 已标记 **deprecated**（2025-06，官方改为「教程式」自研指南）；配套 `arctic@3.7.0`（OAuth）、`@oslojs/crypto@1.0.1`、`@simplewebauthn/server@14.0.3`、`otpauth@9.5.2`、`@node-rs/argon2@2.2.2`、`jose@6.2.12` |
| 与 Next 16.3 / React 19 | peer `next: ^14 || ^15 || ^16`、`react: ^18 || ^19`，均为 optional peer，**兼容**；`better-auth/next-js` 导出 `toNextJsHandler`、`nextCookies`（已在 1.7.11 包内核实） | peer `next: ^14.0.0-0 || ^15 || ^16`、`react: ^18.2 || ^19`，**兼容** | 无框架耦合；Next 16 的约束（`cookies()` 异步、只能在 Server Action / Route Handler 里 set cookie）全部自己处理 |
| 与 Drizzle 0.45 | peer `drizzle-orm: ^0.45.2 || >=1.0.0-rc.1 <2`，自带 `@better-auth/drizzle-adapter@1.7.11`；`@better-auth/cli@1.4.21` 可生成 Drizzle schema | `@auth/drizzle-adapter` 支持 | 直接写 schema |
| 邮箱 + 密码 | 内建（注册、登录、改密、重置、邮箱验证可选），默认 **scrypt** 哈希（待确认具体参数），可换自定义 hash | Credentials provider 被官方定位为「不推荐」，无内建注册 / 哈希 / 重置，且 Credentials 不能用数据库会话（只能 JWT） | 全部自己写 |
| Passkey / WebAuthn | `@better-auth/passkey@1.7.11`（依赖 `@simplewebauthn/* ^13.3`） | 实验性 WebAuthn provider，peer 固定在 `@simplewebauthn/* ^9`（旧两个大版本） | `@simplewebauthn/server@14` 自己接 |
| TOTP 二步验证 | `two-factor` 插件（TOTP + 备份码 + 可信设备） | 无 | `otpauth` 自己接 |
| 用户名登录 | `username` 插件 | 无 | 自己写 |
| 会话 | 数据库会话，带 `ipAddress` / `userAgent`，内建 list / revoke / revokeOthers；可选 cookie cache | Credentials 场景只有 JWT 会话，无法列出 / 撤销设备 | 自己写（约 300 行） |
| 管理功能 | `admin` 插件（角色、封禁、列用户、撤销会话、代登录——我们只用子集） | 无 | 自己写 |
| API Key | `@better-auth/api-key@1.7.11`（可选，§4.4 讨论为何不用） | 无 | 自己写 |
| 内建限速 | 有（内存，生产默认开；可配规则，可存数据库） | 无 | 自己写 |
| OAuth | 内建 GitHub / Google 等 | 强项 | `arctic` |
| 风险 | 迭代快（1.7 → 1.8 beta），插件面大；表结构由其 CLI 生成需与 drizzle-kit 迁移对齐；默认有匿名遥测（`BETTER_AUTH_TELEMETRY=0` 关闭，待确认） | 项目长期 beta；功能缺口要靠自研补 ≈ 第三条路线的大半工作量 | 安全细节全部自己负责：会话轮换、重置令牌、Passkey ceremony、TOTP 重放、限速、锁定，约 1500–2500 行需要安全评审 |

### 3.2 推荐：Better Auth 作认证核心，业务授权自己写

- **M-02** 采用 **Better Auth `^1.7.11`** 处理「用户是谁」：注册 / 登录 / 会话 / 密码 / 重置 / Passkey / TOTP / 多设备会话 / 用户名 / 可选 OAuth / 登录限速。
- **我们自己写**「用户能做什么」：租户隔离（§2）、PAT（§4）、邀请（§3.3）、分享权限（§5、§7）、审计（§6.6）。不用 Better Auth 的 organization / api-key 插件来表达业务概念——业务规则必须在我们能读懂、能单测的代码里。
- 理由：三条路线里只有它在「邮箱 + 密码为基线」「无 SMTP 可用」「Passkey 推荐」「TOTP 可选」「多设备会话管理」五项上都不需要自研补洞，且与 Next 16 / React 19 / Drizzle 0.45 / zod 4 的版本矩阵当天可核实为兼容。Auth.js 的 Credentials 路线等于自研；纯自研在单人维护下安全评审成本最高。
- 边界约定：Better Auth 只接触它自己的表；它的 Drizzle schema 由 CLI 生成到 `src/db/auth-schema.ts`（相对路径导入，和 `src/db/schema.ts` 的注释一样是为了 drizzle-kit 能加载），我们的表引用 `users.id`。

接入骨架（文件名均为建议）：

| 文件 | 内容 |
| --- | --- |
| `src/lib/auth/server.ts` | `betterAuth({ database: drizzleAdapter(db, { provider: "pg", schema, usePlural: true }), emailAndPassword: {...}, plugins: [username(), twoFactor(), passkey(), admin(), nextCookies()], session: {...}, rateLimit: {...}, trustedOrigins: [...] })`。`nextCookies()` 必须是最后一个插件（Better Auth 文档要求，待确认），否则 Server Action 里登录后 cookie 不会写回 |
| `src/app/api/auth/[...all]/route.ts` | `export const { GET, POST } = toNextJsHandler(auth)`。注意路径是 `/api/auth/*`，**不在** `/api/v1` 下，也不走 `/api/v1` 的 PAT 鉴权 |
| `src/lib/auth/client.ts` | `createAuthClient({ plugins: [usernameClient(), twoFactorClient(), passkeyClient(), adminClient()] })`，只在需要浏览器 API 的地方用（Passkey ceremony、TOTP 二维码确认）；表单提交一律 Server Action |
| `src/lib/auth/dal.ts` | `requireUser()`、`getOptionalUser()`、`requireAdmin()`（React `cache`） |
| `src/lib/auth/context.ts` / `tenant.ts` | `ServiceContext`、`withTenant`（§2） |
| `src/app/(auth)/…` | 登录前页面（§10.2） |

> 待确认（开工第一天）：① `advanced.database.generateId` 能否设为 `"uuid"`（让 `users.id` 为 `uuid` 以便我们的外键用 `uuid` 类型；若不行则 `generateId: false` + 列默认 `gen_random_uuid()`）；② Drizzle adapter 是否按 TS 属性名（camelCase）而不是列名访问字段——若是，则生成的 schema 可以保持 `userId: uuid("user_id")` 这种「属性 camelCase、列 snake_case」的写法，与本仓库 snake_case 列名约定一致；③ `usePlural: true` 后表名为 `users / sessions / accounts / verifications / passkeys / two_factors`。

### 3.3 注册策略

| 场景 | 行为 |
| --- | --- |
| 数据库里没有用户（首次启动） | 任何页面都引导到 `/setup`；`/setup` 创建第一个用户，`role = admin`，并把现存的无主数据（原单人库）全部划给他、把 `API_TOKEN` 映射成他的一个 PAT（§8.4）。`/setup` 在已有用户后返回 404 |
| 之后的默认 | **邀请制**。管理员在 `/admin/invites` 生成邀请（可绑定邮箱、可设角色、7 天过期、一次性），复制链接 `/register?invite=<code>` 发给对方（微信 / 口头，不依赖邮件）。有 SMTP 时可直接发邮件 |
| 开放注册 | 环境变量 `AUTH_OPEN_SIGNUP=true` 时 `/register` 不要求邀请码。默认 `false` |
| 邮箱验证 | 有 SMTP 时 `requireEmailVerification` 可开（默认关：邀请码本身已证明「管理员认识你」）；没有 SMTP 一定关 |

实现方式：Better Auth 的注册端点统一经我们的 Server Action 调用 `auth.api.signUpEmail({ body, headers })`，在调用前校验邀请码（哈希比对、未过期、未使用、邮箱匹配）；并在 Better Auth 的 `hooks.before`（匹配 `/sign-up/email`）里**再**校验一次 `body.inviteCode`（作为 `user.additionalFields` 传入），没有合法邀请且非开放注册时抛 `APIError("FORBIDDEN")`——这样即使有人绕过页面直接 POST `/api/auth/sign-up/email` 也进不来。`databaseHooks.user.create.after` 里把邀请标记为已使用、写审计。（`hooks.before` / `databaseHooks` 为 Better Auth 公开 API，具体签名待确认。）

- **M-03** 首启建管理员 → 默认邀请制 → `AUTH_OPEN_SIGNUP` 可开放。

### 3.4 登录方式

| 方式 | 地位 | 说明 |
| --- | --- | --- |
| 邮箱（或用户名）+ 密码 | **基线**，一定可用 | `username` 插件让用户有一个 `@username`，分享时用它指定对方，不暴露邮箱。密码规则：长度 ≥ 10、不限字符种类、拒绝与邮箱 / 用户名相同；可选 `haveibeenpwned` 插件（需外网，默认关） |
| Passkey（WebAuthn） | **推荐的无密码路径** | 注册后在 `/settings/security` 添加；登录页支持 Passkey 按钮与浏览器自动填充（conditional UI）。要求安全上下文：HTTPS 或 `localhost`；局域网 `http://192.168.x.x` 不行，Tailscale 需开 HTTPS（见 §10.7） |
| GitHub / Google OAuth | **可选** | 配了 `GITHUB_CLIENT_ID/SECRET` 或 `GOOGLE_*` 才显示按钮；邀请制下 OAuth 首次登录也要邀请码（走同一个 `hooks.before`）。PWA 独立模式下回跳有坑（§10.7），所以不作为推荐路径 |
| 魔法链接 / 邮箱验证码 | 不做 | 没有 SMTP 时不可用；有了 Passkey 后价值不大 |

- **M-04** 邮箱 / 用户名 + 密码为基线；Passkey 为推荐；OAuth 可选；不做魔法链接。

### 3.5 邮件能力可选

```
SMTP_URL=            # 例如 smtp://user:pass@smtp.example.com:587 ；为空 = 无邮件
MAIL_FROM=
```

| 功能 | 有 SMTP | 无 SMTP |
| --- | --- | --- |
| 邀请 | 可发邮件，也可复制链接 | 复制链接 |
| 找回密码 | 用户在 `/forgot-password` 输入邮箱 → 收邮件 → `/reset-password?token=` | 用户联系管理员 → 管理员在 `/admin/users` 对该用户「生成重置链接」→ 链接通过微信等渠道给用户；实现上是**同一个** `sendResetPassword` 回调：有 SMTP 发邮件，无 SMTP 把链接存进 `pending_reset_links`（仅管理员可见、15 分钟过期、一次性）。用户自己也可以用 2FA 备份码 + Passkey 登录后改密 |
| 分享到达通知 | 可选邮件（用户可关） | 仅站内 |
| 邮箱验证 | 可开 | 关 |

发送实现用 `nodemailer`（版本待确认）；只在 `SMTP_URL` 非空时动态加载。

### 3.6 会话策略

| 项目 | 决定 | 实现落点 |
| --- | --- | --- |
| 存储 | 数据库会话（`sessions` 表），cookie 只放会话 token | Better Auth 默认 |
| Cookie 属性 | `HttpOnly`；`Secure`（生产，名字带 `__Secure-` 前缀）；`SameSite=Lax`（OAuth 回跳与 PWA 需要，`Strict` 会让从微信点进来的链接丢登录态）；`Path=/` | Better Auth 默认 + `advanced.useSecureCookies` |
| 空闲过期 | 30 天滑动：每天最多续一次 | `session.expiresIn = 30d`、`session.updateAge = 1d` |
| 绝对过期 | 180 天：超过即使活跃也要重新登录 | Better Auth 没有绝对上限；在 `requireUser()` / `getAuthContext()` 里比较 `sessions.created_at`，超限则 `revokeSession` 并当作未登录 |
| 轮换 | 登录成功发新会话；改密 / 重置密码 / 启用或关闭 2FA / 删除 Passkey 后**撤销其他全部会话**（当前保留）；OAuth 账号绑定后同样 | Better Auth `revokeOtherSessions` + `emailAndPassword.revokeSessionsOnPasswordReset` |
| 多设备 | `/settings/sessions` 列出 UA、IP、最近活跃、创建时间，可单个撤销、可「注销其他所有设备」 | Better Auth `listSessions` / `revokeSession` / `revokeOtherSessions` |
| 代理层乐观检查 | `src/proxy.ts` 只看 cookie **是否存在**，不查库，不解密；没有就 302 到 `/login?next=`；真正校验在 DAL | Next 文档「Optimistic checks with Proxy」 |
| cookie cache | 关闭（我们每个请求都会查库拿 `role`、`status`，省不下来） | `session.cookieCache.enabled = false` |
| 账号被停用 | `users.status = disabled`：DAL 直接当未登录并撤销其全部会话；PAT 同步失效 | `requireUser()` 读 `status` |

- **M-05** 数据库会话；空闲 30 天滑动 + 绝对 180 天；敏感操作后撤销其他会话。

### 3.7 找回密码

见 §3.5 表格。补充规则：重置链接 15 分钟过期、一次性；重置成功后撤销所有会话并写审计；`/forgot-password` 对不存在的邮箱也返回同样的「如果邮箱存在，已发送」，并走限速（§6.2）。

### 3.8 可选 TOTP 二步验证

- `two-factor` 插件：启用时需输入当前密码 → 展示 `otpauth://` 二维码（服务端用 `qrcode` 包渲染为 SVG，版本待确认）→ 输入一次验证码确认 → 展示 10 个备份码（只展示一次）。
- 登录流程：密码正确 → 若开启 2FA → `/two-factor` 输入 TOTP 或备份码 → 可勾选「30 天内此设备免二步」（插件的 trusted device）。
- Passkey 登录视为已满足二步验证（它本身是双因子）。
- 管理员可在 `/admin/users` 为被锁在外面的用户「重置 2FA」（写审计；用户下次登录会收到提示）。

---

## 4. API 令牌（Personal Access Token）

### 4.1 现状与问题

`src/proxy.ts` + `src/lib/api/auth.ts`：所有 `/api/v1/*` 比对一个全局 `API_TOKEN`，并且**每个打开页面的浏览器**都会被种下 `tc_token = API_TOKEN` 的 cookie（`proxy.ts` 第 33–42 行）。多用户后这两点都不能留：令牌必须属于某个用户、可撤销、可限权，页面也不能把任何密钥下发给浏览器。

### 4.2 设计

| 项目 | 决定 |
| --- | --- |
| 表 | `api_tokens`（§8.2）。只存 `sha256(token)`；明文只在创建时显示一次 |
| 格式 | `tcp_` + 32 字节随机数的 base64url（43 字符）。前缀便于识别与密钥扫描（secret scanning）；`token_prefix` 列存前 12 个字符用于列表展示 |
| 传递 | `Authorization: Bearer tcp_…`。与现在快捷指令的写法完全一样，只换值 |
| 命名 / 过期 / 撤销 | 必填名字；过期可选（预设 90 天 / 1 年 / 永不，默认 1 年）；撤销即时生效（`revoked_at`） |
| scope | 字符串数组，与 `/api/v1` 资源对应：`inbox:write`、`inbox:read`、`people:read`、`people:write`、`search:read`、`tags:read`、`tags:write`、`map:read`、`reminders:read`。预设：「快捷指令（只能记一句）」= `inbox:write`；「完整读写」= 全部。**没有** `tokens:*`、`shares:*`、`account:*`——这些只能在登录会话里操作，PAT 永远做不了 |
| 使用记录 | `last_used_at`、`last_used_ip`，同一令牌 5 分钟内最多更新一次（避免每次写库） |
| 数量上限 | 每用户 20 个 |
| 校验路径 | `getAuthContext()`：`Bearer tcp_` 开头 → 查 `token_hash` → 未撤销、未过期、用户 `active` → `ctx = { via: "pat", scopes }`；Route Handler 声明所需 scope（`route(handler, { scope: "inbox:write" })`），不满足返回 403 `insufficient_scope`。PAT 请求天然免 CSRF 检查（§6.3） |
| 为何不用 `@better-auth/api-key` 插件 | 它把 key 包装成「伪会话」，权限模型（statements）与我们的 scope 需要再映射；更关键的是 `API_TOKEN` 的兼容迁移要把一个**已知明文**按**我们的**哈希方式插进去（§4.4），自建表 150 行以内，完全可控 |

### 4.3 iPhone 快捷指令如何迁移

1. 用户在 `/settings/tokens` 新建令牌，选预设「快捷指令（只能记一句）」，复制明文（页面同时给出「配置快捷指令」链接，指向 `shortcuts/README.md`）。
2. 在快捷指令「获取 URL 内容」的头部，把 `Bearer <旧 API_TOKEN>` 换成 `Bearer tcp_…`。URL、方法、请求体都不变。
3. `shortcuts/README.md` 的「前置 2」改为「在网页 设置 › API 令牌 里新建一个」；排查表里 `unauthorized` 一行补充「令牌被撤销或过期」。
4. 服务器域名化（原设计阶段 3）后 Passkey 等才可用，但快捷指令不依赖此。

### 4.4 `API_TOKEN` 退役与兼容窗口

| 时间点 | 行为 |
| --- | --- |
| A 期上线，`/setup` 完成 | 若 `process.env.API_TOKEN` 非空：自动在管理员名下插入一条 PAT，`name = "旧 API_TOKEN（自动迁移）"`、`token_hash = sha256(API_TOKEN)`、`scopes = 全部`、`expires_at = now() + 90 天`、`legacy = true`。旧快捷指令**无需改动即可继续用** |
| 兼容窗口内（90 天） | `/settings/tokens` 顶部有横幅：「有一个由 `API_TOKEN` 迁移来的令牌，将于 … 过期，建议新建并替换」。启动日志每次 warning：`API_TOKEN is deprecated`。`proxy.ts` 不再种 `tc_token`，并对带有旧 cookie 的请求回 `Set-Cookie` 删除它 |
| 窗口结束 | 令牌自然过期；`.env.example` 删除 `API_TOKEN`；`src/lib/api/auth.ts` 的 `checkAuth` 与其测试删除（`extractBearer`、`safeEqual` 迁到 `src/lib/auth/pat.ts` 继续用） |
| 回滚 | 兼容窗口内任何时候把代码退回 A 期之前的版本都能工作：`API_TOKEN` 还在 `.env` 里，旧表结构只是多了可空列（§8.4） |

- **M-06** 每用户 PAT（只存哈希、可命名 / 撤销 / 过期 / 限 scope）取代全局 `API_TOKEN`；`API_TOKEN` 作为 legacy PAT 自动迁移并有 90 天兼容窗口。

---

## 5. 授权与权限矩阵

### 5.1 请求如何得到 `ctx`

```mermaid
flowchart TD
  R["请求到达"] --> A{"带 Authorization Bearer tcp_ ?"}
  A -- 是 --> P["查 api_tokens.token_hash"]
  P --> P1{"未撤销 / 未过期 / 用户 active ?"}
  P1 -- 否 --> E401["401 unauthorized"]
  P1 -- 是 --> S1{"Route 需要的 scope 在令牌内 ?"}
  S1 -- 否 --> E403a["403 insufficient_scope"]
  S1 -- 是 --> CTX["ctx via=pat"]
  A -- 否 --> C{"有会话 cookie ?"}
  C -- 否 --> E401
  C -- 是 --> V["auth.api.getSession"]
  V --> V1{"会话有效 / 未超绝对期限 / 用户 active ?"}
  V1 -- 否 --> E401
  V1 -- 是 --> M{"非 GET/HEAD ?"}
  M -- 是 --> O{"Origin 或 Sec-Fetch-Site 同源 ?"}
  O -- 否 --> E403b["403 csrf_rejected"]
  O -- 是 --> CTX2["ctx via=session"]
  M -- 否 --> CTX2
  CTX --> SVC["service 层 withTenant"]
  CTX2 --> SVC
```

页面（RSC）只走右半边：`requireUser()` 失败即 `redirect('/login?next=…')`。

### 5.2 权限矩阵

角色 / 身份：**owner**（记录所有者）、**recipient**（被直接分享的站内用户）、**visitor**（持链接的访客，可能未登录）、**admin**（管理员）、**PAT**（以某用户身份、受 scope 限制的程序化调用）。

| 资源 / 操作 | owner | recipient | visitor | admin（对他人） | PAT（本人） |
| --- | --- | --- | --- | --- | --- |
| 读 / 写 / 删自己的 people、tags、events、inbox、embeddings、map、reminders | 可 | — | — | 否（看不到任何内容，包括计数） | 按 scope |
| 读他人的上述记录 | 否（404） | 否（404） | 否 | 否（404） | 否 |
| 创建分享（人 / 圈子），选字段、对象、过期、口令 | 可 | — | — | 否 | 否（无 scope） |
| 查看 / 刷新快照 / 撤销自己发出的分享 | 可 | — | — | 否 | 否 |
| 查看发给自己的分享卡片（快照） | — | 可 | 可（链接有效、口令正确） | 否 | 否 |
| 收录 / 忽略 | — | 可 | 登录后 可 | — | 否 |
| 查看「谁收录了我的分享」 | 可（只看到 @username 与时间） | — | — | 否 | 否 |
| 管理自己的 PAT、会话、Passkey、2FA、隐私开关、导出、注销账号 | 可 | — | — | 否 | 否 |
| 创建 / 撤销邀请 | — | — | — | 可 | 否 |
| 列用户（用户名、邮箱、角色、状态、创建时间、最近登录、**不含**任何记录内容或数量） | — | — | — | 可 | 否 |
| 停用 / 恢复用户、撤销其会话与 PAT、生成重置链接、重置其 2FA | — | — | — | 可（不能对自己停用；至少保留一个 admin） | 否 |
| 提升 / 降级角色 | — | — | — | 可 | 否 |
| 查看审计日志 | 自己的 | — | — | 认证 / 管理类事件全部；内容类事件只看到 actor 与类型 | 否 |
| 实例设置（开放注册、LLM 配额默认值） | — | — | — | 可 | 否 |

- **M-15** 管理员的最小权限集：建邀请、看用户列表、停用 / 恢复、重置登录能力、调整实例级配额；**不能**读任何人的人脉数据，也没有「以该用户身份登录」（不启用 admin 插件的 impersonation）。

### 5.3 落地指引

- `src/lib/auth/authorize.ts`：`assertOwner(ctx, row)`、`assertAdmin(ctx)`、`assertScope(ctx, scope)`、`canViewShareItem(ctx | linkToken, item)`。全部是纯函数或只读查询，便于 Vitest。
- Route Handler 包装器 `route(handler, { scope?: Scope; admin?: boolean; session?: "required" })`：`session: "required"` 用于令牌 / 分享 / 账号类端点，PAT 来访直接 403。
- 不启用 Next 的实验性 `authInterrupts`（`unauthorized()` / `forbidden()` 需要 `experimental.authInterrupts`，且在 Suspense 内无法改状态码）。页面用 `redirect`，API 用 401 / 403 JSON。（**M-18**）

---

## 6. 安全设计

### 6.1 密码与凭据存储

| 项目 | 决定 |
| --- | --- |
| 密码哈希 | 沿用 Better Auth 默认 **scrypt**（参数待确认，官方默认满足 OWASP「可接受」）。若部署机 CPU 充裕可切 **argon2id**（`@node-rs/argon2@2.2.2`，参数 m=19 MiB、t=2、p=1），通过 `emailAndPassword.password.hash/verify` 注入；切换时老用户下次登录成功即自动重哈希。**M-14** |
| PAT | `sha256`（令牌本身 256 位随机，不需要慢哈希） |
| 分享链接 token | 同 PAT：32 字节随机，存 `sha256` |
| 分享口令 | 用户输入的短口令熵低 → scrypt / argon2id |
| 邀请码 | 32 字节随机，存 `sha256` |
| 重置 / 验证令牌 | Better Auth `verifications` 表管理；`pending_reset_links` 只存哈希 |
| TOTP secret、备份码 | Better Auth two-factor 插件默认加密存储（用 `BETTER_AUTH_SECRET` 派生密钥，待确认） |

### 6.2 登录限速与锁定

| 层 | 规则 |
| --- | --- |
| Better Auth 内建限速 | 生产默认开。自定义规则：`/sign-in/*`、`/sign-up/*`、`/forget-password`、`/two-factor/*`：每 IP 每 60 秒 ≤ 10 次；其余认证端点 100 / 60 秒。多实例部署时 `rateLimit.storage = "database"` |
| 账号级软锁 | 同一账号连续 10 次密码错误 → 15 分钟内拒绝密码登录（Passkey 不受影响），写审计，页面提示「稍后再试或用 Passkey」。用 Better Auth `hooks.after` 统计失败次数（待确认可行性；不可行则在我们的 Server Action 外层统计） |
| 公开端点 | `/s/[token]` 与其口令校验：每 IP 每分钟 ≤ 30 次读、≤ 5 次口令尝试；口令连错 10 次该链接自动失效并通知 owner |
| `/api/v1` 整体 | 每 PAT 每分钟 ≤ 120 次；每会话每分钟 ≤ 300 次（内存计数即可；超出 429 `rate_limited` 带 `Retry-After`） |

### 6.3 CSRF

| 入口 | 防护 |
| --- | --- |
| Server Actions（登录 / 注册 / 设置页表单） | Next 内建：只接受 POST，并校验 `Origin` 与 `Host`（或 `X-Forwarded-Host`）一致（`node_modules/next/dist/docs/01-app/02-guides/server-actions.md`「Security」）。部署在 Caddy 后、对外域名与内部 Host 不同时必须配 `experimental.serverActions.allowedOrigins`。每个 action 内部仍要 `requireUser()`，不依赖页面渲染时的检查 |
| Route Handler `/api/v1`（cookie 会话） | 我们自己做：非 GET/HEAD 请求要求 `Sec-Fetch-Site ∈ {same-origin, none}` 或 `Origin` 等于本站；否则 403 `csrf_rejected`。`SameSite=Lax` 是第二道 |
| Route Handler `/api/v1`（PAT） | 免检：浏览器不会跨站自动附带 `Authorization` 头 |
| Better Auth `/api/auth/*` | 其内建 `trustedOrigins` 检查；配置为我们的对外 origin（可多个） |
| 现有客户端代码 | `src/lib/api-client.ts` 的 `apiFetch` 已是同源 `credentials: "same-origin"`，浏览器自动带 `Sec-Fetch-Site: same-origin`，无需改动 |

### 6.4 Cookie 属性

见 §3.6。补充：删除旧 `tc_token` cookie 时要用与种下时相同的 `path=/`；`cookies().delete` 只能在 Server Action / Route Handler 内调用（Next `cookies` 文档），而我们是在 `proxy.ts` 的响应上 `response.cookies.delete`，这在 Proxy 里允许。

### 6.5 安全响应头

| 头 | 值 | 位置 |
| --- | --- | --- |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` | 反向代理（Caddy 自动 HTTPS 时加）；应用层不设，避免本地 http 开发被 HSTS 缓存 |
| `X-Content-Type-Options` | `nosniff` | `next.config.ts` `headers()` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | 同上 |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()`（上传图片用的是 `<input type=file>`，不需要 camera 权限策略） | 同上 |
| `X-Frame-Options` / CSP `frame-ancestors` | `DENY` / `'none'` | 同上 |
| `Content-Security-Policy` | **A 期**：`Content-Security-Policy-Report-Only`，策略 `default-src 'self'; img-src 'self' blob: data:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'`（d3 会写行内 `style` 属性，SVG 图标是组件内联）。**C 期**：切到 `proxy.ts` 生成 nonce 的强制 CSP（本仓库所有页面已经 `force-dynamic`，满足 Next CSP 文档的「nonce 需要动态渲染」前提），`style-src-attr 'unsafe-inline'` 为 d3 保留 | **M-17** |

### 6.6 审计日志

表 `audit_log`（§8.2）。写入点集中在 `src/lib/audit.ts` 的 `audit(ctx | null, action, target, meta)`，在事务外异步写（失败只打日志，不影响主流程）。

| 类别 | 事件（`action`） | 谁可见 |
| --- | --- | --- |
| 认证 | `auth.login.success`、`auth.login.failed`（含方式：password / passkey / oauth）、`auth.logout`、`auth.password.changed`、`auth.password.reset`、`auth.passkey.added/removed`、`auth.2fa.enabled/disabled/reset`、`auth.session.revoked`、`auth.account.locked` | 本人；admin |
| 令牌 | `token.created`、`token.revoked`、`token.used`（每令牌每天首次） | 本人；admin 看到有令牌事件但不看名字 |
| 分享 | `share.created`、`share.refreshed`、`share.revoked`、`share.link.viewed`（访客，记哈希前缀与 IP）、`share.link.passcode_failed`、`share.accepted`（谁收录）、`share.ignored` | owner 看自己发出的；recipient 看自己收到的；admin 只看到类型与 actor |
| 账号 | `account.exported`、`account.deleted`、`privacy.updated`（哪个开关） | 本人；admin |
| 管理 | `admin.invite.created/revoked`、`admin.user.disabled/enabled`、`admin.user.role_changed`、`admin.user.reset_link_issued`、`admin.user.2fa_reset`、`admin.settings.updated` | admin；被操作的用户在自己的日志里也能看到 |

保留 180 天，`pnpm db:prune-audit` 清理。`meta` 不得包含人脉内容字段，只放 id 与枚举。**M-16**

### 6.7 LLM 数据外发的隐私控制

现状：`createAndParseInbox` 把原文整句、`getPeopleIndex()` 的全库「姓名 · 所在地 · tier · 摘要 80 字 · 印象 40 字」一起发给 DeepSeek；图片发给硅基流动视觉模型；查询词发给 embedding 服务（`src/lib/services/inbox.ts`、`src/lib/llm/*`）。

| 控制 | 默认 | 说明 |
| --- | --- | --- |
| `user_settings.llm_enabled` | 开 | 关闭后：输入框不调模型，直接给空表单（复用现有「LLM 失败退化」路径 `fallbackDraft`）；搜索只用关键词层（`semantic_skipped = true` 已有此字段）；不生成 embedding |
| `user_settings.redact_contacts` | **开** | 发送前把手机号、邮箱、`wechat`/`wx` 后的 ID、URL 替换为 `[[CONTACT_1]]`…，返回后按映射还原到 `draft.person.contacts`。`src/lib/llm/redact.ts` 纯函数，Vitest 覆盖。人员索引里本来就不含联系方式，但 `summary` / `impression` 可能混入号码，同样过一遍 |
| `user_settings.vision_enabled` | 开 | 关闭后上传按钮隐藏，API 返回 400 `vision_disabled` |
| 索引范围 | 仅本用户 | `getPeopleIndex(ctx)` |
| 每用户配额 | 抽取 200 次 / 天，视觉 30 次 / 天，embedding 500 次 / 天（admin 可改实例默认值） | `llm_usage(user_id, day)` 计数；超限 429 `quota_exceeded`，前端提示并退化为手工表单，**记人永远不被挡住** |
| 分享快照 | 不经过任何模型 | 收录后在接收方自己的库里重算 embedding（走接收方的配额） |

- **M-13** 每用户 LLM 开关 + 联系方式脱敏默认开 + 每用户配额。取代原设计 §13「隐私边界：已知并接受」与 D-05 中「方便优先」的表述。

### 6.8 图片上传校验

现状 `src/lib/llm/vision.ts` 的 `validateImage` 只看 `file.type` 与大小（≤ 4 MB），图片不落库。补充：

- 读文件头魔数（JPEG `FF D8 FF`、PNG、WebP `RIFF…WEBP`、GIF）与声明的 `mediaType` 一致，否则 400。
- 解码尺寸上限（像素数 ≤ 25 MP），防解压炸弹；用 `sharp`（待确认版本）或只读头部的轻量库取宽高。
- 每用户每天上传次数计入 `vision_count`；单次请求体上限 5 MB（`serverActions.bodySizeLimit` 不涉及——上传走 Route Handler）。
- 继续不落库、不写日志正文。

### 6.9 备份与导出

| 项目 | 决定 |
| --- | --- |
| 实例备份 | 不变：每日 `pg_dump`（原设计 §15）。注意 dump 包含所有用户数据与密码哈希，存放位置要加密 |
| 用户自助导出 | `/settings/account` →「导出我的数据」：异步生成 zip（`people.json`、`tags.json`、`events.json`、`inbox.json`（原文）、`shares.json`、`README.txt`），下载链接 10 分钟有效、一次性；写审计 |
| 注销账号 | 输入密码（或 Passkey）确认 → 撤销全部会话 / PAT → 级联删除 → 别人已收录的副本保留（§7.6），其 `source.from_user` 显示为「已注销用户」 |
| 导入 | 不做（D-09）。导出格式与 `POST /api/v1/people` 的输入兼容，将来要恢复可以脚本化 |

### 6.10 密钥管理

| 密钥 | 用途 | 规则 |
| --- | --- | --- |
| `BETTER_AUTH_SECRET` | 会话 cookie 签名、2FA secret 加密派生 | ≥ 32 字节随机；轮换 = 全员重新登录、2FA 需按文档迁移（待确认） |
| `BETTER_AUTH_URL` | 对外 origin，Passkey rpID / OAuth 回调以此为准 | 必填；与 `trustedOrigins` 一致 |
| `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` | 多实例时 Server Action 闭包加密一致 | 单实例可不设 |
| `DATABASE_URL`（`tc_app`）/ `DATABASE_ADMIN_URL`（`tc_owner`） | 应用 / 迁移脚本 | 两个不同密码；应用容器里不放 admin URL |
| `DEEPSEEK_API_KEY`、`EMBEDDING_API_KEY`、`VISION_API_KEY` | 实例级 LLM key | 仍只在服务端 `src/lib/env.ts` 读取；不做每用户自带 key（见 §12 开放问题） |
| `SMTP_URL` | 可选 | 空即关闭邮件 |
| 所有密钥 | | 只在 `.env` / 容器 secret；永不出现在审计 `meta`、错误消息、客户端 bundle（`NEXT_PUBLIC_` 前缀禁止用于任何密钥） |

### 6.11 威胁模型

| # | 威胁 | 缓解 | 落在哪一层 |
| --- | --- | --- | --- |
| T1 | 跨用户读取 / 修改记录（IDOR：改 URL 里的 id、改 `target_person_id`） | 所有查询带 `owner_id = ctx.userId`；跨租户 404；RLS 兜底 | service 层（M-07）+ Postgres（M-08） |
| T2 | service 里漏写 owner 过滤 | RLS `FORCE`；集成测试「以 tc_app + 用户 A 的 setting 查 B 的数据 = 0 行」；ESLint 禁止 service 直接 import `db` | Postgres + 测试 + lint |
| T3 | 页面没登录就能看（现状） | `requireUser()` 在每个页面 / action / handler；Proxy 乐观跳转；`/setup` 在有用户后 404 | DAL + Proxy |
| T4 | 全局 `API_TOKEN` 泄露 = 全库泄露；浏览器被种下令牌 cookie | 每用户 PAT、scope、过期、撤销；页面不再下发任何令牌 | PAT（M-06）+ proxy 重写 |
| T5 | 撞库 / 暴力破解密码 | scrypt / argon2id；IP 限速；账号软锁；Passkey 可选替代 | Better Auth + 我们的 hook |
| T6 | 会话被盗（XSS、设备丢失） | `HttpOnly` cookie；CSP；多设备列表可撤销；绝对过期；敏感操作后撤销其他会话 | Cookie 属性 + 会话策略（M-05）+ CSP（M-17） |
| T7 | CSRF 让已登录用户被动写入 | Server Action Origin 校验；`/api/v1` 的 `Sec-Fetch-Site` / `Origin` 校验；`SameSite=Lax` | Next 内建 + handler 包装器 |
| T8 | 开放注册导致陌生人进入实例 | 默认邀请制；`hooks.before` 服务端二次校验邀请码 | 注册策略（M-03） |
| T9 | 分享泄露未勾选字段（印象、联系方式、时间线） | 快照在服务端按 `fields` 生成，接收方 / 访客只读快照；默认不含这些字段；选中印象时二次确认 | 分享模型（M-09、M-11） |
| T10 | 分享链接被转发、被爬 | 高熵 token、过期、次数上限、可选口令、可撤销、访问审计、限速 | share_links + 限速 |
| T11 | 撤销后数据仍可见 | 撤销即删快照内容；访客页 410；收录副本是对方的数据，UI 明示不会撤回 | M-12 |
| T12 | 用户枚举（登录 / 找回密码 / 分享对象查找） | 统一错误文案与时序；找回密码一律「已发送」；分享对象只允许精确 @username / 邮箱匹配且返回不含其它信息 | Server Action 文案 + 服务 |
| T13 | 联系方式 / 印象外发到第三方 LLM | 索引仅本用户；脱敏默认开；可整体关闭；向量文本不含联系方式（已有） | M-13 |
| T14 | 一个用户刷爆 LLM 账单 | 每用户配额 + 全局限速 | llm_usage |
| T15 | 恶意图片（伪造类型、解压炸弹） | 魔数校验、像素上限、大小上限、不落盘 | Route Handler |
| T16 | 管理员滥用 | admin 读不到内容；无 impersonation；管理操作全部审计且被操作者可见 | M-15、M-16 |
| T17 | 数据库备份泄露 | 备份加密存放；密码为慢哈希；PAT / 链接只存哈希 | 运维 + 存储设计 |
| T18 | 密钥进仓库 / 日志 | `.env` 已忽略；审计 `meta` 白名单；错误消息不含密钥；PAT 带 `tcp_` 前缀便于扫描 | 约定 + 代码评审 |
| T19 | 旧版本 PWA 调用已轮换的 Server Action id | Next 文档建议：滚动发布、保持 `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` 稳定、前端把「Failed to find Server Action」当作可重试错误提示刷新 | 部署 + UI |

---

## 7. 人脉分享设计

### 7.1 使用场景

场景 F，引荐一个人
: 我（A）知道朋友 B 想找羽毛球教练。在小王的卡片上点「分享」，默认只带姓名、深圳、圈子「球友」、能力「羽毛球」、认识方式；我额外勾上微信号。选对象 `@b`，附一句「上次说的教练，人很好」。B 的收件箱出现一张卡片，点「收录到我的人脉」，小王成为 B 库里的一条新记录，来源写着「@a 分享于 2026-10-20」。之后 B 自己给小王定 tier、写印象、记事件，与我无关。

场景 G，把一个圈子介绍给新同事
: 新同事 C 刚入行，我把「供应链」圈子里的 9 个人分享给他，只带姓名、所在地、能力标签、摘要。C 收到 9 张卡片在同一条分享下，可以逐个收录或忽略，也可以「全部收录」。

场景 H，发一条链接给还没注册的人
: 对方不在这个实例上。我生成一个 7 天过期、最多打开 10 次、带口令的链接，微信发过去。对方打开 `/s/…` 输入口令看到卡片；想收录就得先注册（管理员给他邀请码）；注册后回到同一链接点「收录」。

场景 I，分享错了
: 我误把带印象的卡片发给了 D。立刻撤销：D 的收件箱里这条分享变灰显示「已撤销」，卡片内容不可见；若 D 已经收录了，那条记录是 D 的，不会消失——界面在我撤销时就提醒过这一点。

### 7.2 分享粒度与模型

| 粒度 | 行为 |
| --- | --- |
| 单个人 | `shares.kind = 'person'`，一条 `share_items` |
| 一个圈子 | `shares.kind = 'circle'`，`circle_tag_id` 指向 owner 的 circle 标签；创建时把**当时**属于该圈子的人（`people_tags` 中 `kind = circle` 的匹配，或 `primary_circle_tag_id` 等于它）各生成一条 `share_items`。后来加入圈子的人不会自动进入；owner 可「刷新快照」重新生成（新增的人加入，已退出圈子的人移除，已有的人内容更新） |

**快照而非实时视图（M-09）**：创建分享时，在服务端按 `fields` 从 owner 的记录中抽取允许的字段，写入 `share_items.snapshot`（jsonb）。接收方与访客只读快照；owner 后续的修改不会流出去，除非他主动「刷新快照」。这样字段级可见性只在一个地方（`buildShareSnapshot()` 纯函数）执行，RLS 策略也只需要围绕 `share_items`。

```ts
// src/lib/shares/snapshot.ts（纯函数，Vitest）
export type ShareFields = {
  name: true;                       // 永远包含
  gender: boolean;                  // 默认 true
  location: boolean;                // 默认 true
  tags: "all" | "skills" | "none";  // 默认 "all"（圈子 + 能力 + 其他）
  how_met: boolean;                 // 默认 true
  met_at: boolean;                  // 默认 true
  summary: boolean;                 // 默认 false
  impression: boolean;              // 默认 false，勾选时二次确认
  contacts: string[];               // 默认 []，按 key 勾选，如 ["wechat"]
  events: "none" | "all" | { kinds: EventKind[] }; // 默认 "none"
  tier: boolean;                    // 默认 false（这是我和他的关系，不是他的属性）
  show_owner_name: boolean;         // 默认 true：接收方看到是谁分享的
};

export type ShareSnapshot = {
  version: 1;
  name: string;
  gender?: Gender;
  location?: string | null;
  tags?: Array<{ name: string; kind: TagKind }>;
  how_met?: string | null;
  met_at?: string | null;
  summary?: string | null;
  impression?: string | null;
  contacts?: Record<string, string>;
  events?: Array<{ kind: EventKind; content: string; happened_at: string }>;
  tier?: Tier;
  lat?: number | null; lng?: number | null;  // 跟随 location 一起带，省得对方重新 geocode
};
```

- **M-11** 默认只分享「公开安全」字段：姓名、性别、所在地、标签、认识方式、认识日期。联系方式（逐 key）、摘要、印象、时间线、tier 默认不分享，需显式勾选；印象需二次确认。

### 7.3 分享对象

| 对象 | 规则 |
| --- | --- |
| 站内用户 | 输入 `@username` 或邮箱，**精确匹配**（不做模糊搜索、不做用户目录，防止枚举）；匹配到才可发送；可多选；不能分享给自己；对方停用则不可选。一条分享可以有多个 recipient，每个 recipient 一条 `share_recipients`，状态各自独立 |
| 链接 | 一条分享可以有多个链接（便于撤销某一个转发出去的链接而不影响其它）。每个链接：`expires_at`（1 天 / 7 天 / 30 天，默认 7 天，最长 30 天）、`max_views`（可选，默认不限；达到后 410）、口令（可选，4–32 字符）、随时撤销。链接页不需要登录 |
| 两者可同时存在 | 同一条分享既发给站内用户又生成链接 |

### 7.4 接收方视角：复用收件箱

分享到达接收方时，service 在接收方名下写一条 `inbox` 记录：

| 列 | 值 |
| --- | --- |
| `owner_id` | 接收方 |
| `source` | `'share'`（`INBOX_SOURCE_VALUES` 增加该值；DB 列是 `text`，无需迁移枚举） |
| `status` | `pending` |
| `intent` | `add`（接收方在卡片上切到「更新已有」时变为 `update`，复用 `DraftCard` 现有的新增 / 更新切换） |
| `raw_text` | 生成的一句话，例如「@a 分享了「小王」：羽毛球教练 · 深圳 · 球友。附言：上次说的教练，人很好」。满足「原文永存」，也让收件箱列表、搜索能看到它 |
| `parsed` | 由快照转成的 `Draft`：`person.name/gender/location/how_met/met_at/summary/impression/contacts` 按快照填；`how_met` 默认改写为「经 @a 引荐」并在卡片里显示原值供参考；`tier` 留空（接收方自己定）；`tags` 为快照标签；`events` 为快照事件 |
| `share_recipient_id` | 新列，指向 `share_recipients` |

于是接收方在首页「待处理」和 `/inbox` 里看到的就是一张带「分享」徽标的条目，展开后是**只读卡片预览 + 可编辑的 DraftCard**，底部按钮是「收录到我的人脉」「忽略」。圈子分享生成 N 条 inbox 记录，在列表里折叠成一组，提供「全部收录」。

- **M-10** 分享以 `source = 'share'` 的 inbox 条目到达；收录复用 `applyInbox`。

重名 / 疑似同一人提示：`applyInbox` 之前已经有 `candidatesFor()`（按 `target_person_id`、人名包含关系找候选），对分享条目同样运行，并追加两条规则：联系方式任一 key+value 完全相同；`source.share_item_id` 相同（同一张卡片收录过两次）。命中则 DraftCard 顶部显示「库里可能已有这个人」，接收方可切「更新已有」把快照合并进去（现有逻辑：草稿非空字段覆盖、标签追加、联系方式合并）。

### 7.5 收录 = fork

`applyInbox(ctx, id, draft)` 在 `source = 'share'` 时多做四件事：

1. 新建（或更新）的 `people` 行写入 `source`：
   ```json
   { "kind": "share", "share_id": "…", "share_item_id": "…", "from_user_id": "…", "from_username": "a", "shared_at": "2026-10-20T…", "accepted_at": "2026-10-21T…" }
   ```
   没有外键（owner 注销后仍要能显示「来自已注销用户」），另加可空列 `source_share_item_id` 带 `on delete set null` 的外键，用于 owner 查看「谁收录了」。
2. 快照里接收方词表中不存在的标签：DraftCard 把它们显示为「新建并添加」的虚线 chip，接收方可一键创建（`applyInbox` 对分享条目允许 `createMissingTags`；对普通条目维持现在的「只能从词表里选」）。
3. `share_recipients.status = 'accepted'`、`responded_at = now()`；审计 `share.accepted`。
4. 正常走 `refreshPersonEmbedding(ctx, personId)`——在接收方自己的库里生成向量，用接收方的配额。

链接访客的收录：`/s/[token]` 上点「收录」→ 未登录则 `/login?next=/s/<token>`（或 `/register?invite=…&next=`）→ 登录后回到链接页，服务端为该用户创建一条 `share_recipients(via = 'link')` 与对应 inbox 条目，然后跳到收件箱里那一条展开。

RLS 中访客读快照的策略（`share_items`）：

```sql
using (
  exists (select 1 from shares s where s.id = share_id and s.owner_id = nullif(current_setting('app.user_id', true), '')::uuid)
  or exists (select 1 from share_recipients r where r.share_id = share_id and r.user_id = nullif(current_setting('app.user_id', true), '')::uuid)
  or exists (select 1 from share_links l where l.share_id = share_id
             and l.token_hash = current_setting('app.share_token_hash', true)
             and l.revoked_at is null and l.expires_at > now())
)
```

### 7.6 撤销与生命周期

| 动作 | 效果 |
| --- | --- |
| owner 撤销分享 | `shares.status = 'revoked'`；所有 `share_items.snapshot = null`、`purged_at = now()`；所有链接 `revoked_at`；接收方的 pending inbox 条目变为 `discarded` 并在列表里显示「分享已撤销」；访客页 410；审计。**已收录的副本不动**——撤销前的确认框明示「已被 2 人收录的副本不会撤回」 |
| owner 撤销单个链接 | 只影响该链接 |
| 链接过期 / 次数耗尽 | 410；owner 可生成新链接 |
| owner 删除原记录 | `share_items.person_id` 置空；快照仍在（分享的是当时的内容），owner 可手动撤销 |
| owner 刷新快照 | 重新按 `fields` 生成；pending 中的接收方看到新内容；已收录的不受影响 |
| 接收方忽略 | `share_recipients.status = 'ignored'`，inbox 条目 `discarded`；owner 看到「已忽略」 |
| owner 注销账号 | 其 `shares` 级联删除（快照随之消失）；副本保留，`source.from_username` 继续显示，前面加「（已注销）」 |

- **M-12** 撤销即清快照、链接即刻失效；已收录副本属于接收方，不撤回。

### 7.7 通知

| 渠道 | 规则 |
| --- | --- |
| 站内 | 导航上的待处理角标 = 待处理 inbox 条目数（含分享）；`/shared` 页列出收到的分享（pending / accepted / ignored / revoked）；首页「待处理」区块里分享条目排在最前 |
| 邮件 | 仅 `SMTP_URL` 配置且用户在隐私设置里开启「有人分享给我时发邮件」（默认关）；内容只含分享者 @username 与一个链接，不含卡片内容 |
| owner 侧 | 对方收录 / 忽略时不打扰，只在 `/shares` 列表和审计里可见 |

---

## 8. 数据模型变更

### 8.1 现有表的改动

| 表 | 改动 |
| --- | --- |
| `people` | + `owner_id uuid not null → users(id) cascade`；+ `source jsonb null`；+ `source_share_item_id uuid null → share_items(id) set null`；索引 `(owner_id, created_at desc, id desc)`（现有 keyset 分页 `listPeople` 的排序）、`(owner_id, tier)`、`(owner_id, last_contact_at)`、`(owner_id, lower(name))` |
| `tags` | + `owner_id`；唯一约束 `tags_name_kind_unique (name, kind)` → `tags_owner_name_kind_unique (owner_id, name, kind)`；索引 `(owner_id, kind)` |
| `people_tags` | 不加列；RLS 通过 `people` 推导 |
| `events` | + `owner_id`（冗余，便于 RLS 与按用户统计）；索引 `(owner_id, person_id, happened_at)` 取代现有 `events_person_id_idx`（或保留二者） |
| `people_embeddings` | + `owner_id`；HNSW 索引不变。注意：pgvector 的 HNSW 是「先近邻后过滤」，当某用户的人很少而总行数很大时 `limit 30` 可能被过滤掉大半；pgvector ≥ 0.8 可 `set hnsw.iterative_scan = relaxed_order`（事务级，和 `set_config` 一起放进 `withTenant`），或在搜索里把 `SEMANTIC_TOP_K` 临时放大后再截断（§11 验收项） |
| `inbox` | + `owner_id`；+ `share_recipient_id uuid null → share_recipients(id) set null`；`source` 文本值新增 `'share'`（zod `InboxSource` 同步） |
| `users`（Better Auth 生成） | 业务列：`username text unique`（username 插件）、`role text not null default 'member'`（admin 插件要求 text）、`status text not null default 'active'`（我们加，`active | disabled`）、`failed_login_count int default 0`、`locked_until timestamptz null` |

### 8.2 新表（Drizzle 片段）

```ts
// src/db/schema.ts 增补（示意；列名 snake_case 与现有约定一致）
import { users } from "./auth-schema"; // Better Auth CLI 生成：users / sessions / accounts / verifications / passkeys / two_factors

export const userSettings = pgTable("user_settings", {
  user_id: uuid().primaryKey().references(() => users.id, { onDelete: "cascade" }),
  llm_enabled: boolean().notNull().default(true),
  redact_contacts: boolean().notNull().default(true),
  vision_enabled: boolean().notNull().default(true),
  notify_share_email: boolean().notNull().default(false),
  updated_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export const invites = pgTable("invites", {
  id: uuid().primaryKey().defaultRandom(),
  code_hash: text().notNull().unique(),
  email: text(),                                   // 可选绑定
  role: text().notNull().default("member"),
  created_by: uuid().notNull().references(() => users.id, { onDelete: "cascade" }),
  expires_at: timestamp({ withTimezone: true }).notNull(),
  used_by: uuid().references(() => users.id, { onDelete: "set null" }),
  used_at: timestamp({ withTimezone: true }),
  revoked_at: timestamp({ withTimezone: true }),
  created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export const apiTokens = pgTable("api_tokens", {
  id: uuid().primaryKey().defaultRandom(),
  user_id: uuid().notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text().notNull(),
  token_prefix: text().notNull(),                  // "tcp_ab12cd34" 用于展示
  token_hash: text().notNull().unique(),           // sha256 hex
  scopes: text().array().notNull(),
  expires_at: timestamp({ withTimezone: true }),
  last_used_at: timestamp({ withTimezone: true }),
  last_used_ip: text(),
  revoked_at: timestamp({ withTimezone: true }),
  legacy: boolean().notNull().default(false),      // 由 API_TOKEN 迁移而来
  created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("api_tokens_user_idx").on(t.user_id)]);

export const shareKindEnum = pgEnum("share_kind", ["person", "circle"]);
export const shareStatusEnum = pgEnum("share_status", ["active", "revoked"]);
export const shareRecipientStatusEnum = pgEnum("share_recipient_status", ["pending", "accepted", "ignored"]);
export const shareViaEnum = pgEnum("share_via", ["direct", "link"]);

export const shares = pgTable("shares", {
  id: uuid().primaryKey().defaultRandom(),
  owner_id: uuid().notNull().references(() => users.id, { onDelete: "cascade" }),
  kind: shareKindEnum().notNull(),
  person_id: uuid().references(() => people.id, { onDelete: "set null" }),
  circle_tag_id: uuid().references(() => tags.id, { onDelete: "set null" }),
  fields: jsonb().$type<ShareFields>().notNull(),
  message: text(),
  status: shareStatusEnum().notNull().default("active"),
  created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  refreshed_at: timestamp({ withTimezone: true }),
  revoked_at: timestamp({ withTimezone: true }),
}, (t) => [index("shares_owner_idx").on(t.owner_id, t.created_at)]);

export const shareItems = pgTable("share_items", {
  id: uuid().primaryKey().defaultRandom(),
  share_id: uuid().notNull().references(() => shares.id, { onDelete: "cascade" }),
  person_id: uuid().references(() => people.id, { onDelete: "set null" }),
  snapshot: jsonb().$type<ShareSnapshot>(),        // 撤销后置 null
  snapshot_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  purged_at: timestamp({ withTimezone: true }),
}, (t) => [index("share_items_share_idx").on(t.share_id)]);

export const shareRecipients = pgTable("share_recipients", {
  id: uuid().primaryKey().defaultRandom(),
  share_id: uuid().notNull().references(() => shares.id, { onDelete: "cascade" }),
  user_id: uuid().notNull().references(() => users.id, { onDelete: "cascade" }),
  via: shareViaEnum().notNull().default("direct"),
  status: shareRecipientStatusEnum().notNull().default("pending"),
  created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  responded_at: timestamp({ withTimezone: true }),
}, (t) => [unique("share_recipients_share_user_unique").on(t.share_id, t.user_id), index("share_recipients_user_idx").on(t.user_id, t.status)]);

export const shareLinks = pgTable("share_links", {
  id: uuid().primaryKey().defaultRandom(),
  share_id: uuid().notNull().references(() => shares.id, { onDelete: "cascade" }),
  token_hash: text().notNull().unique(),
  passcode_hash: text(),
  expires_at: timestamp({ withTimezone: true }).notNull(),
  max_views: integer(),
  view_count: integer().notNull().default(0),
  passcode_failures: integer().notNull().default(0),
  last_viewed_at: timestamp({ withTimezone: true }),
  revoked_at: timestamp({ withTimezone: true }),
  created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export const auditLog = pgTable("audit_log", {
  id: uuid().primaryKey().defaultRandom(),
  actor_user_id: uuid().references(() => users.id, { onDelete: "set null" }),
  action: text().notNull(),
  target_type: text(),
  target_id: text(),
  subject_user_id: uuid().references(() => users.id, { onDelete: "set null" }), // 被操作 / 相关的用户
  ip: text(),
  user_agent: text(),
  meta: jsonb().$type<Record<string, string | number | boolean | null>>(),
  created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("audit_actor_idx").on(t.actor_user_id, t.created_at), index("audit_subject_idx").on(t.subject_user_id, t.created_at), index("audit_created_idx").on(t.created_at)]);

export const llmUsage = pgTable("llm_usage", {
  user_id: uuid().notNull().references(() => users.id, { onDelete: "cascade" }),
  day: date().notNull(),
  extract_count: integer().notNull().default(0),
  vision_count: integer().notNull().default(0),
  embed_count: integer().notNull().default(0),
}, (t) => [primaryKey({ columns: [t.user_id, t.day] })]);

export const pendingResetLinks = pgTable("pending_reset_links", {
  id: uuid().primaryKey().defaultRandom(),
  user_id: uuid().notNull().references(() => users.id, { onDelete: "cascade" }),
  url_hash: text().notNull(),
  url_encrypted: text().notNull(),                 // AES-GCM，密钥由 BETTER_AUTH_SECRET 派生；仅管理员页解密展示一次
  issued_by: uuid().references(() => users.id, { onDelete: "set null" }),
  expires_at: timestamp({ withTimezone: true }).notNull(),
  consumed_at: timestamp({ withTimezone: true }),
  created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
});
```

### 8.3 RLS 的 Drizzle 表达（以 `people` 为例）

```ts
import { pgPolicy, pgRole } from "drizzle-orm/pg-core";

export const tcApp = pgRole("tc_app").existing(); // 角色由部署脚本创建，drizzle 只引用

const currentUser = sql`nullif(current_setting('app.user_id', true), '')::uuid`;

export const people = pgTable("people", { /* …列… */ }, (t) => [
  /* …索引… */
  pgPolicy("people_owner_all", {
    for: "all",
    to: tcApp,
    using: sql`${t.owner_id} = ${currentUser}`,
    withCheck: sql`${t.owner_id} = ${currentUser}`,
  }),
]).enableRLS();
```

`FORCE ROW LEVEL SECURITY` drizzle-kit 不生成，放在手写迁移 `drizzle/000x_rls_force.sql` 中（`drizzle-kit generate --custom`）。`people_tags`、`share_items` 的 EXISTS 型策略见 §2.3、§7.5。

### 8.4 迁移步骤

| 步骤 | 内容 | 可回滚性 |
| --- | --- | --- |
| 0 | 备份：`pg_dump` | — |
| 1 | `drizzle/0002_auth.sql`：Better Auth 表（CLI 生成后合并进 drizzle 迁移，不单独跑 `better-auth migrate`）；`user_settings`、`invites`、`api_tokens`、`audit_log`、`llm_usage`、`pending_reset_links` | 可 drop |
| 2 | `drizzle/0003_owner_columns.sql`：各业务表 `owner_id uuid null`、`people.source`、`inbox.share_recipient_id`；`tags` 唯一约束改为 `(owner_id, name, kind)`；新索引 | 新列可空，旧代码照跑 |
| 3 | 部署 A 期代码，访问 `/setup` 建管理员。`setup` 的 Server Action 在**一个事务**里：`update people/tags/events/people_embeddings/inbox set owner_id = :admin where owner_id is null`；插入 legacy PAT（§4.4）；写审计 `admin.setup_completed` | 可重复执行（幂等） |
| 4 | `drizzle/0004_owner_not_null_and_rls.sql`：先 `do $$ begin if exists (select 1 from people where owner_id is null) then raise exception 'unclaimed rows'; end if; end $$;`，再 `set not null`、`enable/force row level security`、建策略。A 期以**两次发布**完成：第一次含步骤 1–3，第二次含步骤 4（避免 drizzle 一次跑完所有迁移时 `/setup` 还没来得及领走数据） | 回滚 = `drop policy`、`disable rls`、`drop not null` |
| 5 | `docker-compose.yml` init SQL 创建 `tc_owner` / `tc_app`；`.env` 加 `DATABASE_ADMIN_URL`；`src/db/index.ts` 按脚本 / 应用选择 URL；`pnpm db:seed` 改为 `--owner <email>`（或开发环境自动建 `dev@local`） | — |
| 6 | B 期：`drizzle/0005_shares.sql`（`shares`、`share_items`、`share_recipients`、`share_links` 及策略；`people.source_share_item_id` 外键） | 可 drop |
| 7 | C 期：Better Auth passkey / two-factor 插件表（若 A 期未一起生成）；`audit_log` 清理脚本 | 可 drop |

回滚思路：A 期第一次发布后的任何时刻，退回旧代码都能运行（新列可空、旧 `API_TOKEN` 仍在）；第二次发布（NOT NULL + RLS）之后退回旧代码会因 `tc_app` 角色与 RLS 而查不到数据——所以第二次发布前要确认 `/setup` 已完成、旧快捷指令已验证可用。

### 8.5 环境变量增量

```
# 数据库：应用用受限角色，迁移/脚本用 owner 角色
DATABASE_URL=postgres://tc_app:…@localhost:5433/tokenconnection
DATABASE_ADMIN_URL=postgres://tc_owner:…@localhost:5433/tokenconnection

# 认证
BETTER_AUTH_SECRET=              # openssl rand -base64 32
BETTER_AUTH_URL=http://localhost:3000
AUTH_OPEN_SIGNUP=false
SESSION_IDLE_DAYS=30
SESSION_ABSOLUTE_DAYS=180
GITHUB_CLIENT_ID= / GITHUB_CLIENT_SECRET=   # 可选
GOOGLE_CLIENT_ID= / GOOGLE_CLIENT_SECRET=   # 可选

# 邮件（可选）
SMTP_URL=
MAIL_FROM=

# LLM 配额默认值（admin 可在实例设置里覆盖）
LLM_QUOTA_EXTRACT_PER_DAY=200
LLM_QUOTA_VISION_PER_DAY=30
LLM_QUOTA_EMBED_PER_DAY=500

# 兼容窗口内保留，窗口结束删除
API_TOKEN=
```

---

## 9. API 变更

### 9.1 鉴权方式变化

| 项目 | 之前（`docs/api.md`） | 之后 |
| --- | --- | --- |
| 凭据 | `Authorization: Bearer <API_TOKEN>` 或 cookie `tc_token` | `Authorization: Bearer tcp_…`（PAT，按 scope）或登录会话 cookie（同源页面；非 GET 需通过 CSRF 校验） |
| 校验位置 | `src/proxy.ts` | Route Handler 内 `getAuthContext()`；`proxy.ts` 不再校验 API |
| 身份 | 无 | 每个请求都有 `ctx.userId`；所有资源按其过滤 |
| 认证端点 | 无 | `/api/auth/*`（Better Auth，自动挂载；页面与客户端 SDK 使用，不列入 `/api/v1` 文档，只在 `docs/api.md` 说明其存在与 CSRF 规则） |

### 9.2 端点清单（新增 / 修改）

| 方法 | 路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| `GET` | `/me` | 会话 / PAT | `{ user: { id, username, name, role }, via, scopes? }` |
| `GET` | `/tokens` | 会话 | 列表（不含哈希） |
| `POST` | `/tokens` | 会话 | `{ name, scopes, expires_in_days? }` → `{ token: "tcp_…", item }`，明文只此一次 |
| `DELETE` | `/tokens/:id` | 会话 | 撤销 |
| `GET` | `/sessions` / `DELETE /sessions/:id` / `POST /sessions/revoke-others` | 会话 | 薄封装 Better Auth `listSessions` 等，便于页面统一走 `/api/v1` |
| `GET` / `PATCH` | `/settings/privacy` | 会话 | `llm_enabled`、`redact_contacts`、`vision_enabled`、`notify_share_email` |
| `POST` | `/account/export` | 会话 | 触发导出，返回 `{ job_id }`；`GET /account/export/:job_id` 取下载链接 |
| `POST` | `/account/delete` | 会话（需密码 / Passkey 重验证） | 注销 |
| `POST` | `/shares` | 会话 | `{ kind, person_id? , circle_tag_id?, fields, message?, recipients?: ["@b", "c@x.com"], link?: { expires_in_days, max_views?, passcode? } }` → `{ share, recipients, link?: { url } }`；链接 URL 明文只此一次 |
| `GET` | `/shares` | 会话 | 我发出的分享（含每个 recipient 的状态、链接的剩余次数） |
| `GET` | `/shares/:id` | 会话 | 详情（含快照预览） |
| `POST` | `/shares/:id/refresh` | 会话 | 刷新快照 |
| `POST` | `/shares/:id/revoke` | 会话 | 撤销 |
| `POST` | `/shares/:id/links` / `DELETE /shares/:id/links/:linkId` | 会话 | 增删链接 |
| `GET` | `/shared` | 会话 | 我收到的分享（`share_recipients` 视角，带 inbox id） |
| `GET` | `/s/:token` | **公开**（限速） | `{ share: { kind, owner_name?, message, expires_at }, items: [snapshot…] }`；需口令时 `401 { error: { code: "share_passcode_required" } }`；过期 / 撤销 / 超次 `410 share_gone`。每次成功读取 `view_count + 1` |
| `POST` | `/s/:token/unlock` | 公开（限速） | `{ passcode }` → 设置一个仅对该链接有效的短期 `HttpOnly` cookie（15 分钟），之后 `GET /s/:token` 免口令 |
| `POST` | `/s/:token/collect` | 会话 | 为当前用户创建 recipient + inbox 条目，返回 `{ inbox_ids }` |
| `GET` | `/inbox?status=` | 会话 / PAT `inbox:read` | 返回项新增 `share?: { id, from_username, kind, item_count }`（`source = 'share'` 时） |
| `POST` | `/inbox/:id/apply` | 会话 / PAT `inbox:write` | 对分享条目：接受 `create_missing_tags: true`；返回的 `person.source` 非空 |
| `GET` | `/admin/users` | 会话 + admin | 用户列表（无内容字段） |
| `POST` | `/admin/users/:id/disable` / `enable` / `role` / `reset-link` / `reset-2fa` / `revoke-sessions` | 会话 + admin | 管理操作 |
| `GET` / `POST` / `DELETE` | `/admin/invites` | 会话 + admin | 邀请 |
| `GET` / `PATCH` | `/admin/settings` | 会话 + admin | 开放注册、配额默认值 |
| `GET` | `/audit?scope=me|admin` | 会话 | 审计日志分页 |
| 既有全部端点 | `/people*`、`/tags*`、`/search`、`/map/*`、`/reminders`、`/geo/cities` | 会话 / PAT 按 scope | 行为不变，数据按 `ctx.userId` 过滤；`PATCH /people/:id` 的 `primary_circle_tag_id`、`PUT /people/:id/tags` 的标签名都在本用户词表内校验 |

### 9.3 错误码增补

| HTTP | `code` | 场景 |
| --- | --- | --- |
| 401 | `unauthorized` | 无凭据 / 会话无效 / PAT 无效 |
| 401 | `token_expired` / `token_revoked` | PAT 过期 / 已撤销（便于快捷指令提示） |
| 401 | `share_passcode_required` | 链接需要口令 |
| 403 | `forbidden` | 登录了但不是 admin；PAT 访问会话专属端点 |
| 403 | `insufficient_scope` | PAT 缺 scope，`message` 指出需要哪个 |
| 403 | `csrf_rejected` | cookie 会话的非 GET 请求 Origin 不符 |
| 403 | `account_disabled` | 用户被停用 |
| 410 | `share_gone` | 链接撤销 / 过期 / 超次 |
| 429 | `rate_limited`（带 `Retry-After`） / `quota_exceeded` | 限速 / LLM 配额 |
| 400 | `vision_disabled` | 用户关闭了图片识别 |
| 503 | `setup_required` | 实例尚无用户（API 侧提示去 `/setup`） |

### 9.4 对 `docs/api.md` 的增补点

1. 开头鉴权段落改写为 §9.1；示例里 `TOKEN=$(grep '^API_TOKEN=' .env …)` 改为「在 设置 › API 令牌 创建」。
2. 新增「Scope 对照表」：每个既有端点需要的 scope。
3. 新增 §9.2 的端点与 §9.3 的错误码。
4. 「排序、提醒、地理」一节末尾注明：所有计算都在当前用户的数据范围内。

---

## 10. UI 重新设计

### 10.1 信息架构

```mermaid
flowchart LR
  subgraph pub["登录前（无应用壳）"]
    setup["/setup 首次启动"]
    login["/login"]
    reg["/register?invite="]
    forgot["/forgot-password"]
    reset["/reset-password?token="]
    tf["/two-factor"]
    s["/s/[token] 访客卡片"]
  end
  subgraph app["登录后（应用壳：桌面顶栏 / 手机底栏）"]
    home["/ 首页"]
    people["/people 与 /people/:id"]
    map["/map"]
    shared["/shared 收到的分享"]
    shares["/shares 我发出的分享"]
    me["/settings 我"]
    inbox["/inbox"]
    tags["/tags"]
    rem["/reminders"]
    acc["/settings/account"]
    sec["/settings/security"]
    sess["/settings/sessions"]
    tok["/settings/tokens"]
    priv["/settings/privacy"]
    admin["/admin/users · /admin/invites · /admin/audit · /admin/settings"]
  end
  login --> home
  s -- 收录需登录 --> login
  me --> inbox & tags & shared & shares & acc & sec & sess & tok & priv & admin
```

目录建议：`src/app/(auth)/*`（登录前页面，极简布局、品牌标、一张卡）；`src/app/(public)/s/[token]/page.tsx`（访客页，独立布局）；`src/app/(app)/*` 现有结构 + 新页面；`src/app/(app)/admin/*` 的 `layout.tsx` 调 `requireAdmin()`（页面内各自再调一次，布局只负责侧边 tab）。

### 10.2 路由清单

| 路由 | 鉴权 | 新 / 改 | 一句话 |
| --- | --- | --- | --- |
| `/setup` | 仅无用户时 | 新 | 创建管理员、迁移旧数据、迁移 `API_TOKEN` |
| `/login` | 公开 | 新 | 邮箱 / 用户名 + 密码；Passkey；可选 OAuth；无用户时显示「去初始化」 |
| `/register` | 公开（需 `invite`，或开放注册） | 新 | 邀请码校验、设置用户名与密码 |
| `/forgot-password`、`/reset-password` | 公开 | 新 | 有 SMTP 走邮件；无 SMTP 提示联系管理员 |
| `/two-factor` | 半登录态 | 新 | 输入 TOTP / 备份码 |
| `/s/[token]` | 公开 | 新 | 访客卡片、口令、收录 CTA |
| `/` | 登录 | 改 | 不变 + 待处理里的分享条目 |
| `/people`、`/map`、`/tags`、`/inbox`、`/reminders` | 登录 | 改 | 数据按用户；`/inbox` 增加「分享」筛选 |
| `/people/[id]` | 登录 | 改 | 顶部加「分享」按钮；分享面板；「已分享给 N 人」行；fork 来源行 |
| `/shared` | 登录 | 新 | 收到的分享（待处理 / 已收录 / 已忽略 / 已撤销） |
| `/shares` | 登录 | 新 | 我发出的分享：状态、接收方、链接、刷新 / 撤销 |
| `/settings` | 登录 | 改 | 从两项列表变成「我」页：头像 / 用户名、分组菜单、退出 |
| `/settings/account` | 登录 | 新 | 名字、用户名、邮箱、头像、导出、注销 |
| `/settings/security` | 登录 | 新 | 密码、Passkey、2FA、会话入口 |
| `/settings/sessions` | 登录 | 新 | 设备列表 |
| `/settings/tokens` | 登录 | 新 | PAT |
| `/settings/privacy` | 登录 | 新 | LLM 开关、脱敏、图片识别、邮件通知、配额用量 |
| `/admin/users`、`/admin/invites`、`/admin/audit`、`/admin/settings` | admin | 新 | 管理后台 |
| `/unauthorized`、`/forbidden` | — | 不做 | 不启用 authInterrupts（M-18）；用 redirect 与 `not-found` |

### 10.3 应用壳的变化

现状 `src/components/app-nav.tsx`：桌面顶栏（品牌「朋友圈」+ 首页 / 人脉 / 地图 / 设置）、手机底栏四格，设置项带待处理角标，`isActive` 把 `/tags`、`/inbox` 归到设置。

| 变化 | 桌面 | 手机 |
| --- | --- | --- |
| 导航项 | 首页 · 人脉 · 地图 · **分享** · 设置 | 四格不变但第四格改名「**我**」（图标 `CircleUser`），收纳设置、分享、收件箱、标签 |
| 角标 | 「分享」项 = 待处理分享数；「设置」= 其余待处理 inbox 数 | 「我」= 全部待处理数（现状逻辑） |
| 用户菜单 | 顶栏右侧头像（首字母圆形，`avatar`）→ 下拉菜单：名字 / @username、设置、安全、API 令牌、管理后台（admin）、退出登录（Server Action） | 无下拉；「我」页顶部即用户区 |
| 快捷入口 | 顶栏「分享」项 hover 显示最近 3 条待处理分享（可省略） | — |
| 退出 | `<form action={logoutAction}>` | 「我」页底部 |
| `isActive` | `/shared`、`/shares` → 分享；`/settings/*`、`/tags`、`/inbox`、`/reminders`、`/admin/*` → 设置 / 我 | 同 |
| `AppLayout` | 继续只取计数（改成 `countPending(ctx)`）；`requireUser()` 在每个 page 调用；布局拿 `getOptionalUser()` 只为渲染头像 | 同 |

### 10.4 页面规格

记法：**组件** 一栏中「已有」指 `src/components/` 现有文件，「ui/新增」指需要通过 `pnpm dlx shadcn@latest add <name>` 加入 `src/components/ui/`（base-nova 风格，`components.json` 已配置；实际组件名以 shadcn 注册表为准，待确认）。全站只有 `button`、`input`、`textarea` 三个 ui 组件是现成的。

#### 登录前

| 页面 | 布局与内容 | 组件 | 状态与文案 |
| --- | --- | --- | --- |
| `/setup` | 居中单卡：品牌标 + 「初始化朋友圈」；表单：名字、用户名、邮箱、密码 ×2；说明「这是第一个账号，拥有管理员权限；库里现有的 N 个人、M 个标签会归到这个账号名下」；检测到 `API_TOKEN` 时多一行「现有快捷指令令牌将自动迁移，90 天内继续可用」 | ui/新增 `field`（或 `label`）、`alert`；已有 `button`、`input` | 已有用户 → 404。提交中禁用；错误用 `useActionState` 内联显示 |
| `/login` | 单卡：邮箱或用户名、密码、「登录」；分割线「或」；「使用 Passkey 登录」（`conditional UI` 自动填充）；OAuth 按钮按环境变量显示；底部链接「忘记密码」「有邀请码？注册」；`?next=` 保留 | ui/新增 `separator`、`alert`；Better Auth client 用于 Passkey | 无用户 → 卡片换成「尚未初始化，去创建管理员 →」。错误文案统一「邮箱、用户名或密码不正确」；被软锁「尝试过多，15 分钟后再试，或用 Passkey」；账号停用「该账号已停用，请联系管理员」 |
| `/register` | 单卡：顶部显示「@admin 邀请你加入」+ 邀请绑定的邮箱（只读）；用户名（实时校验可用）、名字、邮箱、密码 ×2；勾选「我知道这是一个自托管实例，数据由管理员保管」 | 同上 | 无 `invite` 且未开放注册 → 「需要邀请码」空态；邀请过期 / 已用 → 对应提示 |
| `/forgot-password` | 单卡：邮箱 → 提交后一律「如果该邮箱已注册，重置链接已发送」；无 SMTP 时直接显示「本实例未配置邮件，请联系管理员为你生成重置链接」 | — | — |
| `/reset-password` | 新密码 ×2 → 成功后跳 `/login` 并提示「其它设备已退出登录」 | — | 令牌无效 / 过期 → 提示并链接到 `/forgot-password` |
| `/two-factor` | 6 位验证码输入；「用备份码」切换；「30 天内此设备不再询问」 | ui/新增 `input-otp`、`checkbox` | 连错 5 次回登录页 |

#### 访客页 `/s/[token]`

| 项目 | 规格 |
| --- | --- |
| 布局 | 独立极简壳：顶部品牌 +「@a 分享了一张人脉卡片」（`show_owner_name` 为假时只写「有人分享了…」）；中部卡片（圈子分享时为卡片列表）；底部「收录到我的人脉」+「这是什么？」说明 |
| 卡片 | 只渲染快照中存在的字段；联系方式 `select-all` 字体同详情页；不显示 tier、不显示任何「我」的字段 |
| 口令 | 覆盖层：「这张卡片需要口令」+ 输入 + 解锁；成功设短期 cookie |
| CTA | 已登录：点击 → `POST /s/:token/collect` → 跳 `/inbox#<id>`；未登录：→ `/login?next=/s/<token>`，登录页顶部显示「登录后即可收录这张卡片」 |
| 状态 | 410：「这条分享已失效」（不区分撤销 / 过期 / 超次）；429：稍后再试 |
| SEO | `robots: noindex`；无 OG 图片（避免抓取生成的卡片内容） |

#### 登录后新增 / 修改页面

| 页面 | 布局与内容 | 组件 | 状态 |
| --- | --- | --- | --- |
| `/people/[id]`（改） | 标题行按钮组：**分享**（`Share2` 图标）· 编辑 · 删除。标题下新增一行小字：若 `source` 非空「来自 @a 的分享 · 2026-10-20 收录」；若有活跃分享「已分享给 2 人 · 1 个链接 · 管理」→ `/shares?person=` | 已有 `profile-modes`、`timeline` 等；分享面板见下 | 分享按钮在编辑模式隐藏 |
| 分享面板（`share-sheet.tsx`，新） | 桌面 `dialog`（宽 560），手机 `sheet` 从底部。两步 + 预览：① 字段：分组复选（基本 / 标签 / 联系方式逐 key / 摘要 / 印象（勾选弹确认）/ 时间线（全部 / 按类型）/ 关系远近）；右侧（手机为下方）实时「对方将看到」预览卡；② 对象：Tab「站内用户」（输入 @username 或邮箱 → 回车精确匹配 → 变成 chip）/「链接」（有效期 1/7/30 天、访问次数、口令、开关「显示我的名字」）；附言（140 字）。提交 → 结果态：站内「已发送给 @b」；链接显示一次性 URL + 复制 + 「再生成一个链接」 | ui/新增 `dialog`、`sheet`、`checkbox`、`switch`、`tabs`、`badge`、`tooltip`、`alert-dialog`（印象确认） | 没有 circle 标签的人做圈子分享不可用；预览字段为空时提示「至少保留姓名」 |
| 圈子分享入口 | `/tags` 的圈子行与 `/map` 扇区弹层增加「分享这个圈子」→ 同一面板，预览变为「N 张卡片」 | 已有 `tags-manager`、`map/person-popover` | 圈子为空不可分享 |
| `/shared`（新） | 列表按状态 Tab：待处理 / 已收录 / 已忽略 / 已撤销；每项：分享者头像与 @username、时间、附言、卡片缩略（姓名 + 标签 + 所在地）、按钮「查看并收录」（跳 inbox 条目）/「忽略」 | 已有 `empty-state`、`tag-chip`、`tier-badge`；ui/新增 `tabs`、`avatar` | 空态「还没有人分享给你。分享是别人在自己库里点「分享」发给你的只读卡片，收录后就是你自己的记录」 |
| `/shares`（新） | 我发出的：每条显示对象（@b 已收录 / @c 待处理 / 链接 3/10 次 · 5 天后过期）、字段摘要（「姓名 · 所在地 · 标签 · 微信」）、操作「刷新快照」「撤销」「增加链接」；`?person=` 过滤 | 同上 + `alert-dialog`（撤销确认，文案含「已收录的副本不会撤回」） | 空态「还没有分享。到某个人的卡片上点「分享」」 |
| 收件箱分享条目（`inbox-pending-list.tsx` 改） | 条目头部：徽标「分享」+「@a · 2 小时前」+ 一句话 raw_text；展开：上半只读 `shared-card.tsx`（与访客页同一组件），下半 `DraftCard` 预填；重名提示沿用 DraftCard 的候选区；缺失标签显示为虚线 chip「+ 新建」；按钮改文案「收录到我的人脉」「忽略」；圈子分享折叠为一组，组头有「全部收录」 | 已有 `draft-card`、`inbox-pending-list`；新 `shared-card` | 分享已撤销 → 条目灰显「分享已撤销」，不可展开 |
| `/settings`（改） | 顶部用户区（头像、名字、@username、邮箱）；分组列表：**库**（收件箱 · 圈子和标签 · 收到的分享 · 我发出的分享）/ **账号**（账号资料 · 安全 · 登录设备 · API 令牌 · 隐私与模型）/ **管理**（仅 admin：用户 · 邀请 · 审计 · 实例设置）/ 退出登录 | 现有列表样式复用；ui/新增 `avatar`、`separator` | — |
| `/settings/account` | 表单：名字、用户名（改名提示「分享对象通过用户名找到你」）、邮箱（改邮箱需当前密码；有 SMTP 时需验证新邮箱）；危险区：导出我的数据、注销账号（需密码 / Passkey） | `alert-dialog`、`field` | — |
| `/settings/security` | 卡片 1 密码：修改（当前 + 新 ×2），说明「修改后其它设备退出」；卡片 2 Passkey：列表（名字、创建时间、最近使用、删除）+「添加 Passkey」（起名 → 浏览器弹窗）；卡片 3 两步验证：关闭态「启用」→ 向导（密码 → 二维码 + 手动密钥 → 输入验证码 → 备份码展示 + 下载）；开启态「查看备份码（需密码）」「重新生成」「关闭」；卡片 4 登录设备：显示数量 + 链接到 `/settings/sessions` | ui/新增 `dialog`、`input-otp`、`badge`、`skeleton`；Better Auth client（Passkey、2FA） | 非安全上下文（http 非 localhost）时 Passkey 卡片禁用并说明原因 |
| `/settings/sessions` | 表格 / 列表：设备（UA 解析成「iPhone · Safari」）、IP、创建、最近活跃、「当前设备」徽标、撤销按钮；底部「注销其它所有设备」 | ui/新增 `table`（桌面）、列表（手机）、`alert-dialog` | — |
| `/settings/tokens` | 顶部横幅（存在 legacy 令牌时）；列表：名字、`tcp_ab12cd34…`、scope chips、过期、最近使用、撤销；「新建令牌」dialog：名字、预设单选（快捷指令 / 只读 / 完整读写 / 自定义勾选）、有效期；创建成功态：明文 + 复制 + 「配置快捷指令 →」+「关闭后不再显示」 | ui/新增 `dialog`、`checkbox`、`badge`、`alert`、`tooltip`；可用 `sonner` 做复制成功提示 | 达 20 个上限禁用新建 |
| `/settings/privacy` | 开关：使用模型抽取与搜索（关闭后的后果说明）、发送前脱敏联系方式（默认开）、允许图片识别、有人分享给我时发邮件（无 SMTP 禁用）；用量：今日抽取 12/200、图片 1/30、向量 40/500 | ui/新增 `switch`、`progress`（可选） | — |
| `/admin/users` | 表格：用户名、邮箱、角色、状态、创建、最近登录、2FA、操作菜单（停用 / 恢复、设为管理员 / 取消、撤销会话与令牌、生成重置链接、重置 2FA）；**没有**任何人脉计数列 | ui/新增 `table`、`dropdown-menu`、`alert-dialog`、`dialog`（重置链接一次性展示） | 不能操作自己；最后一个 admin 不可降级 |
| `/admin/invites` | 列表 + 「新建邀请」（邮箱可选、角色、有效期）；创建后展示链接一次；可撤销 | 同上 | — |
| `/admin/audit` | 过滤（类型、用户、时间）、分页列表；内容类事件只显示类型 | `table` | — |
| `/admin/settings` | 开放注册开关、配额默认值、实例名 | `switch`、`input` | 需要确认框 |

#### 需要新增的 `src/components/ui/` 清单（去重）

`alert`、`alert-dialog`、`avatar`、`badge`、`checkbox`、`dialog`、`dropdown-menu`、`field`（或 `label`）、`input-otp`、`progress`（可选）、`separator`、`sheet`、`skeleton`、`sonner`（可选）、`switch`、`table`、`tabs`、`tooltip`。继续沿用已有的 `native-select`（不引 `select`）、`empty-state`、`tag-chip`、`tier-badge`。

新增业务组件：`share-sheet.tsx`、`shared-card.tsx`、`share-list.tsx`、`user-menu.tsx`、`login-form.tsx`、`passkey-button.tsx`、`totp-setup.tsx`、`token-create-dialog.tsx`、`session-list.tsx`、`admin/user-table.tsx`、`admin/invite-dialog.tsx`、`source-line.tsx`（fork 来源行）。

### 10.5 关键流程

#### 首次启动建管理员

```mermaid
flowchart TD
  A["打开任意页面"] --> B{"有会话 cookie ?"}
  B -- 否 --> C["/login"]
  C --> D{"users 表为空 ?"}
  D -- 是 --> E["显示「尚未初始化」→ /setup"]
  E --> F["填写管理员资料"]
  F --> G["Server Action：一个事务"]
  G --> G1["auth.api.signUpEmail role=admin"]
  G1 --> G2["无主数据 owner_id = admin"]
  G2 --> G3{"API_TOKEN 已设置 ?"}
  G3 -- 是 --> G4["插入 legacy PAT 90 天"]
  G3 -- 否 --> G5["跳过"]
  G4 --> H["写审计 setup_completed"]
  G5 --> H
  H --> I["nextCookies 写会话 → redirect 首页"]
  D -- 否 --> J["正常登录"]
```

#### 邀请注册

```mermaid
sequenceDiagram
  participant Adm as 管理员
  participant UI as /admin/invites
  participant S as Server Action
  participant DB as Postgres
  participant N as 新用户
  participant BA as Better Auth
  Adm->>UI: 新建邀请（邮箱可选、7 天）
  UI->>S: createInvite
  S->>DB: insert invites(code_hash)
  S-->>UI: 一次性链接 /register?invite=…
  Adm->>N: 微信发送链接
  N->>S: 打开 /register，提交用户名/密码
  S->>DB: 校验 code_hash 未用未过期、邮箱匹配
  S->>BA: auth.api.signUpEmail(body+inviteCode)
  BA->>BA: hooks.before 再校验邀请码
  BA->>DB: insert users / accounts / sessions
  BA->>DB: databaseHooks: invites.used_by/used_at
  S-->>N: Set-Cookie 会话，redirect /
```

#### 登录（含可选二步验证）

```mermaid
sequenceDiagram
  participant U as 用户
  participant L as /login (Server Action)
  participant BA as Better Auth
  participant DB as Postgres
  U->>L: 邮箱/用户名 + 密码
  L->>BA: auth.api.signInEmail / signInUsername
  BA->>DB: 查 users、校验 scrypt
  alt 密码错误
    BA-->>L: 401
    L->>DB: failed_login_count+1（10 次锁 15 分钟）
    L-->>U: 「邮箱、用户名或密码不正确」
  else 开启 2FA
    BA-->>L: twoFactorRedirect
    L-->>U: redirect /two-factor
    U->>L: TOTP 或备份码
    L->>BA: verifyTotp / verifyBackupCode
    BA->>DB: insert sessions
    BA-->>U: Set-Cookie，redirect next
  else 直接成功
    BA->>DB: insert sessions（ip、ua）
    BA-->>U: Set-Cookie，redirect next
  end
  L->>DB: audit auth.login.*
```

#### Passkey 注册

```mermaid
sequenceDiagram
  participant U as 用户
  participant P as /settings/security (client)
  participant BA as /api/auth/passkey/*
  participant Br as 浏览器 WebAuthn
  U->>P: 「添加 Passkey」+ 起名
  P->>BA: generate-register-options
  BA-->>P: PublicKeyCredentialCreationOptions（rpID = 域名）
  P->>Br: navigator.credentials.create
  Br-->>P: attestation
  P->>BA: verify-registration
  BA-->>P: passkeys 新行
  P-->>U: 列表出现新 Passkey；审计 auth.passkey.added
```

#### 创建 PAT 并配置快捷指令

```mermaid
sequenceDiagram
  participant U as 用户
  participant T as /settings/tokens
  participant API as POST /api/v1/tokens
  participant DB as Postgres
  participant SC as iPhone 快捷指令
  participant IN as POST /api/v1/inbox
  U->>T: 新建，预设「快捷指令」= inbox:write，1 年
  T->>API: { name, scopes, expires_in_days }
  API->>DB: insert api_tokens(token_hash, prefix)
  API-->>T: { token: "tcp_…" } 仅一次
  U->>SC: 头部 Authorization: Bearer tcp_…
  SC->>IN: { raw_text, source: "shortcut" }
  IN->>DB: 查 token_hash → ctx(user, scopes)
  IN->>DB: withTenant: insert inbox(owner_id)
  IN-->>SC: 草稿摘要
```

#### 分享给站内用户 → 对方收录

```mermaid
sequenceDiagram
  participant A as 用户 A
  participant SS as 分享面板
  participant API as /api/v1/shares
  participant DB as Postgres
  participant B as 用户 B
  participant IB as 收件箱
  A->>SS: 勾字段、填 @b、附言
  SS->>API: POST /shares
  API->>DB: withTenant(A): insert shares, share_items(snapshot)
  API->>DB: 精确匹配 @b → insert share_recipients(pending)
  API->>DB: 以 B 为 owner insert inbox(source=share, parsed=Draft)
  API-->>SS: 已发送
  B->>IB: 首页待处理 / /shared 看到「分享」条目
  IB->>DB: GET /inbox/:id → 快照 + 候选（重名）
  B->>IB: 收录到我的人脉（可改字段、补标签）
  IB->>DB: POST /inbox/:id/apply → withTenant(B): insert people(source)…
  DB-->>IB: share_recipients=accepted；embedding(B)
  IB-->>B: 跳 /people/[newId]，来源行显示 @a
```

#### 链接分享 → 访客浏览 → 注册后收录

```mermaid
sequenceDiagram
  participant A as 用户 A
  participant API as /api/v1
  participant V as 访客 V
  participant S as 访客页 /s/token
  participant L as /login 或 /register
  A->>API: POST /shares { link: { 7 天, 口令 } }
  API-->>A: https://host/s/token（仅一次）
  A->>V: 微信发送
  V->>S: 打开
  S->>API: GET /s/:token → 401 share_passcode_required
  V->>S: 输入口令
  S->>API: POST /s/:token/unlock → 15 分钟 cookie
  S->>API: GET /s/:token → 快照（view_count+1）
  V->>S: 收录到我的人脉
  S->>L: /login?next=/s/token（无账号则用邀请码注册）
  L-->>S: 登录成功，回到链接页
  S->>API: POST /s/:token/collect → recipient(via=link)+inbox
  S-->>V: redirect 到收件箱对应条目，之后同站内收录流程
```

#### 撤销分享

```mermaid
flowchart TD
  A["/shares 点「撤销」"] --> B{"有已收录的副本 ?"}
  B -- 是 --> C["确认框：「已被 2 人收录，副本不会撤回」"]
  B -- 否 --> D["确认框：普通"]
  C --> E["POST /shares/:id/revoke"]
  D --> E
  E --> F["shares.status = revoked"]
  F --> G["share_items.snapshot = null, purged_at"]
  G --> H["share_links.revoked_at"]
  H --> I["接收方 pending inbox → discarded，标「分享已撤销」"]
  I --> J["audit share.revoked"]
  J --> K["访客页 410；/shared 条目灰显"]
```

### 10.6 线框图

尺寸示意：手机 390 宽为主，桌面是放大版（原设计 §11「移动端优先」）。

#### 登录页 `/login`

```
┌──────────────────────────────────────┐
│                                      │
│            (◎)  朋友圈               │
│        一句话记人，一句话找人         │
│                                      │
│  ┌────────────────────────────────┐  │
│  │ 邮箱或用户名                    │  │
│  │ ┌────────────────────────────┐ │  │
│  │ │ me@example.com             │ │  │
│  │ └────────────────────────────┘ │  │
│  │ 密码                  忘记密码？│  │
│  │ ┌────────────────────────────┐ │  │
│  │ │ ••••••••••••           [显示]  │ │  │
│  │ └────────────────────────────┘ │  │
│  │ ┌────────────────────────────┐ │  │
│  │ │           登  录            │ │  │
│  │ └────────────────────────────┘ │  │
│  │ ─────────── 或 ───────────── │  │
│  │ ┌────────────────────────────┐ │  │
│  │ │  [key] 使用 Passkey 登录       │ │  │
│  │ └────────────────────────────┘ │  │
│  │ ┌─────────────┐┌─────────────┐ │  │
│  │ │  GitHub     ││  Google     │ │  │   ← 仅配置了 OAuth 时显示
│  │ └─────────────┘└─────────────┘ │  │
│  └────────────────────────────────┘  │
│                                      │
│       有邀请码？注册一个账号 →        │
│                                      │
└──────────────────────────────────────┘

错误态（卡片顶部）： (!) 邮箱、用户名或密码不正确
未初始化态（替换卡片）： 这个实例还没有任何账号。 [ 创建管理员账号 → ]
```

#### 应用壳 + 用户菜单

```
桌面顶栏（md 及以上）
┌──────────────────────────────────────────────────────────────────────────┐
│ (◎) 朋友圈   首页   人脉   地图   分享ⓘ2   设置ⓘ1              (A) ▾   │
└──────────────────────────────────────────────────────────────────────────┘
                                                             ┌──────────────┐
                                                             │ 阿明          │
                                                             │ @aming        │
                                                             ├──────────────┤
                                                             │ [cfg] 设置        │
                                                             │ [shield] 安全        │
                                                             │ [key] API 令牌    │
                                                             │ [users] 管理后台    │ ← admin
                                                             ├──────────────┤
                                                             │ ⎋ 退出登录    │
                                                             └──────────────┘

手机底栏
┌──────────────────────────────────────┐
│                                      │
│           （页面内容）                 │
│                                      │
├──────────────────────────────────────┤
│   [home]        [users]        ◎        ⓘ3    │
│  首页      人脉      地图      我     │
└──────────────────────────────────────┘

「我」页（/settings，手机）
┌──────────────────────────────────────┐
│ (A) 阿明                              │
│     @aming · me@example.com          │
├──────────────────────────────────────┤
│ 库                                   │
│  [inbox] 收件箱                  3 条待处理 ›│
│  [tag] 圈子和标签                        ›│
│  [in] 收到的分享              2 条待处理 ›│
│  [out] 我发出的分享                      ›│
├──────────────────────────────────────┤
│ 账号                                 │
│  [user] 账号资料                          ›│
│  [shield] 安全（密码 · Passkey · 两步验证）   ›│
│  [phone] 登录设备                     3 台 ›│
│  [key] API 令牌                     2 个 ›│
│  [lock] 隐私与模型                        ›│
├──────────────────────────────────────┤
│ 管理（仅管理员）                       │
│  [users] 用户    [mail] 邀请    [log] 审计   [cfg] 实例 ›│
├──────────────────────────────────────┤
│  ⎋ 退出登录                           │
└──────────────────────────────────────┘
```

#### 人物详情页的分享按钮与分享面板

```
/people/[id]（桌面，展示模式）
┌──────────────────────────────────────────────────────────────────┐
│ ‹ 人脉列表                                                        │
│                                                                  │
│ 小王  [Interacted contacts]                [ 分享 ] [ 编辑 ] [ 删 ] │
│ 男 · [pin] 深圳                                                      │
│ 羽毛球教练，在深圳带成人班                                          │
│ ⤷ 已分享给 1 人 · 1 个链接 · 管理                                   │ ← 有活跃分享时
│ ⤷ 来自 @lao-li 的分享 · 2026-10-20 收录                            │ ← fork 时
│ …（印象 / 联系方式 / 圈子和标签 / 时间线，同现状）                     │
└──────────────────────────────────────────────────────────────────┘

分享面板（桌面 dialog；手机为底部 sheet，预览移到字段下方）
┌──────────────────────────────────────────────────────────────────┐
│ 分享「小王」                                                  ✕   │
├───────────────────────────────┬──────────────────────────────────┤
│ 1 分享哪些内容                 │ 对方将看到                        │
│                               │ ┌──────────────────────────────┐ │
│ 基本                          │ │ 小王                          │ │
│  [x] 姓名（必选）              │ │ 男 · [pin] 深圳                   │ │
│  [x] 性别   [x] 所在地         │ │ [tag] 球友  羽毛球                │ │
│  [x] 认识方式  [x] 认识日期     │ │ 认识：球馆认识 · 2026-09       │ │
│ 标签                          │ │ 微信  wx123                    │ │
│  (•) 全部  ( ) 仅能力  ( ) 不分享│ │                               │ │
│ 联系方式（默认不分享）          │ │ 由 @aming 分享                 │ │
│  [x] 微信   [ ] 电话   [ ] 邮箱 │ └──────────────────────────────┘ │
│ 更多                          │                                  │
│  [ ] 摘要                     │ (!) 印象是你的私密判断，分享后对方会   │
│  [ ] 我的印象  (!)              │   看到原文。确定？（勾选时弹出）     │
│  [ ] 时间线  ( ) 全部 ( ) 仅认识/帮助│                              │
│  [ ] 关系远近                 │                                  │
│  [x] 显示我的名字              │                                  │
├───────────────────────────────┴──────────────────────────────────┤
│ 2 分享给谁        ┌─ 站内用户 ─┐┌── 链接 ──┐                      │
│ ┌──────────────────────────────────────────────┐                 │
│ │ @lao-li ✕   输入 @用户名 或邮箱，回车添加      │                 │
│ └──────────────────────────────────────────────┘                 │
│ 附言（可选）                                                      │
│ ┌──────────────────────────────────────────────┐                 │
│ │ 上次说的教练，人很好                            │                 │
│ └──────────────────────────────────────────────┘                 │
│                                          [ 取消 ]  [ 发送给 1 人 ]  │
└──────────────────────────────────────────────────────────────────┘

「链接」Tab 的下半部分
│ 有效期  (•) 7 天  ( ) 1 天  ( ) 30 天      访问次数上限 [ 10 ]（可空） │
│ 口令（可选）  ┌────────────┐                                        │
│ 结果态：  https://host/s/3kJ…Qw   [ 复制 ]   仅显示一次 · 5 天后过期   │
```

#### 收件箱中的「分享」条目

```
首页 › 待处理 / 或 /inbox
┌──────────────────────────────────────────────────────────────┐
│ [分享] @lao-li · 2 小时前                                    ˅ │
│ @lao-li 分享了「小王」：羽毛球教练 · 深圳 · 球友。附言：上次说的… │
├──────────────────────────────────────────────────────────────┤
│ ┌─ 对方分享的卡片（只读）──────────────────────────────────┐ │
│ │ 小王   男 · [pin] 深圳   [tag] 球友 羽毛球                        │ │
│ │ 认识：球馆认识 · 2026-09        微信 wx123                 │ │
│ └──────────────────────────────────────────────────────────┘ │
│                                                              │
│ 收录为我的记录                        ( 新增 ) ( 更新已有 )    │
│ (!) 库里可能已有这个人： [ 小王 · Friends · 深圳 ]  ← 点选合并    │
│ 姓名 *  [ 小王 ]      关系远近 [ 未定 ▾ ]   所在地 [ 深圳 ]      │
│ 怎么认识的 [ 经 @lao-li 引荐 ]   （原：球馆认识）                │
│ 圈子 [ 球友 ▾ ]   标签 [ 羽毛球 ] [ + 新建「成人班」]            │ ← 词表里没有的标签
│ 联系方式  微信 [ wx123 ]                                       │
│ 我的印象（私密） [                      ]                       │
│                                                              │
│ [ 忽略 ]                                 [ 收录到我的人脉 ]     │
└──────────────────────────────────────────────────────────────┘

圈子分享（折叠组）
┌──────────────────────────────────────────────────────────────┐
│ [分享] @lao-li 分享了圈子「供应链」· 9 人        [ 全部收录 ] ˅ │
│   ├ 老陈  · 杭州 · 供应链 · 合同            [ 收录 ] [ 忽略 ]   │
│   ├ 周工  · 苏州 · 采购                     [ 收录 ] [ 忽略 ]   │
│   └ …                                                         │
└──────────────────────────────────────────────────────────────┘

已撤销态
┌──────────────────────────────────────────────────────────────┐
│ [分享] @lao-li · 昨天                 这条分享已被对方撤销      │
└──────────────────────────────────────────────────────────────┘
```

#### `/s/[token]` 访客卡片页

```
┌──────────────────────────────────────┐
│ (◎) 朋友圈                            │
│                                      │
│ @aming 分享了一张人脉卡片              │
│ 「上次说的教练，人很好」               │
│                                      │
│ ┌──────────────────────────────────┐ │
│ │ 小王                              │ │
│ │ 男 · [pin] 深圳                       │ │
│ │ [tag] 球友   羽毛球                    │ │
│ │ 认识方式  球馆认识 · 2026-09        │ │
│ │ 微信      wx123                    │ │
│ └──────────────────────────────────┘ │
│                                      │
│ ┌──────────────────────────────────┐ │
│ │        收录到我的人脉              │ │
│ └──────────────────────────────────┘ │
│ 需要登录。没有账号？向管理员要一个邀请。│
│                                      │
│ 这是什么？                            │
│ 分享者只分享了他勾选的字段。收录后这条  │
│ 记录属于你，之后两边各自修改互不影响。  │
│                                      │
│ 有效期至 2026-10-27 · 剩余 7 次        │
└──────────────────────────────────────┘

口令态                               失效态
┌──────────────────────────────┐    ┌──────────────────────────────┐
│ [lock] 这张卡片需要口令           │    │ 这条分享已失效                │
│ ┌──────────────────────────┐ │    │ 链接可能已撤销、过期或超过访问  │
│ │ ••••                     │ │    │ 次数。请联系分享者。          │
│ └──────────────────────────┘ │    │                              │
│ [ 查看 ]                     │    │ [ 回到首页 ]                  │
└──────────────────────────────┘    └──────────────────────────────┘
```

#### 设置 › 安全 `/settings/security`

```
┌──────────────────────────────────────────────────────────────┐
│ ‹ 我    安全                                                  │
│                                                              │
│ 密码                                                         │
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ 上次修改 2026-09-01                       [ 修改密码 ]    │ │
│ │ 修改后，其它设备会退出登录。                               │ │
│ └──────────────────────────────────────────────────────────┘ │
│                                                              │
│ Passkey                                        [ + 添加 ]    │
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ [key] iPhone 15      创建 10-01 · 最近使用 今天        [删除] │ │
│ │ [key] MacBook Touch ID  创建 10-02 · 最近使用 3 天前    [删除] │ │
│ └──────────────────────────────────────────────────────────┘ │
│ ⓘ Passkey 需要 HTTPS 域名；局域网 IP 下不可用。                │
│                                                              │
│ 两步验证（TOTP）                                 ● 已开启     │
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ 备份码剩余 8 个   [ 查看备份码 ] [ 重新生成 ] [ 关闭 ]      │ │
│ └──────────────────────────────────────────────────────────┘ │
│   未开启态：  ○ 未开启   [ 启用 ]                              │
│   启用向导：  ① 输入密码 → ② 扫描二维码 / 复制密钥 → ③ 输入 6 位  │
│              验证码 → ④ 保存 10 个备份码 [下载 .txt]            │
│                                                              │
│ 登录设备                                            3 台  ›  │
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ [phone] iPhone · Safari   100.64.0.3   当前设备                 │ │
│ │ [laptop] Mac · Chrome      100.64.0.2   2 小时前         [撤销]  │ │
│ │ [laptop] Windows · Edge    203.0.113.9  12 天前          [撤销]  │ │
│ │                                   [ 注销其它所有设备 ]      │ │
│ └──────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

#### 设置 › API 令牌 `/settings/tokens`

```
┌──────────────────────────────────────────────────────────────┐
│ ‹ 我    API 令牌                               [ + 新建令牌 ] │
│                                                              │
│ (!) 「旧 API_TOKEN（自动迁移）」将于 2027-01-17 过期。建议新建一个 │
│   只有「记一句」权限的令牌替换快捷指令里的旧值。    [ 了解详情 ] │
│                                                              │
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ iPhone 快捷指令        tcp_ab12cd34…                      │ │
│ │ [inbox:write]          最近使用 今天 · 2027-10-19 过期 [撤销]│ │
│ ├──────────────────────────────────────────────────────────┤ │
│ │ 旧 API_TOKEN（自动迁移） tcp_legacy…   [全部权限] legacy    │ │
│ │                        最近使用 昨天 · 2027-01-17 过期 [撤销]│ │
│ └──────────────────────────────────────────────────────────┘ │
│ 令牌只在创建时显示一次；丢了就撤销重建。                         │
└──────────────────────────────────────────────────────────────┘

新建令牌 dialog
┌──────────────────────────────────────┐
│ 新建令牌                          ✕  │
│ 名字  [ iPhone 快捷指令        ]      │
│ 权限  (•) 快捷指令（只能记一句）        │
│       ( ) 只读（people/search/map）    │
│       ( ) 完整读写                    │
│       ( ) 自定义 …                    │
│ 有效期 ( ) 90 天 (•) 1 年 ( ) 永不     │
│                     [ 取消 ] [ 创建 ] │
└──────────────────────────────────────┘
创建成功
┌──────────────────────────────────────┐
│ 已创建「iPhone 快捷指令」             │
│ ┌──────────────────────────────────┐ │
│ │ tcp_ab12cd34ef56…（完整）  [复制] │ │
│ └──────────────────────────────────┘ │
│ 关闭后不会再显示。                     │
│ 下一步：配置快捷指令 →                 │
│                              [ 完成 ] │
└──────────────────────────────────────┘
```

### 10.7 移动端 / PWA 注意点

| 议题 | 现状 | 决定 |
| --- | --- | --- |
| 登录态保持 | `manifest.ts` `display: standalone`；无登录 | 会话 cookie 由服务端设置且 `HttpOnly`，不受 iOS ITP「7 天脚本可写存储」清理影响；30 天滑动足够。独立模式下首次打开需登录一次，之后与浏览器同域名的 cookie 不共享（iOS 独立 PWA 有自己的存储），所以 Safari 里登录 ≠ 主屏幕图标里登录，在 `/login` 顶部对 `display-mode: standalone` 的访问显示一句提示 |
| Standalone 下的 OAuth 回跳 | — | iOS 独立 PWA 打开跨域 OAuth 页面会进入内嵌浏览器或跳到 Safari，回跳后 cookie 不一定落回 PWA（行为随 iOS 版本变化，待确认）。因此 **PWA 内不推荐 OAuth**：登录页在 standalone 模式隐藏 OAuth 按钮，只留密码与 Passkey |
| Passkey | — | iOS 16+ Safari 支持，且在独立 PWA 中可用；要求 HTTPS 域名（rpID）。局域网 IP / `http://` 不行；开发用 `localhost` 或 Tailscale HTTPS（`tailscale cert`）。`BETTER_AUTH_URL` 决定 rpID，域名一旦变更旧 Passkey 失效——文档里写清楚 |
| 快捷指令 | 用 `API_TOKEN` | **只用 PAT**，不碰 cookie；`source: "shortcut"` 不变；401 时快捷指令显示 `error.message`（已有行为），我们保证 `token_expired` / `token_revoked` 文案可读 |
| 分享面板 | — | 手机用底部 sheet，字段区可滚动，预览折叠在「预览」按钮后；系统分享（Web Share API）用于把 `/s/…` 链接发到微信：`navigator.share({ url })`，不可用时回退复制 |
| 一次性信息 | — | PAT 明文、分享链接、备份码在手机上都提供「复制」与（备份码）「下载」，不要依赖用户截图 |
| 访客页 | — | 不需要登录即可渲染；viewport 与现有一致；`noindex` |
| Server Action 版本漂移 | — | 旧 PWA 壳调用已轮换的 action id 会报 `Failed to find Server Action`；全局 `error.tsx` 捕获此错误并提示「应用已更新，点击刷新」（Next 文档建议） |

---

## 11. 实施分期与验收标准

三期顺序依赖：A 没完成不能做 B（分享依赖租户与会话），C 的各项彼此独立可穿插。每期结束都要能部署、能回滚。

### 11.1 A 期：认证 + 租户化 + PAT + 数据迁移（不含分享）

范围：§2、§3（不含 Passkey、2FA）、§4、§5、§6.1–6.5、§6.7、§8.1–8.5（不含 shares）、§9（不含 shares / admin 大部分）、§10 中登录前页面、应用壳、`/settings`、`/settings/account|sessions|tokens|privacy`、`/admin/users|invites`（最小版：建邀请、列用户、停用）。

| # | 验收条目 | 验证方式 |
| --- | --- | --- |
| A1 | 全新数据库启动后访问任意页面被引到 `/setup`；创建管理员后 `/setup` 返回 404 | 手工 + Playwright（可选） |
| A2 | 带旧数据的库完成 `/setup` 后，原有全部 people / tags / events / inbox / embeddings 归管理员；计数与迁移前一致 | 迁移脚本自检输出 + SQL 对比 |
| A3 | `.env` 有 `API_TOKEN` 时，旧快捷指令（`Bearer <API_TOKEN>`）在 `/setup` 后仍能 `POST /api/v1/inbox`，记录归管理员；`/settings/tokens` 显示 legacy 横幅 | curl 回归（`docs/api.md` 示例） |
| A4 | 未登录访问 `(app)` 下任何页面 → `/login?next=`；登录后回到 `next` | Playwright |
| A5 | 用户 A 用浏览器 / PAT 访问用户 B 的 `/people/:id`、`/api/v1/people/:id`、`/api/v1/people/:id/events`、`/api/v1/tags/:id`、`/api/v1/inbox/:id` 一律 404；`PATCH /people/:id` 带 B 的 `primary_circle_tag_id` 返回 400 `invalid_primary_circle`；`POST /inbox/:id/apply` 带 B 的 `target_person_id` 返回 404 | 集成测试（两用户夹具） |
| A6 | 两个用户可以各自创建同名同类型标签；`GET /tags` 只看到自己的 | 集成测试 |
| A7 | 搜索、地图、提醒、人员索引（LLM prompt）只包含当前用户的数据；mock provider 下断言 prompt 内容 | 单测（`extract` 的 index 入参）+ 集成 |
| A8 | RLS：以 `tc_app` 连接且 `app.user_id` = A 时，`select count(*) from people` 等于 A 的数量；未设置时为 0；以 B 的 id 直接 `insert into people(owner_id = A)` 被策略拒绝 | RLS 集成测试（§11.4） |
| A9 | 应用用超级用户或 BYPASSRLS 角色启动时，生产模式拒绝启动并说明原因 | 单测（自检函数）+ 手工 |
| A10 | 邀请：无邀请码不能注册；过期 / 已用邀请码不能注册；直接 POST `/api/auth/sign-up/email` 绕过页面也被拒绝；`AUTH_OPEN_SIGNUP=true` 时放开 | 集成测试 |
| A11 | 密码错误 10 次后该账号 15 分钟内密码登录被拒；同 IP 60 秒内第 11 次登录请求 429 | 集成测试（可调小阈值） |
| A12 | 改密后其它会话失效；`/settings/sessions` 能列出并撤销指定设备 | 集成测试 + 手工 |
| A13 | 会话超过 `SESSION_ABSOLUTE_DAYS` 即使活跃也要重新登录 | 单测（时钟注入） |
| A14 | PAT：只在创建时返回明文；库里只有哈希；撤销 / 过期立即 401 并带 `token_revoked` / `token_expired`；缺 scope 403 `insufficient_scope`；PAT 访问 `/api/v1/tokens` 403 | 单测（格式、哈希、scope 判定）+ 集成 |
| A15 | cookie 会话的 `POST /api/v1/people` 若 `Origin` 为其它站点 → 403 `csrf_rejected`；PAT 同请求通过 | 集成测试 |
| A16 | 页面不再下发 `tc_token`；带旧 cookie 的请求收到删除指令 | 集成测试（检查响应头） |
| A17 | 隐私：关闭 `llm_enabled` 后 `POST /inbox` 返回 fallback 草稿且不调用 provider；`redact_contacts` 开启时 mock provider 收到的文本不含手机号 / 微信号，返回的草稿 `contacts` 还原正确；超配额返回 429 `quota_exceeded` 且仍可手工入库 | 单测（`redact.ts`、配额计算）+ 集成 |
| A18 | 审计：登录成功 / 失败、改密、建令牌、撤销令牌、建邀请、停用用户各产生一条记录，`meta` 不含内容字段 | 集成测试 |
| A19 | 现有 9 个 Vitest 测试文件继续通过；`pnpm typecheck`、`pnpm lint` 通过；ESLint 规则阻止 `src/lib/services/**` 直接 import `@/db` | CI |
| A20 | `README.md`、`docs/api.md`、`shortcuts/README.md`、`.env.example` 更新到位 | 评审 |

### 11.2 B 期：分享与收录

范围：§7、§8.2 中 shares 四表、§9 中 shares / shared / s / collect、§10 中分享面板、`/shared`、`/shares`、收件箱分享条目、访客页、圈子分享入口。

| # | 验收条目 | 验证方式 |
| --- | --- | --- |
| B1 | 默认字段集：不勾选任何额外项时，快照只含姓名、性别、所在地、标签、认识方式、认识日期、坐标；不含 `contacts`、`summary`、`impression`、`events`、`tier` | 单测 `buildShareSnapshot` 覆盖全部字段开关 |
| B2 | 勾选印象必须经确认；快照中 `contacts` 只含勾选的 key | 单测 + Playwright |
| B3 | 分享给 `@b`：B 的收件箱出现 `source = 'share'` 条目，`parsed` 为合法 `Draft`（zod 校验），`raw_text` 含分享者与姓名；A 的库没有任何变化 | 集成测试 |
| B4 | B 收录后：B 库新增一条 `people`，`source.share_item_id` 正确，embedding 在 B 名下生成；A 的记录无变化；`share_recipients.status = accepted`；A 在 `/shares` 看到「@b 已收录」 | 集成测试 |
| B5 | 重名：B 库里已有「小王」时，条目展开显示候选；选择「更新已有」合并后不产生新记录 | 集成测试 + Playwright |
| B6 | 缺失标签：快照标签不在 B 词表时显示「新建」chip，收录后 B 词表新增该标签且挂在新记录上；普通（非分享）条目仍然拒绝未知标签 | 集成测试 |
| B7 | 圈子分享：圈子 9 人生成 9 条 `share_items` 与 9 条 inbox；「全部收录」一次完成；后加入圈子的人不在内；「刷新快照」后出现 | 集成测试 |
| B8 | 链接：未登录可读；口令错 → 401 `share_passcode_required`，正确后 15 分钟内免口令；超过 `max_views` → 410；过期 → 410；撤销 → 410；每 IP 每分钟超 30 次 → 429 | 集成测试（时钟注入） |
| B9 | 链接访客登录后 `collect` 生成 `via = 'link'` 的 recipient 与 inbox 条目；同一用户对同一分享重复 collect 不重复生成 | 集成测试 |
| B10 | 撤销：快照置空、链接失效、B 的 pending 条目变 `discarded` 且显示「已撤销」；B 已收录的记录仍在；确认框文案含副本数 | 集成测试 + Playwright |
| B11 | RLS：B 作为 recipient 能 select 到 `share_items` 快照；C（无关用户）查同一行为 0；访客 token 哈希正确时能读、撤销后为 0 | RLS 集成测试 |
| B12 | 不能分享给自己、不能分享给停用用户、找不到用户时文案不泄露其它信息 | 单测 + 集成 |
| B13 | 审计：created / refreshed / revoked / link.viewed / accepted / ignored 各一条 | 集成测试 |
| B14 | PAT 无法调用任何 `/shares*`、`/shared`、`/s/:token/collect` | 集成测试 |

### 11.3 C 期：Passkey、2FA、管理后台与审计完善、CSP 强制

| # | 验收条目 | 验证方式 |
| --- | --- | --- |
| C1 | 在 HTTPS 域名下添加 Passkey、用 Passkey 登录（含 conditional UI）、删除 Passkey；非安全上下文下卡片禁用并说明 | 手工（真机）+ Playwright 的虚拟认证器（CDP `WebAuthn.addVirtualAuthenticator`） |
| C2 | 启用 2FA 需密码；登录需验证码；备份码可用一次；信任设备 30 天；关闭 2FA 需密码；Passkey 登录跳过 2FA | 集成测试（`otpauth` 生成码） |
| C3 | 管理员：重置用户 2FA、生成重置链接（无 SMTP 展示一次、15 分钟有效、一次性）、角色升降、最后一个 admin 不可降级、不能停用自己 | 集成测试 |
| C4 | 有 SMTP 时：邀请邮件、重置邮件、分享通知邮件（用户开启后）发出；`SMTP_URL` 为空时所有流程仍可完成 | 集成测试（stub transport） |
| C5 | `/admin/audit` 过滤与分页；内容类事件对 admin 只显示类型；`pnpm db:prune-audit` 删除 180 天前记录 | 集成测试 |
| C6 | CSP 从 report-only 切到 nonce 强制后，所有页面（含地图 d3、图片上传、Passkey）无 CSP 报错 | Playwright 收集 `securitypolicyviolation` 事件 |
| C7 | 用户导出 zip 内容与数据库一致；注销账号后其分享消失、副本保留并显示「已注销用户」 | 集成测试 |
| C8 | 图片魔数校验、像素上限生效 | 单测（构造文件头） |

### 11.4 测试策略

| 层 | 工具 | 覆盖 |
| --- | --- | --- |
| 纯函数单测（现有 `vitest.config.mts`，`src/**/*.test.ts`） | Vitest 5 | `pat.ts`（生成 / 解析 / 哈希 / scope 判定）、`authorize.ts`、`invite.ts`（码校验）、`session-policy.ts`（绝对过期）、`redact.ts`、`quota.ts`、`shares/snapshot.ts`（字段开关 × 快照）、`shares/draft-from-snapshot.ts`、`shares/dedupe.ts`、`share-link.ts`（过期 / 次数 / 口令状态机）、`csrf.ts`（`Origin` / `Sec-Fetch-Site` 判定）、`image-magic.ts`、`audit-meta.ts`（白名单） |
| 服务层集成测试（新增 `src/**/*.int.test.ts`，单独 `vitest.int.config.mts`） | Vitest + 真实 Postgres（`docker compose` 起一个 `tokenconnection_test` 库，或 `@testcontainers/postgresql`，待确认选型） | 两用户夹具（A、B、admin）、每个 service 的跨租户 404、分享全流程、邀请 / 注册 / 登录（通过 `auth.api.*` 服务端调用，不起浏览器） |
| RLS 测试 | 同上，但用 `tc_app` 连接；辅助函数 `asTenant(userId, fn)` 与 `asLinkVisitor(tokenHash, fn)` | §11.1 A8、§11.2 B11；再加「每张启用 RLS 的表在未设置 setting 时 select 为 0 行」的参数化测试，防止新表漏策略 |
| 端到端 | Playwright（可选，C 期引入） | A4、B2、B5、B10、C1、C6 |
| 安全回归 | curl 脚本 `scripts/security-smoke.sh`（仓库内，非临时文件） | 旧 cookie 删除、CSRF 403、PAT scope 403、公开链接 410 / 429 |

---

## 12. 开放问题与默认假设

凡是本文替用户做了选择的地方，集中列在这里。每条给出默认值与替代项；开工前最好先拍板前 5 条。

| # | 问题 | 本文默认 | 替代项 |
| --- | --- | --- | --- |
| Q1 | 认证库 | Better Auth 1.7.x（M-02） | 自研（Oslo + Arctic + SimpleWebAuthn）：多 1500+ 行、安全评审自担；Auth.js：Credentials 路线等于自研 |
| Q2 | 是否上 RLS | 上，限内容表（M-08） | 不上，只靠 service 层 + 测试；或 C 期再上 |
| Q3 | 分享模型 | 快照 + fork（M-09） | 实时只读视图（owner 改动即时可见，但撤销 / 字段控制 / RLS 都更复杂） |
| Q4 | 撤销分享是否撤回已收录副本 | 不撤回（M-12） | 撤回（需要在接收方库里删数据，违背「收录后是你的记录」） |
| Q5 | 注册策略 | 首启建 admin → 邀请制，`AUTH_OPEN_SIGNUP` 可开（M-03） | 永远邀请制；或管理员直接创建账号并发临时密码 |
| Q6 | 用户名 | 启用 `username` 插件，分享按 `@username` 或邮箱精确匹配 | 只用邮箱（分享时暴露邮箱） |
| Q7 | 会话时长 | 空闲 30 天 / 绝对 180 天 | 更短（7 / 30）更安全，PWA 上要常登录 |
| Q8 | 密码哈希 | Better Auth 默认 scrypt（M-14） | argon2id（`@node-rs/argon2`，Docker 多架构需确认预编译包） |
| Q9 | PAT 实现 | 自建 `api_tokens`（M-06） | `@better-auth/api-key` 插件 |
| Q10 | `API_TOKEN` 兼容窗口 | 90 天 | 30 天；或不做自动迁移、上线即换令牌 |
| Q11 | 分享默认字段 | 姓名、性别、所在地、标签、认识方式、认识日期（M-11） | 更保守：只姓名 + 标签；或把摘要加入默认 |
| Q12 | 链接分享默认有效期 / 上限 | 7 天 / 最长 30 天 / 次数可选 / 口令可选 | 不做链接分享（只站内） |
| Q13 | 圈子分享的成员范围 | 创建时快照，后续手动刷新 | 实时成员（与 M-09 冲突） |
| Q14 | 分享到达如何展示 | 复用 inbox（M-10）+ `/shared` 页 | 独立「分享收件箱」，不混进 inbox |
| Q15 | 管理员能否看用户的人数统计 | 不能（M-15 连计数都不给） | 允许看计数（便于容量管理） |
| Q16 | LLM key 归属 | 实例级 key，每用户配额 | 每用户自带 key（加密存储，用自己的额度）——C 期之后考虑 |
| Q17 | 脱敏默认 | 开 | 关（抽取效果略好，但联系方式外发） |
| Q18 | OAuth | 可选，PWA 内隐藏 | 完全不做 |
| Q19 | 导航第四格 | 手机改名「我」 | 保留「设置」 |
| Q20 | 实验性 `authInterrupts` | 不用（M-18） | 启用，用 `unauthorized.tsx` 承载登录 UI |
| Q21 | 集成测试数据库 | docker compose 第二个库 | testcontainers |
| Q22 | 多实例部署 | 不考虑（单容器 + Caddy） | 需要时：`rateLimit.storage = "database"`、`NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`、会话无状态化 |

### 开工第一天要核实的「待确认」清单

1. Better Auth：`advanced.database.generateId` 是否支持 `"uuid"`；Drizzle adapter 的字段访问方式（TS 属性名 vs 列名）；`usePlural` 表名；`nextCookies()` 需放在插件末尾；`hooks.before` / `databaseHooks` 签名；two-factor 插件的 secret 加密方式；`BETTER_AUTH_TELEMETRY` 变量名；scrypt 默认参数；内建 rate limit 的默认规则与 `customRules` 写法；`revokeSessionsOnPasswordReset` 选项名。
2. `@better-auth/passkey@1.7.11` 与 `@simplewebauthn/* ^13` 在 Node 24 下的安装（本仓库 `@types/node@^24`）。
3. drizzle-orm 0.45 的 `pgPolicy` / `pgRole().existing()` / `.enableRLS()` 生成的 SQL 是否符合预期；`FORCE ROW LEVEL SECURITY` 用 `drizzle-kit generate --custom`。
4. pgvector 版本（`pgvector/pgvector:pg16` 镜像当前带的版本）是否 ≥ 0.8，决定能否用 `hnsw.iterative_scan`。
5. iOS 当前版本独立 PWA 中 OAuth 回跳与 Passkey 的实际行为（真机验证一次）。
6. `nodemailer`、`qrcode`、`sharp`（或替代）的当前版本与 Next 16 Turbopack 的兼容性。

---

## 13. 决策记录（本文）

- M-01 多用户采用「租户隔离的私有库 + 只读卡片分享 + fork 收录」；不做多人编辑同一记录。取代原设计 §2 非目标第 1 条、D-10
- M-02 认证库选 Better Auth `^1.7.11`；业务授权（租户、PAT、邀请、分享、审计）自己写。取代原设计 §8 认证
- M-03 注册：首次启动建管理员 → 默认邀请制 → `AUTH_OPEN_SIGNUP=true` 开放
- M-04 登录：邮箱 / 用户名 + 密码为基线；Passkey 为推荐无密码路径；OAuth 可选；不做魔法链接
- M-05 会话：数据库会话；`HttpOnly` / `Secure` / `SameSite=Lax`；空闲 30 天滑动 + 绝对 180 天；敏感操作后撤销其他会话；多设备列表
- M-06 每用户 PAT（`tcp_` 前缀、只存 sha256、可命名 / 撤销 / 过期 / scope）取代全局 `API_TOKEN`；`API_TOKEN` 自动迁移为 legacy PAT，90 天兼容窗口
- M-07 service 层统一 `ctx.userId`，是唯一的数据访问层；跨租户一律 404
- M-08 采用 Postgres RLS 作纵深防御：`tc_app` 角色 + 事务级 `set_config('app.user_id')`，限内容表，`FORCE`，启动自检
- M-09 分享用服务端生成的字段过滤快照，不是实时视图
- M-10 分享以 `source = 'share'` 的 inbox 条目到达接收方；收录复用 `applyInbox`
- M-11 默认只分享姓名、性别、所在地、标签、认识方式、认识日期；联系方式逐 key、摘要、印象（需确认）、时间线、tier 默认不分享
- M-12 撤销分享即清快照、链接失效；已收录副本属于接收方，不撤回
- M-13 每用户 LLM 开关 + 联系方式脱敏默认开 + 每用户配额。收紧原设计 §13 与 D-05 的「方便优先」
- M-14 密码哈希沿用 Better Auth 默认 scrypt，argon2id 作为可选加固
- M-15 管理员最小权限：邀请、列用户、停用 / 恢复、重置登录能力、实例设置；不读任何人脉数据，无代登录
- M-16 审计日志表，`meta` 不含内容字段，保留 180 天
- M-17 CSP 两步走：A 期 report-only，C 期 `proxy.ts` nonce 强制
- M-18 不启用实验性 `authInterrupts`；页面 `redirect`，API 401 / 403
- M-19 标签词表按用户隔离，`tags` 唯一键改为 `(owner_id, name, kind)`；分享收录时允许一键创建缺失标签
- M-20 命名：UI 继续叫「朋友圈」；用户对外标识用 `@username`；访客页路径 `/s/[token]`
