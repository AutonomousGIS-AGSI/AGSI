/**
 * Experiment 2 research workspace.
 *
 * Coordinates multi-source, multi-task studies around the existing Handbook
 * Generator. Study configuration and records are persisted through the Flask
 * API; ordinary Handbook Generator behavior remains unchanged.
 */
(function () {
    'use strict';

    const MECHANISMS = {
        rest: { label: 'REST API', hint: 'HTTP endpoints and query parameters' },
        stac: { label: 'STAC', hint: 'Catalog, collection, item and asset search' },
        ogc: { label: 'OGC Service', hint: 'WMS, WFS, WCS and OGC API services' },
        sql: { label: 'SQL Interface', hint: 'Database and query-based access' },
        bulk: { label: 'Bulk Download', hint: 'Files, archives and repositories' },
    };
    const FAILURE_CATEGORIES = [
        'Incorrect endpoint', 'Incorrect parameter', 'Missing required parameter',
        'Authentication failure', 'Spatial-filter error', 'Temporal-filter error',
        'Pagination failure', 'Rate limit', 'Unsupported output format',
        'Response-parsing error', 'File-writing error', 'Incorrect dataset selection',
        'Documentation ambiguity', 'Network or service failure',
        'Generated-code defect', 'Unknown',
    ];
    // Open-source models served from an OpenAI-compatible endpoint (see
    // Local_models_test.ipynb). "gemma4-fast" is the fastest of that catalog,
    // so it — plus its server — is the default; base_url empty routes back
    // to GIBD/OpenAI.
    const LOCAL_BASE_URL = 'http://128.118.54.16:11434/v1';
    const LOCAL_MODELS = [
        'qwen3:32b', 'gpt-oss:20b', 'gpt-oss:120b', 'llama3.1:70b',
        'gemma4-fast:latest', 'deepseek-v4-flash:cloud', 'deepseek-v4-pro:cloud',
        'deepseek-v3:latest', 'gemma4:31b', 'mistral:latest', 'llama3.2:1b',
        'llama4:latest', 'deepseek-r1:70b', 'llama2:latest',
    ];
    const DEFAULT_CONTROLS = {
        model: 'qwen3:32b', base_url: LOCAL_BASE_URL,
        reasoning_effort: 'low', repetitions: 1,
        max_refinements: 3, timeout_seconds: 300, stop_on_success: true,
        stop_on_repeated_error: true, randomize_order: false,
    };

    const state = {
        open: false,
        tab: 'setup',
        study: null,
        dirty: false,
        saving: false,
        running: false,
        liveEvents: [],
        runKeys: {},
        requiredKeys: [],
        selectedTrialId: null,
        lastScrolledStage: null,
        openDetails: new Set(),
        collapsedStages: new Set(),
        outputPreviews: new Map(),
    };

    const byId = (id) => document.getElementById(id);
    const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[ch]);
    const safeUrl = (value) => /^https?:\/\//i.test(String(value || '').trim())
        ? esc(String(value).trim()) : '';
    const uid = (prefix) => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const now = () => new Date().toISOString();

    function clearRunViewState() {
        state.outputPreviews.forEach((record) => {
            const url = record?.preview?.object_url;
            if (url) URL.revokeObjectURL(url);
        });
        state.outputPreviews.clear();
        state.collapsedStages.clear();
        state.openDetails.clear();
        state.lastScrolledStage = null;
    }

    function blankStudy() {
        return {
            name: 'Experiment 2 Study',
            description: '',
            research_question: 'How does execution-grounded refinement affect handbook quality and retrieval performance across geospatial access mechanisms?',
            status: 'draft',
            source_name: '',
            documentation_url: '',
            retrieval_task: '',
            mechanisms: Object.keys(MECHANISMS),
            sources: [],
            tasks: [],
            controls: { ...DEFAULT_CONTROLS },
            trials: [],
            handbook_versions: [],
            refinements: [],
            manual_interventions: [],
        };
    }

    function markDirty() {
        state.dirty = true;
        const label = byId('exp2-save-state');
        if (label) {
            label.textContent = 'Unsaved changes';
            label.className = 'exp2-save-state dirty';
        }
    }

    function savedState(text = 'Saved') {
        state.dirty = false;
        const label = byId('exp2-save-state');
        if (label) {
            label.textContent = text;
            label.className = 'exp2-save-state saved';
        }
    }

    function toast(message, kind = 'success') {
        const el = byId('exp2-toast');
        if (!el) return;
        el.textContent = message;
        el.className = `exp2-toast ${kind}`;
        el.hidden = false;
        clearTimeout(toast.timer);
        toast.timer = setTimeout(() => { el.hidden = true; }, 3500);
    }

    async function api(path, options = {}) {
        const response = await fetch(path, options);
        let data = {};
        try { data = await response.json(); } catch (_) { /* non-JSON */ }
        if (!response.ok || data.success === false) {
            throw new Error(data.error || `Request failed (${response.status})`);
        }
        return data;
    }

    function open() {
        if (window.HandbookGenerator) HandbookGenerator.close();
        const workspace = byId('exp2-workspace');
        if (!workspace) return;
        if (!state.study) state.study = blankStudy();
        ensureSetupFields(state.study);
        state.open = true;
        workspace.hidden = false;
        document.body.classList.add('exp2-open');
        render();
    }

    function close() {
        if (state.running) {
            toast('Stop the running batch before leaving Experiment 2.', 'info');
            return;
        }
        if (state.dirty && !confirm('Close Experiment 2 with unsaved changes?')) return;
        const workspace = byId('exp2-workspace');
        if (workspace) workspace.hidden = true;
        document.body.classList.remove('exp2-open');
        state.open = false;
        if (window.HandbookGenerator) HandbookGenerator.open();
    }

    function switchTab(tab) {
        if (!['setup', 'runs', 'refinement', 'results'].includes(tab)) return;
        state.tab = tab;
        document.querySelectorAll('[data-exp2-tab]').forEach((button) => {
            button.classList.toggle('active', button.dataset.exp2Tab === tab);
        });
        render();
    }

    function render() {
        const main = byId('exp2-main');
        if (!main || !state.study) return;
        const subtitle = byId('exp2-subtitle');
        if (subtitle) subtitle.textContent = state.study.name || 'Execution-grounded refinement across access mechanisms';
        if (state.tab === 'setup') renderSetup(main);
        else if (state.tab === 'runs') renderPipelineRuns(main);
        else if (state.tab === 'refinement') renderRefinement(main);
        else renderResults(main);
        restoreOpenDetails(main);
    }

    // Live runs re-render on every heartbeat, which would otherwise collapse
    // any panel the researcher has expanded to read.
    function restoreOpenDetails(main) {
        main.querySelectorAll('details[data-detail-key]').forEach((element) => {
            element.open = state.openDetails.has(element.dataset.detailKey);
        });
        if (main.dataset.detailsWired) return;
        main.dataset.detailsWired = '1';
        main.addEventListener('toggle', (event) => {
            const key = event.target?.dataset?.detailKey;
            if (!key) return;
            if (event.target.open) state.openDetails.add(key);
            else state.openDetails.delete(key);
        }, true);
    }

    function ensureSetupFields(study) {
        if (!study) return;
        const firstSource = (study.sources || [])[0] || {};
        const firstTask = (study.tasks || [])[0] || {};
        if (study.source_name == null) study.source_name = firstSource.name || '';
        if (study.documentation_url == null) {
            study.documentation_url = firstSource.docs_url || firstSource.website || '';
        }
        if (study.retrieval_task == null) {
            study.retrieval_task = firstTask.description || firstTask.name || '';
        }
    }

    function readiness() {
        const s = state.study;
        const issues = [];
        if (!String(s.name || '').trim()) issues.push('Enter a study name.');
        if (!String(s.source_name || '').trim()
                && !String(s.documentation_url || '').trim()) {
            issues.push('Enter a data source name or documentation URL.');
        }
        if (!String(s.retrieval_task || '').trim()) {
            issues.push('Enter the retrieval task that the pipeline should run.');
        }
        if (!(s.mechanisms || []).length) {
            issues.push('Select at least one access mechanism.');
        }
        return { ready: issues.length === 0, issues };
    }

    function renderSetup(main) {
        const s = state.study;
        const ready = readiness();
        main.innerHTML = `
            <div class="exp2-page">
                <section class="exp2-page-heading">
                    <div><span class="exp2-section-number">01</span>
                        <h3>Configure the study</h3>
                        <p>Define the protocol before generating baseline handbooks or running trials.</p>
                    </div>
                    <span class="exp2-readiness ${ready.ready ? 'ready' : ''}">${ready.ready ? 'Setup complete' : `${ready.issues.length} setup item${ready.issues.length === 1 ? '' : 's'} remaining`}</span>
                </section>

                <section class="exp2-card">
                    <div class="exp2-card-head"><div><h4>Study overview</h4><p>Describe the source and retrieval request that will enter the experimental pipeline.</p></div></div>
                    <div class="exp2-form-grid two">
                        <label class="wide"><span>Study name *</span><input id="exp2-name" value="${esc(s.name)}" placeholder="e.g. WorldPop REST retrieval study"></label>
                        <label><span>Data source name</span><input id="exp2-source-name" value="${esc(s.source_name)}" placeholder="e.g. WorldPop"></label>
                        <label><span>Documentation URL</span><input id="exp2-documentation-url" type="url" value="${esc(s.documentation_url)}" placeholder="https://official-documentation.example"></label>
                        <p class="exp2-field-note wide">Provide the source name, documentation URL, or both.</p>
                        <label class="wide"><span>Retrieval task *</span><textarea id="exp2-retrieval-task" rows="4" placeholder="Describe the exact data retrieval request that should be used when the pipeline runs.">${esc(s.retrieval_task)}</textarea><small class="exp2-input-help">This task will be passed into the experimental retrieval pipeline.</small></label>
                    </div>
                </section>

                <section class="exp2-card">
                    <div class="exp2-card-head">
                        <div><h4>Access mechanisms</h4><p>Select the mechanisms represented in the study.</p></div>
                        <span class="exp2-count">${s.mechanisms.length} selected</span>
                    </div>
                    <div class="exp2-mechanism-grid">
                        ${Object.entries(MECHANISMS).map(([id, m]) => `
                            <label class="exp2-mechanism ${s.mechanisms.includes(id) ? 'selected' : ''}">
                                <input type="checkbox" value="${id}" ${s.mechanisms.includes(id) ? 'checked' : ''} onchange="Experiment2Mode.toggleMechanism('${id}', this.checked)">
                                <span class="exp2-mechanism-icon">${m.label.slice(0,2).toUpperCase()}</span>
                                <strong>${m.label}</strong><small>${m.hint}</small>
                                <em>${s.mechanisms.includes(id) ? 'Selected' : 'Not selected'}</em>
                            </label>`).join('')}
                    </div>
                </section>

                <section class="exp2-card">
                    <div class="exp2-card-head"><div><h4>Experimental controls</h4><p>These settings are recorded with the protocol and should remain fixed after baseline execution.</p></div></div>
                    <div class="exp2-form-grid four">
                        <label><span>Model</span>
                            <select id="exp2-control-model-picker">
                                <option value="">Pick a local model…</option>
                                ${LOCAL_MODELS.map(m=>`<option value="${esc(m)}" ${s.controls.model===m?'selected':''}>${esc(m)}</option>`).join('')}
                                <option value="" ${LOCAL_MODELS.includes(s.controls.model)?'':'selected'}>Custom (type below)</option>
                            </select>
                            <input id="exp2-control-model" value="${esc(s.controls.model)}" placeholder="e.g. qwen3:32b or gpt-6-luna">
                        </label>
                        <label class="wide"><span>Model server base URL</span><input id="exp2-control-base-url" type="url" value="${esc(s.controls.base_url)}" placeholder="Leave blank to use GIBD/OpenAI"><small class="exp2-input-help">Points refinement, trace analysis, semantic evaluation, and retrieval-code generation at any OpenAI-compatible server (local or cloud). H0 handbook generation now uses the same server too, with a Tavily-backed search tool standing in for OpenAI's hosted web search.</small></label>
                        <label><span>Reasoning effort</span><select id="exp2-control-reasoning">${['low','medium','high'].map(v=>`<option ${s.controls.reasoning_effort===v?'selected':''}>${v}</option>`).join('')}</select></label>
                        <label><span>Repeated runs</span><input id="exp2-control-repetitions" type="number" min="1" max="100" value="${s.controls.repetitions}"></label>
                        <label><span>Timeout (seconds)</span><input id="exp2-control-timeout" type="number" min="10" value="${s.controls.timeout_seconds}"></label>
                        <label><span>Maximum refinements</span><input id="exp2-control-refinements" type="number" min="0" max="20" value="${s.controls.max_refinements}"></label>
                        <label class="check"><input id="exp2-control-stop-success" type="checkbox" ${s.controls.stop_on_success?'checked':''}><span>Stop after success</span></label>
                        <label class="check"><input id="exp2-control-stop-error" type="checkbox" ${s.controls.stop_on_repeated_error?'checked':''}><span>Stop on repeated error</span></label>
                        <label class="check"><input id="exp2-control-randomize" type="checkbox" ${s.controls.randomize_order?'checked':''}><span>Randomize run order</span></label>
                    </div>
                </section>

                ${!ready.ready ? `<section class="exp2-readiness-card"><h4>Before preparing trials</h4>${ready.issues.map(issue=>`<div><span>○</span>${esc(issue)}</div>`).join('')}</section>` : ''}
                <div class="exp2-page-footer"><button class="exp2-btn primary large" onclick="Experiment2Mode.saveAndContinue()">Save and continue →</button></div>
            </div>`;
        wireSetupInputs();
    }

    function wireSetupInputs() {
        const map = {
            'exp2-name': 'name',
            'exp2-source-name': 'source_name',
            'exp2-documentation-url': 'documentation_url',
            'exp2-retrieval-task': 'retrieval_task',
        };
        Object.entries(map).forEach(([id, field]) => {
            byId(id)?.addEventListener('input', (event) => {
                state.study[field] = event.target.value; markDirty();
                if (field === 'name') byId('exp2-subtitle').textContent = event.target.value;
            });
        });
        byId('exp2-control-model-picker')?.addEventListener('change', (event) => {
            if (!event.target.value) return; // "Custom (type below)" — leave the text field alone
            state.study.controls.model = event.target.value;
            const field = byId('exp2-control-model');
            if (field) field.value = event.target.value;
            markDirty();
        });
        const controls = {
            'exp2-control-model': ['model', String],
            'exp2-control-base-url': ['base_url', String],
            'exp2-control-reasoning': ['reasoning_effort', String],
            'exp2-control-repetitions': ['repetitions', Number],
            'exp2-control-timeout': ['timeout_seconds', Number],
            'exp2-control-refinements': ['max_refinements', Number],
            'exp2-control-stop-success': ['stop_on_success', (el) => el.checked, true],
            'exp2-control-stop-error': ['stop_on_repeated_error', (el) => el.checked, true],
            'exp2-control-randomize': ['randomize_order', (el) => el.checked, true],
        };
        Object.entries(controls).forEach(([id, spec]) => {
            byId(id)?.addEventListener('change', (event) => {
                state.study.controls[spec[0]] = spec[2] ? spec[1](event.target) : spec[1](event.target.value);
                markDirty();
            });
        });
    }

    function toggleMechanism(id, checked) {
        const set = new Set(state.study.mechanisms);
        checked ? set.add(id) : set.delete(id);
        state.study.mechanisms = Object.keys(MECHANISMS).filter(m => set.has(m));
        markDirty(); render();
    }

    function syncPreparedInputs() {
        const study = state.study;
        const enteredName = String(study.source_name || '').trim();
        const docsUrl = String(study.documentation_url || '').trim();
        let sourceName = enteredName;
        if (!sourceName && docsUrl) {
            try {
                sourceName = new URL(docsUrl).hostname.replace(/^www\./, '');
            } catch (_) {
                sourceName = docsUrl;
            }
        }
        const existingSources = study.sources || [];
        study.sources = (study.mechanisms || []).map((mechanism) => {
            const existing = existingSources.find(source =>
                source.mechanism === mechanism
                && String(source.name || '').trim().toLowerCase() === sourceName.toLowerCase()
            );
            return {
                ...(existing || {}),
                id: existing?.id || uid('source'),
                name: sourceName,
                mechanism,
                website: docsUrl,
                docs_url: docsUrl,
                setup_generated: true,
                created_at: existing?.created_at || now(),
            };
        });

        const taskText = String(study.retrieval_task || '').trim();
        const existingTask = (study.tasks || []).find(task =>
            String(task.description || '').trim() === taskText
        );
        study.tasks = [{
            ...(existingTask || {}),
            id: existingTask?.id || uid('task'),
            name: existingTask?.name || 'Configured retrieval task',
            description: taskText,
            mechanism: 'all',
            difficulty: existingTask?.difficulty || 'Intermediate',
            setup_generated: true,
            created_at: existingTask?.created_at || now(),
        }];
    }

    function prepareTrials() {
        const ready = readiness();
        if (!ready.ready) { state.tab = 'setup'; render(); return toast(ready.issues[0], 'error'); }
        if (state.study.trials.length && !confirm('Replace the current prepared trial matrix?')) return;
        syncPreparedInputs();
        const trials = [];
        const repetitions = Math.max(1, Number(state.study.controls.repetitions) || 1);
        state.study.sources.forEach((source) => {
            state.study.tasks.filter(task => task.mechanism === 'all' || task.mechanism === source.mechanism).forEach((task) => {
                for (let repeat = 1; repeat <= repetitions; repeat++) {
                    trials.push({
                        id: uid('trial'), source_id: source.id, task_id: task.id,
                        mechanism: source.mechanism, condition: 'baseline',
                        handbook_version: 'H0', repetition: repeat, attempt: 1,
                        status: 'queued', failure_category: '', notes: '',
                        created_at: now(), updated_at: now(),
                    });
                }
            });
        });
        state.study.trials = trials;
        markDirty(); render(); toast(`Prepared ${trials.length} baseline trial${trials.length === 1 ? '' : 's'}.`);
    }

    function renderPipelineRuns(main) {
        const study = state.study;
        const pipeline = study.pipeline_state || {};
        const stages = pipeline.stages || [];
        const versions = study.handbook_versions || [];
        const conditions = pipeline.conditions || [];
        const requiredKeys = [...new Set([
            ...(pipeline.required_keys || []),
            ...state.requiredKeys,
        ])];
        const outcome = pipeline.outcome || '';
        const isComplete = pipeline.status === 'complete';
        const isWaitingForKeys = pipeline.status === 'awaiting_credentials';
        const isAwaitingTest = pipeline.status === 'awaiting_test_confirmation';
        const statusLabel = state.running ? 'Running live'
            : isWaitingForKeys ? 'Waiting for credentials'
            : isAwaitingTest ? 'Waiting to confirm retrieval test'
            : isComplete ? ({
                passed: 'All mechanisms validated',
                partial: 'Partially validated',
                invalid: 'Evidence invalid',
                stopped: 'Pipeline stopped',
            }[outcome] || 'Pipeline complete')
            : pipeline.status === 'interrupted' ? 'Ready to resume'
            : pipeline.status === 'error' ? 'Needs attention'
            : 'Ready to run';
        const actionLabel = isWaitingForKeys ? 'Resume with credentials'
            : isAwaitingTest ? 'Run retrieval test'
            : isComplete ? 'Run experiment again'
            : pipeline.status === 'interrupted' || pipeline.status === 'error'
                ? 'Resume pipeline' : 'Start live pipeline';

        main.innerHTML = `<div class="exp2-page exp2-pipeline-page">
            <section class="exp2-page-heading">
                <div><span class="exp2-section-number">02</span>
                    <h3>Live experimental run</h3>
                    <p>The initial handbook, H0 evaluation, trace analysis, and every refinement remain together in one evidence trail.</p>
                </div>
                <div class="exp2-pipeline-actions">
                    <span class="exp2-pipeline-status ${esc(pipeline.status || 'not_started')}"><i class="${state.running ? 'active' : ''}"></i>${esc(statusLabel)}</span>
                    ${state.running
                        ? '<button class="exp2-btn danger" onclick="Experiment2Mode.cancelBatch()">Stop safely</button>'
                        : `<button class="exp2-btn primary" onclick="Experiment2Mode.startPipeline(${isComplete ? 'true' : 'false'})">${esc(actionLabel)}</button>`}
                </div>
            </section>

            <section class="exp2-pipeline-brief">
                <div><span>Data source</span><strong>${esc(study.source_name || 'Derived from documentation URL')}</strong><small>${esc(study.documentation_url || 'No documentation URL entered')}</small></div>
                <div><span>Retrieval task</span><strong>${esc(study.retrieval_task || 'Not configured')}</strong></div>
                <div><span>Access mechanism${(study.mechanisms || []).length === 1 ? '' : 's'}</span><strong>${esc((study.mechanisms || []).map(id => MECHANISMS[id]?.label || id).join(', ') || 'Not selected')}</strong></div>
                <div><span>Refinement limit</span><strong>${esc(study.controls?.max_refinements ?? 0)}</strong><small>${esc(study.controls?.stop_on_repeated_error ? 'Stops when the same error repeats' : 'Repeated-error stop disabled')}</small></div>
            </section>

            ${conditions.length ? pipelineConditionSummary(conditions) : ''}

            ${versions.length ? `<section class="exp2-version-rail"><div><strong>Recorded handbook versions</strong><small>Each access mechanism receives its own independently generated and self-verified H0. Refinements never cross mechanism boundaries.</small></div><div>${versions.map((version, index) => {
                const current = conditions.some(item => item.current_version === version.version);
                const iteration = Number(version.iteration ?? String(version.version || '').match(/H(\d+)$/)?.[1] ?? index);
                return `<span class="${current ? 'current' : ''}"><b>${esc(version.display_version || version.version || `H${index}`)}</b><em>${iteration === 0 ? 'Baseline' : `Refinement ${iteration}`}</em></span>`;
            }).join('')}</div></section>` : ''}

            ${pipelineProgressStrip(stages)}

            ${requiredKeys.length ? `<section class="exp2-credentials exp2-pipeline-credentials"><div><strong>Credentials needed to continue</strong><small>Values are used for this run only and are never saved in the study or displayed in the trace.</small></div><div class="exp2-credential-fields">${requiredKeys.map(name => `<label><span>${esc(name)}</span><input type="password" autocomplete="off" data-key="${esc(name)}" value="${esc(state.runKeys[name] || '')}" oninput="Experiment2Mode.setRunKey(this.dataset.key, this.value)" placeholder="Enter credential"></label>`).join('')}</div></section>` : ''}

            ${isAwaitingTest ? `<section class="exp2-credentials exp2-pipeline-credentials"><div><strong>Ready to test</strong><small>${esc(pipeline.pending_message || 'The handbook is ready. Run the retrieval test now, or leave this parked and come back later.')}</small></div></section>` : ''}

            <section class="exp2-pipeline-timeline" aria-live="polite">
                ${stages.length ? pipelineConditionStages(conditions, stages) : pipelineEmptyState()}
            </section>

            ${isComplete ? pipelineCompletionCard(pipeline) : ''}
        </div>`;
    }

    function conditionStatusText(condition) {
        if (condition.status === 'awaiting_credentials') return 'Needs credentials';
        if (condition.status === 'awaiting_test_confirmation') return 'Awaiting confirmation';
        if (condition.status === 'running') return 'Running';
        if (condition.outcome === 'passed') return 'Validated';
        if (condition.outcome === 'invalid') return 'Invalid evidence';
        if (condition.outcome === 'stopped') return 'Stopped';
        return condition.status === 'complete' ? 'Complete' : 'Queued';
    }

    function pipelineConditionSummary(conditions) {
        return `<section class="exp2-condition-summary">
            <header><div><strong>Experimental conditions</strong><small>Each mechanism is generated, executed, validated, and refined independently.</small></div><span>${conditions.length} condition${conditions.length === 1 ? '' : 's'}</span></header>
            <div>${conditions.map(condition => {
                const status = condition.outcome || condition.status || 'queued';
                return `<article class="${esc(status)}">
                    <span class="exp2-condition-icon" aria-hidden="true"></span>
                    <div><small>${esc(condition.label || MECHANISMS[condition.mechanism]?.label || condition.mechanism)}</small><strong>${esc(conditionStatusText(condition))}</strong><p>${esc(condition.stop_reason ? condition.stop_reason.replaceAll('_', ' ') : condition.status === 'awaiting_test_confirmation' ? 'Handbook ready — confirm to run the retrieval test' : 'Waiting for this condition to begin')}</p></div>
                    <b>${esc(condition.current_version || 'H0 pending')}</b>
                </article>`;
            }).join('')}</div>
        </section>`;
    }

    function pipelineConditionStages(conditions, stages) {
        if (!conditions.length) {
            return stages.map((stage, index) => pipelineStageCard(stage, index)).join('');
        }
        const used = new Set();
        const groups = conditions.map(condition => {
            const prefix = `${condition.mechanism}_`;
            const mechanismStages = stages.filter(stage => {
                const matched = String(stage.key || '').startsWith(prefix);
                if (matched) used.add(stage.key);
                return matched;
            });
            if (!mechanismStages.length && condition.status === 'queued') return '';
            const status = condition.outcome || condition.status || 'queued';
            return `<section class="exp2-condition-run ${esc(status)}">
                <header><div><span>${esc(condition.label || condition.mechanism)}</span><strong>${esc(conditionStatusText(condition))}</strong></div><small>${esc(condition.current_version || 'Preparing H0')}</small></header>
                <div>${mechanismStages.map((stage, index) => pipelineStageCard(stage, index)).join('')}</div>
            </section>`;
        }).join('');
        const globalStages = stages.filter(stage => !used.has(stage.key));
        return groups + globalStages.map((stage, index) => pipelineStageCard(stage, index)).join('');
    }

    function pipelineEmptyState() {
        return `<div class="exp2-pipeline-empty">
            <span>01</span>
            <div><strong>The run will appear here stage by stage</strong><p>Documentation discovery will begin automatically after Save and Continue. Each stage keeps its messages, artifacts, evidence, and status inside its own card.</p></div>
        </div>`;
    }

    function pipelineProgressStrip(stages) {
        if (!stages.length) return '';
        const finished = stages.filter(s => ['complete', 'warning', 'stopped', 'error'].includes(s.status)).length;
        const current = stages.find(s => s.status === 'running');
        return `<section class="exp2-pipeline-progress">
            <div class="exp2-progress-summary">
                <strong>${current ? `Now: ${esc(current.label)}` : `${finished} of ${stages.length} stages finished`}</strong>
                <small>${current ? `Stage ${stages.indexOf(current) + 1} of ${stages.length} · updates stream onto its card below` : 'Select a stage to jump to its card'}</small>
            </div>
            <div class="exp2-progress-chips">${stages.map((s, i) => `<button type="button" class="${esc(s.status || 'waiting')}" onclick="Experiment2Mode.scrollToStage('${esc(s.key)}')" title="${esc(s.label || s.key)}"><b>${i + 1}</b><span>${esc(s.label || s.key)}</span></button>`).join('')}</div>
        </section>`;
    }

    function cleanActivityLine(raw) {
        let text = String((raw && typeof raw === 'object') ? raw.text : raw || '').trim()
            .replace(/^\[\d{2}:\d{2}:\d{2}\]\s*/, '')
            .replace(/^\[(?:chat|stage:\w+:\w+|artifact:\w+)\]\s*/, '');
        if (!text || text.includes('```') || text.includes('[REDACTED]')) return '';
        if (/^[{\["']/.test(text)) return '';
        text = text.replace(/[*`#]/g, '').replace(/\s+/g, ' ').trim();
        return text.length > 260 ? `${text.slice(0, 257)}…` : text;
    }

    function stageActivity(stage) {
        const seen = new Set();
        return (stage.details || []).map(cleanActivityLine).filter((text) => {
            if (!text || seen.has(text)) return false;
            seen.add(text);
            return true;
        });
    }

    function elapsedLabel(stage) {
        const seconds = Number.isFinite(stage.elapsed_seconds)
            ? stage.elapsed_seconds
            : (stage.started_at
                ? Math.round((Date.now() - new Date(stage.started_at).getTime()) / 1000)
                : null);
        if (seconds == null || seconds < 0) return '';
        return seconds >= 60
            ? `${Math.floor(seconds / 60)}m ${seconds % 60}s`
            : `${seconds}s`;
    }

    function pipelineStageCard(stage, index) {
        const status = stage.status || 'waiting';
        const collapsed = state.collapsedStages.has(stage.key);
        const activity = stageActivity(stage);
        let activityBlock = '';
        if (status === 'running') {
            const hint = cleanActivityLine(stage.hint);
            const latest = activity[activity.length - 1] || hint
                || 'The pipeline is working on this stage. Live updates will appear here as they arrive.';
            const elapsed = elapsedLabel(stage);
            activityBlock = `<div class="exp2-stage-current-activity" role="status" aria-live="polite">
                <span><i></i><b data-live-label>Working now${elapsed ? ` · ${esc(elapsed)} elapsed` : ''}</b></span>
                <p data-live-message>${esc(latest)}</p>
                ${hint && hint !== latest ? `<em class="exp2-stage-hint">${esc(hint)}</em>` : ''}
            </div>`;
        } else if (activity.length) {
            activityBlock = `<details class="exp2-stage-log" data-detail-key="${esc(stage.key)}:log"><summary>Stage activity · ${activity.length} update${activity.length === 1 ? '' : 's'}</summary><ul>${activity.map(text => `<li>${esc(text)}</li>`).join('')}</ul></details>`;
        }
        return `<article class="exp2-pipeline-stage ${esc(status)} ${collapsed ? 'collapsed' : ''}" data-stage-key="${esc(stage.key)}">
            <div class="exp2-pipeline-step"><span>${String(index + 1).padStart(2, '0')}</span><i></i></div>
            <div class="exp2-pipeline-card">
                <header>
                    <div><strong>${esc(stage.label || stage.key)}</strong><p>${esc(stage.description || '')}</p></div>
                    <div class="exp2-stage-header-actions">
                        <span class="exp2-stage-status">${esc(status.replaceAll('_', ' '))}</span>
                        <button type="button" class="exp2-stage-collapse" aria-expanded="${collapsed ? 'false' : 'true'}" onclick="Experiment2Mode.toggleStageCard('${esc(stage.key)}')">
                            <span>${collapsed ? 'Expand' : 'Collapse'}</span><i aria-hidden="true">⌃</i>
                        </button>
                    </div>
                </header>
                <div class="exp2-stage-card-body" ${collapsed ? 'hidden' : ''}>
                    ${stage.message ? `<div class="exp2-stage-message">${esc(stage.message)}</div>` : ''}
                    ${activityBlock}
                    ${pipelineArtifact(stage.artifact, stage.key)}
                    ${stage.started_at ? `<footer><span>Started ${esc(new Date(stage.started_at).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit', second:'2-digit'}))}</span>${stage.finished_at ? `<span>Finished ${esc(new Date(stage.finished_at).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit', second:'2-digit'}))}</span>` : '<span>Working now…</span>'}</footer>` : ''}
                </div>
            </div>
        </article>`;
    }

    function toggleStageCard(key) {
        const collapsed = !state.collapsedStages.has(key);
        if (collapsed) state.collapsedStages.add(key);
        else state.collapsedStages.delete(key);
        const article = document.querySelector(
            `.exp2-pipeline-stage[data-stage-key="${CSS.escape(key)}"]`);
        if (!article) return;
        article.classList.toggle('collapsed', collapsed);
        const body = article.querySelector('.exp2-stage-card-body');
        if (body) body.hidden = collapsed;
        const button = article.querySelector('.exp2-stage-collapse');
        if (button) {
            button.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
            const label = button.querySelector('span');
            if (label) label.textContent = collapsed ? 'Expand' : 'Collapse';
        }
    }

    function updateLiveStageDom(stage) {
        if (!stage || stage.status !== 'running') return;
        const article = document.querySelector(
            `.exp2-pipeline-stage[data-stage-key="${CSS.escape(stage.key)}"]`);
        if (!article) return;
        const activity = stageActivity(stage);
        const hint = cleanActivityLine(stage.hint);
        const latest = activity[activity.length - 1] || hint
            || 'The pipeline is working on this stage.';
        const elapsed = elapsedLabel(stage);
        const label = article.querySelector('[data-live-label]');
        const message = article.querySelector('[data-live-message]');
        if (label) label.textContent = `Working now${elapsed ? ` · ${elapsed} elapsed` : ''}`;
        if (message) message.textContent = latest;
    }

    function scrollToStage(key) {
        document.querySelector(`.exp2-pipeline-stage[data-stage-key="${CSS.escape(key)}"]`)
            ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function outputPreviewKey(scope, index) {
        return `${scope}:output:${index}`;
    }

    function outputRequestUrl(file, mode = '') {
        const params = new URLSearchParams();
        if (file?.artifact_ref) params.set('ref', file.artifact_ref);
        else {
            params.set('name', file?.name || '');
            params.set('size', String(file?.size_bytes ?? -1));
        }
        if (mode) params.set(mode, '1');
        return `/api/handbook-experiments/${encodeURIComponent(state.study.id)}/output-preview?${params}`;
    }

    function outputPreviewPanel(scope, index) {
        const record = state.outputPreviews.get(outputPreviewKey(scope, index));
        if (!record?.open) return '';
        if (record.loading) {
            return `<div class="exp2-output-preview loading"><span class="exp2-output-preview-spinner"></span><p>Preparing a safe in-card preview…</p></div>`;
        }
        if (record.error) {
            return `<div class="exp2-output-preview error"><strong>Preview unavailable</strong><p>${esc(record.error)}</p></div>`;
        }
        const preview = record.preview || {};
        let content = '';
        if (preview.kind === 'text') {
            content = `<pre><code>${esc(preview.content || '')}</code></pre>${preview.truncated ? '<small>Preview truncated to the first 300 KB.</small>' : ''}`;
        } else if (preview.kind === 'image' && preview.object_url) {
            content = `<img src="${esc(preview.object_url)}" alt="Preview of ${esc(preview.name || 'output file')}">`;
        } else if (preview.kind === 'pdf' && preview.object_url) {
            content = `<iframe src="${esc(preview.object_url)}" title="Preview of ${esc(preview.name || 'PDF output')}"></iframe>`;
        } else {
            content = `<div class="exp2-output-binary"><strong>Structured preview is not available for this file type.</strong><p>You can still download and inspect the complete output.</p></div>`;
        }
        return `<div class="exp2-output-preview">
            <header><div><strong>${esc(preview.name || 'Output')}</strong><small>${esc(preview.mime_type || 'Unknown file type')} · ${esc(preview.size_bytes ?? 0)} bytes</small></div><button type="button" data-ref="${esc(preview.artifact_ref || '')}" data-name="${esc(preview.name || 'output')}" onclick="Experiment2Mode.downloadOutput(this)">Download</button></header>
            ${content}
        </div>`;
    }

    function outputFileControl(file, scope, index) {
        const record = state.outputPreviews.get(outputPreviewKey(scope, index));
        return `<button type="button" class="exp2-output-file ${record?.open ? 'active' : ''}" data-ref="${esc(file.artifact_ref || '')}" data-name="${esc(file.name || '')}" data-size="${esc(file.size_bytes ?? 0)}" onclick="Experiment2Mode.toggleOutputPreview('${esc(scope)}', ${index}, this)">
            <span aria-hidden="true">▤</span><span><b>${esc(file.name || 'Output file')}</b><small>${esc(file.size_bytes ?? 0)} bytes · ${record?.open ? 'Hide preview' : 'Click to preview'}</small></span>
        </button>`;
    }

    async function toggleOutputPreview(scope, index, button) {
        const key = outputPreviewKey(scope, index);
        const existing = state.outputPreviews.get(key);
        if (existing?.preview || existing?.error) {
            existing.open = !existing.open;
            render();
            return;
        }
        const file = {
            artifact_ref: button?.dataset?.ref || '',
            name: button?.dataset?.name || '',
            size_bytes: Number(button?.dataset?.size || 0),
        };
        state.outputPreviews.set(key, { open: true, loading: true, file });
        render();
        try {
            const data = await api(outputRequestUrl(file));
            const preview = data.preview || {};
            if (['image', 'pdf'].includes(preview.kind)) {
                const rawResponse = await fetch(outputRequestUrl(
                    { ...file, artifact_ref: preview.artifact_ref }, 'raw'));
                if (!rawResponse.ok) throw new Error(`Could not load binary preview (${rawResponse.status}).`);
                preview.object_url = URL.createObjectURL(await rawResponse.blob());
            }
            state.outputPreviews.set(key, {
                open: true, loading: false, file, preview,
            });
        } catch (error) {
            state.outputPreviews.set(key, {
                open: true, loading: false, file, error: error.message,
            });
        }
        render();
    }

    async function downloadOutput(button) {
        const artifactRef = button?.dataset?.ref || '';
        const filename = button?.dataset?.name || 'experiment-output';
        try {
            const response = await fetch(outputRequestUrl({
                artifact_ref: artifactRef, name: filename,
            }, 'download'));
            if (!response.ok) throw new Error(`Download failed (${response.status}).`);
            const url = URL.createObjectURL(await response.blob());
            const link = document.createElement('a');
            link.href = url;
            link.download = filename || 'experiment-output';
            link.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        } catch (error) {
            toast(error.message, 'error');
        }
    }

    function pipelineArtifact(artifact, scope = '') {
        if (!artifact || typeof artifact !== 'object') return '';
        const parts = [];
        if (Array.isArray(artifact.links)) {
            const links = artifact.links.filter(item => safeUrl(item.url));
            if (links.length) parts.push(`<div class="exp2-artifact-links">${links.map(item => `<a href="${safeUrl(item.url)}" target="_blank" rel="noopener">${esc(item.label || 'Open source')} ↗</a>`).join('')}</div>`);
        }
        if (Array.isArray(artifact.facts) && artifact.facts.length) {
            parts.push(`<div class="exp2-artifact-facts">${artifact.facts.map(item => `<div><span>${esc(item.label)}</span><strong>${esc(item.value || '—')}</strong></div>`).join('')}</div>`);
        }
        const verification = artifact.verification;
        if (verification) {
            parts.push(`<div class="exp2-artifact-facts"><div><span>Verification</span><strong>${verification.verified ? 'Passed' : esc(verification.status || 'Not passed')}</strong></div><div><span>Attempts</span><strong>${esc(verification.attempts ?? 0)}</strong></div><div><span>Sample outputs</span><strong>${esc((verification.files || []).length)}</strong></div></div>`);
        }
        const source = artifact.source;
        if (source) {
            parts.push(`<div class="exp2-handbook-artifact"><div><span>${esc(artifact.version || 'Draft')}</span><strong>${esc(source.data_source_name || 'Generated handbook')}</strong><small>${esc(source.brief_description || '')}</small></div><details data-detail-key="${esc(scope)}:handbook"><summary>View handbook instructions</summary><pre>${esc(source.handbook || '')}</pre></details><details data-detail-key="${esc(scope)}:code"><summary>View sample retrieval code</summary><pre><code>${esc(source.code_example || '')}</code></pre></details></div>`);
        }
        const result = artifact.execution_result;
        if (result) {
            const validation = result.validation || {};
            const semantic = result.semantic_validation || {};
            const routing = result.failure_routing || {};
            parts.push(`<div class="exp2-evaluation-artifact">
                <div class="exp2-artifact-facts">
                    <div><span>Retrieval</span><strong class="${result.status === 'passed' ? 'good' : 'bad'}">${esc(result.status || 'unknown')}</strong></div>
                    <div><span>File validation</span><strong>${validation.passed ? 'Passed' : 'Not passed'}</strong></div>
                    <div><span>Semantic validation</span><strong class="${semantic.task_completed ? 'good' : semantic.task_completed === false ? 'bad' : ''}">${semantic.task_completed === true ? 'Passed' : semantic.task_completed === false ? 'Not passed' : 'Not run'}</strong></div>
                    <div><span>Execution attempts</span><strong>${esc(result.execution?.attempts_used ?? 0)}</strong></div>
                    <div><span>HTTP requests</span><strong>${esc((result.http_requests || []).length)}</strong></div>
                    <div><span>Output files</span><strong>${esc((result.downloaded_files || []).length)}</strong></div>
                </div>
                ${routing.origin ? `<div class="exp2-routing-note ${routing.refinable === false ? 'excluded' : 'refinable'}"><strong>${esc(routing.category || 'Failure routing')}</strong><p>${esc(routing.summary || (routing.refinable === false ? 'Excluded from handbook refinement.' : 'Eligible for handbook-deficiency analysis.'))}</p><span>${routing.refinable === false ? 'Not used to refine the handbook' : 'Eligible for trace analysis'}</span></div>` : ''}
                ${(result.downloaded_files || []).length ? `<div class="exp2-output-files">${result.downloaded_files.map((file, index) => outputFileControl(file, scope, index)).join('')}</div>${result.downloaded_files.map((file, index) => outputPreviewPanel(scope, index)).join('')}` : ''}
                ${(result.http_requests || []).length ? `<details class="exp2-request-evidence" data-detail-key="${esc(scope)}:requests"><summary>View HTTP request evidence · ${result.http_requests.length}</summary><div>${result.http_requests.map(item => `<article><span>${esc(item.method || 'GET')}</span><code>${esc(item.url || '')}</code><small>${item.attempt ? `Attempt ${esc(item.attempt)}` : 'Recorded request'}</small></article>`).join('')}</div></details>` : ''}
                <details class="exp2-validation-evidence" data-detail-key="${esc(scope)}:validation"><summary>View validation evidence</summary><div><p><strong>${validation.passed ? 'Passed' : 'Not passed'}</strong>${esc(validation.message || 'No validation message was recorded.')}</p><dl><div><dt>Output present</dt><dd>${validation.output_present ? 'Yes' : 'No'}</dd></div><div><dt>Format match</dt><dd>${validation.format_match === false ? 'No' : 'Yes'}</dd></div><div><dt>Expected format</dt><dd>${esc(validation.expected_format || 'Not specified')}</dd></div></dl></div></details>
                ${(result.output_evidence || []).length ? `<details class="exp2-output-structure" data-detail-key="${esc(scope)}:structure"><summary>Inspect output content evidence · ${result.output_evidence.length}</summary><div class="exp2-output-evidence">${result.output_evidence.map(outputEvidenceCard).join('')}</div></details>` : ''}
                ${result.error ? `<details class="error" data-detail-key="${esc(scope)}:error"><summary>Execution error and trace</summary><pre>${esc(result.error)}</pre></details>` : ''}
                ${result.generated_code ? `<details data-detail-key="${esc(scope)}:generated"><summary>Generated task-retrieval code</summary><pre><code>${esc(result.generated_code)}</code></pre></details>` : ''}
            </div>`);
        }
        const analysis = artifact.analysis;
        if (analysis) {
            if (Object.hasOwn(analysis, 'task_completed')) {
                parts.push(semanticValidationArtifact(analysis));
            } else {
                parts.push(`<div class="exp2-analysis-artifact"><div class="exp2-analysis-summary"><span>${esc(analysis.failure_category || 'Trace analysis')}</span><p>${esc(analysis.summary || analysis.validation_assessment || '')}</p></div>${(analysis.deficiencies || []).length ? `<div class="exp2-deficiency-grid">${analysis.deficiencies.map((item, index) => `<article><span>Deficiency ${index + 1}</span><strong>${esc(item.handbook_gap || 'Handbook gap')}</strong><p>${esc(item.evidence || '')}</p><small>${esc(item.recommended_change || '')}</small></article>`).join('')}</div>` : '<p class="exp2-no-deficiency">No refinable handbook deficiency was identified.</p>'}</div>`);
            }
        }
        return parts.length ? `<div class="exp2-stage-artifact">${parts.join('')}</div>` : '';
    }

    function outputEvidenceCard(item) {
        const facts = [];
        if (item.feature_count != null) facts.push(`${item.feature_count} features`);
        if (item.row_count != null) facts.push(`${item.row_count} rows`);
        if (Array.isArray(item.layers)) facts.push(`${item.layers.length} layers`);
        if (item.osm_counts) facts.push(`${Object.values(item.osm_counts).reduce((sum, value) => sum + Number(value || 0), 0)} OSM elements`);
        if (Array.isArray(item.columns)) facts.push(`${item.columns.length} columns`);
        return `<article><strong>${esc(item.name || 'Output')}</strong><span>${esc(item.extension || 'unknown format')} · ${esc(item.size_bytes ?? 0)} bytes</span><p>${esc(facts.join(' · ') || item.inspection_note || 'Basic file evidence recorded')}</p></article>`;
    }

    function semanticValidationArtifact(analysis) {
        const statusLabel = value => String(value || 'unknown').replaceAll('_', ' ');
        const fact = (label, value) => `<div><span>${esc(label)}</span><strong class="${value === 'pass' ? 'good' : value === 'fail' ? 'bad' : ''}">${esc(statusLabel(value))}</strong></div>`;
        return `<div class="exp2-analysis-artifact exp2-semantic-artifact">
            <div class="exp2-analysis-summary ${analysis.task_completed ? 'passed' : 'failed'}"><span>${analysis.task_completed ? 'Task completed' : esc(analysis.failure_category || 'Semantic validation did not pass')}</span><p>${esc(analysis.summary || 'No semantic summary was recorded.')}</p><small>Confidence ${Math.round(Number(analysis.confidence || 0) * 100)}%</small></div>
            <div class="exp2-artifact-facts">
                ${fact('Mechanism', analysis.mechanism_correctness)}
                ${fact('Parameters', analysis.parameter_correctness)}
                ${fact('Spatial query', analysis.spatial_query_correctness)}
                ${fact('Temporal query', analysis.temporal_query_correctness)}
                ${fact('Output content', analysis.output_correctness)}
            </div>
            ${(analysis.checks || []).length ? `<div class="exp2-semantic-checks">${analysis.checks.map(check => `<article class="${esc(check.status || 'unknown')}"><span>${esc(statusLabel(check.status))}</span><strong>${esc(check.name || 'Validation check')}</strong><p>${esc(check.evidence || 'No supporting evidence recorded.')}</p></article>`).join('')}</div>` : ''}
            ${analysis.handbook_gap ? `<div class="exp2-handbook-gap"><span>Possible handbook deficiency</span><strong>${esc(analysis.handbook_gap)}</strong><small>${analysis.should_refine_handbook ? 'Eligible for execution-grounded refinement' : 'Recorded for review; refinement was not recommended'}</small></div>` : ''}
        </div>`;
    }

    function pipelineCompletionCard(pipeline) {
        const outcome = pipeline.outcome || 'stopped';
        const labels = {
            passed: 'All validation criteria satisfied',
            partial: 'Some mechanisms validated',
            invalid: 'Experimental evidence was invalid',
            stopped: 'Pipeline stopped without validation',
        };
        const icon = outcome === 'passed' ? '✓' : outcome === 'partial' ? '◐' : '■';
        return `<section class="exp2-pipeline-completion ${esc(outcome)}"><span>${icon}</span><div><strong>${esc(labels[outcome] || 'Pipeline complete')}</strong><p>${esc(pipeline.stop_reason ? pipeline.stop_reason.replaceAll('_', ' ') : 'Run complete')}</p></div></section>`;
    }

    function renderRuns(main) {
        const s = state.study;
        const counts = trialCounts(s.trials);
        const resumable = (counts.queued || 0) + (counts.interrupted || 0);
        const credentialNames = [...new Set([
            ...state.requiredKeys,
            ...s.sources.flatMap(source => source.credential_names || []),
        ])];
        main.innerHTML = `<div class="exp2-page">
            <section class="exp2-page-heading"><div><span class="exp2-section-number">02</span><h3>Run the evaluation</h3><p>Prepare reproducible source-task trial records and track their outcomes.</p></div>
                <div class="exp2-inline-actions"><button class="exp2-btn secondary" onclick="Experiment2Mode.switchTab('setup')">Review setup</button><button class="exp2-btn primary" onclick="Experiment2Mode.prepareTrials()">${s.trials.length ? 'Rebuild trial matrix' : 'Prepare baseline trials'}</button></div>
            </section>
            <div class="exp2-stat-grid">
                ${statCard('Total trials', s.trials.length, 'Source × task × repetitions')}
                ${statCard('Queued', counts.queued || 0, 'Prepared for execution')}
                ${statCard('Passed', counts.passed || 0, 'Validated retrievals', 'success')}
                ${statCard('Failed', counts.failed || 0, 'Ready for refinement', 'danger')}
            </div>
            <section class="exp2-run-console">
                <div class="exp2-run-toolbar">
                    <div><span class="exp2-live-dot ${state.running ? 'active' : ''}"></span><strong>${state.running ? 'Batch running' : 'Batch runner'}</strong><p>${state.running ? 'Progress is saved after every trial.' : `${resumable} queued or interrupted trial${resumable === 1 ? '' : 's'} ready.`}</p></div>
                    <div class="exp2-inline-actions">
                        ${state.running ? '<button class="exp2-btn danger" onclick="Experiment2Mode.cancelBatch()">Stop safely</button>' : `<button class="exp2-btn primary" ${!resumable || !s.id ? 'disabled' : ''} onclick="Experiment2Mode.startBatch()">${counts.interrupted ? 'Resume batch' : 'Run queued trials'}</button>`}
                    </div>
                </div>
                ${!s.id ? '<div class="exp2-run-guidance">Save the study before starting a batch.</div>' : ''}
                ${credentialNames.length ? `<div class="exp2-credentials"><div><strong>Source credentials</strong><small>Used for this run only. Values are never saved in the study.</small></div><div class="exp2-credential-fields">${credentialNames.map(name => `<label><span>${esc(name)}</span><input type="password" autocomplete="off" data-key="${esc(name)}" value="${esc(state.runKeys[name] || '')}" oninput="Experiment2Mode.setRunKey(this.dataset.key, this.value)" placeholder="Enter credential"></label>`).join('')}</div></div>` : ''}
                <div class="exp2-live-feed" aria-live="polite">
                    ${state.liveEvents.length ? state.liveEvents.slice(-30).map(runEventCard).join('') : '<div class="exp2-live-empty"><strong>Ready when you are</strong><span>Run messages, validation results, and failures will appear here as individual cards.</span></div>'}
                </div>
            </section>
            <section class="exp2-card">
                <div class="exp2-card-head"><div><h4>Trial matrix</h4><p>Baseline uses the immutable documentation-only handbook version H0.</p></div><span class="exp2-count">${s.trials.length} records</span></div>
                ${trialTable(s.trials)}
                ${trialEvidence()}
            </section>
        </div>`;
    }

    function runEventCard(event) {
        const kind = event.type === 'trial_finished'
            ? (event.trial?.status || 'info')
            : (event.type === 'error' ? 'failed' : event.type.includes('finished') ? 'passed' : 'info');
        const title = event.type === 'trial_started' ? `Trial ${event.position}/${event.total}`
            : event.type === 'trial_finished' ? `Trial ${String(event.trial?.status || 'finished').replace('_', ' ')}`
            : event.type === 'batch_started' ? 'Batch started'
            : event.type === 'batch_finished' ? 'Batch complete'
            : event.type === 'batch_cancelled' ? 'Batch stopped'
            : event.type === 'error' ? 'Run error' : 'Working';
        return `<article class="exp2-live-event ${esc(kind)}"><span class="exp2-event-mark"></span><div><strong>${esc(title)}</strong><p>${esc(event.message || event.error || '')}</p></div><time>${esc(event.displayTime || '')}</time></article>`;
    }

    function trialTable(trials) {
        if (!trials.length) return '<div class="exp2-empty"><span>▦</span><strong>No trial matrix yet</strong><p>Complete Setup, then prepare baseline trials.</p></div>';
        return `<div class="exp2-table-wrap"><table class="exp2-table trials"><thead><tr><th>Trial</th><th>Mechanism</th><th>Source</th><th>Task</th><th>Version</th><th>Outcome</th><th>Action</th></tr></thead><tbody>
            ${trials.map((trial, index) => {
                const source = state.study.sources.find(s => s.id === trial.source_id) || {};
                const task = state.study.tasks.find(t => t.id === trial.task_id) || {};
                return `<tr class="${state.selectedTrialId === trial.id ? 'selected' : ''}"><td><strong>T${String(index+1).padStart(3,'0')}</strong><small>Run ${trial.repetition || 1}</small></td><td><span class="exp2-tag">${esc(MECHANISMS[trial.mechanism]?.label || trial.mechanism)}</span></td><td>${esc(source.name || 'Removed source')}</td><td><strong>${esc(task.name || 'Removed task')}</strong><small>${esc(task.difficulty || '')}</small></td><td>${esc(trial.handbook_version || 'H0')}</td><td><select class="exp2-status-select ${esc(trial.status)}" ${state.running ? 'disabled' : ''} onchange="Experiment2Mode.updateTrial('${trial.id}', this.value)">${['queued','running','passed','failed','needs_handbook','needs_credentials','interrupted','skipped'].map(v=>`<option value="${v}" ${trial.status===v?'selected':''}>${v.replaceAll('_',' ')}</option>`).join('')}</select></td><td><div class="exp2-row-actions"><button class="exp2-btn tiny" onclick="Experiment2Mode.inspectTrial('${trial.id}')">${state.selectedTrialId === trial.id ? 'Hide evidence' : 'Evidence'}</button><button class="exp2-btn tiny secondary" onclick="Experiment2Mode.generateH0('${source.id}')">Generate H0</button></div></td></tr>`;
            }).join('')}
        </tbody></table></div>`;
    }

    function trialEvidence() {
        const trial = state.study.trials.find(item => item.id === state.selectedTrialId);
        if (!trial) return '';
        const result = trial.execution_result || {};
        const validation = result.validation || {};
        return `<article class="exp2-evidence">
            <div class="exp2-card-head"><div><h4>Trial evidence</h4><p>Structured record captured from the pinned-handbook execution.</p></div><span class="exp2-tag ${trial.status === 'passed' ? '' : 'neutral'}">${esc(trial.status || 'queued')}</span></div>
            <div class="exp2-evidence-grid">
                <div><span>Validation</span><strong>${validation.passed ? 'Passed' : 'Not passed'}</strong><small>${esc(validation.message || trial.notes || 'No execution evidence yet.')}</small></div>
                <div><span>Execution</span><strong>${esc(result.execution?.attempts_used ?? '—')} attempt(s)</strong><small>${esc(trial.duration_seconds != null ? `${trial.duration_seconds}s elapsed` : 'Not run')}</small></div>
                <div><span>Outputs</span><strong>${(result.downloaded_files || []).length} file(s)</strong><small>${esc((result.downloaded_files || []).map(file => `${file.name} (${file.size_bytes} bytes)`).join(', ') || 'None')}</small></div>
                <div><span>Requests</span><strong>${(result.http_requests || []).length} request(s)</strong><small>${esc((result.http_requests || []).slice(-2).map(item => `${item.method} ${item.url}`).join(' · ') || 'None')}</small></div>
            </div>
            ${result.generated_code ? `<details><summary>Generated retrieval code</summary><pre><code>${esc(result.generated_code)}</code></pre></details>` : ''}
            ${result.error ? `<details class="error"><summary>Error trace</summary><pre>${esc(result.error)}</pre></details>` : ''}
        </article>`;
    }

    function setRunKey(name, value) {
        state.runKeys[name] = value;
    }

    function inspectTrial(id) {
        state.selectedTrialId = state.selectedTrialId === id ? null : id;
        render();
    }

    function addRunEvent(event) {
        event.displayTime = new Date().toLocaleTimeString([], {
            hour: '2-digit', minute: '2-digit', second: '2-digit',
        });
        if (event.type === 'heartbeat') {
            const last = state.liveEvents[state.liveEvents.length - 1];
            if (last?.type === 'heartbeat') return;
        }
        state.liveEvents.push(event);
        if (state.liveEvents.length > 80) state.liveEvents.splice(0, state.liveEvents.length - 80);
    }

    function applyRunEvent(event) {
        if (event.study) {
            state.study = event.study;
            savedState('Run progress saved');
        }
        const pipeline = state.study.pipeline_state || (state.study.pipeline_state = {
            status: 'running', stages: [], required_keys: [],
        });
        const stages = pipeline.stages || (pipeline.stages = []);
        const targetStage = (key) => stages.find(item => item.key === key)
            || [...stages].reverse().find(item => item.status === 'running');
        let liveStage = null;

        if (event.type === 'stage' && event.stage) {
            const index = stages.findIndex(item => item.key === event.stage.key);
            if (index < 0) stages.push(event.stage);
            else {
                // The server copy is authoritative, but a stage event that
                // arrives without details must not erase the progress lines
                // already streamed onto this card.
                const previous = stages[index];
                stages[index] = {
                    ...previous,
                    ...event.stage,
                    details: (event.stage.details || []).length
                        ? event.stage.details : (previous.details || []),
                };
                if (event.stage.status !== 'running') delete stages[index].hint;
            }
        }
        if (event.type === 'stage_progress') {
            const stage = targetStage(event.stage_key);
            const message = String(event.message || '').trim();
            if (stage && message) {
                const details = stage.details || (stage.details = []);
                if (details[details.length - 1] !== message) details.push(message);
                if (details.length > 30) details.splice(0, details.length - 30);
                delete stage.hint;
            }
            liveStage = stage;
        }
        if (event.type === 'heartbeat') {
            // Heartbeats say "still alive", not "something new happened", so
            // they refresh the live ticker instead of piling into the trail.
            const stage = targetStage(event.stage_key);
            if (stage) {
                stage.hint = String(event.message || '').trim();
                stage.elapsed_seconds = event.elapsed_seconds;
            }
            liveStage = stage;
        }
        if (event.type === 'pipeline_started') pipeline.status = 'running';
        if (event.type === 'credential_required') {
            const names = event.required_keys || [];
            state.requiredKeys = [...new Set([...state.requiredKeys, ...names])];
            pipeline.required_keys = state.requiredKeys;
            pipeline.status = 'awaiting_credentials';
        }
        if (event.type === 'retrieval_confirmation_required') {
            pipeline.status = 'awaiting_test_confirmation';
            pipeline.pending_mechanism = event.mechanism || '';
            pipeline.pending_message = event.message || '';
        }
        if (event.type === 'pipeline_cancelled') pipeline.status = 'interrupted';
        if (event.type === 'error') {
            pipeline.status = 'error';
            pipeline.error = event.error || 'Pipeline error';
        }
        if (liveStage && ['stage_progress', 'heartbeat'].includes(event.type)) {
            // Preserve the researcher's scroll position, expanded evidence,
            // text selection, and open output preview while the one live
            // message changes in place.
            updateLiveStageDom(liveStage);
        } else {
            render();
        }
    }

    async function startPipeline(restart = false) {
        if (state.running) return;
        if (!state.study.id && !(await save())) return;
        if (state.dirty && !(await save())) return;
        if (restart && !confirm('Start this experiment again? Existing pipeline stages, handbook versions, refinements, and trials will be replaced.')) return;
        if (restart) clearRunViewState();

        state.running = true;
        render();
        try {
            const pipeline = state.study.pipeline_state || {};
            const confirmMechanisms = (!restart && pipeline.status === 'awaiting_test_confirmation' && pipeline.pending_mechanism)
                ? [pipeline.pending_mechanism] : [];
            const response = await fetch(
                `/api/handbook-experiments/${encodeURIComponent(state.study.id)}/run-stream`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'text/event-stream',
                    },
                    body: JSON.stringify({
                        data_source_keys: state.runKeys,
                        restart: !!restart,
                        confirm_mechanisms: confirmMechanisms,
                    }),
                }
            );
            if (!response.ok || !response.body) {
                let message = `Could not start the experiment pipeline (${response.status}).`;
                try { message = (await response.json()).error || message; } catch (_) {}
                throw new Error(message);
            }
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            while (true) {
                const { value, done } = await reader.read();
                buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
                const frames = buffer.split(/\r?\n\r?\n/);
                buffer = frames.pop() || '';
                frames.forEach((frame) => {
                    const line = frame.split(/\r?\n/).find(item => item.startsWith('data:'));
                    if (!line) return;
                    try {
                        const event = JSON.parse(line.slice(5).trim());
                        applyRunEvent(event);
                        if (event.type === 'error') toast(event.error || 'Pipeline failed.', 'error');
                    } catch (_) { /* ignore malformed/partial event */ }
                });
                if (done) break;
            }
            const latest = await api(`/api/handbook-experiments/${encodeURIComponent(state.study.id)}`);
            state.study = latest.study;
            savedState('Run progress saved');
        } catch (error) {
            applyRunEvent({ type: 'error', error: error.message });
            toast(error.message, 'error');
        } finally {
            state.runKeys = {};
            state.running = false;
            render();
        }
    }

    function startBatch() {
        return startPipeline(false);
    }

    async function cancelBatch() {
        if (!state.running || !state.study.id) return;
        try {
            const data = await api(
                `/api/handbook-experiments/${encodeURIComponent(state.study.id)}/cancel`,
                { method: 'POST' }
            );
            applyRunEvent({ type: 'heartbeat', message: data.message });
            toast('Safe stop requested.', 'info');
        } catch (error) {
            toast(error.message, 'error');
        }
    }

    function updateTrial(id, status) {
        const trial = state.study.trials.find(t => t.id === id);
        if (!trial) return;
        trial.status = status; trial.updated_at = now();
        if (status !== 'failed') trial.failure_category = '';
        markDirty(); render();
    }

    function renderRefinement(main) {
        const failed = state.study.trials.filter(t => t.status === 'failed');
        main.innerHTML = `<div class="exp2-page">
            <section class="exp2-page-heading"><div><span class="exp2-section-number">03</span><h3>Refine failed handbooks</h3><p>Classify failures, record revisions, and create paired post-refinement trials.</p></div><span class="exp2-readiness ${failed.length ? '' : 'ready'}">${failed.length} failed trial${failed.length === 1 ? '' : 's'}</span></section>
            <section class="exp2-card">
                <div class="exp2-card-head"><div><h4>Failure review queue</h4><p>Confirmed categories support mechanism-specific failure analysis.</p></div></div>
                ${failed.length ? `<div class="exp2-refinement-list">${failed.map(refinementCard).join('')}</div>` : '<div class="exp2-empty"><span>✓</span><strong>No failed trials awaiting refinement</strong><p>Mark failed outcomes in Runs to create this review queue.</p></div>'}
            </section>
            <section class="exp2-card">
                <div class="exp2-card-head"><div><h4>Handbook version history</h4><p>H0 remains the immutable, self-verified baseline produced before task evaluation.</p></div><span class="exp2-count">${state.study.refinements.length} refinements</span></div>
                ${versionHistory()}
            </section>
        </div>`;
    }

    function refinementCard(trial) {
        const source = state.study.sources.find(s => s.id === trial.source_id) || {};
        const task = state.study.tasks.find(t => t.id === trial.task_id) || {};
        const existing = state.study.refinements.find(r => r.trial_id === trial.id);
        return `<article class="exp2-refinement-card">
            <div class="exp2-refinement-top"><div><span class="exp2-tag">${esc(MECHANISMS[trial.mechanism]?.label || trial.mechanism)}</span><h4>${esc(source.name || 'Source')} · ${esc(task.name || 'Task')}</h4><p>${esc(task.description || '')}</p></div><span class="exp2-version">${esc(trial.handbook_version || 'H0')}</span></div>
            <div class="exp2-form-grid two">
                <label><span>Confirmed failure category</span><select id="failure-${trial.id}"><option value="">Select category…</option>${FAILURE_CATEGORIES.map(c=>`<option ${trial.failure_category===c?'selected':''}>${esc(c)}</option>`).join('')}</select></label>
                <label class="wide"><span>Failure evidence or trace summary</span><textarea id="failure-note-${trial.id}" rows="2" placeholder="Error, failed parameter, invalid output…">${esc(trial.notes || '')}</textarea></label>
            </div>
            <div class="exp2-form-actions"><button class="exp2-btn secondary" onclick="Experiment2Mode.saveFailure('${trial.id}')">Save classification</button>${existing ? `<span class="exp2-done-label">Revision ${esc(existing.to_version)} recorded</span>` : `<button class="exp2-btn primary" onclick="Experiment2Mode.createRefinement('${trial.id}')">Create refinement record</button>`}</div>
        </article>`;
    }

    function saveFailure(trialId) {
        const trial = state.study.trials.find(t => t.id === trialId);
        if (!trial) return;
        trial.failure_category = byId(`failure-${trialId}`).value;
        trial.notes = byId(`failure-note-${trialId}`).value.trim();
        trial.updated_at = now();
        markDirty(); toast('Failure classification saved.');
    }

    function createRefinement(trialId) {
        saveFailure(trialId);
        const trial = state.study.trials.find(t => t.id === trialId);
        if (!trial.failure_category) return toast('Confirm a failure category first.', 'error');
        const sourceRefinements = state.study.refinements.filter(r => r.source_id === trial.source_id);
        const version = `H${sourceRefinements.length + 1}`;
        state.study.refinements.push({
            id: uid('refinement'), trial_id: trial.id, source_id: trial.source_id,
            task_id: trial.task_id, from_version: trial.handbook_version || 'H0',
            to_version: version, failure_category: trial.failure_category,
            evidence: trial.notes, status: 'proposed', created_at: now(),
        });
        state.study.trials.push({
            ...trial, id: uid('trial'), condition: 'refined',
            handbook_version: version, repetition: trial.repetition || 1,
            attempt: (trial.attempt || 1) + 1, status: 'queued',
            parent_trial_id: trial.id, failure_category: '', notes: '',
            created_at: now(), updated_at: now(),
        });
        markDirty(); render(); toast(`${version} refinement and paired rerun prepared.`);
    }

    function versionHistory() {
        if (!state.study.sources.length) return '<div class="exp2-empty compact"><p>Add sources to establish H0 baselines.</p></div>';
        return `<div class="exp2-version-list">${state.study.sources.map(source => {
            const refs = state.study.refinements.filter(r => r.source_id === source.id);
            return `<div class="exp2-version-row"><div><strong>${esc(source.name)}</strong><small>${esc(MECHANISMS[source.mechanism]?.label || '')}</small></div><div class="exp2-version-chain"><span class="baseline">H0 <em>Self-verified baseline</em></span>${refs.map(r=>`<span>${esc(r.to_version)} <em>${esc(r.failure_category)}</em></span>`).join('')}</div></div>`;
        }).join('')}</div>`;
    }

    // Rate over trials where `field` reached a determinate pass/fail verdict
    // (excludes 'unknown'/'not_applicable', which aren't correctness data).
    function correctnessRate(trials, field) {
        const determinate = trials.filter(t => {
            const v = (t.semantic_validation || {})[field];
            return v === 'pass' || v === 'fail';
        });
        if (!determinate.length) return null;
        return Math.round(determinate.filter(t => t.semantic_validation[field] === 'pass').length / determinate.length * 100);
    }

    function taskCompletionRate(trials) {
        const evaluated = trials.filter(t => typeof (t.semantic_validation || {}).task_completed === 'boolean');
        if (!evaluated.length) return null;
        return Math.round(evaluated.filter(t => t.semantic_validation.task_completed).length / evaluated.length * 100);
    }

    function formatRate(value) {
        return value === null ? '—' : `${value}%`;
    }

    function renderResults(main) {
        const trials = state.study.trials;
        const complete = trials.filter(t => ['passed','failed'].includes(t.status));
        const baseline = complete.filter(t => t.condition === 'baseline');
        const refined = complete.filter(t => t.condition === 'refined');
        const rate = (items) => items.length ? Math.round(items.filter(t=>t.status==='passed').length / items.length * 100) : 0;
        const baselineRate = rate(baseline), refinedRate = rate(refined);

        const taskRate = taskCompletionRate(complete);
        const paramRate = correctnessRate(complete, 'parameter_correctness');
        const spatialRate = correctnessRate(complete, 'spatial_query_correctness');
        const temporalRate = correctnessRate(complete, 'temporal_query_correctness');
        const refinementIterations = (state.study.handbook_versions || []).filter(v => (v.iteration || 0) > 0).length;
        const handbookRevisions = (state.study.refinements || []).length;

        main.innerHTML = `<div class="exp2-page">
            <section class="exp2-page-heading"><div><span class="exp2-section-number">04</span><h3>Compare and export results</h3><p>Metrics update from validated trial outcomes and remain linked to trial records.</p></div><div class="exp2-inline-actions"><button class="exp2-btn secondary" onclick="Experiment2Mode.exportCSV()">Export trials CSV</button><button class="exp2-btn primary" onclick="Experiment2Mode.exportJSON()">Export study JSON</button></div></section>
            <div class="exp2-stat-grid">
                ${statCard('Baseline success', `${baselineRate}%`, `${baseline.length} completed H0 trials`)}
                ${statCard('Refined success', `${refinedRate}%`, `${refined.length} completed refined trials`, 'success')}
                ${statCard('Improvement', `${refined.length && baseline.length ? (refinedRate-baselineRate>=0?'+':'')+(refinedRate-baselineRate) : 0} pts`, 'Absolute percentage-point change')}
                ${statCard('Manual interventions', state.study.manual_interventions.length, 'Recorded researcher actions')}
            </div>
            <div class="exp2-stat-grid">
                ${statCard('Task completion', formatRate(taskRate), 'Semantic task success across evaluated trials')}
                ${statCard('Parameter correctness', formatRate(paramRate), 'Correct endpoint/parameter usage, where evaluated')}
                ${statCard('Spatial correctness', formatRate(spatialRate), 'Correct spatial filtering, where applicable')}
                ${statCard('Temporal correctness', formatRate(temporalRate), 'Correct temporal filtering, where applicable')}
            </div>
            <div class="exp2-stat-grid">
                ${statCard('Refinement iterations', refinementIterations, 'Refined handbook versions produced (H1 and beyond)')}
                ${statCard('Handbook revisions', handbookRevisions, 'Recorded refinement edits')}
            </div>
            <section class="exp2-card"><div class="exp2-card-head"><div><h4>Performance by access mechanism</h4><p>Baseline and refined retrieval success.</p></div></div>${mechanismResults()}</section>
            <section class="exp2-card"><div class="exp2-card-head"><div><h4>Semantic validation by access mechanism</h4><p>Task completion and query-correctness rates from evaluated trials.</p></div></div>${semanticMechanismResults()}</section>
            <section class="exp2-card"><div class="exp2-card-head"><div><h4>Failure patterns</h4><p>Confirmed classifications from baseline and refined trials.</p></div></div>${failureResults()}</section>
            ${!complete.length ? '<section class="exp2-notice neutral"><strong>Results will populate during the live pipeline</strong><p>Baseline and refined retrieval outcomes are recorded automatically in Runs.</p></section>' : ''}
        </div>`;
    }

    function mechanismResults() {
        const rows = state.study.mechanisms.map((mechanism) => {
            const base = state.study.trials.filter(t => t.mechanism===mechanism && t.condition==='baseline' && ['passed','failed'].includes(t.status));
            const refined = state.study.trials.filter(t => t.mechanism===mechanism && t.condition==='refined' && ['passed','failed'].includes(t.status));
            const r = arr => arr.length ? Math.round(arr.filter(t=>t.status==='passed').length/arr.length*100) : null;
            const br=r(base), rr=r(refined);
            return `<tr><td><strong>${esc(MECHANISMS[mechanism].label)}</strong></td><td>${base.length}</td><td>${br===null?'—':br+'%'}</td><td>${refined.length}</td><td>${rr===null?'—':rr+'%'}</td><td>${br!==null&&rr!==null?`${rr-br>=0?'+':''}${rr-br} pts`:'—'}</td></tr>`;
        });
        return `<div class="exp2-table-wrap"><table class="exp2-table"><thead><tr><th>Mechanism</th><th>Baseline n</th><th>Baseline success</th><th>Refined n</th><th>Refined success</th><th>Change</th></tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
    }

    function semanticMechanismResults() {
        const rows = state.study.mechanisms.map((mechanism) => {
            const evaluated = state.study.trials.filter(t => t.mechanism===mechanism && ['passed','failed'].includes(t.status));
            const iterations = (state.study.handbook_versions || [])
                .filter(v => v.mechanism === mechanism && (v.iteration || 0) > 0).length;
            return `<tr><td><strong>${esc(MECHANISMS[mechanism].label)}</strong></td><td>${formatRate(taskCompletionRate(evaluated))}</td><td>${formatRate(correctnessRate(evaluated, 'parameter_correctness'))}</td><td>${formatRate(correctnessRate(evaluated, 'spatial_query_correctness'))}</td><td>${formatRate(correctnessRate(evaluated, 'temporal_query_correctness'))}</td><td>${iterations}</td></tr>`;
        });
        return `<div class="exp2-table-wrap"><table class="exp2-table"><thead><tr><th>Mechanism</th><th>Task completion</th><th>Parameter correctness</th><th>Spatial correctness</th><th>Temporal correctness</th><th>Refinement iterations</th></tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
    }

    function failureResults() {
        const counts = {};
        state.study.trials.forEach(t => { if (t.failure_category) counts[t.failure_category]=(counts[t.failure_category]||0)+1; });
        const entries = Object.entries(counts).sort((a,b)=>b[1]-a[1]);
        if (!entries.length) return '<div class="exp2-empty compact"><p>No confirmed failure classifications yet.</p></div>';
        const max = Math.max(...entries.map(e=>e[1]));
        return `<div class="exp2-failure-bars">${entries.map(([name,count])=>`<div><span>${esc(name)}</span><div><i style="width:${count/max*100}%"></i></div><strong>${count}</strong></div>`).join('')}</div>`;
    }

    function trialCounts(trials) {
        return trials.reduce((acc,t)=>{acc[t.status]=(acc[t.status]||0)+1;return acc;},{});
    }
    function statCard(label, value, hint, kind='') {
        return `<article class="exp2-stat ${kind}"><span>${esc(label)}</span><strong>${esc(value)}</strong><small>${esc(hint)}</small></article>`;
    }

    async function save() {
        if (state.running) {
            toast('Run progress is being saved automatically.', 'info');
            return false;
        }
        if (state.saving) return;
        state.saving = true;
        const label = byId('exp2-save-state');
        if (label) label.textContent = 'Saving…';
        try {
            const path = state.study.id ? `/api/handbook-experiments/${encodeURIComponent(state.study.id)}` : '/api/handbook-experiments';
            const method = state.study.id ? 'PUT' : 'POST';
            const data = await api(path, {
                method, headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(state.study),
            });
            state.study = data.study;
            savedState(`Saved ${new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}`);
            toast('Experiment study saved.');
            render();
            return true;
        } catch (error) {
            markDirty(); toast(error.message, 'error'); return false;
        } finally { state.saving = false; }
    }

    async function saveAndContinue() {
        const ready = readiness();
        if (!ready.ready) {
            toast(ready.issues[0], 'error');
            return;
        }
        const ok = await save();
        if (!ok) return;
        const restart = state.study.pipeline_state?.status === 'complete';
        switchTab('runs');
        setTimeout(() => startPipeline(restart), 120);
    }

    async function openStudyPicker() {
        const main = byId('exp2-main');
        try {
            const data = await api('/api/handbook-experiments');
            main.innerHTML = `<div class="exp2-page"><section class="exp2-page-heading"><div><span class="exp2-section-number">STUDIES</span><h3>Experiment 2 studies</h3><p>Continue a saved study or start a new one.</p></div><button class="exp2-btn primary" onclick="Experiment2Mode.newStudy()">+ New study</button></section>
                <div class="exp2-study-grid">${(data.studies||[]).length ? data.studies.map(study=>`<article class="exp2-study-card"><span class="exp2-tag neutral">${esc(study.status)}</span><h4>${esc(study.name)}</h4><p>Updated ${esc(new Date(study.updated_at).toLocaleString())}</p><div><span>${study.source_count} sources</span><span>${study.task_count} tasks</span><span>${study.trial_count} trials</span></div><button class="exp2-btn primary" onclick="Experiment2Mode.loadStudy('${study.id}')">Open study</button></article>`).join('') : '<div class="exp2-empty"><strong>No saved studies</strong><p>Create your first Experiment 2 study.</p></div>'}</div></div>`;
        } catch (error) { toast(error.message, 'error'); }
    }

    function newStudy() {
        if (state.dirty && !confirm('Discard unsaved changes and start a new study?')) return;
        clearRunViewState();
        state.study = blankStudy(); savedState('Not saved'); switchTab('setup');
    }
    async function loadStudy(id) {
        try {
            const data = await api(`/api/handbook-experiments/${encodeURIComponent(id)}`);
            clearRunViewState();
            state.study = data.study;
            ensureSetupFields(state.study);
            state.tab='setup'; savedState('Saved'); switchTab('setup');
        } catch (error) { toast(error.message, 'error'); }
    }

    function download(filename, content, type) {
        const blob = new Blob([content], { type });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob); link.download = filename; link.click();
        setTimeout(()=>URL.revokeObjectURL(link.href), 0);
    }
    function exportJSON() {
        download(`${slug(state.study.name)}_experiment2.json`, JSON.stringify(state.study,null,2), 'application/json');
    }
    function exportCSV() {
        const headers = [
            'trial_id', 'condition', 'mechanism', 'source', 'task', 'handbook_version',
            'repetition', 'attempt', 'status', 'failure_category', 'notes',
            'task_completed', 'confidence', 'mechanism_correctness', 'parameter_correctness',
            'spatial_query_correctness', 'temporal_query_correctness', 'output_correctness',
            'should_refine_handbook', 'handbook_gap',
        ];
        const rows = state.study.trials.map(t => {
            const source=state.study.sources.find(s=>s.id===t.source_id)||{};
            const task=state.study.tasks.find(x=>x.id===t.task_id)||{};
            const sem = t.semantic_validation || {};
            return [
                t.id, t.condition, t.mechanism, source.name, task.name, t.handbook_version,
                t.repetition, t.attempt, t.status, t.failure_category, t.notes,
                sem.task_completed ?? '', sem.confidence ?? '', sem.mechanism_correctness || '',
                sem.parameter_correctness || '', sem.spatial_query_correctness || '',
                sem.temporal_query_correctness || '', sem.output_correctness || '',
                sem.should_refine_handbook ?? '', sem.handbook_gap || '',
            ];
        });
        const csv=[headers,...rows].map(row=>row.map(csvCell).join(',')).join('\r\n');
        download(`${slug(state.study.name)}_trials.csv`, csv, 'text/csv;charset=utf-8');
    }
    const csvCell = v => `"${String(v??'').replaceAll('"','""')}"`;
    const slug = v => String(v||'experiment_2').toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'');

    window.Experiment2Mode = {
        open, close, switchTab, save, saveAndContinue, openStudyPicker,
        newStudy, loadStudy, toggleMechanism,
        prepareTrials, updateTrial, saveFailure, createRefinement,
        exportJSON, exportCSV, startPipeline, startBatch, cancelBatch,
        setRunKey, inspectTrial, scrollToStage, toggleStageCard,
        toggleOutputPreview, downloadOutput,
    };
})();
