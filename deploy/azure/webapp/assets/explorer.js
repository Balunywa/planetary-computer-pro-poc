// StormLens — live GeoCatalog explorer.
// Signs in with MSAL (Microsoft Entra), lists STAC collections from the GeoCatalog data
// plane, and draws item footprints on a MapLibre map. No account keys, no portal — the
// browser calls the catalog with the signed-in user's token.

(function () {
  "use strict";

  var CFG = window.STORMLENS_CONFIG || {};
  var GEOCAT_SCOPE = "https://geocatalog.spatio.azure.com/.default";
  var API_VERSION = CFG.apiVersion || "2025-04-30-preview";

  var el = function (id) { return document.getElementById(id); };
  var catalogInput = el("catalogUrl");
  var authBtn = el("authBtn");
  var authDot = el("authDot");
  var authState = el("authState");
  var collectionSelect = el("collectionSelect");
  var itemList = el("itemList");
  var itemCount = el("itemCount");
  var configBanner = el("configBanner");

  catalogInput.value = CFG.geoCatalogUrl || "";

  // --- Map ---------------------------------------------------------------------------
  // liveToken holds the current GeoCatalog access token so the map's raster tile requests
  // (which go out as <img>/fetch and can't set headers themselves) can be authenticated
  // for a live catalog. In demo mode the tiles are public (Planetary Computer) and no
  // token is attached. This is the same approach the PC Explorer uses to sign tile calls.
  var liveToken = null;

  var map = new maplibregl.Map({
    container: "map",
    // Start with a dependency-free background so the map's "load" event fires immediately
    // in every environment. The OSM basemap is added AFTER load (below), so a blocked or
    // slow tile provider can never stall map initialization or hide the data layers.
    style: {
      version: 8,
      sources: {},
      layers: [
        { id: "bg", type: "background", paint: { "background-color": "#0b1020" } }
      ]
    },
    center: [-90.19, 29.1], // Port Fourchon, Gulf of Mexico
    zoom: 6,
    transformRequest: function (url, resourceType) {
      if (resourceType === "Tile" && liveToken && isCatalogOrigin(url)) {
        return { url: url, headers: { Authorization: "Bearer " + liveToken } };
      }
    }
  });
  map.addControl(new maplibregl.NavigationControl(), "top-right");

  var mapReady = false;
  var pendingTiler = null;
  var pendingFC = null;

  map.on("load", function () {
    // Basemap added here (not in the initial style) so a blocked OSM endpoint never
    // prevents the map from loading or the footprints/imagery from rendering.
    if (!map.getSource("osm")) {
      map.addSource("osm", {
        type: "raster",
        tiles: ["https://a.tile.openstreetmap.org/{z}/{x}/{y}.png"],
        tileSize: 256,
        attribution: "© OpenStreetMap contributors"
      });
      map.addLayer({ id: "osm", type: "raster", source: "osm", paint: { "raster-opacity": 0.85 } });
    }
    map.addSource("footprints", { type: "geojson", data: emptyFC() });
    map.addLayer({
      id: "footprints-fill", type: "fill", source: "footprints",
      paint: { "fill-color": "#4cc2ff", "fill-opacity": 0.12 }
    });
    map.addLayer({
      id: "footprints-line", type: "line", source: "footprints",
      paint: { "line-color": "#4cc2ff", "line-width": 1.5 }
    });
    mapReady = true;
    if (pendingFC) { var s = map.getSource("footprints"); if (s) s.setData(pendingFC); pendingFC = null; }
    if (pendingTiler) { applyRaster(pendingTiler); pendingTiler = null; }
  });

  function emptyFC() { return { type: "FeatureCollection", features: [] }; }

  // Safely update the footprints source even if the map's style/source isn't ready yet
  // (e.g. the user signs in before the map "load" event fires).
  function setFootprints(fc) {
    var src = map.getSource("footprints");
    if (src) { src.setData(fc); return; }
    pendingFC = fc;
  }

  // --- Satellite imagery raster layer ------------------------------------------------
  // Paints the actual pixels of the selected scene onto the map using its TiTiler XYZ
  // template (the same /item/tiles/... endpoint the Planetary Computer Explorer uses),
  // drawn beneath the footprint outlines so context stays visible.
  var RASTER_SRC = "item-raster";
  var RASTER_LYR = "item-raster-layer";

  function isCatalogOrigin(url) {
    try {
      var c = catalogUrl();
      return !!c && new URL(url).origin === new URL(c).origin;
    } catch (e) { return false; }
  }

  function clearItemRaster() {
    if (map.getLayer(RASTER_LYR)) map.removeLayer(RASTER_LYR);
    if (map.getSource(RASTER_SRC)) map.removeSource(RASTER_SRC);
  }

  function applyRaster(tiler) {
    clearItemRaster();
    if (!tiler || !tiler.tiles || !tiler.tiles.length) return;
    map.addSource(RASTER_SRC, {
      type: "raster",
      tiles: tiler.tiles,
      tileSize: 256,
      minzoom: tiler.minzoom || 8,
      maxzoom: tiler.maxzoom || 18,
      bounds: tiler.bounds || undefined,
      attribution: "Imagery: Microsoft Planetary Computer / ESA Sentinel-2"
    });
    var before = map.getLayer("footprints-fill") ? "footprints-fill" : undefined;
    map.addLayer({ id: RASTER_LYR, type: "raster", source: RASTER_SRC, paint: { "raster-opacity": 1 } }, before);
  }

  function addRasterToMap(tiler) {
    if (mapReady) applyRaster(tiler); else pendingTiler = tiler;
  }

  // Returns { tiles, minzoom, maxzoom, bounds } for a feature. Demo items carry a
  // precomputed "tiler" block; live catalog items expose a "tilejson" asset we resolve
  // (with the user's token) at click time.
  async function getTilerForFeature(f) {
    if (f.tiler && f.tiler.tiles && f.tiler.tiles.length) return f.tiler;
    var tjHref = f.assets && f.assets.tilejson && f.assets.tilejson.href;
    if (!tjHref) return null;
    try {
      var headers = {};
      if (isCatalogOrigin(tjHref)) { headers.Authorization = "Bearer " + (await getToken()); }
      var resp = await fetch(tjHref, { headers: headers });
      if (!resp.ok) return null;
      var tj = await resp.json();
      return { tiles: tj.tiles, minzoom: tj.minzoom, maxzoom: tj.maxzoom, bounds: tj.bounds };
    } catch (e) { return null; }
  }

  function showFeatureImagery(f) {
    getTilerForFeature(f).then(addRasterToMap).catch(function () { });
  }

  function selectFeature(f) {
    zoomToFeature(f);
    showItemPopup(f);
    showFeatureImagery(f);
  }

  // --- MSAL auth ---------------------------------------------------------------------
  var msalApp = null;
  var account = null;

  function isEntraConfigured() {
    return !!(CFG.entra && CFG.entra.clientId && CFG.entra.tenantId);
  }

  function initMsal() {
    msalApp = new msal.PublicClientApplication({
      auth: {
        clientId: CFG.entra.clientId,
        authority: "https://login.microsoftonline.com/" + CFG.entra.tenantId,
        redirectUri: window.location.origin + window.location.pathname
      },
      cache: { cacheLocation: "sessionStorage" }
    });
  }

  function showConfigBanner(html) {
    configBanner.innerHTML = html;
    configBanner.classList.remove("hidden");
  }

  function setSignedIn(name) {
    authDot.classList.add("on");
    authState.textContent = name ? ("Signed in — " + name) : "Signed in";
    authBtn.textContent = "Sign out";
  }
  function setSignedOut() {
    authDot.classList.remove("on");
    authState.textContent = "Not signed in";
    authBtn.textContent = "Sign in";
  }

  async function signIn() {
    if (!msalApp) return;
    var res = await msalApp.loginPopup({ scopes: [GEOCAT_SCOPE] });
    account = res.account;
    msalApp.setActiveAccount(account);
    setSignedIn(account && account.name);
    await loadCollections();
  }

  function signOut() {
    if (msalApp && account) { msalApp.logoutPopup({ account: account }); }
    account = null;
    setSignedOut();
    collectionSelect.innerHTML = '<option value="">— sign in to load —</option>';
    itemList.innerHTML = "";
    itemCount.textContent = "";
    setFootprints(emptyFC());
  }

  async function getToken() {
    var req = { scopes: [GEOCAT_SCOPE], account: account };
    try { var r = await msalApp.acquireTokenSilent(req); liveToken = r.accessToken; return r.accessToken; }
    catch (e) { var r2 = await msalApp.acquireTokenPopup(req); liveToken = r2.accessToken; return r2.accessToken; }
  }

  // --- GeoCatalog STAC calls ---------------------------------------------------------
  function catalogUrl() { return (catalogInput.value || "").replace(/\/+$/, ""); }

  async function stacGet(path) {
    var token = await getToken();
    var sep = path.indexOf("?") >= 0 ? "&" : "?";
    var url = catalogUrl() + path + sep + "api-version=" + encodeURIComponent(API_VERSION);
    var resp = await fetch(url, { headers: { Authorization: "Bearer " + token } });
    if (!resp.ok) throw new Error("HTTP " + resp.status + " for " + path);
    return resp.json();
  }

  async function loadCollections() {
    if (!catalogUrl()) { showConfigBanner("Enter your GeoCatalog URL above to load collections."); return; }
    try {
      var data = await stacGet("/stac/collections");
      var cols = (data && data.collections) || [];
      collectionSelect.innerHTML = "";
      if (!cols.length) {
        collectionSelect.innerHTML = '<option value="">(no collections yet)</option>';
        return;
      }
      cols.forEach(function (c) {
        var o = document.createElement("option");
        o.value = c.id; o.textContent = c.title || c.id;
        collectionSelect.appendChild(o);
      });
      var preferred = CFG.defaultCollectionId;
      if (preferred && cols.some(function (c) { return c.id === preferred; })) {
        collectionSelect.value = preferred;
      }
      await loadItems(collectionSelect.value);
    } catch (e) {
      showConfigBanner("Could not load collections: " + e.message +
        ". Check the GeoCatalog URL and that your account has data-plane access.");
    }
  }

  async function loadItems(collectionId) {
    if (!collectionId) return;
    itemList.innerHTML = '<div class="muted">Loading…</div>';
    try {
      var data = await stacGet("/stac/collections/" + encodeURIComponent(collectionId) + "/items?limit=50");
      var feats = (data && data.features) || [];
      var fc = { type: "FeatureCollection", features: feats.filter(function (f) { return f.geometry; }) };
      setFootprints(fc);
      fitTo(fc);
      renderItemList(feats);
      itemCount.textContent = "(" + feats.length + ")";
      clearItemRaster();
      if (feats.length) showFeatureImagery(feats[0]);
    } catch (e) {
      itemList.innerHTML = '<div class="muted">Could not load items: ' + e.message + "</div>";
    }
  }

  function renderItemList(feats) {
    itemList.innerHTML = "";
    feats.forEach(function (f) {
      var div = document.createElement("div");
      div.className = "item";
      var dt = (f.properties && (f.properties.datetime || f.properties["start_datetime"])) || "";
      div.innerHTML = "<b>" + (f.id || "item") + "</b><span>" + dt + "</span>";
      div.onclick = function () { selectFeature(f); };
      itemList.appendChild(div);
    });
  }

  function bboxOf(fc) {
    var b = [Infinity, Infinity, -Infinity, -Infinity];
    (fc.features || []).forEach(function (f) {
      coordsEach(f.geometry, function (c) {
        if (c[0] < b[0]) b[0] = c[0]; if (c[1] < b[1]) b[1] = c[1];
        if (c[0] > b[2]) b[2] = c[0]; if (c[1] > b[3]) b[3] = c[1];
      });
    });
    return isFinite(b[0]) ? b : null;
  }
  function coordsEach(geom, cb) {
    if (!geom) return;
    var walk = function (a) { if (typeof a[0] === "number") { cb(a); } else { a.forEach(walk); } };
    if (geom.coordinates) walk(geom.coordinates);
  }
  function fitTo(fc) {
    var b = bboxOf(fc);
    if (b) map.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: 40, maxZoom: 11, duration: 600 });
  }
  function zoomToFeature(f) { fitTo({ type: "FeatureCollection", features: [f] }); }

  // Is this asset served by the GeoCatalog itself (so it needs the bearer token)?
  // We only attach the token to same-origin catalog assets — never to third-party URLs,
  // to avoid leaking the access token to another origin.
  function isCatalogAsset(href) {
    try { return new URL(href, window.location.href).origin === new URL(catalogUrl()).origin; }
    catch (e) { return false; }
  }

  async function loadCatalogThumb(href, popup) {
    try {
      var token = await getToken();
      var resp = await fetch(href, { headers: { Authorization: "Bearer " + token } });
      if (!resp.ok) throw new Error("HTTP " + resp.status);
      var obj = URL.createObjectURL(await resp.blob());
      var root = popup.getElement && popup.getElement();
      var ph = root && root.querySelector("[data-thumb]");
      if (ph) { ph.outerHTML = "<img src='" + obj + "' alt='preview' />"; }
    } catch (e) {
      var root2 = popup.getElement && popup.getElement();
      var ph2 = root2 && root2.querySelector("[data-thumb]");
      if (ph2) { ph2.textContent = "preview unavailable"; }
    }
  }

  function showItemPopup(f) {
    var b = bboxOf({ type: "FeatureCollection", features: [f] });
    if (!b) return;
    var center = [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
    var assets = f.assets || {};
    var thumb = (assets.rendered_preview && assets.rendered_preview.href) ||
                (assets.preview && assets.preview.href) ||
                (assets.thumbnail && assets.thumbnail.href) || "";
    var dt = (f.properties && f.properties.datetime) || "";
    var cloud = (f.properties && f.properties["eo:cloud_cover"]);
    var html = "<b>" + (f.id || "item") + "</b><br /><span style='color:#97a3bd'>" + dt + "</span>";
    if (cloud != null) html += "<br /><span style='color:#97a3bd'>cloud: " + Math.round(cloud) + "%</span>";
    var needsToken = thumb && isCatalogAsset(thumb);
    if (thumb && !needsToken) { html += "<img src='" + thumb + "' alt='preview' />"; }
    else if (needsToken) { html += "<div data-thumb style='color:#97a3bd;margin-top:6px'>loading preview…</div>"; }
    var popup = new maplibregl.Popup({ maxWidth: "260px" }).setLngLat(center).setHTML(html).addTo(map);
    if (needsToken) { loadCatalogThumb(thumb, popup); }
  }

  // --- Offline demo mode -------------------------------------------------------------
  // Loads bundled sample STAC data (assets/demo/catalog.json) so StormLens can be
  // explored locally with no Azure sign-in and no live catalog. Used automatically when
  // Entra is not configured, or forced with ?demo=1 in the URL.
  var demoItems = {};

  function showDemoItems(collectionId) {
    var feats = demoItems[collectionId] || [];
    var fc = { type: "FeatureCollection", features: feats.filter(function (f) { return f.geometry; }) };
    setFootprints(fc);
    fitTo(fc);
    renderItemList(feats);
    itemCount.textContent = "(" + feats.length + ")";
    clearItemRaster();
    if (feats.length) showFeatureImagery(feats[0]);
  }

  async function enterDemoMode() {
    authBtn.disabled = true;
    authBtn.textContent = "Demo";
    authDot.classList.add("on");
    authState.textContent = "Demo data (no sign-in)";
    catalogInput.value = "bundled sample data";
    catalogInput.disabled = true;
    showConfigBanner(
      "Showing bundled <b>demo</b> data so you can explore StormLens locally &mdash; no Azure sign-in " +
      "and no live catalog needed. To connect your real GeoCatalog, set the Entra <code>clientId</code> " +
      "and <code>tenantId</code> in <code>assets/app-config.js</code>."
    );
    try {
      var resp = await fetch("assets/demo/catalog.json", { cache: "no-store" });
      if (!resp.ok) throw new Error("HTTP " + resp.status);
      var demo = await resp.json();
      var cols = demo.collections || [];
      demoItems = demo.items || {};
      collectionSelect.innerHTML = "";
      cols.forEach(function (c) {
        var o = document.createElement("option");
        o.value = c.id; o.textContent = c.title || c.id;
        collectionSelect.appendChild(o);
      });
      collectionSelect.onchange = function () { showDemoItems(collectionSelect.value); };
      var preferred = CFG.defaultCollectionId;
      var start = (preferred && demoItems[preferred]) ? preferred : (cols[0] && cols[0].id);
      if (start) { collectionSelect.value = start; showDemoItems(start); }
    } catch (e) {
      showConfigBanner("Could not load demo data: " + e.message);
    }
  }

  // --- Wire up UI --------------------------------------------------------------------
  authBtn.onclick = function () { account ? signOut() : signIn().catch(function (e) { alert(e.message); }); };
  collectionSelect.onchange = function () { loadItems(collectionSelect.value); };
  catalogInput.onchange = function () { if (account) loadCollections(); };

  var forceDemo = /[?&]demo=1/.test(window.location.search);
  if (forceDemo || !isEntraConfigured()) {
    enterDemoMode();
  } else {
    initMsal();
    setSignedOut();
  }
})();
