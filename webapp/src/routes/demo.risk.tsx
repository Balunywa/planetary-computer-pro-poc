import { createFileRoute } from "@tanstack/react-router";

import { RiskPage } from "@/views/risk";

export const Route = createFileRoute("/demo/risk")({
  head: () => ({
    meta: [
      { title: "Asset Risk (Demo) | Weather & Asset Risk" },
      { name: "description", content: "Ranked infrastructure exposure with transparent risk scoring, impact ETA and primary threat by asset. Interactive demo on synthetic sample data." },
      { property: "og:title", content: "Asset Risk (Demo) | Weather & Asset Risk" },
      { property: "og:description", content: "Ranked infrastructure exposure with transparent risk scoring, impact ETA and primary threat by asset. Interactive demo on synthetic sample data." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: RiskPage,
});
