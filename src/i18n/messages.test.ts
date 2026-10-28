import { describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import ar from "../../messages/ar.json";

function keys(obj: Record<string, unknown>, prefix = ""): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === "object" ? keys(v as Record<string, unknown>, `${prefix}${k}.`) : [`${prefix}${k}`]
  );
}

function placeholders(s: string) {
  // Real placeholders only: {name} or {name, plural|select …} — not the text
  // that starts a plural branch ("one {to confirm it…}").
  return Array.from(new Set(Array.from(s.matchAll(/\{(\w+)(?=[},])/g), (m) => m[1]))).sort();
}

describe("translations", () => {
  const enKeys = keys(en).sort();
  const arKeys = keys(ar).sort();

  it("Arabic and English have exactly the same keys", () => {
    expect(arKeys.filter((k) => !enKeys.includes(k))).toEqual([]);
    expect(enKeys.filter((k) => !arKeys.includes(k))).toEqual([]);
  });

  it("every message uses the same placeholders in both languages", () => {
    const get = (o: Record<string, unknown>, k: string) => k.split(".").reduce<unknown>((a, p) => (a as Record<string, unknown>)[p], o) as string;
    const mismatched = enKeys.filter((k) => JSON.stringify(placeholders(get(en, k))) !== JSON.stringify(placeholders(get(ar, k))));
    expect(mismatched).toEqual([]);
  });

  it("no Arabic message is left empty or untranslated", () => {
    const get = (o: Record<string, unknown>, k: string) => k.split(".").reduce<unknown>((a, p) => (a as Record<string, unknown>)[p], o) as string;
    const empty = arKeys.filter((k) => !get(ar, k).trim());
    expect(empty).toEqual([]);
  });
});
