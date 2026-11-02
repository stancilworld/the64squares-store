// Small script added to every admin page (through the admin's Vite config). It:
// - hides menu items a moderator is not allowed to use (Settings → Staff & permissions);
//   only tidiness, the server checks every action anyway (src/api/staff-guard.ts)
// - hides technical settings from the menu (they're listed under Settings → Advanced settings)
// - hides the links to Medusa's documentation and changelog
// - shows "Stancil Admin" and the Stancil logo in the browser tab instead of Medusa
// - opens the Dashboard after signing in, instead of the Orders list
import { ADMIN_FAVICON } from "./brand/admin-favicon"

// Menu link → the permission it needs: "admin" = admin only, a list = any of them.
const NAV: Record<string, string | string[]> = {
  "/app/orders": "orders.view",
  "/app/draft-orders": "orders.view",
  "/app/customers": "customers.view",
  "/app/customer-groups": "customers.view",
  "/app/promotions": "promotions.manage",
  "/app/campaigns": "promotions.manage",
  "/app/price-lists": "products.prices",
  "/app/subscribers": "subscribers.view",
  "/app/characters": "content.characters",
  "/app/product-editor": "products.edit",
  "/app/product-order": "products.edit",
  "/app/website/contact": "content.contact",
  "/app/website/chatbot": ["content.chatbot", "messages.view"],
  "/app/messages": ["messages.view", "mailbox.view"],
  "/app/website": [
    "content.homepage",
    "content.about",
    "content.footer",
    "content.characters",
    "content.blog",
    "content.help",
    "content.contact",
    "content.chatbot",
    "settings.branding",
  ],
  "/app/website/homepage": "content.homepage",
  "/app/website/about-us": "content.about",
  "/app/website/footer": "content.footer",
  "/app/website/navigation": "content.footer",
  "/app/website/blog": "content.blog",
  "/app/website/help-pages": "content.help",
  "/app/settings/branding": "settings.branding",
  "/app/settings/store": "settings.store",
  "/app/settings/payments": "settings.store",
  "/app/settings/invoices": "settings.store",
  "/app/settings/return-reasons": "settings.store",
  "/app/settings/product-types": "products.edit",
  "/app/settings/product-tags": "products.edit",
  "/app/settings/locations": "settings.shipping",
  "/app/settings/upload-limits": "settings.branding",
  "/app/settings/users": "admin",
  "/app/settings/staff": "admin",
  "/app/settings/activity": "admin",
  "/app/settings/advanced": "admin",
}

// Hidden from the Settings menu for everyone; listed under Settings → Advanced settings.
const ADVANCED = [
  "/app/settings/regions",
  "/app/settings/tax-regions",
  "/app/settings/sales-channels",
  "/app/settings/refund-reasons",
  "/app/settings/publishable-api-keys",
  "/app/settings/secret-api-keys",
  "/app/settings/workflows",
  "/app/settings/search",
  "/app/settings/translations",
  "/app/settings/locales",
]

// A menu link plus the wrapper around it, so hiding it leaves no gap.
const hideSel = (h: string) =>
  `a[href="${h}"]:not([data-keep]),div:has(> div > a[href="${h}"]:not([data-keep]))`

const ALWAYS_CSS = [
  // Technical settings links.
  ADVANCED.map(hideSel).join(",") + "{display:none!important}",
  // Dashboard first in the main menu, right under Search.
  `nav .flex-col > div:first-child{order:-2}`,
  `nav .flex-col > div:has(> div > a[href="/app/dashboard"]){order:-1}`,
  // The settings menu's "Developer" group is then empty: hide its heading too.
  `[data-stancil-hide]{display:none!important}`,
  // Medusa documentation / changelog links in the user menu.
  `a[href^="https://docs.medusajs.com"],a[href^="https://medusajs.com"]{display:none!important}`,
  // ...and the divider under them, so there's no double line.
  `a[href^="https://medusajs.com"] + [role="separator"]{display:none!important}`,
].join("\n")

const script = (backendUrl: string) => `
(function () {
  var BACKEND = ${JSON.stringify(backendUrl.replace(/\/$/, ""))};
  var NAV = ${JSON.stringify(NAV)};
  function hideSel(h) { return 'a[href="' + h + '"]:not([data-keep]),div:has(> div > a[href="' + h + '"]:not([data-keep]))'; }
  var FAVICON = ${JSON.stringify(ADMIN_FAVICON)};

  var always = document.createElement("style");
  always.textContent = ${JSON.stringify(ALWAYS_CSS)};
  document.head.appendChild(always);
  var style = document.createElement("style");
  document.head.appendChild(style);

  // Browser tab: Stancil name and logo.
  function fixHead() {
    var t = document.title;
    if (t.indexOf("Medusa") >= 0) {
      document.title = t === "Medusa" ? "Stancil Admin" : t.replace(/ - Medusa$/, " - Stancil Admin").replace(/Medusa/g, "Stancil");
    }
    var icon = document.querySelector('link[rel="icon"]');
    if (icon && icon.getAttribute("href") !== FAVICON) icon.setAttribute("href", FAVICON);
  }
  fixHead();
  new MutationObserver(fixHead).observe(document.head, { childList: true, subtree: true, characterData: true });

  // Hide a settings group heading when every link under it is hidden.
  function tidyGroups() {
    var heads = document.querySelectorAll("aside p, nav p");
    for (var i = 0; i < heads.length; i++) {
      var p = heads[i];
      if (p.textContent.trim() !== "Developer") continue;
      var box = p.closest("div");
      while (box && box.querySelectorAll("a").length === 0) box = box.parentElement;
      if (!box) continue;
      var links = box.querySelectorAll("a"), visible = 0;
      for (var j = 0; j < links.length; j++) if (getComputedStyle(links[j]).display !== "none") visible++;
      if (visible === 0) box.setAttribute("data-stancil-hide", "");
    }
  }
  new MutationObserver(function () { clearTimeout(tidyGroups.t); tidyGroups.t = setTimeout(tidyGroups, 50); })
    .observe(document.documentElement, { childList: true, subtree: true });

  var timer = null;
  function allowed(staff, need) {
    if (need === "admin") return false;
    if (Array.isArray(need)) return need.some(function (n) { return staff.permissions.indexOf(n) >= 0; });
    return staff.permissions.indexOf(need) >= 0;
  }
  function apply(staff) {
    if (!staff || staff.role === "admin") { style.textContent = ""; return; }
    var hide = [];
    for (var href in NAV) if (!allowed(staff, NAV[href])) hide.push(hideSel(href));
    style.textContent = hide.length ? hide.join(",") + "{display:none!important}" : "";
  }
  function load() {
    clearTimeout(timer);
    timer = setTimeout(function () {
      fetch(BACKEND + "/admin/staff/me", { credentials: "include" })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (d) { apply(d && d.staff); })
        .catch(function () {});
    }, 150);
  }

  // Open the Dashboard (not Orders) after signing in or when opening the admin's front door.
  var last = location.pathname;
  function landing(path) {
    var from = last;
    last = path;
    if (path === "/app/orders" && !location.search && (from === "/app/login" || from === "/app" || from === "/app/")) {
      setTimeout(function () {
        history.replaceState(null, "", "/app/dashboard");
        last = "/app/dashboard";
        window.dispatchEvent(new PopStateEvent("popstate", { state: null }));
      }, 0);
    }
  }

  ["pushState", "replaceState"].forEach(function (m) {
    var orig = history[m];
    history[m] = function () {
      var out = orig.apply(this, arguments);
      landing(location.pathname);
      load();
      return out;
    };
  });
  window.addEventListener("popstate", function () { last = location.pathname; load(); });
  window.addEventListener("focus", load);
  load();
})();
`

// Vite plugin that adds the script to the admin's index.html.
export const adminNavGuard = (backendUrl: string) => ({
  name: "stancil-admin-nav-guard",
  transformIndexHtml() {
    return [
      { tag: "title", children: "Stancil Admin", injectTo: "head" as const },
      { tag: "script", children: script(backendUrl), injectTo: "body" as const },
    ]
  },
})
