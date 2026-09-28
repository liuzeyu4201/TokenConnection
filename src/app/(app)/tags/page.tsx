import type { Metadata } from "next";

import { TagsManager } from "@/components/tags-manager";
import { listTags } from "@/lib/services/tags";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "标签" };

export default async function TagsPage() {
  const tags = await listTags();
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">标签</h1>
        <p className="text-sm text-muted-foreground">能力和圈子都是标签，用类型区分；点标签名可按它筛选人。</p>
      </div>
      <TagsManager tags={tags} />
    </div>
  );
}
