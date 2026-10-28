import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Clarix — every purchase at the best price, approved by your rules";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** The share card: the comparison sheet's verdict, drawn as type. English only (the edge font has no Arabic). */
export default function OpengraphImage() {
  const row = (rank: string, name: string, total: string, pick = false) => (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 28,
        padding: "18px 28px",
        borderTop: "1px solid #E2E8F0",
        background: pick ? "rgba(124,111,224,0.08)" : "#FFFFFF",
      }}
    >
      <div style={{ fontSize: 30, fontWeight: 700, color: pick ? "#0F172A" : "#CBD5E1", width: 28 }}>{rank}</div>
      <div style={{ flex: 1, fontSize: 28, fontWeight: 600, color: "#0F172A" }}>{name}</div>
      <div style={{ fontSize: 28, fontWeight: 600, color: "#0F172A" }}>{total}</div>
    </div>
  );
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "#F8FAFC", padding: 64, fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ width: 44, height: 44, borderRadius: 10, background: "#0A0A0F", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ width: 22, height: 22, borderRadius: 11, border: "4px solid #7C6FE0" }} />
          </div>
          <div style={{ fontSize: 32, fontWeight: 700, color: "#0F172A" }}>Clarix</div>
        </div>
        <div style={{ marginTop: 36, fontSize: 64, fontWeight: 700, lineHeight: 1.05, letterSpacing: -2, color: "#0F172A", maxWidth: 960 }}>
          Every purchase at the best price. Approved by your rules.
        </div>
        <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", border: "1px solid #CBD5E1", borderRadius: 14, overflow: "hidden", background: "#FFFFFF", position: "relative" }}>
          {row("1", "Al Rashid Building Materials", "SAR 48,250", true)}
          {row("2", "Eastern Province Trading", "SAR 46,900")}
          <div
            style={{
              position: "absolute",
              right: 300,
              top: 10,
              transform: "rotate(-8deg)",
              border: "3px solid #5B4FD0",
              borderRadius: 6,
              padding: "4px 14px",
              color: "#5B4FD0",
              fontSize: 24,
              fontWeight: 800,
              letterSpacing: 3,
            }}
          >
            APPROVED
          </div>
        </div>
      </div>
    ),
    size
  );
}
