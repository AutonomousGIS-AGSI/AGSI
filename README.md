# AGM — Offline Conversation Snapshots

Self-contained, read-only snapshots of conversations produced by the
**Autonomous Geographic Modeling (AGM)** WebUI. Each subfolder is an
independent bundle: chat transcript, workflow cards, research plan,
flowchart, geoprocessing diagram, all generated figures and tables,
the manuscript, and the original uploaded data — no server, network,
or API key required.

## Bundles in this repository

| Folder | Research question |
| --- | --- |
| [`124e6b8e-ad5a-49f9-802e-87cc5101dda4/`](124e6b8e-ad5a-49f9-802e-87cc5101dda4/) | How do spatial patterns of mobility (place visitation) mediate the relationship between neighborhood socioeconomic status and depression prevalence across the counties of South Carolina? |
| [`a4c5a1b9-449e-440c-a2cf-003513b58787/`](a4c5a1b9-449e-440c-a2cf-003513b58787/) | How do spatial inequalities in PM2.5 exposure across California counties vary with income inequality (Gini) in 2019, and does the spatial relationship vary by urban–rural classification? |
| [`c52bc37f-8e66-4df1-b20b-57c92bbd2311/`](c52bc37f-8e66-4df1-b20b-57c92bbd2311/) | How does proximity to hazardous waste facilities influence spatial patterns of asthma prevalence across census tracts of North Carolina, and how do these relationships vary spatially by socioeconomic and demographic context? |

Each bundle contains:

```
<conversation_id>/
├── index.html, map.html, styles.css, script.js   (patched WebUI)
├── offline-config.js, offline-shim.js            (rewrites /api/* to local files)
├── data/                                         (conversation + workflow JSON)
├── artifacts/<task_id>/                          (figures, tables, plan HTMLs, manuscript)
├── uploads/<conversation_id>/                    (original input data)
└── START_HERE.txt
```

---

## How to open a snapshot

Most browsers block JavaScript from reading local files when you simply
double-click `index.html` (the `file://` security policy). Use **one** of
the options below.

### Option 1 — Run a tiny local web server  *(recommended, works everywhere)*

Requires Python 3 (pre-installed on macOS and most Linux; on Windows
install from <https://www.python.org/downloads/> — tick *"Add to PATH"*).

1. Open a terminal **inside the snapshot folder**:
   - **Windows**: <kbd>Shift</kbd> + right-click in the folder →
     *"Open PowerShell window here"* (or *"Open in Terminal"*).
   - **macOS**: right-click the folder → *Services* → *"New Terminal at Folder"*.
   - **Linux**: `cd /path/to/<conversation_id>`.
2. Run:
   ```bash
   python -m http.server 8000
   ```
   *(on some systems use `python3` instead of `python`)*
3. Open your browser to <http://localhost:8000>.
4. When done, press <kbd>Ctrl</kbd>+<kbd>C</kbd> in the terminal to stop.



### Option 2 — VS Code "Live Server" extension

If you already use VS Code:

1. Open the snapshot folder in VS Code.
2. Install the **Live Server** extension (by Ritwick Dey).
3. Right-click `index.html` → *"Open with Live Server"*.

---

## What you can and cannot do

|  | Supported |
| --- | --- |
| Read the full chat | ✅ |
| Expand workflow cards (objectives & steps) | ✅ |
| View figures, tables, generated code | ✅ |
| Scroll the research plan, flowchart, and geoprocessing diagrams | ✅ |
| Read the generated manuscript | ✅ |
| Download artifacts | ✅ |
| View uploaded data on the embedded map | ✅ |
| Send new messages, re-run steps, edit the plan | ❌ *(disabled by design)* |

---

## Troubleshooting

- **Blank page or spinning loader** — you almost certainly opened it via
  `file://` instead of `http://localhost`. Use Option 1.
- **`Address already in use` on port 8000** — pick another port:
  ```bash
  python -m http.server 8123
  ```
  then visit <http://localhost:8123>.
- **Map iframe is empty** — same root cause: serve via a local web server.

---

## Regenerating a bundle

These snapshots were produced by `WebUI/export_offline_conversation.py`
in the AGM source repository. To regenerate or add a new bundle:

```bash
python WebUI/export_offline_conversation.py <conversation_id>
```

The script reads from `WebUI/conversations.db`, mirrors the matching
`Outputs/<task_id>/` and `WebUI/uploads/<conversation_id>/` directories,
and writes the result to `Offline_Exports/<conversation_id>/`.
