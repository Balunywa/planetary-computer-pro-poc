import { createFileRoute } from "@tanstack/react-router";

import { CopilotPage } from "@/views/copilot";

export const Route = createFileRoute("/demo/copilot")({
  head: () => ({
    meta: [
      { title: "Operations Assistant (Demo) | Weather & Asset Risk" },
      { name: "description", content: "Natural-language assistant grounded in live asset, storm and risk data. Interactive demo on synthetic sample data." },
      { property: "og:title", content: "Operations Assistant (Demo) | Weather & Asset Risk" },
      { property: "og:description", content: "Natural-language assistant grounded in live asset, storm and risk data. Interactive demo on synthetic sample data." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CopilotPage,
});
