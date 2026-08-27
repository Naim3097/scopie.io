import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    // sitemap: "https://scopie.io/sitemap.xml", // add when real content lands
  };
}
