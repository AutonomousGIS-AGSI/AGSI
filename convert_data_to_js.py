"""Convert each Case's data/*.json into data/*.js that assigns to a window global,
so the snapshot can run from file:// without fetch().
"""
import json
import os
import sys

CASES = ["Case 1", "Case 2", "Case 3"]
MAPPING = {
    "conversation.json":   "__OFFLINE_CONVERSATION__",
    "conversations.json":  "__OFFLINE_CONVERSATIONS__",
    "workflow_steps.json": "__OFFLINE_WORKFLOW_STEPS__",
}

root = os.path.dirname(os.path.abspath(__file__))

for case in CASES:
    data_dir = os.path.join(root, case, "data")
    if not os.path.isdir(data_dir):
        print(f"skip: {data_dir} (missing)")
        continue
    for fname, var in MAPPING.items():
        src = os.path.join(data_dir, fname)
        if not os.path.isfile(src):
            print(f"skip: {src} (missing)")
            continue
        with open(src, "r", encoding="utf-8") as f:
            obj = json.load(f)
        js = f"window.{var} = " + json.dumps(obj, ensure_ascii=False) + ";\n"
        dst = os.path.splitext(src)[0] + ".js"
        with open(dst, "w", encoding="utf-8") as f:
            f.write(js)
        print(f"wrote: {dst}  ({len(js):,} bytes)")
