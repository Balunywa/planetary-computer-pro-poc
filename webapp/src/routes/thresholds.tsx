import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/thresholds")({
  beforeLoad: () => {
    throw redirect({ to: "/demo/thresholds" });
  },
});
