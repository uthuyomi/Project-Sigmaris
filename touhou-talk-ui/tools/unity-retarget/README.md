# Unity retarget tools (Mixamo -> VRM)

This folder contains a Unity Editor drop-in used to convert Mixamo humanoid animations into:

- Baked Transform `.anim` clips (easy to export / consume outside Unity), and optionally
- `.glb` exports (requires UnityGLTF)

The drop-in is under `touhou-talk-ui/tools/unity-retarget/UnityDropIn/` and can be copied into any Unity project.

## Prerequisites

- Unity 2022.3 LTS (recommended)
- A VRM importer (UniVRM) to bring VRM as a Humanoid prefab
- Mixamo FBX animations imported with Humanoid rig

Optional:

- UnityGLTF (if you want the "Export GLB" option)

## Setup (in Unity)

1) Create/open a Unity project.
2) Import UniVRM (or your VRM pipeline) and import your VRM as a prefab.
3) Copy `UnityDropIn/Assets/Editor/` into your project's `Assets/Editor/`.
4) Import Mixamo FBX files into a folder (example: `Assets/Mixamo/`).

Mixamo import settings (typical):

- `Rig` -> `Animation Type: Humanoid`
- `Avatar Definition: Create From This Model`

## Bake animations

Open:

- `Tools > Touhou Talk > Mixamo -> VRM Bake`

Fill in:

- `VRM Prefab` (must have an `Animator` with a Humanoid avatar)
- `Mixamo Folder` (folder containing animation clips / FBX)
- `Output Folder` (where `.anim` files are written)
- `Sample FPS` (default 30)

Click "Bake All".

Outputs:

- One baked `.anim` per source clip under `Output Folder`
- Names include the source asset filename (Mixamo clips often share internal names)

## Fix SkinnedMeshRenderer bindings (common import issue)

If a VRM prefab looks broken or skinning is incorrect, try:

- Select the VRM root object in the Hierarchy
- Run `Tools > Touhou Talk > Fix SkinnedMeshRenderer Bindings (RootBone/Bones)`

This attempts a best-effort repair of missing `rootBone` / bone references.

## Notes / limitations

- The baked clips are Transform animations; they are intended to be exported/consumed outside Unity.
- Exporting GLB requires UnityGLTF and is optional.

