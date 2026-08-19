import { createFileRoute, Link } from "@tanstack/react-router";

import { Card, Section, SiteChrome, SiteHero } from "@/components/site/SiteChrome";

const TITLE = "Solution | Weather & Asset Risk Intelligence";
const DESC =
  "How the accelerator joins tropical hazard forecasts to your offshore estate: explainable risk scoring, T-gate response posture, configurable thresholds and forecast uncertainty.";

export const Route = createFileRoute("/solution")({
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
  component: SolutionPage,
});

const SCORE = [
  ["Proximity", "Great-circle distance from the asset to the forecast track, weighted by how quickly the storm closes."],
  ["Wind exposure", "Sustained wind at the asset derived from radial decay across the 64/50/34 kt wind field."],
  ["Precipitation & surge", "Rainfall and inundation potential, weighted higher for coastal terminals and refineries."],
  ["Criticality", "Asset class, throughput, persons-on-board and downstream dependency."],
];

function SolutionPage() {
  return (
    <SiteChrome>
      <SiteHero
        eyebrow="Solution"
        title="Hazard forecasts are commodity. The decision is which assets you touch, and when."
        lede="The accelerator sits between hazard-only weather services and asset-only GIS. It joins tropical forecasts to your infrastructure register and produces an explainable, auditable exposure score per asset — then drives the response posture off it."
      >
        <div className="mt-8 flex flex-wrap gap-3">
          <Link to="/demo" className="rounded-sm bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            Launch demo
          </Link>
          <Link to="/architecture" className="rounded-sm border px-4 py-2 text-sm hover:bg-accent">
            Reference architecture
          </Link>
        </div>
      </SiteHero>

      <Section
        title="Explainable risk scoring"
        description="Every score decomposes into four factors, each shown with its own contribution. No black box — operations leaders can defend the number in a storm call."
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {SCORE.map(([t, d]) => (
            <Card key={t} title={t as string}>{d}</Card>
          ))}
        </div>
      </Section>

      <Section title="Operating model" description="Nine console surfaces that map to how a severe weather event is actually run.">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Card title="Operations overview">Fixed-viewport command centre with cross-filtering between map, ranked exposure table and alert rail.</Card>
          <Card title="Live map">Real vector basemap with track history, NHC-style forecast cone, asymmetric wind radii and asset layers.</Card>
          <Card title="Forecast timeline">120-hour scrubbing to see how exposure builds, with playback to brief a decision window.</Card>
          <Card title="Response posture">T-120 to T-24 gate board covering down-manning, shut-in, evacuation and persons-on-board.</Card>
          <Card title="Thresholds">Per-asset-class operational limits — crane suspension, helicopter cut-off, boat transfer — that raise alerts automatically.</Card>
          <Card title="Uncertainty">Ensemble spread plus cycle-over-cycle shift, so a track change is visible before it becomes a surprise.</Card>
          <Card title="Alerts">Priority queue combining hazard exposure and threshold breaches with acknowledgement workflow.</Card>
          <Card title="Operations assistant">Natural-language questions grounded in the same asset, storm and risk objects the console renders.</Card>
          <Card title="Asset management">Registry of platforms, wells, pipelines, refineries, terminals and ports under monitoring.</Card>
        </div>
      </Section>

      <Section title="See it running" description="The demo is open — no sign-in, no form. It runs on a synthetic sample estate and a fictional hurricane.">
        <Link to="/demo" className="inline-flex rounded-sm bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
          Launch demo
        </Link>
      </Section>
    </SiteChrome>
  );
}
