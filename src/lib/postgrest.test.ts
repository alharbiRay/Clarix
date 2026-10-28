import { describe, expect, it } from "vitest";
import { ilikeAnyFilter } from "@/lib/postgrest";

describe("ilikeAnyFilter", () => {
  it("quotes the value so reserved characters can't add conditions", () => {
    const filter = ilikeAnyFilter(["title", "project"], "x,rfq.neq.null)");
    expect(filter).toBe('title.ilike."%x,rfq.neq.null)%",project.ilike."%x,rfq.neq.null)%"');
  });

  it("escapes quotes, backslashes and LIKE wildcards", () => {
    expect(ilikeAnyFilter(["title"], 'a"b')).toBe(String.raw`title.ilike."%a\"b%"`);
    // LIKE escape (\%) then PostgREST escape (\\%)
    expect(ilikeAnyFilter(["title"], "100%_")).toBe(String.raw`title.ilike."%100\\%\\_%"`);
    expect(ilikeAnyFilter(["title"], String.raw`a\b`)).toBe(String.raw`title.ilike."%a\\\\b%"`);
  });

  it("keeps Arabic text as is and caps the length", () => {
    expect(ilikeAnyFilter(["title"], "مواد بناء")).toBe('title.ilike."%مواد بناء%"');
    expect(ilikeAnyFilter(["title"], "x".repeat(500)).length).toBeLessThan(130);
  });
});
