import { createFileRoute, Link } from "@tanstack/react-router";

import { Card, Section, SiteChrome, SiteHero } from "@/components/site/SiteChrome";

const TITLE = "Security & Tenancy | Weather & Asset Risk";
const DESC =
  "Identity, tenancy and data-handling model: Microsoft Entra ID single sign-on, per-tenant isolation, row-level security and auditable risk scoring.";

export const Route = createFileRoute("/security")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESC },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESC },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SecurityPage,
});

function SecurityPage() {
  return (
    <SiteChrome>
      <SiteHero
        eyebrow="Security"
        title="The accelerator runs in your tenant, on your directory, under your controls."
        lede="Statements below describe how this accelerator is built and deployed. They are the operator's commitments for a deployment, not third-party certifications or an independent audit."
      />

      <Section title="Identity">
        <div className="grid gap-4 sm:grid-cols-3">
          <Card title="Microsoft Entra ID SSO">Sign-in is delegated to your directory. MFA, conditional access, device compliance and offboarding are enforced by your existing policy.</Card>
          <Card title="Role mapping">Directory app roles map to viewer, approver and administrator inside the console; posture changes and shut-in decisions require an approver role.</Card>
          <Card title="No shared credentials">The open demo carries no tenant data at all, so there is nothing to gate and no shared login to circulate.</Card>
        </div>
      </Section>

      <Section title="Tenancy and data">
        <div className="grid gap-4 sm:grid-cols-3">
          <Card title="Per-tenant isolation">Asset registers, thresholds, posture and alerts carry a tenant identifier derived from the authenticated directory; row-level security enforces the boundary on every query.</Card>
          <Card title="Data residency">Deployment targets a region you choose. Asset data stays in the subscription the accelerator is deployed into.</Card>
          <Card title="Third-party feeds">Hazard data flows inbound only. Asset locations and posture are never sent to external weather providers.</Card>
        </div>
      </Section>

      <Section title="Auditability">
        <div className="grid gap-4 sm:grid-cols-3">
          <Card title="Reconstructable scores">Each risk score records its factor inputs and the forecast cycle it came from, so a decision can be reviewed after the season.</Card>
          <Card title="Decision trail">Alert acknowledgement, threshold edits and posture transitions are recorded with actor and timestamp.</Card>
          <Card title="Model transparency">The scoring model is documented arithmetic, not an opaque model output. Assistant responses are grounded in the same objects.</Card>
        </div>
      </Section>

      <Section title="Questions from your security team?" description="The architecture page covers networking and adapter boundaries in more detail.">
        <div className="flex flex-wrap gap-3">
          <Link to="/architecture" className="rounded-sm border px-4 py-2 text-sm hover:bg-accent">Reference architecture</Link>
          <Link to="/demo" className="rounded-sm bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">Launch demo</Link>
        </div>
      </Section>
    </SiteChrome>
  );
}
