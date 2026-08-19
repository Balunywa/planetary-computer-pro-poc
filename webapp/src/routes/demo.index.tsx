import { createFileRoute } from "@tanstack/react-router";

import { OverviewPage } from "@/views/index";

export const Route = createFileRoute("/demo/")({
  head: () => ({
    meta: [
      { title: "Operations Overview (Demo) | Weather & Asset Risk" },
      { name: "description", content: "Executive view of Severe weather exposure across offshore platforms, pipelines, refineries and LNG terminals. Interactive demo on synthetic sample data." },
      { property: "og:title", content: "Operations Overview (Demo) | Weather & Asset Risk" },
      { property: "og:description", content: "Executive view of Severe weather exposure across offshore platforms, pipelines, refineries and LNG terminals. Interactive demo on synthetic sample data." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: OverviewPage,
});
