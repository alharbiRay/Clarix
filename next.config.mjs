import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // PDF uploads post through a server action (default limit 1 MB). Vercel
    // caps a function request at about 4.5 MB, so uploads allow 4 MB files;
    // larger quotes can still come in by email (10 MB, downloaded server-side).
    serverActions: { bodySizeLimit: "4.5mb" },
  },
};

export default withNextIntl(nextConfig);
