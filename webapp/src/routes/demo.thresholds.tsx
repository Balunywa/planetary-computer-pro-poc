import { createFileRoute } from "@tanstack/react-router";

import { ThresholdsPage } from "@/views/thresholds";

export const Route = createFileRoute("/demo/thresholds")({
  head: () => ({
    meta: [
      { title: "Thresholds (Demo) | Weather & Asset Risk" },
      { name: "description", content: "Configurable operational limits per asset class that drive automated alerting. Interactive demo on synthetic sample data." },
      { property: "og:title", content: "Thresholds (Demo) | Weather & Asset Risk" },
      { property: "og:description", content: "Configurable operational limits per asset class that drive automated alerting. Interactive demo on synthetic sample data." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ThresholdsPage,
});
