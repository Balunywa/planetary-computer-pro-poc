import { createFileRoute } from "@tanstack/react-router";

import { DeploymentPage } from "@/views/deployment";

export const Route = createFileRoute("/demo/deployment")({
  head: () => ({
    meta: [
      { title: "Deployment (Demo) | Weather & Asset Risk" },
      { name: "description", content: "Azure reference architecture and adapter configuration for tenant deployment. Interactive demo on synthetic sample data." },
      { property: "og:title", content: "Deployment (Demo) | Weather & Asset Risk" },
      { property: "og:description", content: "Azure reference architecture and adapter configuration for tenant deployment. Interactive demo on synthetic sample data." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DeploymentPage,
});
