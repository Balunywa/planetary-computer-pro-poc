import { createFileRoute } from "@tanstack/react-router";

import { AssetsPage } from "@/views/assets";

export const Route = createFileRoute("/demo/assets")({
  head: () => ({
    meta: [
      { title: "Asset Management (Demo) | Weather & Asset Risk" },
      { name: "description", content: "Registry of platforms, wells, pipelines, refineries, terminals and ports under monitoring. Interactive demo on synthetic sample data." },
      { property: "og:title", content: "Asset Management (Demo) | Weather & Asset Risk" },
      { property: "og:description", content: "Registry of platforms, wells, pipelines, refineries, terminals and ports under monitoring. Interactive demo on synthetic sample data." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AssetsPage,
});
