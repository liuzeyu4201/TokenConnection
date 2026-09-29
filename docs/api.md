# HTTP API

前缀 `/api/v1`。全部 JSON。每个请求需要 `Authorization: Bearer <API_TOKEN>`，或浏览器里由页面种下的同源 cookie `tc_token`。

错误统一为 `{ "error": { "code": "...", "message": "..." } }`。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/people?tier=&tag=&location=&q=&cursor=&limit=` | 列表：结构化筛选 + 关键词，keyset 分页返回 `{ items, next_cursor }` |
| `POST` | `/people` | 新建（可带 `tags`） |
| `GET` | `/people/:id` | 详情（含 `tags`、`events`） |
| `PATCH` | `/people/:id` | 更新字段。可带 `tags` 整体替换。`primary_circle_tag_id` 设主圈子。`lat`/`lng` 视为手动坐标。`geo_manual: false` 恢复按所在地自动定位 |
| `DELETE` | `/people/:id` | 删除 |
| `PUT` | `/people/:id/tags` | `{ tags: [{ name, kind }] }` 整体设置标签 |
| `GET` | `/people/:id/events` | 时间线 |
| `POST` | `/people/:id/events` | 追加事件 `{ kind, content, happened_at? }`，更新 `last_contact_at` 并重算向量 |
| `DELETE` | `/people/:id/events/:eventId` | 删除事件。事件只追加、可删除、不可编辑 |
| `GET` | `/tags?kind=` | 标签列表（含 `people_count`） |
| `POST` | `/tags` | 新建 |
| `PATCH` | `/tags/:id` | 改名 / 改 kind |
| `DELETE` | `/tags/:id` | 删除 |
| `GET` | `/search?q=&tier=&tag=&location=&limit=` | 三层搜索，返回 `{ hits: [{ person, score, reasons, semantic, keyword_hit }] }` |
| `POST` | `/inbox` | `{ raw_text, source, person_id? }` 落库并立即解析，返回 `{ inbox, draft, candidates, results?, error }` |
| `GET` | `/inbox?status=pending` | 收件箱列表 |
| `GET` | `/inbox/:id` | 单条（含已存草稿与候选人，不调模型） |
| `POST` | `/inbox/:id/reparse` | 重新解析 |
| `POST` | `/inbox/:id/apply` | `{ draft }` 用确认后的草稿落库，返回 `{ inbox, person }` |
| `POST` | `/inbox/:id/discard` | 丢弃 |
| `GET` | `/map/radial` | 同心圆地图。`layout.points` 是单位圆内的坐标 |
| `GET` | `/map/geo` | 地理地图：`{ clusters, unlocated, no_location_count, located_count, skills }` |
| `GET` | `/reminders` | 该联系了 |
| `GET` | `/geo/cities?q=` | 离线城市表查询：`{ match, items }` |

## 排序、提醒、地理

排序公式和阈值在 `src/lib/search/rank.ts`：`score = 0.60*semantic + 0.25*tier_rank/5 + 0.15*keyword_hit`。语义相似度低于 0.30 且没有关键词命中的不返回。

提醒阈值在 `src/lib/reminders/thresholds.ts`：Best Bros 30 天、Close friends 60 天、Friends 120 天。另外两级不提醒。基准时间是 `last_contact_at`，没有则用 `met_at`，再没有则用 `created_at`。

所在地用 `src/lib/geo/cities.ts` 的离线城市表（GeoNames cities15000，CC BY 4.0）匹配。匹配不到的人出现在地理地图的「未定位」里。底图是随包的中国省级边界 `src/lib/geo/china-provinces.json`。

## 例子

```bash
TOKEN=$(grep '^API_TOKEN=' .env | cut -d= -f2)
curl -s -G -H "Authorization: Bearer $TOKEN" --data-urlencode "q=羽毛球教练" http://localhost:3000/api/v1/search
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"raw_text":"今天球馆认识小王，羽毛球教练，深圳，微信 wx123，人很热情","source":"shortcut"}' \
  http://localhost:3000/api/v1/inbox
```
