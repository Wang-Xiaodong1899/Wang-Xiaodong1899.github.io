# SimForcing project website

A self-contained, static project page with a method introduction and the user-selected qualitative comparisons. No CDN, framework, build-time npm dependencies, or runtime API is required.

## Preview

From the FastWAM repository root:

```bash
python3 -m http.server 8768 --bind 127.0.0.1 --directory visualizations/simforcing_project
```

Open http://127.0.0.1:8768/ . Forward port 8768 when working on a remote machine. `index.html` also works directly via `file://`.

Copy this entire directory to any static host to deploy it. All website media and the method figure are local files, not links into training runs. No public deployment has been performed.

## Content

- Project name, title, authors, and affiliation: `SimForcing-Proj/main.tex`.
- Method description: `SimForcing-Proj/sections/0_abstract.tex` and `3_method.tex`.
- Training diagram: `SimForcing-Proj/SimForcing/assets/method.png`.
- Header logo and browser icon: `SimForcing-Proj/resources/logos/pku-seal.png`.
- Bridge selection: `visualizations/bridge_demo_picks.json` (12 cases).
- OmniObject3D selection: `visualizations/omniobject3d_demo_picks.json` (11 cases).

Cases appear in selection-file order. Each has six video panels: SimForcing simulation prediction, SimForcing real prediction, real GT, GeniWorld prediction, Baseline prediction, and EnerVerse-AC prediction. The GT is the real GT saved in our original case video; it is not another method's generated output.

Simulation predictions are extracted from row 1 of the four-row Ours MP4. The row order is `[generated simulation, generated real, simulation GT, real GT]`, as verified in the Bridge and OmniObject3D v12 inference scripts. Real predictions, real GT, and competing predictions are copied from the previously normalized review assets.

- All 138 videos are 320×224, H.264, yuv420p; each has a local poster image.
- Bridge preserves 21 frames / 8 fps for our simulation, real, GT, GeniWorld and Baseline, and 16 frames / 5 fps for Ener. Website playback matches relative progress; this is **not frame-level temporal alignment**.
- OmniObject3D uses 32 frames / 8 fps for every panel, matching source frames 1–32 for Ours, GeniWorld and Baseline to Ener frames 0–31. The simulation crop follows exactly the same frame interval as the normalized real prediction and GT.
- Original composite videos and selection files are unchanged. Metrics are not shown, and no aggregate performance claims are inferred from the selected examples.

Two independent galleries are stacked vertically: Bridge and OmniObject3D. Each shows one selected example with six video panels, a task description, previous/next arrows, a small play/pause button, and navigation dots. Navigation wraps through the selected examples; touch swipes and left/right keyboard arrows are supported. There are no visible case IDs, frame counts, timelines, or technical notes. Clicking a video opens an enlarged view. Only visible groups load and play; switching a slide releases the previous videos. Playback pauses in background tabs and behind the inspection dialog. Reduced-motion preferences disable autoplay by default. Temporal alignment details remain documented above.

## Regenerate media and manifest

Requires Python 3, ffmpeg and ffprobe:

```bash
python3 visualizations/simforcing_project/build.py --workers 4
```

Use `--force` to re-extract simulation clips and regenerate posters. Output geometry, frame counts, frame rates, durations and codecs are verified. The script preserves selection order, emits `data.json` / `data.js` for the website, and writes media-source mappings to `provenance.json` for review.

If the pick lists change, rerun the script. Existing files for deselected cases may remain on disk but are excluded from `data.json` and the gallery.
