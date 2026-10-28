import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { Type } from "@google/genai";
import { generateStructured, type RawGenerate } from "@/lib/gemini";
import { GeminiOutputError } from "@/lib/gemini-errors";

// The model is injected: nothing here calls Gemini.
const schema = z.object({ price: z.number(), currency: z.string() });
const responseSchema = { type: Type.OBJECT };
const parts = [{ text: "extract" }];

function replies(...texts: (string | null)[]) {
  const queue = [...texts];
  return vi.fn<RawGenerate>(async () => ({ text: queue.shift() ?? null }));
}

describe("generateStructured", () => {
  it("returns valid output without a second call", async () => {
    const generate = replies('{"price": 12.5, "currency": "SAR"}');
    expect(await generateStructured(parts, responseSchema, schema, generate)).toEqual({ price: 12.5, currency: "SAR" });
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("repairs invalid output once, telling the model what was wrong", async () => {
    const generate = replies('{"price": "12.5 SAR"}', '{"price": 12.5, "currency": "SAR"}');
    expect(await generateStructured(parts, responseSchema, schema, generate)).toEqual({ price: 12.5, currency: "SAR" });
    expect(generate).toHaveBeenCalledTimes(2);
    const repairParts = generate.mock.calls[1][0];
    expect(repairParts.slice(0, 1)).toEqual(parts);
    const repairText = repairParts.at(-1)!.text!;
    expect(repairText).toContain("price");
    expect(repairText).toContain('{"price": "12.5 SAR"}');
  });

  it("repairs output that isn't JSON at all", async () => {
    const generate = replies("Sure! The price is 12.5", '{"price": 12.5, "currency": "SAR"}');
    expect(await generateStructured(parts, responseSchema, schema, generate)).toEqual({ price: 12.5, currency: "SAR" });
  });

  it("throws GeminiOutputError when the repair is still invalid", async () => {
    const generate = replies("{}", '{"price": null}');
    await expect(generateStructured(parts, responseSchema, schema, generate)).rejects.toBeInstanceOf(GeminiOutputError);
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it("doesn't retry a request the model declined", async () => {
    const generate = vi.fn<RawGenerate>(async () => ({ text: null, blockReason: "SAFETY" }));
    await expect(generateStructured(parts, responseSchema, schema, generate)).rejects.toThrow(/declined.*SAFETY/);
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("lets transport errors (quota, network) through for the job runner to classify", async () => {
    const quota = new Error('{"error":{"status":"RESOURCE_EXHAUSTED","message":"quota"}}');
    const generate = vi.fn<RawGenerate>(async () => { throw quota; });
    await expect(generateStructured(parts, responseSchema, schema, generate)).rejects.toBe(quota);
  });

  it("treats an empty answer without a refusal as invalid output and repairs it", async () => {
    const generate = replies(null, '{"price": 12.5, "currency": "SAR"}');
    expect(await generateStructured(parts, responseSchema, schema, generate)).toEqual({ price: 12.5, currency: "SAR" });
    expect(generate.mock.calls[1][0].at(-1)!.text).toMatch(/empty/);
  });

  it("leaves the failure retryable when there's no time left for a repair", async () => {
    let t = 0;
    const generate = vi.fn<RawGenerate>(async () => {
      t += 30_000;
      return { text: "{}" };
    });
    const err = await generateStructured(parts, responseSchema, schema, generate, () => t).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(GeminiOutputError);
    expect(generate).toHaveBeenCalledTimes(1);
  });
});
