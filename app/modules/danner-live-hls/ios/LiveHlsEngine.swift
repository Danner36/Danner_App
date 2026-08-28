import AVFoundation
import AVKit
import CoreMedia
import Darwin
import Foundation
import ReplayKit
import UIKit
import VideoToolbox

final class LiveHlsEngine: @unchecked Sendable {
  static let shared = LiveHlsEngine()

  private let window = HlsWindow()
  private let httpServer: HlsHttpServer
  private let muxQueue = DispatchQueue(label: "danner.livehls.mux")
  private let aacEncoder = PcmToAacEncoder()
  private var muxer = MpegTsMuxer()
  private var segment = Data()
  private var compressionSession: VTCompressionSession?
  private var airPlayPlayer: AVPlayer?
  private var routePicker: AVRoutePickerView?
  private var videoHeader = Data([0x00, 0x00, 0x00, 0x01, 0x09, 0xF0])
  private var includeAudio = false
  private var segmentStartSeconds = -1.0
  private var lastVideoSeconds = 0.0
  private var lastKeyframeSeconds = -2.0
  private var encoderWidth: Int32 = 0
  private var encoderHeight: Int32 = 0
  private let minSegments = 3
  private let readyTimeoutSeconds: TimeInterval = 15

  private(set) var origin: String?
  private(set) var port = 0
  private(set) var running = false

  private init() {
    httpServer = HlsHttpServer(window: window)
  }

  func start() throws -> (origin: String, port: Int) {
    if running, let origin, port != 0 {
      return (origin, port)
    }
    stop()
    let boundPort = try httpServer.start(in: 8108...8127)
    let originValue = "http://\(Self.lanIPv4()):\(boundPort)"
    port = boundPort
    origin = originValue
    includeAudio = false
    running = true
    RPScreenRecorder.shared().isMicrophoneEnabled = false
    let started = DispatchSemaphore(value: 0)
    let startBox = StartErrorBox()
    RPScreenRecorder.shared().startCapture { [weak self] sample, type, error in
      if let error {
        startBox.error = error
        started.signal()
        return
      }
      self?.handle(sample: sample, type: type)
    } completionHandler: { error in
      startBox.error = error
      started.signal()
    }
    _ = started.wait(timeout: .now() + 8)
    if let startError = startBox.error {
      stop()
      throw startError
    }
    let deadline = Date().addingTimeInterval(readyTimeoutSeconds)
    while window.count < minSegments && Date() < deadline {
      Thread.sleep(forTimeInterval: 0.2)
    }
    if window.count < minSegments {
      stop()
      throw NSError(domain: "DannerLiveHls", code: 2)
    }
    return (originValue, boundPort)
  }

  func stop() {
    running = false
    RPScreenRecorder.shared().stopCapture { _ in }
    if let compressionSession {
      VTCompressionSessionCompleteFrames(compressionSession, untilPresentationTimeStamp: .invalid)
      VTCompressionSessionInvalidate(compressionSession)
    }
    compressionSession = nil
    airPlayPlayer?.pause()
    airPlayPlayer = nil
    httpServer.stop()
    window.clear()
    muxQueue.sync {
      muxer = MpegTsMuxer()
      segment = Data()
      segmentStartSeconds = -1
    }
    origin = nil
    port = 0
    encoderWidth = 0
    encoderHeight = 0
  }

  func showAirPlayPicker() {
    if let origin, airPlayPlayer == nil, let url = URL(string: "\(origin)/live.m3u8") {
      startAirPlayPlayer(url: url)
    }
    DispatchQueue.main.async {
      let picker = AVRoutePickerView(frame: CGRect(x: -80, y: -80, width: 44, height: 44))
      picker.prioritizesVideoDevices = true
      guard let window = Self.keyWindow() else {
        return
      }
      self.routePicker?.removeFromSuperview()
      window.addSubview(picker)
      self.routePicker = picker
      if let button = picker.subviews.compactMap({ $0 as? UIButton }).first {
        button.sendActions(for: .touchUpInside)
      }
      DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
        picker.removeFromSuperview()
        if self.routePicker === picker {
          self.routePicker = nil
        }
      }
    }
  }

  private func startAirPlayPlayer(url: URL) {
    DispatchQueue.main.async {
      let player = AVPlayer(url: url)
      player.volume = 0
      player.allowsExternalPlayback = true
      player.play()
      self.airPlayPlayer = player
    }
  }

  private func handle(sample: CMSampleBuffer, type: RPSampleBufferType) {
    guard running else {
      return
    }
    switch type {
    case .video:
      encodeVideo(sample)
    case .audioApp:
      encodeAudio(sample)
    default:
      break
    }
  }

  private func encodeVideo(_ sample: CMSampleBuffer) {
    guard let imageBuffer = CMSampleBufferGetImageBuffer(sample) else {
      return
    }
    let width = Int32(CVPixelBufferGetWidth(imageBuffer) & ~1)
    let height = Int32(CVPixelBufferGetHeight(imageBuffer) & ~1)
    if compressionSession == nil || width != encoderWidth || height != encoderHeight {
      createEncoder(width: width, height: height)
    }
    guard let compressionSession else {
      return
    }
    let pts = CMSampleBufferGetPresentationTimeStamp(sample)
    let seconds = CMTimeGetSeconds(pts)
    var attributes: CFDictionary?
    if seconds - lastKeyframeSeconds >= 2 {
      attributes = [kVTEncodeFrameOptionKey_ForceKeyFrame: true] as CFDictionary
    }
    VTCompressionSessionEncodeFrame(
      compressionSession,
      imageBuffer: imageBuffer,
      presentationTimeStamp: pts,
      duration: .invalid,
      frameProperties: attributes,
      sourceFrameRefcon: nil,
      infoFlagsOut: nil
    )
  }

  private func createEncoder(width: Int32, height: Int32) {
    if let compressionSession {
      VTCompressionSessionInvalidate(compressionSession)
    }
    compressionSession = nil
    encoderWidth = width
    encoderHeight = height
    let refcon = Unmanaged.passUnretained(self).toOpaque()
    var session: VTCompressionSession?
    let result = VTCompressionSessionCreate(
      allocator: kCFAllocatorDefault,
      width: width,
      height: height,
      codecType: kCMVideoCodecType_H264,
      encoderSpecification: nil,
      imageBufferAttributes: nil,
      compressedDataAllocator: nil,
      outputCallback: liveHlsCompressionCallback,
      refcon: refcon,
      compressionSessionOut: &session
    )
    guard result == noErr, let session else {
      return
    }
    VTSessionSetProperty(session, key: kVTCompressionPropertyKey_RealTime, value: kCFBooleanTrue)
    VTSessionSetProperty(
      session,
      key: kVTCompressionPropertyKey_ProfileLevel,
      value: kVTProfileLevel_H264_Baseline_AutoLevel
    )
    VTSessionSetProperty(
      session,
      key: kVTCompressionPropertyKey_AverageBitRate,
      value: 2_500_000 as CFNumber
    )
    VTSessionSetProperty(
      session,
      key: kVTCompressionPropertyKey_MaxKeyFrameIntervalDuration,
      value: 2 as CFNumber
    )
    VTSessionSetProperty(
      session,
      key: kVTCompressionPropertyKey_AllowFrameReordering,
      value: kCFBooleanFalse
    )
    VTSessionSetProperty(
      session,
      key: kVTCompressionPropertyKey_ExpectedFrameRate,
      value: 30 as CFNumber
    )
    VTCompressionSessionPrepareToEncodeFrames(session)
    compressionSession = session
  }

  fileprivate func handleEncodedVideo(_ sample: CMSampleBuffer) {
    let seconds = CMTimeGetSeconds(CMSampleBufferGetPresentationTimeStamp(sample))
    let keyframe = Self.isKeyframe(sample)
    if keyframe {
      lastKeyframeSeconds = seconds
      if let header = Self.parameterSets(from: sample) {
        videoHeader = header
      }
    }
    guard let accessUnit = Self.annexB(from: sample, header: keyframe ? videoHeader : Data([0x00, 0x00, 0x00, 0x01, 0x09, 0xF0])) else {
      return
    }
    muxQueue.async {
      self.muxVideo(accessUnit: accessUnit, seconds: seconds, keyframe: keyframe)
    }
  }

  private func encodeAudio(_ sample: CMSampleBuffer) {
    let seconds = CMTimeGetSeconds(CMSampleBufferGetPresentationTimeStamp(sample))
    let frames = aacEncoder.encode(sample: sample)
    if !frames.isEmpty {
      includeAudio = true
    }
    muxQueue.async {
      for frame in frames {
        self.muxAudio(frame: frame, seconds: seconds)
      }
    }
  }

  private func muxVideo(accessUnit: Data, seconds: Double, keyframe: Bool) {
    if segmentStartSeconds < 0 {
      if !keyframe {
        return
      }
      beginSegment(seconds: seconds)
    } else if keyframe && seconds - segmentStartSeconds >= 1.8 {
      publishSegment(duration: seconds - segmentStartSeconds)
      beginSegment(seconds: seconds)
    }
    lastVideoSeconds = seconds
    let pts90k = MpegTsMuxer.pts90k(fromSeconds: seconds)
    segment.append(
      muxer.pesPackets(
        pid: MpegTsMuxer.videoPid,
        streamId: MpegTsMuxer.videoStreamId,
        payload: accessUnit,
        pts90k: pts90k,
        pcr90k: pts90k,
        setLength: false
      )
    )
  }

  private func muxAudio(frame: Data, seconds: Double) {
    if segmentStartSeconds < 0 {
      return
    }
    let pts90k = MpegTsMuxer.pts90k(fromSeconds: seconds)
    segment.append(
      muxer.pesPackets(
        pid: MpegTsMuxer.audioPid,
        streamId: MpegTsMuxer.audioStreamId,
        payload: frame,
        pts90k: pts90k,
        pcr90k: nil,
        setLength: true
      )
    )
  }

  private func beginSegment(seconds: Double) {
    muxer = MpegTsMuxer()
    segment = Data()
    segment.append(muxer.patPacket())
    segment.append(muxer.pmtPacket(includeAudio: includeAudio))
    segmentStartSeconds = seconds
  }

  private func publishSegment(duration: Double) {
    if segment.isEmpty {
      return
    }
    window.add(durationSeconds: min(max(duration, 1.0), 3.0), payload: segment)
  }

  private static func isKeyframe(_ sample: CMSampleBuffer) -> Bool {
    guard
      let attachments = CMSampleBufferGetSampleAttachmentsArray(sample, createIfNecessary: false)
        as? [NSDictionary],
      let first = attachments.first
    else {
      return false
    }
    let notSync = first[kCMSampleAttachmentKey_NotSync] as? Bool ?? false
    return !notSync
  }

  private static func parameterSets(from sample: CMSampleBuffer) -> Data? {
    guard let format = CMSampleBufferGetFormatDescription(sample) else {
      return nil
    }
    var header = Data([0x00, 0x00, 0x00, 0x01, 0x09, 0xF0])
    var count = 0
    CMVideoFormatDescriptionGetH264ParameterSetAtIndex(
      format,
      parameterSetIndex: 0,
      parameterSetPointerOut: nil,
      parameterSetSizeOut: nil,
      parameterSetCountOut: &count,
      nalUnitHeaderLengthOut: nil
    )
    for index in 0..<count {
      var pointer: UnsafePointer<UInt8>?
      var size = 0
      CMVideoFormatDescriptionGetH264ParameterSetAtIndex(
        format,
        parameterSetIndex: index,
        parameterSetPointerOut: &pointer,
        parameterSetSizeOut: &size,
        parameterSetCountOut: nil,
        nalUnitHeaderLengthOut: nil
      )
      guard let pointer, size > 0 else {
        continue
      }
      header.append(contentsOf: [0x00, 0x00, 0x00, 0x01])
      header.append(Data(bytes: pointer, count: size))
    }
    return header
  }

  private static func annexB(from sample: CMSampleBuffer, header: Data) -> Data? {
    guard let format = CMSampleBufferGetFormatDescription(sample),
      let block = CMSampleBufferGetDataBuffer(sample)
    else {
      return nil
    }
    var nalLengthSize: Int32 = 4
    CMVideoFormatDescriptionGetH264ParameterSetAtIndex(
      format,
      parameterSetIndex: 0,
      parameterSetPointerOut: nil,
      parameterSetSizeOut: nil,
      parameterSetCountOut: nil,
      nalUnitHeaderLengthOut: &nalLengthSize
    )
    var length = 0
    var pointer: UnsafeMutablePointer<Int8>?
    let status = CMBlockBufferGetDataPointer(
      block,
      atOffset: 0,
      lengthAtOffsetOut: nil,
      totalLengthOut: &length,
      dataPointerOut: &pointer
    )
    guard status == noErr, let pointer, length > 0 else {
      return nil
    }
    let bytes = UnsafeRawPointer(pointer).bindMemory(to: UInt8.self, capacity: length)
    var offset = 0
    var out = header
    let prefix = Int(nalLengthSize)
    while offset + prefix <= length {
      var nalLength = 0
      for index in 0..<prefix {
        nalLength = (nalLength << 8) | Int(bytes[offset + index])
      }
      offset += prefix
      if nalLength <= 0 || offset + nalLength > length {
        break
      }
      out.append(contentsOf: [0x00, 0x00, 0x00, 0x01])
      out.append(Data(bytes: bytes + offset, count: nalLength))
      offset += nalLength
    }
    return out
  }

  private static func lanIPv4() -> String {
    var address = "127.0.0.1"
    var ifaddr: UnsafeMutablePointer<ifaddrs>?
    guard getifaddrs(&ifaddr) == 0, let first = ifaddr else {
      return address
    }
    defer { freeifaddrs(first) }
    var pointer: UnsafeMutablePointer<ifaddrs>? = first
    while let current = pointer {
      let interface = current.pointee
      if let addr = interface.ifa_addr, addr.pointee.sa_family == sa_family_t(AF_INET) {
        let name = String(cString: interface.ifa_name)
        if name.hasPrefix("en") {
          var hostname = [CChar](repeating: 0, count: Int(NI_MAXHOST))
          getnameinfo(
            addr,
            socklen_t(addr.pointee.sa_len),
            &hostname,
            socklen_t(hostname.count),
            nil,
            0,
            NI_NUMERICHOST
          )
          let ip = String(cString: hostname)
          if !ip.hasPrefix("127.") && !ip.hasPrefix("169.254") {
            address = ip
            if name == "en0" {
              break
            }
          }
        }
      }
      pointer = interface.ifa_next
    }
    return address
  }

  private static func keyWindow() -> UIWindow? {
    let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
    for scene in scenes {
      if let key = scene.windows.first(where: { $0.isKeyWindow }) {
        return key
      }
    }
    return scenes.first?.windows.first
  }
}

private final class StartErrorBox: @unchecked Sendable {
  var error: Error?
}

private func liveHlsCompressionCallback(
  refcon: UnsafeMutableRawPointer?,
  _: UnsafeMutableRawPointer?,
  status: OSStatus,
  _: VTEncodeInfoFlags,
  sampleBuffer: CMSampleBuffer?
) {
  guard status == noErr, let refcon, let sampleBuffer else {
    return
  }
  let engine = Unmanaged<LiveHlsEngine>.fromOpaque(refcon).takeUnretainedValue()
  engine.handleEncodedVideo(sampleBuffer)
}
