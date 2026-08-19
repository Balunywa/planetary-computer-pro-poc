import { Link, useRouterState } from "@tanstack/react-router";
import type { ComponentPropsWithoutRef, ReactElement } from "react";

export type OpsBase = "/demo" | "/app";

/** Console pages are mounted twice: /demo/* (synthetic) and /app/* (tenant data). */
export function useOpsBase(): OpsBase {
  const path = useRouterState({ select: (s) => s.location.pathname });
  return path.startsWith("/app") ? "/app" : "/demo";
}

export function useIsDemo() {
  return useOpsBase() === "/demo";
}

type OpsLinkProps = Omit<ComponentPropsWithoutRef<"a">, "href"> & {
  /** Path relative to the console root, e.g. "/risk" or "/" for the overview. */
  to: string;
};

export function OpsLink({ to, ...rest }: OpsLinkProps) {
  const base = useOpsBase();
  const href = to === "/" ? base : `${base}${to}`;
  const AnyLink = Link as unknown as (props: Record<string, unknown>) => ReactElement;
  return <AnyLink to={href} {...rest} />;
}
