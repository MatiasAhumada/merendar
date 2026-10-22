import type { MetadataRoute } from "next";
import { ROUTES } from "@/constants/routes";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Merendar",
    short_name: "Merendar",
    description: "Plataforma comunitaria para organizar jornadas y acompañar a las familias.",
    start_url: ROUTES.HOME,
    scope: ROUTES.HOME,
    display: "standalone",
    background_color: "#fffaf1",
    theme_color: "#c9630b",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
