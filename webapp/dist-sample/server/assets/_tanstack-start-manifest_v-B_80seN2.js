//#region \0tanstack-start-manifest:v
var tsrStartManifest = () => ({ routes: {
	__root__: {
		filePath: "/Users/taacs/planetary-computer-pro-poc/webapp/src/routes/__root.tsx",
		children: [
			"/",
			"/_authenticated",
			"/alerts",
			"/assets",
			"/auth",
			"/copilot",
			"/deployment",
			"/events",
			"/map",
			"/posture",
			"/risk",
			"/thresholds",
			"/timeline",
			"/auth_/callback"
		],
		preloads: ["/assets/index-Cf9fnVxy.js", "/assets/jsx-runtime-Cltr0gcK.js"],
		scripts: [{ attrs: {
			type: "module",
			async: !0,
			src: "/assets/index-Cf9fnVxy.js"
		} }]
	},
	"/_authenticated": {
		filePath: "/Users/taacs/planetary-computer-pro-poc/webapp/src/routes/_authenticated/route.tsx",
		children: [
			"/_authenticated/app/alerts",
			"/_authenticated/app/assets",
			"/_authenticated/app/copilot",
			"/_authenticated/app/deployment",
			"/_authenticated/app/events",
			"/_authenticated/app/map",
			"/_authenticated/app/posture",
			"/_authenticated/app/risk",
			"/_authenticated/app/thresholds",
			"/_authenticated/app/timeline",
			"/_authenticated/app/"
		],
		preloads: ["/assets/route-QFWcz4g6.js"]
	},
	"/auth": {
		filePath: "/Users/taacs/planetary-computer-pro-poc/webapp/src/routes/auth.tsx",
		children: void 0,
		preloads: [
			"/assets/auth-CtgefuJk.js",
			"/assets/createLucideIcon-CEGepnBf.js",
			"/assets/loader-circle-LmZjNfAe.js",
			"/assets/wind-Bu6EgeVR.js",
			"/assets/session-BAtJOxvx.js"
		]
	},
	"/auth_/callback": {
		filePath: "/Users/taacs/planetary-computer-pro-poc/webapp/src/routes/auth_.callback.tsx",
		children: void 0,
		preloads: [
			"/assets/auth_.callback-gVlKI0Kg.js",
			"/assets/loader-circle-LmZjNfAe.js",
			"/assets/session-BAtJOxvx.js"
		]
	},
	"/_authenticated/app/alerts": {
		filePath: "/Users/taacs/planetary-computer-pro-poc/webapp/src/routes/_authenticated/app.alerts.tsx",
		children: void 0,
		preloads: [
			"/assets/app.alerts-BlHRrI5r.js",
			"/assets/use-ops-data-SAX8hoxT.js",
			"/assets/format-BXkwTQZM.js"
		]
	},
	"/_authenticated/app/assets": {
		filePath: "/Users/taacs/planetary-computer-pro-poc/webapp/src/routes/_authenticated/app.assets.tsx",
		children: void 0,
		preloads: [
			"/assets/app.assets-C1CfRCUn.js",
			"/assets/use-ops-data-SAX8hoxT.js",
			"/assets/upload-ex0PMMmX.js",
			"/assets/createLucideIcon-CEGepnBf.js",
			"/assets/loader-circle-LmZjNfAe.js",
			"/assets/format-BXkwTQZM.js",
			"/assets/Skeleton-BMBfd7tt.js"
		]
	},
	"/_authenticated/app/copilot": {
		filePath: "/Users/taacs/planetary-computer-pro-poc/webapp/src/routes/_authenticated/app.copilot.tsx",
		children: void 0,
		preloads: [
			"/assets/app.copilot-DJEIYra9.js",
			"/assets/use-ops-data-SAX8hoxT.js",
			"/assets/createLucideIcon-CEGepnBf.js",
			"/assets/sparkles-C-wfMPnb.js",
			"/assets/OpsMap-ghXfg26g.js"
		]
	},
	"/_authenticated/app/deployment": {
		filePath: "/Users/taacs/planetary-computer-pro-poc/webapp/src/routes/_authenticated/app.deployment.tsx",
		children: void 0,
		preloads: [
			"/assets/app.deployment-xY3zFduk.js",
			"/assets/use-ops-data-SAX8hoxT.js",
			"/assets/createLucideIcon-CEGepnBf.js",
			"/assets/check-CCy2ox4b.js",
			"/assets/sparkles-C-wfMPnb.js"
		]
	},
	"/_authenticated/app/events": {
		filePath: "/Users/taacs/planetary-computer-pro-poc/webapp/src/routes/_authenticated/app.events.tsx",
		children: void 0,
		preloads: [
			"/assets/app.events-BBKIA1-M.js",
			"/assets/use-ops-data-SAX8hoxT.js",
			"/assets/format-BXkwTQZM.js",
			"/assets/OpsMap-ghXfg26g.js",
			"/assets/RiskBadge-DXa7Sor3.js"
		]
	},
	"/_authenticated/app/map": {
		filePath: "/Users/taacs/planetary-computer-pro-poc/webapp/src/routes/_authenticated/app.map.tsx",
		children: void 0,
		preloads: [
			"/assets/app.map-BsGS6FXN.js",
			"/assets/use-ops-data-SAX8hoxT.js",
			"/assets/search-B10CUpjR.js",
			"/assets/AssetDetailPanel-m9BXEvDb.js",
			"/assets/format-BXkwTQZM.js",
			"/assets/OpsMap-ghXfg26g.js",
			"/assets/RiskBadge-DXa7Sor3.js"
		]
	},
	"/_authenticated/app/posture": {
		filePath: "/Users/taacs/planetary-computer-pro-poc/webapp/src/routes/_authenticated/app.posture.tsx",
		children: void 0,
		preloads: [
			"/assets/app.posture-CGvOXTu9.js",
			"/assets/use-ops-data-SAX8hoxT.js",
			"/assets/createLucideIcon-CEGepnBf.js",
			"/assets/check-CCy2ox4b.js",
			"/assets/loader-circle-LmZjNfAe.js",
			"/assets/minus-D2hvncCe.js",
			"/assets/rotate-ccw-CasiQsPG.js",
			"/assets/format-BXkwTQZM.js",
			"/assets/RiskBadge-DXa7Sor3.js"
		]
	},
	"/_authenticated/app/risk": {
		filePath: "/Users/taacs/planetary-computer-pro-poc/webapp/src/routes/_authenticated/app.risk.tsx",
		children: void 0,
		preloads: [
			"/assets/app.risk-CHaujr3Q.js",
			"/assets/use-ops-data-SAX8hoxT.js",
			"/assets/createLucideIcon-CEGepnBf.js",
			"/assets/search-B10CUpjR.js",
			"/assets/AssetDetailPanel-m9BXEvDb.js",
			"/assets/format-BXkwTQZM.js",
			"/assets/Skeleton-BMBfd7tt.js",
			"/assets/OpsMap-ghXfg26g.js",
			"/assets/RiskBadge-DXa7Sor3.js"
		]
	},
	"/_authenticated/app/thresholds": {
		filePath: "/Users/taacs/planetary-computer-pro-poc/webapp/src/routes/_authenticated/app.thresholds.tsx",
		children: void 0,
		preloads: [
			"/assets/app.thresholds-C0JuChdV.js",
			"/assets/use-ops-data-SAX8hoxT.js",
			"/assets/createLucideIcon-CEGepnBf.js",
			"/assets/plus-gxGqauJF.js",
			"/assets/rotate-ccw-CasiQsPG.js",
			"/assets/format-BXkwTQZM.js"
		]
	},
	"/_authenticated/app/timeline": {
		filePath: "/Users/taacs/planetary-computer-pro-poc/webapp/src/routes/_authenticated/app.timeline.tsx",
		children: void 0,
		preloads: [
			"/assets/app.timeline-D6Egz1-S.js",
			"/assets/use-ops-data-SAX8hoxT.js",
			"/assets/createLucideIcon-CEGepnBf.js",
			"/assets/format-BXkwTQZM.js",
			"/assets/OpsMap-ghXfg26g.js",
			"/assets/RiskBadge-DXa7Sor3.js"
		]
	},
	"/_authenticated/app/": {
		filePath: "/Users/taacs/planetary-computer-pro-poc/webapp/src/routes/_authenticated/app.index.tsx",
		children: void 0,
		preloads: [
			"/assets/app.index-Dxjl-I-H.js",
			"/assets/use-ops-data-SAX8hoxT.js",
			"/assets/upload-ex0PMMmX.js",
			"/assets/createLucideIcon-CEGepnBf.js",
			"/assets/loader-circle-LmZjNfAe.js",
			"/assets/sparkles-C-wfMPnb.js",
			"/assets/AssetDetailPanel-m9BXEvDb.js",
			"/assets/format-BXkwTQZM.js",
			"/assets/Skeleton-BMBfd7tt.js",
			"/assets/OpsMap-ghXfg26g.js",
			"/assets/RiskBadge-DXa7Sor3.js"
		]
	}
} });
//#endregion
export { tsrStartManifest };
