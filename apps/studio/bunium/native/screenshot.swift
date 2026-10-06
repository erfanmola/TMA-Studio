import AppKit
import CoreMedia
import CoreVideo
import Foundation
import ImageIO
import ScreenCaptureKit
import UniformTypeIdentifiers

private func writePNG(
  _ source: CGImage,
  output: URL,
  rect: CGRect,
  hostHeight: CGFloat,
  windowWidth: CGFloat,
  windowHeight: CGFloat,
  scope: String
) throws {
  guard source.width > 0, source.height > 0, source.width * source.height <= 16_000_000 else {
    throw NSError(domain: "TMAStudioCapture", code: 1)
  }
  let sx = CGFloat(source.width) / windowWidth
  let sy = CGFloat(source.height) / windowHeight
  let topInset = max(0, windowHeight - hostHeight)
  let crop = CGRect(x: rect.minX * sx, y: (topInset + rect.minY) * sy,
    width: rect.width * sx, height: rect.height * sy).integral
  let image: CGImage?
  if scope == "window" { image = source }
  else if CGRect(x: 0, y: 0, width: source.width, height: source.height).contains(crop) {
    image = source.cropping(to: crop)
  } else { image = nil }
  guard let image else {
    throw NSError(domain: "TMAStudioCapture", code: 3, userInfo: [NSLocalizedDescriptionKey:
      "Crop exceeds captured window: crop=\(crop), raster=\(source.width)x\(source.height), window=\(windowWidth)x\(windowHeight), hostHeight=\(hostHeight)"])
  }
  let data = NSMutableData()
  guard let destination = CGImageDestinationCreateWithData(data, UTType.png.identifier as CFString, 1, nil) else {
    throw NSError(domain: "TMAStudioCapture", code: 4)
  }
  CGImageDestinationAddImage(destination, image, nil)
  guard CGImageDestinationFinalize(destination) else {
    throw NSError(domain: "TMAStudioCapture", code: 5)
  }
  try (data as Data).write(to: output, options: .withoutOverwriting)
}

@available(macOS 12.3, *)
private final class OneFrame: NSObject, SCStreamOutput, SCStreamDelegate {
  private let stream: SCStream
  private let output: URL
  private let rect: CGRect
  private let hostHeight: CGFloat
  private let windowWidth: CGFloat
  private let windowHeight: CGFloat
  private let scope: String
  private var continuation: CheckedContinuation<Void, Error>?
  private var finished = false
  private let lock = NSLock()

  init(stream: SCStream, output: URL, rect: CGRect, hostHeight: CGFloat,
    windowWidth: CGFloat, windowHeight: CGFloat, scope: String) {
    self.stream = stream
    self.output = output
    self.rect = rect
    self.hostHeight = hostHeight
    self.windowWidth = windowWidth
    self.windowHeight = windowHeight
    self.scope = scope
  }

  func run() async throws {
    try await withCheckedThrowingContinuation { continuation in
      self.continuation = continuation
      Task {
        do { try await stream.startCapture() }
        catch { finish(error) }
      }
    }
  }

  func stream(_ stream: SCStream, didOutputSampleBuffer sampleBuffer: CMSampleBuffer, of type: SCStreamOutputType) {
    guard type == .screen, CMSampleBufferDataIsReady(sampleBuffer),
      let pixel = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }
    do {
      let ci = CIImage(cvPixelBuffer: pixel)
      guard let source = CIContext().createCGImage(ci, from: ci.extent) else {
        throw NSError(domain: "TMAStudioCapture", code: 2)
      }
      try writePNG(source, output: output, rect: rect, hostHeight: hostHeight,
        windowWidth: windowWidth, windowHeight: windowHeight, scope: scope)
      finish(nil)
    } catch { finish(error) }
  }

  func stream(_ stream: SCStream, didStopWithError error: Error) { finish(error) }

  private func finish(_ error: Error?) {
    lock.lock()
    guard !finished else { lock.unlock(); return }
    finished = true
    let continuation = self.continuation
    lock.unlock()
    Task {
      try? await stream.stopCapture()
      if let error { continuation?.resume(throwing: error) }
      else { continuation?.resume() }
    }
  }
}

@main private struct ScreenshotMain {
  private static func captureCoreGraphics(
    pid: Int32, title: String, bounds: CGRect, hostHeight: CGFloat, scope: String, output: URL
  ) throws {
    guard let entries = CGWindowListCopyWindowInfo(.optionOnScreenOnly, kCGNullWindowID) as? [[String: Any]],
      let entry = entries.first(where: {
        ($0[kCGWindowOwnerPID as String] as? Int32) == pid &&
        ($0[kCGWindowName as String] as? String) == title
      }),
      let number = entry[kCGWindowNumber as String] as? UInt32,
      let boundsValue = entry[kCGWindowBounds as String] as? [String: CGFloat],
      let windowWidth = boundsValue["Width"], let windowHeight = boundsValue["Height"],
      let source = CGWindowListCreateImage(.null, .optionIncludingWindow, number, .bestResolution)
    else { throw NSError(domain: "TMAStudioCapture", code: 6) }
    try writePNG(source, output: output, rect: bounds, hostHeight: hostHeight,
      windowWidth: windowWidth, windowHeight: windowHeight, scope: scope)
  }

  @available(macOS 12.3, *)
  private static func captureScreenKit(
    pid: Int32, title: String, bounds: CGRect, hostHeight: CGFloat, scope: String, output: URL
  ) async throws {
    let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true)
    guard let window = content.windows.first(where: {
      $0.owningApplication?.processID == pid && $0.title == title
    }) else { throw NSError(domain: "TMAStudioCapture", code: 6) }
    let config = SCStreamConfiguration()
    let scale = NSScreen.screens.first(where: { $0.frame.intersects(window.frame) })?.backingScaleFactor ?? 1
    config.width = max(1, Int(window.frame.width * scale))
    config.height = max(1, Int(window.frame.height * scale))
    config.pixelFormat = kCVPixelFormatType_32BGRA
    config.queueDepth = 1
    config.minimumFrameInterval = CMTime(value: 1, timescale: 30)
    if #available(macOS 13.0, *) { config.capturesAudio = false }
    let stream = SCStream(filter: SCContentFilter(desktopIndependentWindow: window), configuration: config, delegate: nil)
    let capture = OneFrame(stream: stream, output: output, rect: bounds, hostHeight: hostHeight,
      windowWidth: window.frame.width, windowHeight: window.frame.height, scope: scope)
    try stream.addStreamOutput(capture, type: .screen, sampleHandlerQueue: DispatchQueue(label: "tma.capture.png"))
    try await capture.run()
  }

  static func main() async {
    if CommandLine.arguments.count == 2 && CommandLine.arguments[1] == "--check" {
      let os = ProcessInfo.processInfo.operatingSystemVersion
      exit(os.majorVersion >= 12 ? 0 : 69)
    }
    guard CommandLine.arguments.count == 11,
      let pid = Int32(CommandLine.arguments[1]),
      let hostWidth = Double(CommandLine.arguments[3]),
      let hostHeight = Double(CommandLine.arguments[4]),
      let x = Double(CommandLine.arguments[5]), let y = Double(CommandLine.arguments[6]),
      let width = Double(CommandLine.arguments[7]), let height = Double(CommandLine.arguments[8])
    else { exit(64) }
    _ = NSApplication.shared
    do {
      let bounds = CGRect(x: x, y: y, width: width, height: height)
      guard bounds.minX >= 0, bounds.minY >= 0, bounds.width > 0, bounds.height > 0,
        bounds.maxX <= hostWidth, bounds.maxY <= hostHeight else { exit(65) }
      let output = URL(fileURLWithPath: CommandLine.arguments[10])
      let title = CommandLine.arguments[2]
      let scope = CommandLine.arguments[9]
      if ProcessInfo.processInfo.environment["TMA_STUDIO_FORCE_COREGRAPHICS"] == "1" {
        try captureCoreGraphics(pid: pid, title: title, bounds: bounds,
          hostHeight: CGFloat(hostHeight), scope: scope, output: output)
      } else if #available(macOS 12.3, *) {
        try await captureScreenKit(pid: pid, title: title, bounds: bounds,
          hostHeight: CGFloat(hostHeight), scope: scope, output: output)
      } else {
        try captureCoreGraphics(pid: pid, title: title, bounds: bounds,
          hostHeight: CGFloat(hostHeight), scope: scope, output: output)
      }
    } catch {
      fputs("Screenshot capture failed: \(error.localizedDescription)\n", stderr)
      exit(1)
    }
  }
}
