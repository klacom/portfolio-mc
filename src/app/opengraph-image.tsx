import { ImageResponse } from "next/og";
import { getContent } from "@/content";

export const alt = "Portfolio preview: a pixel landscape with grass and dirt blocks under a sky.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpenGraphImage() {
  const { profile } = await getContent();
  const columns = Array.from({ length: 25 }, (_, i) => i);
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "linear-gradient(#8AC4EE, #F2E4AC)" }}>
        <div style={{ flex: 1, display: "flex", alignItems: "center", padding: "0 80px" }}>
          <div style={{ display: "flex", flexDirection: "column", background: "#FFFFFF", border: "6px solid #1E1B26", padding: "40px 48px", gap: 12 }}>
            <div style={{ fontSize: 72, fontWeight: 700, color: "#1E1B26" }}>{profile.name}</div>
            <div style={{ fontSize: 34, color: "#4B4658" }}>{profile.headline}</div>
          </div>
        </div>
        <div style={{ display: "flex" }}>
          {columns.map((i) => (
            <div key={i} style={{ width: 48, height: 144, display: "flex", flexDirection: "column" }}>
              <div style={{ height: 14, background: "#5DAE3B" }} />
              <div style={{ height: 82, background: i % 3 === 0 ? "#9C6A48" : "#8B5A3C" }} />
              <div style={{ height: 48, background: "#8E8F95" }} />
            </div>
          ))}
        </div>
      </div>
    ),
    size,
  );
}
