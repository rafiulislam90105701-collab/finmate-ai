import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "FinMate AI",
    short_name: "FinMate",
    description: "Clearer money decisions.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f7f6f2",
    theme_color: "#123b38",
    icons: [
      { src: "/icons/finmate-icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/finmate-icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/finmate-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/finmate-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icons/finmate-icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}
