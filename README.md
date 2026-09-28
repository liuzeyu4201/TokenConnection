# TokenConnection · 人脉

只给自己用的人脉库：用一句自然语言把人记进去，系统自动归档；需要某类人的时候一句话把人找出来，按关系远近排好。设计文档见 [`docs/design.md`](docs/design.md)，本仓库已实现「阶段 1：能每天用」与「阶段 2：能看」（同心圆地图、地理地图、该联系了提醒）。

技术栈：Next.js 16（App Router）+ TypeScript + Drizzle + Postgres 16 / pgvector + Tailwind / shadcn/ui + Vercel AI SDK（DeepSeek 抽取、通义千问 embedding），包管理 pnpm。

## 安装与运行

前置：Node ≥ 20、pnpm、Docker。

```bash
# 1. 启动数据库（pgvector/pgvector:pg16，宿主机端口默认 5433）
cp .env.example .env          # 按需修改 POSTGRES_PASSWORD / API_TOKEN
docker compose up -d

# 2. 安装依赖、建表
pnpm install
pnpm db:migrate               # 执行 drizzle/ 下的迁移（含 create extension vector）

# 3. 填充示例数据（14 个虚构人物，覆盖 5 个 tier）
pnpm db:seed                  # 已有数据时会跳过；pnpm db:seed --reset 可重建

# 4. 启动
pnpm dev                      # http://localhost:3000
```

页面：`/` 首页（万能输入框、待处理、该联系了、最近添加/联系）、`/people` 列表与筛选、`/people/[id]` 详情（追加一句、编辑、设为主圈子、手动坐标）、`/map` 同心圆地图、`/map?view=geo` 地理地图、`/reminders` 该联系了、`/tags`、`/inbox`。

首页即万能输入框：直接输入「今天球馆认识小王，羽毛球教练，深圳，微信 wx123，人很热情」会得到一张可编辑的草稿卡，点「确认入库」即完成记录；输入「想找个人教我打羽毛球」会原地展开搜索结果。`+` 开头强制记录，`?` 开头强制查询。

手机上：用 Safari 打开局域网地址（`pnpm dev` 会打印 `Network: http://192.168.x.x:3000`），「添加到主屏幕」即可作为 PWA 使用；快捷指令的配置见 [`shortcuts/README.md`](shortcuts/README.md)。

## 环境变量

`.env.example` 里有全部变量和说明，关键几项：

| 变量 | 说明 |
| --- | --- |
| `DATABASE_URL` | Postgres 连接串，端口要和 `POSTGRES_PORT` 一致（默认 5433，因为 5432 常被本机其他 Postgres 占用） |
| `POSTGRES_PASSWORD` / `POSTGRES_PORT` | 给 docker compose 用 |
| `API_TOKEN` | `/api/v1/*` 的 Bearer token；web 页面会自动以同源 cookie 带上同一个 token |
| `LLM_PROVIDER` | `mock`（默认，无需 key）或 `real` |
| `DEEPSEEK_API_KEY` / `DEEPSEEK_MODEL` / `DEEPSEEK_BASE_URL` | 抽取与意图判断（`deepseek-chat`，JSON 模式） |
| `DASHSCOPE_API_KEY` / `DASHSCOPE_EMBEDDING_MODEL` / `DASHSCOPE_BASE_URL` / `EMBEDDING_DIM` | 通义千问 `text-embedding-v3`，1024 维，OpenAI 兼容接口 |

### 切换到真实 LLM

1. 在 [DeepSeek 开放平台](https://platform.deepseek.com/) 和 [阿里云百炼 / DashScope](https://dashscope.console.aliyun.com/) 分别申请 key。
2. 在 `.env` 中填入 `DEEPSEEK_API_KEY`、`DASHSCOPE_API_KEY`，并把 `LLM_PROVIDER=real`。
3. 重启 `pnpm dev`。已有数据的向量是 mock 模型算的，需要全量重算一次：`pnpm db:reembed`（`people_embeddings.model` 字段记录了每条向量用的模型）。

`LLM_PROVIDER=mock` 时不访问网络：用正则 / 关键词启发式生成草稿，embedding 是基于文本概念哈希的确定性伪向量，足够把整个流程跑通并做开发测试；开发、seed 和单元测试默认都走 mock。无论哪种模式，LLM 失败都不会阻止记人——inbox 会标记 `error`，前端给出一张把原文预填进摘要的空表单。

## 常用脚本

| 命令 | 作用 |
| --- | --- |
| `pnpm dev` / `pnpm build` / `pnpm start` | 开发 / 构建 / 生产启动 |
| `pnpm typecheck` | `next typegen && tsc --noEmit` |
| `pnpm lint` | ESLint |
| `pnpm test` | vitest 单元测试（排序、schema、mock 抽取、鉴权） |
| `pnpm db:generate` | 根据 `src/db/schema.ts` 生成迁移到 `drizzle/` |
| `pnpm db:migrate` | 执行迁移 |
| `pnpm db:seed [--reset]` | 示例数据 |
| `pnpm db:reembed` | 用当前 provider 重算全部向量 |
| `pnpm db:geocode [--all]` | 用离线城市表为有所在地但无坐标（且非手动）的人回填经纬度；`--all` 重算全部非手动的人 |
| `pnpm db:studio` | Drizzle Studio |

## API 一览

前缀 `/api/v1`，全部 JSON，所有请求需要 `Authorization: Bearer <API_TOKEN>`。错误统一为 `{ "error": { "code": "...", "message": "..." } }`。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/people?tier=&tag=&location=&q=&cursor=&limit=` | 列表：结构化筛选 + 关键词，keyset 分页返回 `{ items, next_cursor }` |
| `POST` | `/people` | 新建（可带 `tags`） |
| `GET` | `/people/:id` | 详情（含 `tags`、`events`） |
| `PATCH` | `/people/:id` | 更新任意字段（可带 `tags` 整体替换；阶段 2 新增 `primary_circle_tag_id`、`lat`/`lng`（视为手动坐标）、`geo_manual: false` 表示恢复自动 geocode） |
| `DELETE` | `/people/:id` | 删除 |
| `PUT` | `/people/:id/tags` | `{ tags: [{ name, kind }] }` 整体设置标签 |
| `GET` | `/people/:id/events` | 时间线 |
| `POST` | `/people/:id/events` | 追加事件 `{ kind, content, happened_at? }`，自动更新 `last_contact_at` 并重算向量 |
| `DELETE` | `/people/:id/events/:eventId` | 删除事件（事件只追加、可删除、不可编辑） |
| `GET` | `/tags?kind=` | 标签列表（含 `people_count`） |
| `POST` | `/tags` | 新建 |
| `PATCH` | `/tags/:id` | 改名 / 改 kind |
| `DELETE` | `/tags/:id` | 删除 |
| `GET` | `/search?q=&tier=&tag=&location=&limit=` | 三层搜索，返回 `{ hits: [{ person, score, reasons, semantic, keyword_hit }] }` |
| `POST` | `/inbox` | `{ raw_text, source, person_id? }` 落库并立即解析，返回 `{ inbox, draft, candidates, results?, error }` |
| `GET` | `/inbox?status=pending` | 收件箱列表 |
| `GET` | `/inbox/:id` | 单条（含已存草稿与候选人，不调 LLM） |
| `POST` | `/inbox/:id/reparse` | 重新解析 |
| `POST` | `/inbox/:id/apply` | `{ draft }` 用确认后的草稿落库，返回 `{ inbox, person }` |
| `POST` | `/inbox/:id/discard` | 丢弃 |
| `GET` | `/map/radial` | 同心圆地图数据：`{ people, layout: { rings, sectors, points }, skills, locations }`，坐标为单位圆内的 (x, y) |
| `GET` | `/map/geo` | 地理地图数据：`{ clusters, unlocated, no_location_count, located_count, skills }` |
| `GET` | `/reminders` | 该联系了：`{ items: [{ person, basis, basis_at, threshold_days, days_since, overdue_days }], thresholds }` |
| `GET` | `/geo/cities?q=` | 离线城市表查询：`{ match, items }`，`match` 为 `geocode(q)` 的结果 |

提醒阈值在 `src/lib/reminders/thresholds.ts`（Best Bros 30 天、Close friends 60 天、Friends 120 天；另外两级不提醒），基准时间 `last_contact_at` → `met_at` → `created_at`。

地图不依赖任何外部服务：所在地用 `src/lib/geo/cities.ts` 的离线城市表（GeoNames cities15000，CC BY 4.0；全部省级行政区与地级市、港澳台主要城市、约 100 个世界城市）匹配，匹配不到的人会出现在地理地图下方的「未定位」里，可在详情页编辑中手动填坐标或搜城市名填入；底图是随包附带的 `world-atlas` 110m 国界。

排序公式与阈值在 `src/lib/search/rank.ts` 一处维护：`score = 0.60*semantic + 0.25*tier_rank/5 + 0.15*keyword_hit`，语义相似度低于 0.30 且无关键词命中的不返回。

例子：

```bash
TOKEN=$(grep '^API_TOKEN=' .env | cut -d= -f2)
curl -s -G -H "Authorization: Bearer $TOKEN" --data-urlencode "q=羽毛球教练" http://localhost:3000/api/v1/search
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"raw_text":"今天球馆认识小王，羽毛球教练，深圳，微信 wx123，人很热情","source":"shortcut"}' \
  http://localhost:3000/api/v1/inbox
```

## 目录

```
docs/design.md            设计文档（唯一的需求与规格来源）
docker-compose.yml        pgvector Postgres
drizzle/                  迁移文件
shortcuts/                iOS 快捷指令配置说明
src/app/(app)/            页面：/ /people /people/[id] /map /reminders /tags /inbox
src/app/api/v1/           REST 路由
src/proxy.ts              Bearer / cookie 鉴权
src/db/                   Drizzle schema、迁移、seed
src/lib/schemas/          zod：输入校验 + LLM Draft
src/lib/services/         people / tags / events / inbox / search 业务函数（API 与页面共用）
src/lib/llm/              provider / extract / embed / prompts / mock
src/lib/search/rank.ts    排序公式与阈值
src/lib/geo/              离线城市表 + geocode
src/lib/map/              同心圆布局（纯函数）、主圈子回退规则
src/lib/reminders/        提醒阈值与计算
src/components/           UI 组件
```
