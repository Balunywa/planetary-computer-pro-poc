import { createFileRoute } from "@tanstack/react-router";

import { PosturePage } from "@/views/posture";

export const Route = createFileRoute("/demo/posture")({
  head: () => ({
    meta: [
      { title: "Response Posture (Demo) | Weather & Asset Risk" },
      { name: "description", content: "T-gate board tracking watch, logistics, down-manning, shut-in and evacuation status by asset. Interactive demo on synthetic sample data." },
      { property: "og:title", content: "Response Posture (Demo) | Weather & Asset Risk" },
      { property: "og:description", content: "T-gate board tracking watch, logistics, down-manning, shut-in and evacuation status by asset. Interactive demo on synthetic sample data." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PosturePage,
});
