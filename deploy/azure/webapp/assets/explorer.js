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
  var map = new maplibregl.Map({
    container: "map",
    style: {
      version: 8,
      sources: {
        osm: {
          type: "raster",
          tiles: ["https://a.tile.openstreetmap.org/{z}/{x}/{y}.png"],
          tileSize: 256,
          attribution: "© OpenStreetMap contributors"
        }
      },
      layers: [
        { id: "bg", type: "background", paint: { "background-color": "#0b1020" } },
        { id: "osm", type: "raster", source: "osm", paint: { "raster-opacity": 0.85 } }
      ]
    },
    center: [-90.19, 29.1], // Port Fourchon, Gulf of Mexico
    zoom: 6
  });
  map.addControl(new maplibregl.NavigationControl(), "top-right");

  map.on("load", function () {
    map.addSource("footprints", { type: "geojson", data: emptyFC() });
    map.addLayer({
      id: "footprints-fill", type: "fill", source: "footprints",
      paint: { "fill-color": "#4cc2ff", "fill-opacity": 0.12 }
    });
    map.addLayer({
      id: "footprints-line", type: "line", source: "footprints",
      paint: { "line-color": "#4cc2ff", "line-width": 1.5 }
    });
  });

  function emptyFC() { return { type: "FeatureCollection", features: [] }; }

  // --- MSAL auth ---------------------------------------------------------------------
  var msalApp = null;
  var account = null;

  function initMsal() {
    if (!CFG.entra || !CFG.entra.clientId || !CFG.entra.tenantId) {
      showConfigBanner(
        "Sign-in is not configured yet. Set the Entra <code>clientId</code> and <code>tenantId</code> " +
        "in <code>assets/app-config.js</code> (the deployment can do this for you). You can still paste a " +
        "GeoCatalog URL, but the browser needs an app registration to obtain a token."
      );
      authBtn.disabled = true;
      return;
    }
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
    map.getSource("footprints") && map.getSource("footprints").setData(emptyFC());
  }

  async function getToken() {
    var req = { scopes: [GEOCAT_SCOPE], account: account };
    try { return (await msalApp.acquireTokenSilent(req)).accessToken; }
    catch (e) { return (await msalApp.acquireTokenPopup(req)).accessToken; }
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
      map.getSource("footprints").setData(fc);
      fitTo(fc);
      renderItemList(feats);
      itemCount.textContent = "(" + feats.length + ")";
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
      div.onclick = function () { zoomToFeature(f); showItemPopup(f); };
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
    if (thumb) html += "<img src='" + thumb + "' alt='preview' />";
    new maplibregl.Popup({ maxWidth: "260px" }).setLngLat(center).setHTML(html).addTo(map);
  }

  // --- Wire up UI --------------------------------------------------------------------
  authBtn.onclick = function () { account ? signOut() : signIn().catch(function (e) { alert(e.message); }); };
  collectionSelect.onchange = function () { loadItems(collectionSelect.value); };
  catalogInput.onchange = function () { if (account) loadCollections(); };

  initMsal();
  setSignedOut();
})();
