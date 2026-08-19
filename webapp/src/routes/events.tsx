import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/events")({
  beforeLoad: () => {
    throw redirect({ to: "/demo/events" });
  },
});
