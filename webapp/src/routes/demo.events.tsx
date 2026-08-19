import { createFileRoute } from "@tanstack/react-router";

import { EventsPage } from "@/views/events";

export const Route = createFileRoute("/demo/events")({
  head: () => ({
    meta: [
      { title: "Weather Events (Demo) | Weather & Asset Risk" },
      { name: "description", content: "Active and monitored tropical systems with intensity, motion and forecast confidence. Interactive demo on synthetic sample data." },
      { property: "og:title", content: "Weather Events (Demo) | Weather & Asset Risk" },
      { property: "og:description", content: "Active and monitored tropical systems with intensity, motion and forecast confidence. Interactive demo on synthetic sample data." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: EventsPage,
});
