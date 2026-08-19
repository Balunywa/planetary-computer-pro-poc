import { createFileRoute, redirect } from "@tanstack/react-router";

// This is the PRODUCT app (what customers fork + "Deploy to Azure"). It carries
// no marketing landing — that lives in the separate marketing site. The public
// entry point is the demo console; a tenant deployment signs into /app.
export const Route = createFileRoute("/")({
  beforeLoad: () => {
    throw redirect({ to: "/demo" });
  },
});
