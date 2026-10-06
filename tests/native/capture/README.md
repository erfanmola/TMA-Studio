# Native compositor capture spike

This opt-in macOS fixture records the real composed Bunium window: a
checkerboard CEF guest, a second overlapping guest, rounded native clipping,
and a host frame/menu overlay. It also builds Studio's one-frame PNG helper
and captures the full window, a Telegram surface crop, and one guest viewport.
PNG capture uses ScreenCaptureKit on macOS 12.3 and newer, with a CoreGraphics
window-image fallback for macOS 12.0–12.2. Both paths capture one matching
application window rather than the desktop.

The capture queue is fixed at three ScreenCaptureKit frames. The writer keeps
only the newest source sample and emits at 30 fps; when its input is not ready,
it drops that output tick instead of queueing another frame. A 1280×960 BGRA
source queue plus the retained latest frame has a conservative raw capacity of
18.75 MiB. The capture helper removes a partial movie on cancellation or write
failure. `/dev/full` is used as the deterministic ENOSPC sink.

Run only on a macOS desktop session with Screen Recording permission and
`ffmpeg`/`ffprobe` available for artifact extraction and inspection:

```sh
RUN_NATIVE_CAPTURE=1 BUNIUM_REPO=/path/to/bunium bun test tests/native/capture/qualification.test.ts
```

The test leaves `composed-window.mov` and `composed-window.png` in
`/tmp/01g-capture-evidence` for visual review. The image is captured from the
fixture window itself. Check it to confirm guest layers and host content in the
same artifact; a host CEF screenshot alone is not compositor evidence.
Uniquely named `studio-*.png` and `tma-studio-*.png` artifacts show the full
image and scope crops. A second same-process window verifies exact-title
selection. The qualification exercises the CoreGraphics fallback on the
current macOS runner and checks that an existing PNG is not overwritten.

This is macOS qualification only; Windows/Linux capture implementations are
not included. The AVFoundation writer uses the compatibility
input API available for the project's macOS 12 baseline; newer SDKs deprecate
that API in favor of sample-buffer receivers.
