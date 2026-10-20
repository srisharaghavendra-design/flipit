// Per-browser sandbox. Loaded only after sign-in. When the preview flag is off, this file does nothing.
(function () {
  if (window.__MOPS_SANDBOX__ !== true) return;
  var HASH = 'mops_box_hash';
  var LOG = 'mops_box_log';
  var EXP = 'mops_box_exp';
  var BOX_MS = 2 * 60 * 60 * 1000;
  var CAP = 80;

  function readLog() {
    try { return JSON.parse(localStorage.getItem(LOG) || '[]'); } catch (e) { return []; }
  }
  function fresh() {
    localStorage.removeItem(HASH);
    localStorage.removeItem(LOG);
    localStorage.setItem(EXP, String(Date.now() + BOX_MS));
  }
  function expired() {
    var exp = Number(localStorage.getItem(EXP) || 0);
    if (!exp || Date.now() > exp) { fresh(); return true; }
    return false;
  }
  expired();

  var orig = window.fetch.bind(window);
  var syncing = null;
  function replay() {
    if (syncing) return syncing;
    syncing = orig('/api/sandbox/sync', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ log: readLog() })
    }).then(function (r) { return r.json(); }).then(function (j) {
      if (j && j.hash) localStorage.setItem(HASH, j.hash);
    }).finally(function () { syncing = null; });
    return syncing;
  }

  window.fetch = function (url, opt) {
    expired();
    var opts = opt ? Object.assign({}, opt) : {};
    var href = typeof url === 'string' ? url : (url && url.url) || '';
    var method = String(opts.method || 'GET').toUpperCase();
    var track = method !== 'GET' && method !== 'HEAD' && href.indexOf('/api/platform') === 0;
    var headers = new Headers(opts.headers || (typeof url !== 'string' && url && url.headers) || {});
    var hash = localStorage.getItem(HASH);
    if (hash && (href.indexOf('/api/platform') === 0 || href.indexOf('/platform') === 0)) headers.set('x-mops-sandbox', hash);
    opts.headers = headers;
    return orig(url, opts).then(function (res) {
      if (res.status === 409 && res.headers.get('x-mops-replay') === '1' && href.indexOf('/api/sandbox/sync') !== 0) {
        return replay().then(function () {
          var again = new Headers(opts.headers || {});
          var next = localStorage.getItem(HASH);
          if (next) again.set('x-mops-sandbox', next);
          else again.delete('x-mops-sandbox');
          opts.headers = again;
          return orig(url, opts);
        });
      }
      return res;
    }).then(function (res) {
      var advanced = res.headers.get('x-mops-sandbox-next');
      if (advanced && track) {
        localStorage.setItem(HASH, advanced);
        var log = readLog();
        var body = typeof opts.body === 'string' ? opts.body : '';
        log.push({ m: method, u: href, b: body, user: window.__MOPS_UID || '' });
        localStorage.setItem(LOG, JSON.stringify(log.slice(-CAP)));
      }
      return res;
    });
  };

  window.mopsSandboxReset = function () {
    localStorage.removeItem(HASH);
    localStorage.removeItem(LOG);
    localStorage.removeItem(EXP);
  };

  // Report downloads are plain links, so they cannot send the sandbox header.
  document.addEventListener('click', function (ev) {
    var node = ev.target;
    var a = node && node.closest ? node.closest('a') : null;
    if (!a) return;
    var href = a.getAttribute('href') || '';
    if (href.indexOf('/api/platform') !== 0) return;
    var hash = localStorage.getItem(HASH);
    if (!hash || /(?:\?|&)box=/.test(href)) return;
    ev.preventDefault();
    window.location.assign(href + (href.indexOf('?') === -1 ? '?' : '&') + 'box=' + encodeURIComponent(hash));
  }, true);
})();
