# Blender tools (VRM scan / idle motion)

This folder contains small Blender batch jobs used by `touhou-talk-ui` to:

- Scan a VRM for bones + shape keys (morph targets)
- Generate a simple "idle breathe" animation and export it as GLB

Jobs live under `touhou-talk-ui/tools/blender/jobs/` and are executed via `run.ps1`.

## Prerequisites

- Windows
- Blender installed

If `blender.exe` is not found automatically, set:

```powershell
$env:BLENDER_EXE="C:\\Program Files\\Blender Foundation\\Blender 4.2\\blender.exe"
```

## How to run

`run.ps1` resolves input/output paths relative to the repo root.

### 1) Scan a VRM

Produces a JSON containing bone names and mesh shape keys.

```powershell
pwsh -File touhou-talk-ui/tools/blender/run.ps1 `
  -Job scan `
  -Input "touhou-talk-ui/vrm-characters/reimu.vrm" `
  -Output "touhou-talk-ui/vrm-characters/reimu.scan.json"
```

### 2) Generate a base idle animation (GLB)

```powershell
pwsh -File touhou-talk-ui/tools/blender/run.ps1 `
  -Job idle `
  -Input "touhou-talk-ui/vrm-characters/reimu.vrm" `
  -Output "touhou-talk-ui/vrm-characters/motion-library/converted/glb/reimu_idle_breathe.glb"
```

Notes:

- The current `idle` job is conservative and primarily intended as a baseline for Reimu-like VRMs.
- VRM is a glTF-based format; these jobs use Blender's glTF importer/exporter (no VRM addon dependency).

