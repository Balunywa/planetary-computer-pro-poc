import { useState } from "react";

import { cn } from "@/lib/utils";
import { LandingConsole } from "./LandingConsole";
import { AssetScorePanel, DecisionGatesPanel } from "./ScoreProof";

const TABS = [
  { id: "map", label: "Live map" },
  { id: "score", label: "Asset score" },
  { id: "gates", label: "Decision gates" },
] as const;

type TabId = (typeof TABS)[number]["id"];

/**
 * One console surface for the hero. Folds the live map, the score decomposition
 * and the decision-gate board into a single tabbed panel so the same story is
 * told in one place instead of three stacked sections.
 */
export function HeroConsole({ className }: { className?: string }) {
  const [tab, setTab] = useState<TabId>("map");

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div
        role="tablist"
        aria-label="Console view"
        className="flex gap-1 rounded-sm border bg-surface p-1 text-[12px]"
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "flex-1 rounded-[3px] px-3 py-1.5 font-medium transition-colors",
              tab === t.id
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "map" ? <LandingConsole /> : null}
      {tab === "score" ? <AssetScorePanel /> : null}
      {tab === "gates" ? <DecisionGatesPanel /> : null}
    </div>
  );
}
