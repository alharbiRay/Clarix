import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

/** Index the public pages; keep crawlers out of the app, supplier links and APIs. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/pricing", "/demo", "/login"],
        disallow: ["/dashboard", "/rfqs", "/suppliers", "/reports", "/settings", "/quote/", "/api/", "/auth/"],
      },
    ],
    sitemap: siteUrl("/sitemap.xml"),
  };
}
