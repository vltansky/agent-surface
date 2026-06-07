// ---------------------------------------------------------------------------
// Bridge script — injected into every served page.
// Provides window.__as.done(data) and window.__as.cancel().
// PORT_PLACEHOLDER is replaced with the actual port at serve time.
// ---------------------------------------------------------------------------
export const BRIDGE_SCRIPT = `
<script>
(function() {
  var baseUrl = 'http://127.0.0.1:PORT_PLACEHOLDER';
  var sessionToken = 'SESSION_TOKEN_PLACEHOLDER';
  var authQuery = '?token=' + encodeURIComponent(sessionToken);
  var callbackUrl = baseUrl + '/callback' + authQuery;
  var submitted = false;
  var requestDelivered = false;
  var multiMode = MULTI_PLACEHOLDER;
  var watchMode = WATCH_PLACEHOLDER;
  window.__as = window.__as || {};
  window.__as.sessionToken = sessionToken;

  window.__as.done = function(data) {
    if (submitted) return;
    submitted = true;
    var payload = { action: 'done', data: data || {} };
    showDone(payload);
    post(payload);
  };
  window.__as.cancel = function() {
    if (submitted) return;
    submitted = true;
    showDone(null);
    post({ action: 'cancel' });
  };
  window.__as.regenerate = function(data) {
    if (!multiMode) { window.__as.done(data); return; }
    submitted = true;
    post({ action: 'regenerate', data: data || {} });
  };

  // SSE listener for multi-step — receives loading/data/done events from server
  var dataSubscribers = [];
  if (multiMode) {
    var evtSource = new EventSource(baseUrl + '/events' + authQuery);
    evtSource.addEventListener('done', function() {
      evtSource.close();
      if (!submitted) showDone(null);
    });
    evtSource.addEventListener('auto-submit', function() {
      if (window.__as._autoSubmit) {
        window.__as._autoSubmit();
      }
    });
    evtSource.addEventListener('data', function(e) {
      var parsed;
      try { parsed = JSON.parse(e.data); } catch (_) { return; }
      for (var i = 0; i < dataSubscribers.length; i++) {
        try { dataSubscribers[i](parsed); } catch (_) {}
      }
    });
  }
  window.__as.subscribe = function(handler) {
    if (typeof handler === 'function') dataSubscribers.push(handler);
  };

  var _lastPayload = null;
  function post(payload) {
    _lastPayload = payload;
    requestDelivered = false;
    var xhr = new XMLHttpRequest();
    xhr.open('POST', callbackUrl, true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.setRequestHeader('X-AU-Session-Token', sessionToken);
    xhr.onerror = function() { if (!requestDelivered) showRecovery(payload); };
    xhr.onload = function() {
      if (xhr.status >= 200 && xhr.status < 300) {
        requestDelivered = true;
        return;
      }
      if (!requestDelivered) showRecovery(payload);
    };
    xhr.send(JSON.stringify(payload));
  }
  function showRecovery(payload) {
    var json = JSON.stringify(payload, null, 2);
    var blob = new Blob([json], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    document.body.innerHTML =
      '<div style="display:flex;align-items:center;justify-content:center;' +
      'height:100vh;font-family:system-ui,sans-serif;flex-direction:column;gap:16px;padding:32px">' +
      '<p style="font-size:1.125rem;font-weight:600;color:#991b1b">Could not reach the CLI server</p>' +
      '<p style="color:#78716c;font-size:0.875rem;max-width:400px;text-align:center">The server may have exited or timed out. Your feedback is preserved below.</p>' +
      '<div style="display:flex;gap:8px">' +
      '<a href="' + url + '" download="au-feedback.json" style="display:inline-flex;align-items:center;gap:6px;padding:8px 16px;background:#1c1917;color:#fff;border-radius:8px;text-decoration:none;font-size:13px;font-weight:500">' +
      '<svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M8 2v8m0 0l-3-3m3 3l3-3M3 14h10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
      'Download JSON</a>' +
      '<button onclick="navigator.clipboard.writeText(document.getElementById(\\x27au-json\\x27).textContent).then(function(){this.textContent=\\x27Copied!\\x27;}.bind(this))" ' +
      'style="padding:8px 16px;background:#f5f5f0;border:1px solid #e8e6e1;border-radius:8px;font-size:13px;font-weight:500;cursor:pointer">Copy to clipboard</button>' +
      '</div>' +
      '<pre id="au-json" style="background:#1e1e1e;color:#d4d4d4;padding:16px 20px;border-radius:8px;font-size:12px;max-width:600px;width:100%;overflow:auto;max-height:300px;margin:0">' +
      json.replace(/</g,'&lt;').replace(/>/g,'&gt;') + '</pre></div>';
  }
  function showDone(payload) {
    var actionsHtml = '';
    if (payload && payload.data && Object.keys(payload.data).length > 0) {
      var json = JSON.stringify(payload.data, null, 2);
      var blob = new Blob([json], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      actionsHtml =
        '<div style="display:flex;gap:8px;margin-top:4px">' +
        '<a href="' + url + '" download="au-result.json" style="display:inline-flex;align-items:center;gap:6px;padding:8px 16px;background:#1c1917;color:#fff;border-radius:8px;text-decoration:none;font-size:13px;font-weight:500">' +
        '<svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M8 2v8m0 0l-3-3m3 3l3-3M3 14h10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
        'Download JSON</a>' +
        '<button onclick="navigator.clipboard.writeText(document.getElementById(\\x27au-done-json\\x27).textContent).then(function(){this.textContent=\\x27Copied!\\x27;}.bind(this))" ' +
        'style="padding:8px 16px;background:#f5f5f0;border:1px solid #e8e6e1;border-radius:8px;font-size:13px;font-weight:500;cursor:pointer">Copy</button>' +
        '</div>' +
        '<pre id="au-done-json" style="background:#1e1e1e;color:#d4d4d4;padding:16px 20px;border-radius:8px;font-size:12px;max-width:600px;width:100%;overflow:auto;max-height:240px;margin:0">' +
        json.replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</pre>';
    }
    document.body.innerHTML =
      '<div style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:system-ui,sans-serif;flex-direction:column;gap:12px;padding:32px">' +
      '<div style="width:56px;height:56px;background:#dcfce7;border-radius:50%;display:flex;align-items:center;justify-content:center">' +
      '<svg width="28" height="28" viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="#16a34a" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
      '</div>' +
      '<p style="font-size:1.25rem;font-weight:600;margin:0">Done!</p>' +
      '<p style="color:#78716c;font-size:0.875rem;margin:0">The CLI has received your response.</p>' +
      (actionsHtml ? '<p style="color:#a8a29e;font-size:0.8rem;margin:0">In case something went wrong:</p>' : '') +
      actionsHtml +
      '</div>';
  }
  // In watch mode the server's lifecycle is governed by the 30s last-client-disconnect
  // grace period, not by tab-close. A cancel beacon would race that and kill the daemon.
  if (!watchMode) {
    window.addEventListener('beforeunload', function() {
      if (!submitted) {
        navigator.sendBeacon(callbackUrl, JSON.stringify({ action: 'cancel' }));
      }
    });
  }
})();
</script>
`;


export function buildJsxShell(bundledSource: string, dataJson: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
  <title>Agent UI</title>
  <script src="https://cdn.tailwindcss.com"><\/script>
  <script src="https://unpkg.com/react@18/umd/react.production.min.js" crossorigin><\/script>
  <script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js" crossorigin><\/script>
  <style>
    body { margin: 0; }
    #root { min-height: 100vh; }
  </style>
</head>
<body>
  <div id="root"></div>
  <script>
    window.__as = window.__as || {};
    window.__as.data = ${dataJson.replace(/<\//g, "<\\/")};
  </script>
  BRIDGE_INJECT_POINT
  <script>
${bundledSource.replace(/<\//g, "<\\/")}
  <\/script>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// HTML injection — insert bridge before </body> or append
// ---------------------------------------------------------------------------
export function injectBridge(html: string, port: number, multi: boolean, dataJson = "{}", sessionToken = "", watchMode = false): string {
  const bridge = BRIDGE_SCRIPT
    .replace(/PORT_PLACEHOLDER/g, String(port))
    .replace(/MULTI_PLACEHOLDER/g, String(multi))
    .replace(/WATCH_PLACEHOLDER/g, String(watchMode))
    .replace(/SESSION_TOKEN_PLACEHOLDER/g, sessionToken);
  const dataBootstrap = `<script>window.__as = window.__as || {}; window.__as.data = ${dataJson.replace(/<\//g, "<\\/")};</script>`;
  // For JSX shells: inject at the marked point (before Babel script). dataBootstrap is already in shell.
  if (html.includes("BRIDGE_INJECT_POINT")) {
    return html.replace("BRIDGE_INJECT_POINT", bridge);
  }
  const faviconTag = '<link rel="icon" type="image/svg+xml" href="/favicon.svg" />';
  // For raw HTML: add favicon in <head> when available.
  let withFavicon = html;
  if (withFavicon.includes("</head>") && !withFavicon.includes('href="/favicon.svg"')) {
    withFavicon = withFavicon.replace("</head>", faviconTag + "</head>");
  }
  // For raw HTML: dataBootstrap must run BEFORE any inline <script> in the page so they see window.__as.data.
  // Insert before the first <script> tag (head or body); fall back to before </body>; fall back to append.
  let withData: string;
  const firstScriptMatch = withFavicon.match(/<script[\s>]/i);
  if (firstScriptMatch && firstScriptMatch.index !== undefined) {
    withData = withFavicon.slice(0, firstScriptMatch.index) + dataBootstrap + withFavicon.slice(firstScriptMatch.index);
  } else if (withFavicon.includes("</head>")) {
    withData = withFavicon.replace("</head>", dataBootstrap + "</head>");
  } else if (withFavicon.includes("</body>")) {
    withData = withFavicon.replace("</body>", dataBootstrap + "</body>");
  } else {
    withData = withFavicon + dataBootstrap;
  }
  // Bridge IIFE goes at end of body so DOM is parsed before it runs.
  if (withData.includes("</body>")) {
    return withData.replace("</body>", bridge + "</body>");
  }
  return withData + bridge;
}

// ---------------------------------------------------------------------------
// Favicon — inline AU logo served at /favicon.svg
// ---------------------------------------------------------------------------
export const AGENT_UI_FAVICON_SVG = `<svg width="80" height="80" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M12 51V44.4286H15.2582V51H12ZM15.2582 44.4286V41.1429H18.5164V44.4286H15.2582ZM18.5164 41.1429V37.8571H21.7745V41.1429H18.5164ZM21.7745 37.8571V34.5714H25.0327V37.8571H21.7745ZM25.0327 34.5714V28H28.2909V34.5714H25.0327Z" fill="black"/>
<path d="M35.1127 51V47.7143H44.8873V51H35.1127ZM44.8873 47.7143V44.4286H48.1455V47.7143H44.8873ZM31.8545 47.7143V31.2857H35.1127V47.7143H31.8545ZM44.8873 34.5714V31.2857H48.1455V34.5714H44.8873ZM35.1127 31.2857V28H44.8873V31.2857H35.1127Z" fill="black"/>
<path d="M64.7418 51V47.7143H68V51H64.7418ZM61.4836 47.7143V44.4286H64.7418V47.7143H61.4836ZM58.2255 44.4286V41.1429H61.4836V44.4286H58.2255ZM58.2255 37.8571V34.5714H61.4836V37.8571H58.2255ZM61.4836 34.5714V31.2857H64.7418V34.5714H61.4836ZM51.7091 51V28H54.9673V37.8571H58.2255V41.1429H54.9673V51H51.7091ZM64.7418 31.2857V28H68V31.2857H64.7418Z" fill="black"/>
</svg>`;

// ---------------------------------------------------------------------------
// MIME type map for static file serving
// ---------------------------------------------------------------------------
export const MIME_TYPES: Record<string, string> = {
  ".html": "text/html", ".htm": "text/html",
  ".css": "text/css", ".js": "text/javascript",
  ".json": "application/json", ".svg": "image/svg+xml",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".gif": "image/gif", ".ico": "image/x-icon",
  ".woff": "font/woff", ".woff2": "font/woff2",
  ".ttf": "font/ttf", ".eot": "application/vnd.ms-fontobject",
};
