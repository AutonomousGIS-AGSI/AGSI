# GIS Co-Scientist - Offline Conversation Snapshots

Self-contained, read-only snapshots of conversations produced by the
**GIS Co-Scientist** WebUI, a pipeline for Autonomous Geospatial Scientific Inquiry (AGSI). Each subfolder is an
independent bundle: chat transcript, workflow cards, research plan,
flowchart, geoprocessing diagram, all generated figures and tables,
the manuscript, and the original uploaded data — no server, network,
or API key required. 

## Snapshots

| Folder | Session | Description |
|---|---|---|
| `Case1/` | `a4c5a1b9-449e-440c-a2cf-003513b58787` | Case 1: PM2.5 exposure and income inequality, California |
| `Case2/` | `124e6b8e-ad5a-49f9-802e-87cc5101dda4` | Case 2: mobility-mediated health, South Carolina |
| `Case3/` | `c52bc37f-8e66-4df1-b20b-57c92bbd2311` | Case 3: hazardous waste proximity and asthma, North Carolina |
| `Case1-ablation/` | `dd5922b8-6439-4369-b784-21a662f7c30c` | Case 1 without the Planning Agent |
| `Case2-ablation/` | `bb8805e4-6c34-49e8-aa70-b49981b7c56e` | Case 2 without the Planning Agent |
| `Case3-ablation/` | `9a0ef1c1-f819-4f4a-98ec-df6aceaa15b2` | Case 3 without the Planning Agent |

Append `?view=geoprocessing` to a case URL (for example
`https://autonomousgis-agsi.github.io/AGSI/Case1/?view=geoprocessing`)
to open its geoprocessing workflow directly.
