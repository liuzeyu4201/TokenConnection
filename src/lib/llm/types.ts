import type { InboxIntent, TagKind } from "@/lib/schemas/enums";

/** One line per person handed to the LLM for disambiguation (design.md §9.1). */
export type PeopleIndexEntry = {
  id: string;
  name: string;
  /** e.g. "深圳 · Friends · 羽毛球教练" */
  summary_line: string;
};

export type ExtractOptions = {
  /** `+` / `?` prefix or a page context forces the intent. */
  forcedIntent?: Extract<InboxIntent, "add" | "update" | "query">;
  /** Person detail page: the text is about this person. */
  targetPersonId?: string;
  /** YYYY-MM-DD used to resolve relative dates. Defaults to today. */
  today?: string;
  /** Circles and tags defined in settings; the draft may only use these names. */
  tagVocabulary?: Array<{ name: string; kind: TagKind }>;
};

export class ExtractionError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "ExtractionError";
  }
}

export class EmbeddingError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "EmbeddingError";
  }
}
