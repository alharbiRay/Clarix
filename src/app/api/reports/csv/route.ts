import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { loadMetricsRfqs } from "@/lib/metrics/load";
import { buildReport, parseReportFilters } from "@/lib/reports";
import { CSV_SECTIONS, csvFilename, reportCsv, type CsvSection } from "@/lib/reports/csv";

export const dynamic = "force-dynamic";

/**
 * GET /api/reports/csv?section=awards|monthly|suppliers|categories&from=&to=&supplier=
 * The signed-in buyer's report as CSV, built on the server from the same
 * data and filters as the Reports page. RLS scopes every row to the buyer.
 */
export async function GET(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const params = Object.fromEntries(req.nextUrl.searchParams.entries());
  const section: CsvSection = (CSV_SECTIONS as readonly string[]).includes(params.section ?? "")
    ? (params.section as CsvSection)
    : "awards";
  const now = new Date();
  const filters = parseReportFilters(params, now);

  let rfqs;
  try {
    rfqs = await loadMetricsRfqs(supabase, user.id);
  } catch (e) {
    console.error(JSON.stringify({ event: "reports.csv_failed", error: String(e).slice(0, 300) }));
    return NextResponse.json({ error: "Couldn't build the report. Try again." }, { status: 500 });
  }
  const report = buildReport(rfqs, filters, now);

  return new NextResponse(reportCsv(report, section), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${csvFilename(report, section)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
