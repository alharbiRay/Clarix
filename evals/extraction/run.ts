/**
 * Extraction evals: runs every labeled fixture through the quote extraction
 * (the same prompt, schema and repair logic the app uses) and reports
 * per-field accuracy.
 *
 *   npx tsx evals/extraction/run.ts                 # offline: rule-based baseline as the model
 *   RUN_LIVE_EVALS=true npx tsx --env-file=.env.local evals/extraction/run.ts   # real Gemini
 *   ... run.ts --write                              # also update docs/EVALS.md
 *
 * Live mode calls the Gemini API (and spends quota) only when
 * RUN_LIVE_EVALS=true. Tests import runEvals() with the baseline only.
 */
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { GEMINI_MODEL, extractQuoteFromPdf, type RawGenerate } from "@/lib/gemini";
import { FIXTURES, type EvalFixture } from "./fixtures";
import { baselineGenerate } from "./baseline";
import { FIELDS, scoreCase, summarize, type CaseScore, type Summary } from "./score";

export type Mode = "baseline" | "live";

/** Free-tier Gemini allows about 10 requests a minute; each case can take two (repair). */
const LIVE_PAUSE_MS = 13_000;

export async function runEvals(
  mode: Mode,
  fixtures: EvalFixture[] = FIXTURES,
  liveGenerate?: (f: EvalFixture) => RawGenerate | undefined
): Promise<{ scores: CaseScore[]; summary: Summary }> {
  const scores: CaseScore[] = [];
  for (const [index, fixture] of fixtures.entries()) {
    if (mode === "live" && index > 0) await new Promise((r) => setTimeout(r, LIVE_PAUSE_MS));
    const generate = mode === "baseline" ? baselineGenerate(fixture) : liveGenerate?.(fixture);
    try {
      const result = await extractQuoteFromPdf(
        {
          pdfBase64: "",
          document: { kind: "text", text: fixture.text },
          currency: fixture.rfqCurrency,
          supplier: { email: "supplier@example.test", company_name: null },
          items: fixture.items.map((i) => ({ id: i.id, name: i.name, description: null, quantity: i.quantity, unit: i.unit })),
        },
        generate
      );
      scores.push(scoreCase(fixture, result));
    } catch (e) {
      scores.push(scoreCase(fixture, null, e instanceof Error ? e.message.slice(0, 200) : String(e)));
    }
  }
  return { scores, summary: summarize(scores) };
}

const LABELS: Record<string, string> = { price: "Unit price", currency: "Currency", deliveryDays: "Delivery days", warranty: "Warranty period" };

export function reportMarkdown(mode: Mode, scores: CaseScore[], summary: Summary, date: string) {
  const rows = FIELDS.map((f) => `| ${LABELS[f]} | ${summary.accuracy[f].correct} / ${summary.accuracy[f].total} | ${summary.accuracy[f].pct}% |`);
  const langs = Object.keys(summary.byLanguage);
  const langRows = FIELDS.map((f) => `| ${LABELS[f]} | ${langs.map((l) => `${summary.byLanguage[l][f]}%`).join(" | ")} |`);
  const misses = scores.filter((s) => s.misses.length).map((s) => `- \`${s.id}\`: ${s.misses.join("; ")}`);
  return [
    `### ${mode === "live" ? `Gemini, live (${GEMINI_MODEL})` : "Rule-based baseline (offline mock)"} — ${date}`,
    "",
    summary.errors
      ? `${summary.cases} fixtures: ${summary.cases - summary.errors} answered, ${summary.errors} errored (API errors, listed below and left out of the accuracy).`
      : `${summary.cases} fixtures.`,
    "",
    "| Field | Correct | Accuracy |",
    "| --- | --- | --- |",
    ...rows,
    "",
    `| By language | ${langs.join(" | ")} |`,
    `| --- | ${langs.map(() => "---").join(" | ")} |`,
    ...langRows,
    "",
    misses.length ? "Misses:" : "No misses.",
    ...misses,
    "",
  ].join("\n");
}

const START = (mode: Mode) => `<!-- evals:${mode}:start -->`;
const END = (mode: Mode) => `<!-- evals:${mode}:end -->`;

/** Replaces this mode's block in docs/EVALS.md, keeping the rest of the file. */
export function updateEvalsDoc(doc: string, mode: Mode, block: string) {
  const start = START(mode);
  const end = END(mode);
  const section = `${start}\n${block}\n${end}`;
  if (doc.includes(start) && doc.includes(end)) {
    return doc.slice(0, doc.indexOf(start)) + section + doc.slice(doc.indexOf(end) + end.length);
  }
  return `${doc.trimEnd()}\n\n${section}\n`;
}

async function main() {
  const live = process.env.RUN_LIVE_EVALS === "true";
  const mode: Mode = live ? "live" : "baseline";
  const { scores, summary } = await runEvals(mode);
  const date = new Date().toISOString().slice(0, 10);
  const block = reportMarkdown(mode, scores, summary, date);
  console.log(block);
  if (process.argv.includes("--write")) {
    const file = path.join(process.cwd(), "docs", "EVALS.md");
    const doc = existsSync(file) ? readFileSync(file, "utf8") : "# Evals\n";
    writeFileSync(file, updateEvalsDoc(doc, mode, block));
    console.log(`Updated ${path.relative(process.cwd(), file)} (${mode}).`);
  }
}

if (process.argv[1] && /evals[\\/]extraction[\\/]run\.ts$/.test(process.argv[1])) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
