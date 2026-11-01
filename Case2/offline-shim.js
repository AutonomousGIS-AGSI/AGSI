// offline-shim.js — redirects /api/* requests to bundled files.
(function () {
    if (!window.OFFLINE_CONVERSATION_ID) return;
    var CONV = window.OFFLINE_CONVERSATION_ID;
    var TASK = window.OFFLINE_TASK_ID || CONV;

    // Every file in the bundle (paths relative to this folder), so artifact
    // requests can be matched even when the UI builds an incomplete path
    // such as figures/<name>.png for a file saved under figures/auto/.
    var FILES = {};
    var BY_NAME = {};
    (window.__OFFLINE_FILES__ || []).forEach(function (f) {
        FILES[f] = true;
        var name = f.slice(f.lastIndexOf('/') + 1);
        (BY_NAME[name] = BY_NAME[name] || []).push(f);
    });
    var HAVE_INDEX = !!window.__OFFLINE_FILES__;

    function pathOf(u) {
        try { var p = new URL(u, location.href); return p.pathname + p.search; }
        catch (_) { return String(u || ''); }
    }
    function stripQ(p) { var i = p.indexOf('?'); return i === -1 ? p : p.slice(0, i); }
    function decode(p) { try { return decodeURIComponent(p); } catch (_) { return p; } }

    // Resolve an artifact path (as the UI requested it) to a bundled file.
    function resolveArtifact(rel) {
        rel = decode(rel).replace(/\\/g, '/').replace(/^\/+/, '');
        var candidates = ['artifacts/' + rel, 'artifacts/' + TASK + '/' + rel];
        if (!HAVE_INDEX) return candidates[0];
        for (var i = 0; i < candidates.length; i++) {
            if (FILES[candidates[i]]) return candidates[i];
        }
        // Same filename elsewhere in the bundle: prefer this task's copy,
        // then the one whose path shares the most trailing segments.
        var name = rel.slice(rel.lastIndexOf('/') + 1);
        var hits = (BY_NAME[name] || []).filter(function (f) { return f.indexOf('artifacts/') === 0; });
        if (hits.length) {
            var own = hits.filter(function (f) { return f.indexOf('artifacts/' + TASK + '/') === 0; });
            if (own.length) hits = own;
            var segs = rel.split('/');
            hits.sort(function (a, b) { return score(b) - score(a); });
            function score(f) {
                var fs = f.split('/'), n = 0;
                while (n < segs.length && n < fs.length && fs[fs.length - 1 - n] === segs[segs.length - 1 - n]) n++;
                return n;
            }
            return hits[0];
        }
        return candidates[1];
    }

    // Map an /api/... path to a bundled file path (or a stub object).
    function rewrite(rawPath) {
        var p = stripQ(pathOf(rawPath));

        if (p === '/api/conversations' && window.__OFFLINE_CONVERSATIONS__) return { stub: window.__OFFLINE_CONVERSATIONS__ };
        if (p === '/api/conversations/' + CONV && window.__OFFLINE_CONVERSATION__) return { stub: window.__OFFLINE_CONVERSATION__ };
        if (p === '/api/workflow/steps/' + TASK && window.__OFFLINE_WORKFLOW_STEPS__) return { stub: window.__OFFLINE_WORKFLOW_STEPS__ };
        if (p === '/api/conversations') return { file: 'data/conversations.json' };
        if (p === '/api/conversations/' + CONV) return { file: 'data/conversation.json' };
        if (p === '/api/workflow/steps/' + TASK) return { file: 'data/workflow_steps.json' };
        if (p === '/api/research-plan/' + TASK)
            return { file: 'artifacts/' + TASK + '/research_plan_viz/research_plan_' + TASK + '.html' };
        if (p === '/api/research-plan-flowchart/' + TASK)
            return { file: 'artifacts/' + TASK + '/research_plan_viz/research_plan_flowchart_' + TASK + '.html' };
        if (p === '/api/research-plan-geoprocessing/' + TASK)
            return { file: 'artifacts/' + TASK + '/research_plan_viz/research_plan_geoprocessing_' + TASK + '.html' };
        if (p === '/api/graph/' + TASK)
            return { file: 'artifacts/' + TASK + '/graphfiles/' + TASK + '.html' };

        var a = p.indexOf('/api/artifacts/');
        if (a !== -1) return { file: resolveArtifact(p.slice(a + '/api/artifacts/'.length)) };
        var u = p.indexOf('/api/uploads/');
        if (u !== -1) return { file: 'uploads/' + decode(p.slice(u + '/api/uploads/'.length)) };
        if (p === '/api/health') return { stub: { status: 'ok' } };
        if (p === '/api/clear-key') return { stub: { status: 'ok' } };
        if (p.indexOf('/api/tif_bounds/') === 0) return { stub: { error: 'unavailable offline' } };

        return null;
    }

    // Bundled file path for a URL, or null if it isn't an /api/ URL we can serve.
    function localFile(v) {
        if (typeof v !== 'string' || v.indexOf('/api/') === -1) return null;
        try { var m = rewrite(v); return m && m.file ? encodeURI(m.file) : null; }
        catch (_) { return null; }
    }

    function jsonResp(obj, status) {
        return new Response(JSON.stringify(obj), {
            status: status || 200,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    var _nativeFetch = window.fetch.bind(window);
    window.fetch = function (input, init) {
        var url = typeof input === 'string' ? input : (input && input.url) || '';
        if (url.indexOf('/api/') === -1) return _nativeFetch(input, init);

        var method = ((init && init.method) || 'GET').toUpperCase();
        if (method !== 'GET' && method !== 'HEAD') {
            // No backend in offline mode — silently succeed without doing anything.
            return Promise.resolve(jsonResp({
                success: false,
                error: 'Offline read-only snapshot — interactive actions are disabled.',
            }, 200));
        }

        var m = rewrite(url);
        if (!m) return Promise.resolve(jsonResp({ error: 'Not available offline' }, 404));
        if (m.stub) return Promise.resolve(jsonResp(m.stub));

        return _nativeFetch(encodeURI(m.file), method === 'HEAD' ? { method: 'HEAD' } : undefined);
    };

    // Intercept src/href property assignments so images, iframes, and download
    // links load bundled files instead of the (absent) backend.
    function hookProperty(proto, prop) {
        var desc = proto && Object.getOwnPropertyDescriptor(proto, prop);
        if (!desc || !desc.set) return;
        Object.defineProperty(proto, prop, {
            configurable: true,
            enumerable: true,
            get: desc.get,
            set: function (v) {
                var f = localFile(v);
                return desc.set.call(this, f || v);
            },
        });
    }
    hookProperty(window.HTMLIFrameElement && HTMLIFrameElement.prototype, 'src');
    hookProperty(window.HTMLImageElement && HTMLImageElement.prototype, 'src');
    hookProperty(window.HTMLAnchorElement && HTMLAnchorElement.prototype, 'href');
    hookProperty(window.HTMLSourceElement && HTMLSourceElement.prototype, 'src');

    // Elements inserted through innerHTML never hit the setters above, so
    // rewrite their src/href attributes as soon as they appear.
    function fixElement(el) {
        if (!el || el.nodeType !== 1) return;
        ['src', 'href'].forEach(function (attr) {
            var v = el.getAttribute && el.getAttribute(attr);
            var f = localFile(v);
            if (f) el.setAttribute(attr, f);
        });
    }
    function fixTree(root) {
        fixElement(root);
        if (root.querySelectorAll) {
            root.querySelectorAll('[src*="/api/"], [href*="/api/"]').forEach(fixElement);
        }
    }
    new MutationObserver(function (records) {
        records.forEach(function (r) {
            if (r.type === 'attributes') fixElement(r.target);
            else r.addedNodes.forEach(fixTree);
        });
    }).observe(document.documentElement, {
        childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'href'],
    });

    // Artifact "open in new tab" buttons call window.open with an /api/ URL.
    var _nativeOpen = window.open;
    window.open = function (url) {
        var f = localFile(url);
        var args = Array.prototype.slice.call(arguments);
        if (f) args[0] = f;
        return _nativeOpen.apply(window, args);
    };

    // Visual cue + disable input controls once DOM is ready.
    document.addEventListener('DOMContentLoaded', function () {
        fixTree(document.body);
        var bar = document.createElement('div');
        bar.textContent = 'Offline read-only snapshot — interactive actions are disabled.';
        bar.style.cssText =
            'background:#fff3cd;color:#664d03;padding:6px 14px;border-bottom:1px solid #ffe69c;' +
            'font:13px system-ui,sans-serif;text-align:center;position:sticky;top:0;z-index:9999;';
        document.body.insertBefore(bar, document.body.firstChild);

        // Disable the chat send / new chat / settings buttons gracefully.
        var killers = [
            '#send-button', '#new-chat-btn', '#stop-button',
            'button[onclick*="saveApiKey"]', 'button[onclick*="clearApiKey"]',
        ];
        killers.forEach(function (sel) {
            document.querySelectorAll(sel).forEach(function (el) {
                el.setAttribute('disabled', 'disabled');
                el.style.opacity = '0.5';
                el.style.cursor = 'not-allowed';
            });
        });
        var input = document.getElementById('chat-input');
        if (input) {
            input.setAttribute('disabled', 'disabled');
            input.placeholder = 'Offline snapshot — input disabled';
        }
    });
})();
