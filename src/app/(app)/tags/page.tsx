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
        <h1 className="text-xl font-semibold">圈子和标签</h1>
        <p className="text-sm text-muted-foreground">圈子一个人只有一个，用来在地图上分扇区。标签可以有很多，用来查找。</p>
      </div>
      <TagsManager tags={tags} />
    </div>
  );
}
