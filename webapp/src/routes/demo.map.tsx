import { createFileRoute } from "@tanstack/react-router";

import { MapPage } from "@/views/map";

export const Route = createFileRoute("/demo/map")({
  head: () => ({
    meta: [
      { title: "Live Map (Demo) | Weather & Asset Risk" },
      { name: "description", content: "Interactive operations map with hurricane track, forecast cone, wind field and asset exposure layers. Interactive demo on synthetic sample data." },
      { property: "og:title", content: "Live Map (Demo) | Weather & Asset Risk" },
      { property: "og:description", content: "Interactive operations map with hurricane track, forecast cone, wind field and asset exposure layers. Interactive demo on synthetic sample data." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: MapPage,
});
