import { describe, expect, it } from "vitest";
import { csvFilename, reportCsv, toCsv, CSV_SECTIONS } from "@/lib/reports/csv";
import { buildReport } from "@/lib/reports";
import type { MetricsRfq } from "@/lib/metrics";

describe("toCsv", () => {
  it("starts with a UTF-8 BOM and uses CRLF, so Excel opens Arabic correctly", () => {
    const csv = toCsv([["a", "b"], ["1", "2"]]);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toBe("﻿a,b\r\n1,2\r\n");
  });

  it("quotes commas, quotes, and line breaks", () => {
    expect(toCsv([['He said "hi", then left', "two\nlines", "plain"]])).toBe('﻿"He said ""hi"", then left","two\nlines",plain\r\n');
  });

  it("keeps Arabic text intact", () => {
    expect(toCsv([["شركة الراشد للتجارة"]])).toBe("﻿شركة الراشد للتجارة\r\n");
  });

  it("neutralises spreadsheet formulas in text (CSV injection), but not in numbers", () => {
    expect(toCsv([["=HYPERLINK(\"http://x\")", "+1", "@SUM(A1)", "-cmd", -42.5]])).toBe(
      "﻿\"'=HYPERLINK(\"\"http://x\"\")\",'+1,'@SUM(A1),'-cmd,-42.50\r\n"
    );
  });

  it("also neutralises a leading tab or carriage return", () => {
    expect(toCsv([["\tcmd", "\rcmd"]])).toBe("﻿'\tcmd,\"'\rcmd\"\r\n");
  });

  it("writes numbers with two decimals and empty cells for null", () => {
    expect(toCsv([[1234.5, null, 0]])).toBe("﻿1234.50,,0.00\r\n");
  });
});

describe("reportCsv", () => {
  const rfqs: MetricsRfq[] = [
    {
      id: "r1",
      title: "أسمنت, للموقع",
      currency: "SAR",
      created_at: "2026-09-01T08:00:00Z",
      status: "awarded",
      items: [{ id: "i1", name: "Portland cement", quantity: 1 }],
      invites: [
        { id: "a", label: "=Al Rashid", supplier_id: "sup-a", email: "a@x.sa", status: "submitted", invited_at: "2026-09-01T08:00:00Z" },
        { id: "b", label: "Gulf", supplier_id: "sup-b", email: "b@x.sa", status: "submitted", invited_at: "2026-09-01T08:00:00Z" },
      ],
      quotes: [
        { id: "qa", invite_id: "a", status: "submitted", submitted_at: "2026-09-02T08:00:00Z", lines: [{ item_id: "i1", total: 100 }] },
        { id: "qb", invite_id: "b", status: "submitted", submitted_at: "2026-09-02T08:00:00Z", lines: [{ item_id: "i1", total: 120 }] },
      ],
      award: { decision: "auto_approved", quote_id: "qa", po_sent_at: "2026-09-03T08:00:00Z", created_at: "2026-09-03T08:00:00Z", reason: null },
    },
  ];
  const report = buildReport(rfqs, { from: "2026-09-01", to: "2026-09-30", supplier: null }, new Date("2026-10-01T00:00:00Z"));

  it("exports every section with a header row", () => {
    for (const section of CSV_SECTIONS) {
      const lines = reportCsv(report, section).replace("﻿", "").trim().split("\r\n");
      expect(lines.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("awards: one row per award, escaped, with the currency", () => {
    const lines = reportCsv(report, "awards").replace("﻿", "").trim().split("\r\n");
    expect(lines[0]).toBe("PO date,RFQ,Supplier,Categories,Currency,Total,Baseline (avg. other quotes),Savings,Savings %,Decision");
    expect(lines[1]).toBe(`2026-09-03,"أسمنت, للموقع",'=Al Rashid,Construction materials,SAR,100.00,120.00,20.00,16.67,Automatic`);
  });

  it("names the file after the section and range", () => {
    expect(csvFilename(report, "suppliers")).toBe("clarix-suppliers-2026-09-01-to-2026-09-30.csv");
  });
});
