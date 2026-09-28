export type DateLike = string | Date | null | undefined;

function toDate(value: DateLike): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** 2026-09-28 */
export function formatDate(value: DateLike): string {
  const d = toDate(value);
  if (!d) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Date-only strings (YYYY-MM-DD) should not be shifted by the timezone. */
export function formatDay(value: DateLike): string {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  return formatDate(value);
}

/** "刚刚 / 3 小时前 / 5 天前 / 2026-01-02" */
export function formatRelative(value: DateLike, now = new Date()): string {
  const d = toDate(value);
  if (!d) return "";
  const diffMs = now.getTime() - d.getTime();
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} 天前`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months} 个月前`;
  return formatDate(d);
}

export const CONTACT_LABELS: Record<string, string> = {
  wechat: "微信",
  phone: "电话",
  email: "邮箱",
  xiaohongshu: "小红书",
  douyin: "抖音",
  weibo: "微博",
  linkedin: "LinkedIn",
  twitter: "X / Twitter",
  github: "GitHub",
  telegram: "Telegram",
  whatsapp: "WhatsApp",
  address: "地址",
  company: "公司",
};

export const QUICK_CONTACT_KEYS = ["wechat", "phone", "email", "xiaohongshu", "linkedin"] as const;

export function contactLabel(key: string): string {
  return CONTACT_LABELS[key] ?? key;
}

/** Turn a search `reasons` entry into UI text. */
export function reasonLabel(reason: string): string {
  if (reason === "semantic") return "语义相近";
  if (reason === "filter") return "符合筛选";
  if (reason === "all") return "全部";
  if (reason === "keyword") return "关键词";
  if (reason.startsWith("keyword:")) {
    const field = reason.slice("keyword:".length);
    const map: Record<string, string> = {
      name: "姓名命中",
      summary: "摘要命中",
      impression: "印象命中",
      how_met: "认识经过命中",
      location: "所在地命中",
    };
    return map[field] ?? `命中 ${field}`;
  }
  if (reason.startsWith("tag:")) return `标签「${reason.slice(4)}」`;
  return reason;
}

export function truncate(text: string | null | undefined, max = 60): string {
  if (!text) return "";
  return text.length > max ? `${text.slice(0, max)}…` : text;
}
