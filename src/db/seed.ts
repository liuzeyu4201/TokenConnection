import { loadDotEnv } from "./load-env";
import type { EventKind, Gender, TagKind, Tier } from "@/lib/schemas/enums";

loadDotEnv();

/**
 * Seed 14 fictional people covering all five tiers, several circles and
 * skills, with events and (some) contacts, then embed everyone with the
 * current LLM provider. Usage:
 *
 *   pnpm db:seed            # refuses to run if people already exist
 *   pnpm db:seed --reset    # wipes people / tags / events / inbox first
 */

type SeedPerson = {
  name: string;
  gender: Gender;
  tier: Tier;
  location: string | null;
  summary: string;
  impression: string | null;
  contacts: Record<string, string>;
  how_met: string | null;
  met_at: string | null;
  tags: Array<[string, TagKind]>;
  events: Array<[string, EventKind, string]>;
};

const SEED_PEOPLE: SeedPerson[] = [
  {
    // Design.md §17 acceptance case: plays badminton at team level, has
    // taught students, but the summary never says "教练".
    name: "李昊然",
    gender: "male",
    tier: "close_friends",
    location: "杭州",
    summary: "大学羽毛球校队主力，毕业后业余时间带过一些学生打球，现在在杭州一家国企做行政",
    impression: "靠谱，答应的事一定做到，话不多",
    contacts: { wechat: "lihaoran_hz", phone: "13800001111" },
    how_met: "大学同学，一起打了四年球",
    met_at: "2016-09-01",
    tags: [["羽毛球", "skill"], ["大学同学", "circle"], ["球友", "circle"]],
    events: [
      ["2026-09-14", "hangout", "一起打了两小时球，他顺手帮我调了拍线"],
      ["2026-06-02", "helped_me", "帮我看了一份 offer，给了很中肯的建议"],
      ["2025-12-20", "hangout", "年底聚餐"],
    ],
  },
  {
    name: "王磊",
    gender: "male",
    tier: "interacted",
    location: "深圳",
    summary: "在福田一家球馆做羽毛球培训，带成人班，也接私教课",
    impression: "热情，话多，专业",
    contacts: { wechat: "wanglei_bd" },
    how_met: "球馆认识，加了微信",
    met_at: "2026-09-20",
    tags: [["羽毛球", "skill"], ["教练", "skill"], ["球友", "circle"]],
    events: [["2026-09-20", "met", "球馆认识，加了微信"]],
  },
  {
    name: "周雨桐",
    gender: "female",
    tier: "friends",
    location: "深圳",
    summary: "周末球友，在一家跨境电商公司做运营，经常组织球局",
    impression: "开朗，组织能力强",
    contacts: { wechat: "zhouyt" },
    how_met: "球馆认识",
    met_at: "2025-10-11",
    tags: [["羽毛球", "skill"], ["电商", "skill"], ["运营", "skill"], ["球友", "circle"]],
    events: [
      ["2026-08-30", "hangout", "她组织了一场 8 人球局"],
      ["2026-07-12", "hangout", "打完球一起吃了宵夜"],
    ],
  },
  {
    name: "陈默",
    gender: "male",
    tier: "friends",
    location: "上海",
    summary: "供应链管理，在一家制造企业做采购总监",
    impression: "靠谱但话少",
    contacts: { wechat: "chenmo_sc", email: "chenmo@example.com" },
    how_met: "2025 年一个行业活动上认识",
    met_at: "2025-11-08",
    tags: [["供应链", "skill"], ["采购", "skill"], ["行业活动", "circle"]],
    events: [
      ["2025-11-08", "met", "行业活动上认识"],
      ["2026-01-15", "helped_me", "帮我看了一份供应商合同，指出两处风险"],
    ],
  },
  {
    name: "张伟",
    gender: "male",
    tier: "best_bros",
    location: "北京",
    summary: "发小，现在在北京做后端开发，业余搞开源",
    impression: "什么都能聊，关键时刻一定在",
    contacts: { wechat: "zhangwei_dev", phone: "13900002222" },
    how_met: "小学同学，发小",
    met_at: "2004-09-01",
    tags: [["后端", "skill"], ["编程", "skill"], ["发小", "circle"]],
    events: [
      ["2026-09-01", "hangout", "他来杭州出差，喝到半夜"],
      ["2026-03-10", "i_helped", "帮他改简历"],
      ["2025-10-01", "hangout", "国庆一起去了趟西北"],
    ],
  },
  {
    name: "刘思远",
    gender: "male",
    tier: "best_bros",
    location: "杭州",
    summary: "大学室友，现在在杭州创业做 AI 应用，公司二十来人",
    impression: "想法多，执行力强，有点急",
    contacts: { wechat: "siyuan_ai" },
    how_met: "大学室友",
    met_at: "2016-09-01",
    tags: [["创业", "skill"], ["AI", "skill"], ["大学同学", "circle"], ["创业圈", "circle"]],
    events: [
      ["2026-09-25", "hangout", "一起吃饭，聊他的融资进展"],
      ["2026-05-20", "helped_me", "帮我介绍了一个投资人"],
    ],
  },
  {
    name: "林小满",
    gender: "female",
    tier: "close_friends",
    location: "上海",
    summary: "前同事，做 UI 设计，现在在上海一家大厂",
    impression: "细心，审美好，很会照顾人",
    contacts: { wechat: "linxiaoman", xiaohongshu: "小满的设计笔记" },
    how_met: "前公司同事",
    met_at: "2021-03-01",
    tags: [["设计", "skill"], ["UI", "skill"], ["前同事", "circle"]],
    events: [
      ["2026-08-18", "helped_me", "帮我改了 PPT 的视觉"],
      ["2026-04-05", "hangout", "一起看了个展"],
    ],
  },
  {
    name: "赵律",
    gender: "male",
    tier: "friends",
    location: "深圳",
    summary: "执业律师，主做公司法和合同纠纷",
    impression: "严谨，说话慢但准",
    contacts: { phone: "13700003333", email: "zhaolv@example.com" },
    how_met: "朋友饭局上认识",
    met_at: "2024-06-15",
    tags: [["法律", "skill"], ["律师", "skill"], ["朋友的朋友", "circle"]],
    events: [
      ["2024-06-15", "met", "朋友饭局上认识"],
      ["2025-09-02", "helped_me", "电话咨询了一次租房合同的问题"],
    ],
  },
  {
    name: "孙倩",
    gender: "female",
    tier: "interacted",
    location: "成都",
    summary: "在成都做独立摄影师，主要拍人像和活动",
    impression: "安静，作品很有风格",
    contacts: { wechat: "sunqian_photo" },
    how_met: "朋友婚礼上她是摄影师",
    met_at: "2026-05-18",
    tags: [["摄影", "skill"], ["朋友的朋友", "circle"]],
    events: [["2026-05-18", "met", "朋友婚礼上认识，加了微信"]],
  },
  {
    name: "吴凡",
    gender: "male",
    tier: "interacted",
    location: "广州",
    summary: "做外贸，主营家居用品出口东南亚",
    impression: "很会聊，酒量好",
    contacts: { wechat: "wufan_trade" },
    how_met: "球馆认识",
    met_at: "2026-07-06",
    tags: [["外贸", "skill"], ["电商", "skill"], ["球友", "circle"]],
    events: [["2026-07-06", "met", "球馆认识，打了一场双打"]],
  },
  {
    name: "郑医生",
    gender: "female",
    tier: "known_of",
    location: "杭州",
    summary: "据说是省人民医院的骨科医生，朋友推荐过，打球膝盖有问题可以找她",
    impression: null,
    contacts: {},
    how_met: "刘思远提过",
    met_at: null,
    tags: [["医生", "skill"], ["朋友的朋友", "circle"]],
    events: [],
  },
  {
    name: "老周",
    gender: "male",
    tier: "known_of",
    location: "深圳",
    summary: "听吴凡说的，在深圳做投资，看消费和跨境方向",
    impression: null,
    contacts: {},
    how_met: "吴凡提过",
    met_at: null,
    tags: [["投资", "skill"], ["朋友的朋友", "circle"]],
    events: [],
  },
  {
    name: "韩雪",
    gender: "female",
    tier: "friends",
    location: "北京",
    summary: "健身私教，也教瑜伽，在北京朝阳的一家工作室",
    impression: "自律，话直",
    contacts: { wechat: "hanxue_fit" },
    how_met: "健身房认识",
    met_at: "2025-03-02",
    tags: [["健身", "skill"], ["瑜伽", "skill"], ["教练", "skill"], ["健身房", "circle"]],
    events: [
      ["2025-03-02", "met", "健身房认识"],
      ["2026-02-14", "note", "她换了工作室"],
    ],
  },
  {
    name: "高远",
    gender: "male",
    tier: "close_friends",
    location: "杭州",
    summary: "跑友，做数据分析，每周末一起跑西湖",
    impression: "稳，没什么脾气",
    contacts: { wechat: "gaoyuan_run" },
    how_met: "跑团认识",
    met_at: "2023-04-16",
    tags: [["跑步", "skill"], ["数据", "skill"], ["跑团", "circle"]],
    events: [
      ["2026-09-21", "hangout", "西湖 10 公里"],
      ["2026-08-10", "hangout", "一起报了半马"],
    ],
  },
];

async function main() {
  const reset = process.argv.includes("--reset");

  const { closeDb, getDb } = await import("./index");
  const { events, inbox, people, peopleEmbeddings, peopleTags, tags } = await import("./schema");
  const { sql } = await import("drizzle-orm");
  const { replacePersonTags } = await import("@/lib/services/tags");
  const { recomputeLastContact } = await import("@/lib/services/events");
  const { initialGeo } = await import("@/lib/services/people");
  const { embedPerson } = await import("@/lib/llm/embed");
  const { getEmbeddingModelName, getLlmProviderKind } = await import("@/lib/llm/provider");

  const db = getDb();
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(people);

  if (count > 0 && !reset) {
    console.log(`people 表已有 ${count} 条记录，跳过。要重建示例数据请运行 pnpm db:seed --reset`);
    await closeDb();
    return;
  }
  if (reset) {
    console.log("清空 people / tags / events / people_tags / people_embeddings / inbox ...");
    await db.execute(
      sql`truncate table ${inbox}, ${peopleEmbeddings}, ${events}, ${peopleTags}, ${tags}, ${people} cascade`,
    );
  }

  console.log(`LLM provider: ${getLlmProviderKind()}（embedding 模型 ${getEmbeddingModelName()}）`);

  const ids: string[] = [];
  for (const person of SEED_PEOPLE) {
    const id = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(people)
        .values({
          name: person.name,
          gender: person.gender,
          tier: person.tier,
          location: person.location,
          summary: person.summary,
          impression: person.impression,
          contacts: person.contacts,
          how_met: person.how_met,
          met_at: person.met_at,
          // Stage 2: coordinates from the offline geocoder.
          ...initialGeo({ location: person.location }),
        })
        .returning({ id: people.id });
      await replacePersonTags(
        row.id,
        person.tags.map(([name, kind]) => ({ name, kind })),
        tx,
      );
      if (person.events.length > 0) {
        await tx.insert(events).values(
          person.events.map(([happened_at, kind, content]) => ({
            person_id: row.id,
            kind,
            content,
            happened_at,
          })),
        );
        await recomputeLastContact(row.id, tx);
      }
      return row.id;
    });
    ids.push(id);
    console.log(`+ ${person.name}（${person.tier}）`);
  }

  console.log("生成 embedding ...");
  let failed = 0;
  for (const id of ids) {
    try {
      await embedPerson(id);
    } catch (error) {
      failed++;
      console.error(`  embedding 失败 ${id}:`, error instanceof Error ? error.message : error);
    }
  }
  const [{ located }] = await db
    .select({ located: sql<number>`count(*) filter (where lat is not null)::int` })
    .from(people);
  console.log(`完成：${ids.length} 人，embedding 失败 ${failed} 个，已定位 ${located} 人。`);
  await closeDb();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
