import { createFileRoute } from "@tanstack/react-router";

import { AlertsPage } from "@/views/alerts";

export const Route = createFileRoute("/demo/alerts")({
  head: () => ({
    meta: [
      { title: "Alerts (Demo) | Weather & Asset Risk" },
      { name: "description", content: "Prioritised operational alerts from hazard exposure and threshold breaches. Interactive demo on synthetic sample data." },
      { property: "og:title", content: "Alerts (Demo) | Weather & Asset Risk" },
      { property: "og:description", content: "Prioritised operational alerts from hazard exposure and threshold breaches. Interactive demo on synthetic sample data." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AlertsPage,
});
