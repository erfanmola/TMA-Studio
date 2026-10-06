import AVFoundation
import AppKit
import CoreMedia
import CoreVideo
import Foundation
import ScreenCaptureKit

private enum CaptureFailure: Error, CustomStringConvertible {
  case usage
  case windowNotFound(String)
  case pixelLimit(width: Int, height: Int)
  case noFrames
  case cancelled
  case stream(String)
  case writer(String)

  var description: String {
    switch self {
    case .usage:
      return "usage: macos-window-capture.swift <window-title> <output.mov|/dev/full> <seconds> <width> <height>"
    case let .windowNotFound(title):
      return "on-screen window not found: \(title)"
    case let .pixelLimit(width, height):
      return "capture dimensions exceed bounded 16-megapixel limit: \(width)x\(height)"
    case .noFrames:
      return "ScreenCaptureKit produced no video frames"
    case .cancelled:
      return "capture cancelled"
    case let .stream(message):
      return "ScreenCaptureKit: \(message)"
    case let .writer(message):
      return "AVAssetWriter: \(message)"
    }
  }
}

private final class WindowCapture: NSObject, SCStreamOutput, SCStreamDelegate {
  private let title: String
  private let outputURL: URL
  private let seconds: Double
  private let width: Int
  private let height: Int
  private let outputQueue = DispatchQueue(label: "tma.capture.window.frames")
  private let lock = NSLock()

  private var stream: SCStream?
  private var writer: AVAssetWriter?
  private var writerInput: AVAssetWriterInput?
  private var frameTimer: DispatchSourceTimer?
  private var latestSampleBuffer: CMSampleBuffer?
  private var firstPresentationTime: CMTime?
  private var acceptedFrames = 0
  private var droppedFrames = 0
  private var outputFrameIndex: Int64 = 0
  private var failure: String?
  private var isStopping = false
  private var cancelRequested = false

  init(title: String, outputURL: URL, seconds: Double, width: Int, height: Int) {
    self.title = title
    self.outputURL = outputURL
    self.seconds = seconds
    self.width = width
    self.height = height
  }

  func run() async throws {
    guard width > 0, height > 0, width * height <= 16_000_000 else {
      throw CaptureFailure.pixelLimit(width: width, height: height)
    }
    if outputURL.path != "/dev/full" {
      try? FileManager.default.removeItem(at: outputURL)
    }

    let shareable = try await SCShareableContent.excludingDesktopWindows(
      false,
      onScreenWindowsOnly: true
    )
    guard let window = shareable.windows.first(where: { $0.title == title }) else {
      throw CaptureFailure.windowNotFound(title)
    }

    let filter = SCContentFilter(desktopIndependentWindow: window)
    let configuration = SCStreamConfiguration()
    configuration.width = width
    configuration.height = height
    configuration.pixelFormat = kCVPixelFormatType_32BGRA
    configuration.minimumFrameInterval = CMTime(value: 1, timescale: 30)
    configuration.queueDepth = 3
    configuration.capturesAudio = false

    let stream = SCStream(filter: filter, configuration: configuration, delegate: self)
    try stream.addStreamOutput(self, type: .screen, sampleHandlerQueue: outputQueue)
    self.stream = stream
    try await stream.startCapture()
    fputs("CAPTURE_STREAM_STARTED title=\(title) size=\(width)x\(height) queueDepth=3\n", stderr)

    let deadline = Date().addingTimeInterval(seconds)
    while Date() < deadline {
      if currentFailure() != nil || isCancelled() { break }
      try await Task.sleep(for: .milliseconds(50))
    }

    markStopping()
    do {
      try await stream.stopCapture()
    } catch {
      // The source window can close between the deadline and this request.
      // Drain delivered samples below, then preserve any delegate/writer error.
    }
    outputQueue.sync {
      frameTimer?.cancel()
      frameTimer = nil
    }

    if isCancelled() {
      writer?.cancelWriting()
      removePartialOutput()
      throw CaptureFailure.cancelled
    }

    if let message = currentFailure() {
      writer?.cancelWriting()
      removePartialOutput()
      throw CaptureFailure.writer(message)
    }
    guard let writer, let writerInput, acceptedFrames > 0 else {
      removePartialOutput()
      throw CaptureFailure.noFrames
    }

    writerInput.markAsFinished()
    await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
      writer.finishWriting { continuation.resume() }
    }
    guard writer.status == .completed else {
      let message = writer.error?.localizedDescription ?? "writer did not complete"
      removePartialOutput()
      throw CaptureFailure.writer(message)
    }

    let first = firstPresentationTime.map(CMTimeGetSeconds) ?? 0
    let evidence: [String: Any] = [
      "title": title,
      "width": width,
      "height": height,
      "queueDepth": 3,
      "queueCapacityBytes": width * height * 4 * 4,
      "acceptedFrames": acceptedFrames,
      "droppedFrames": droppedFrames,
      "outputFrameRate": 30,
      "durationSeconds": seconds,
      "firstPresentationTime": first,
      "output": outputURL.path,
      "codec": "AVFoundation H.264",
    ]
    let evidenceData = try JSONSerialization.data(withJSONObject: evidence, options: [.sortedKeys])
    fputs("CAPTURE_RESULT:", stderr)
    FileHandle.standardError.write(evidenceData)
    fputs("\n", stderr)
  }

  func stream(_ stream: SCStream, didOutputSampleBuffer sampleBuffer: CMSampleBuffer, of type: SCStreamOutputType) {
    guard type == .screen, CMSampleBufferDataIsReady(sampleBuffer) else { return }
    guard let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }

    if writer == nil {
      do {
        let created = try AVAssetWriter(outputURL: outputURL, fileType: .mov)
        let pixelWidth = CVPixelBufferGetWidth(pixelBuffer)
        let pixelHeight = CVPixelBufferGetHeight(pixelBuffer)
        let settings: [String: Any] = [
          AVVideoCodecKey: AVVideoCodecType.h264,
          AVVideoWidthKey: pixelWidth,
          AVVideoHeightKey: pixelHeight,
          AVVideoCompressionPropertiesKey: [
            AVVideoAverageBitRateKey: 4_000_000,
            AVVideoExpectedSourceFrameRateKey: 30,
            AVVideoMaxKeyFrameIntervalKey: 60,
          ],
        ]
        let input = AVAssetWriterInput(
          mediaType: .video,
          outputSettings: settings,
          sourceFormatHint: CMSampleBufferGetFormatDescription(sampleBuffer)
        )
        input.expectsMediaDataInRealTime = true
        guard created.canAdd(input) else {
          throw CaptureFailure.writer("cannot add H.264 video input")
        }
        created.add(input)
        guard created.startWriting() else {
          throw CaptureFailure.writer(created.error?.localizedDescription ?? "startWriting failed")
        }
        let presentationTime = CMSampleBufferGetPresentationTimeStamp(sampleBuffer)
        created.startSession(atSourceTime: .zero)
        firstPresentationTime = presentationTime
        writerInput = input
        writer = created
        latestSampleBuffer = sampleBuffer
        startFrameTimer()
      } catch {
        setFailure(String(describing: error))
        return
      }
    } else {
      // Retain only the latest source frame; output uses a fixed-rate clock.
      latestSampleBuffer = sampleBuffer
    }
  }

  private func startFrameTimer() {
    let timer = DispatchSource.makeTimerSource(queue: outputQueue)
    timer.schedule(deadline: .now(), repeating: .milliseconds(33), leeway: .milliseconds(2))
    timer.setEventHandler { [weak self] in self?.appendLatestFrame() }
    frameTimer = timer
    timer.resume()
  }

  private func appendLatestFrame() {
    guard let sampleBuffer = latestSampleBuffer,
      let writer,
      let writerInput,
      writer.status == .writing
    else {
      return
    }
    let timing = CMSampleTimingInfo(
      duration: CMTime(value: 1, timescale: 30),
      presentationTimeStamp: CMTime(value: outputFrameIndex, timescale: 30),
      decodeTimeStamp: .invalid
    )
    outputFrameIndex += 1
    var retimed: CMSampleBuffer?
    let status = CMSampleBufferCreateCopyWithNewTiming(
      allocator: kCFAllocatorDefault,
      sampleBuffer: sampleBuffer,
      sampleTimingEntryCount: 1,
      sampleTimingArray: [timing],
      sampleBufferOut: &retimed
    )
    guard status == noErr, let retimed else {
      setFailure("cannot retime screen frame (\(status))")
      return
    }
    if writerInput.isReadyForMoreMediaData {
      if writerInput.append(retimed) {
        acceptedFrames += 1
      } else {
        setFailure(writer.error?.localizedDescription ?? "append failed")
      }
    } else {
      // Realtime recording drops a frame instead of accumulating an unbounded queue.
      droppedFrames += 1
    }
  }

  func stream(_ stream: SCStream, didStopWithError error: Error) {
    lock.lock()
    let expectedStop = isStopping
    lock.unlock()
    if !expectedStop { setFailure(error.localizedDescription) }
  }

  private func currentFailure() -> String? {
    lock.lock()
    defer { lock.unlock() }
    return failure
  }

  private func markStopping() {
    lock.lock()
    isStopping = true
    lock.unlock()
  }

  func requestCancel() {
    lock.lock()
    cancelRequested = true
    lock.unlock()
  }

  private func isCancelled() -> Bool {
    lock.lock()
    defer { lock.unlock() }
    return cancelRequested
  }

  private func setFailure(_ message: String) {
    lock.lock()
    if failure == nil { failure = message }
    lock.unlock()
  }

  private func removePartialOutput() {
    if outputURL.path != "/dev/full" {
      try? FileManager.default.removeItem(at: outputURL)
    }
  }
}

@main
private struct CaptureMain {
  static func main() async {
    // ScreenCaptureKit window enumeration needs an initialized WindowServer
    // connection even though this helper creates no visible window itself.
    _ = NSApplication.shared
    guard CommandLine.arguments.count == 6,
      let seconds = Double(CommandLine.arguments[3]),
      let width = Int(CommandLine.arguments[4]),
      let height = Int(CommandLine.arguments[5])
    else {
      fputs("\(CaptureFailure.usage)\n", stderr)
      exit(64)
    }

    let capture = WindowCapture(
      title: CommandLine.arguments[1],
      outputURL: URL(fileURLWithPath: CommandLine.arguments[2]),
      seconds: seconds,
      width: width,
      height: height
    )
    signal(SIGINT, SIG_IGN)
    signal(SIGTERM, SIG_IGN)
    let interrupt = DispatchSource.makeSignalSource(signal: SIGINT, queue: .global())
    interrupt.setEventHandler { capture.requestCancel() }
    interrupt.resume()
    let terminate = DispatchSource.makeSignalSource(signal: SIGTERM, queue: .global())
    terminate.setEventHandler { capture.requestCancel() }
    terminate.resume()
    do {
      try await capture.run()
    } catch {
      fputs("CAPTURE_FAILED:\(String(describing: error))\n", stderr)
      if case CaptureFailure.cancelled = error { exit(130) }
      exit(1)
    }
  }
}
