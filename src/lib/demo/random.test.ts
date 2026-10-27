import { describe, expect, it } from "vitest";
import { createRandom, stableUuid } from "@/lib/demo/random";

describe("createRandom (seeded PRNG)", () => {
  it("produces the same sequence for the same seed", () => {
    const a = createRandom("clarix");
    const b = createRandom("clarix");
    expect(Array.from({ length: 5 }, () => a.next())).toEqual(Array.from({ length: 5 }, () => b.next()));
  });

  it("produces different sequences for different seeds", () => {
    expect(createRandom("a").next()).not.toBe(createRandom("b").next());
  });

  it("keeps numbers in range", () => {
    const r = createRandom("range");
    for (let i = 0; i < 500; i++) {
      const n = r.next();
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(1);
      const k = r.int(3, 7);
      expect(k).toBeGreaterThanOrEqual(3);
      expect(k).toBeLessThanOrEqual(7);
    }
  });

  it("picks from arrays and shuffles without losing elements", () => {
    const r = createRandom("pick");
    expect(["x", "y", "z"]).toContain(r.pick(["x", "y", "z"]));
    expect(r.shuffle([1, 2, 3, 4, 5]).sort()).toEqual([1, 2, 3, 4, 5]);
  });

  it("chance(p) is roughly p over many draws", () => {
    const r = createRandom("chance");
    const hits = Array.from({ length: 4000 }, () => r.chance(0.25)).filter(Boolean).length;
    expect(hits / 4000).toBeGreaterThan(0.2);
    expect(hits / 4000).toBeLessThan(0.3);
  });
});

describe("stableUuid", () => {
  it("is deterministic per key and a valid v4-shaped UUID", () => {
    const id = stableUuid("demo", "rfq:1");
    expect(id).toBe(stableUuid("demo", "rfq:1"));
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(id).not.toBe(stableUuid("demo", "rfq:2"));
    expect(id).not.toBe(stableUuid("other", "rfq:1"));
  });
});
