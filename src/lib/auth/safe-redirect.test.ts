import { describe, expect, it } from "vitest";
import { safeNextPath } from "@/lib/auth/safe-redirect";

describe("safeNextPath", () => {
  it.each([
    ["/rfqs/42", "/rfqs/42"],
    ["/rfqs?q=cement", "/rfqs?q=cement"],
    [undefined, "/dashboard"],
    ["", "/dashboard"],
    ["https://evil.example", "/dashboard"],
    ["//evil.example/path", "/dashboard"],
    [String.raw`/\evil.example`, "/dashboard"],
    ["javascript:alert(1)", "/dashboard"],
    ["/login", "/dashboard"],
    ["/\t/evil.com", "/dashboard"],
    ["/%09/evil.com", "/%09/evil.com"],
    ["/\n/evil.com", "/dashboard"],
    ["/\u0000x", "/dashboard"],
    ["/rfqs#x", "/rfqs#x"],
  ])("%s → %s", (input, expected) => {
    expect(safeNextPath(input)).toBe(expected);
  });
});
