import { createFileRoute } from "@tanstack/react-router";

import { TimelinePage } from "@/views/timeline";

export const Route = createFileRoute("/demo/timeline")({
  head: () => ({
    meta: [
      { title: "Forecast Timeline (Demo) | Weather & Asset Risk" },
      { name: "description", content: "120-hour forecast scrubbing showing how storm position and asset exposure evolve. Interactive demo on synthetic sample data." },
      { property: "og:title", content: "Forecast Timeline (Demo) | Weather & Asset Risk" },
      { property: "og:description", content: "120-hour forecast scrubbing showing how storm position and asset exposure evolve. Interactive demo on synthetic sample data." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TimelinePage,
});
