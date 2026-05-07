// offline-shim.js — redirects /api/* requests to bundled files.
(function () {
    if (!window.OFFLINE_CONVERSATION_ID) return;
    var CONV = window.OFFLINE_CONVERSATION_ID;
    var TASK = window.OFFLINE_TASK_ID || CONV;

    function pathOf(u) {
        try { var p = new URL(u, location.href); return p.pathname + p.search; }
        catch (_) { return String(u || ''); }
    }
    function stripQ(p) { var i = p.indexOf('?'); return i === -1 ? p : p.slice(0, i); }

    // Map an /api/... path to a bundled file path (or a stub object).
    function rewrite(rawPath) {
        var p = stripQ(pathOf(rawPath));

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

        if (p.indexOf('/api/artifacts/') === 0) {
            var rel = p.slice('/api/artifacts/'.length);
            return { file: 'artifacts/' + rel };
        }
        if (p.indexOf('/api/uploads/') === 0) {
            var rest = p.slice('/api/uploads/'.length);
            return { file: 'uploads/' + rest };
        }
        if (p === '/api/health') return { stub: { status: 'ok' } };
        if (p === '/api/clear-key') return { stub: { status: 'ok' } };
        if (p.indexOf('/api/tif_bounds/') === 0) return { stub: { error: 'unavailable offline' } };

        return null;
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

        return _nativeFetch(m.file).then(function (r) {
            // Preserve native Response so .json()/.text() work as callers expect.
            return r;
        });
    };

    // Intercept iframe.src assignments so plan/graph/HTML iframes load locally.
    var desc = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'src');
    if (desc && desc.set) {
        Object.defineProperty(HTMLIFrameElement.prototype, 'src', {
            configurable: true,
            enumerable: true,
            get: desc.get,
            set: function (v) {
                try {
                    if (typeof v === 'string' && v.indexOf('/api/') !== -1) {
                        var m2 = rewrite(v);
                        if (m2 && m2.file) { return desc.set.call(this, m2.file); }
                    }
                } catch (_) {}
                return desc.set.call(this, v);
            },
        });
    }

    // Visual cue + disable input controls once DOM is ready.
    document.addEventListener('DOMContentLoaded', function () {
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
