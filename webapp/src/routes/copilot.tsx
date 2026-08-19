import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/copilot")({
  beforeLoad: () => {
    throw redirect({ to: "/demo/copilot" });
  },
});
