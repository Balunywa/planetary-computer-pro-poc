import { w as cn } from "./use-ops-data-QkGo7WN-.js";
import { Suspense, lazy, useEffect, useState } from "react";
import { jsx } from "react/jsx-runtime";
//#region src/components/ops/OpsMap.tsx
var GeoMap = lazy(() => import("./GeoMap-BjGHhZbV.js"));
/**
* Operational map. Renders a real tiled basemap (coastlines, borders, cities)
* with storm and asset layers on top. Browser-only: MapLibre needs a DOM.
*/
function OpsMap(props) {
	const [mounted, setMounted] = useState(false);
	useEffect(() => setMounted(true), []);
	if (!mounted) return /* @__PURE__ */ jsx("div", {
		className: cn("bg-ocean-deep flex items-center justify-center", props.className),
		children: /* @__PURE__ */ jsx("span", {
			className: "label-xs text-muted-foreground",
			children: "Loading basemap…"
		})
	});
	return /* @__PURE__ */ jsx(Suspense, {
		fallback: /* @__PURE__ */ jsx("div", {
			className: cn("bg-ocean-deep flex items-center justify-center", props.className),
			children: /* @__PURE__ */ jsx("span", {
				className: "label-xs text-muted-foreground",
				children: "Loading basemap…"
			})
		}),
		children: /* @__PURE__ */ jsx(GeoMap, { ...props })
	});
}
//#endregion
export { OpsMap as t };
