import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

/** Public pages only. The language follows a cookie, so each page has one URL. */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: siteUrl("/"), lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: siteUrl("/pricing"), lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: siteUrl("/demo"), lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: siteUrl("/login"), lastModified: now, changeFrequency: "yearly", priority: 0.3 },
  ];
}
