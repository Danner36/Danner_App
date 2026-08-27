import AudioToolbox
import CoreMedia
import Foundation

final class PcmToAacEncoder {
  private var converter: AudioConverterRef?
  private var inputDescription = AudioStreamBasicDescription()
  private var leftover = Data()
  private let outputChannels: UInt32 = 2
  private let outputSampleRate: Float64 = 44_100
  private let framesPerPacket: UInt32 = 1024

  private struct FillContext {
    var bytes: UnsafeMutableRawPointer?
    var byteCount: UInt32 = 0
    var channels: UInt32 = 2
    var frames: UInt32 = 1024
    var consumed = false
  }

  deinit {
    if let converter {
      AudioConverterDispose(converter)
    }
  }

  var isReady: Bool {
    converter != nil
  }

  func encode(sample: CMSampleBuffer) -> [Data] {
    guard let pcm = pcmData(from: sample),
      let format = CMSampleBufferGetFormatDescription(sample),
      let asbdPointer = CMAudioFormatDescriptionGetStreamBasicDescription(format)
    else {
      return []
    }
    if converter == nil {
      guard prepare(input: asbdPointer.pointee) else {
        return []
      }
    }
    leftover.append(pcm)
    let bytesPerFrame = max(1, Int(inputDescription.mBytesPerFrame))
    let bytesPerPacket = bytesPerFrame * Int(framesPerPacket)
    var frames: [Data] = []
    while leftover.count >= bytesPerPacket {
      let packet = leftover.prefix(bytesPerPacket)
      leftover.removeFirst(bytesPerPacket)
      if let encoded = convert(Data(packet)) {
        frames.append(
          MpegTsMuxer.adtsFrame(
            aacFrame: encoded,
            sampleRateHz: Int(outputSampleRate),
            channelCount: Int(outputChannels)
          )
        )
      }
    }
    return frames
  }

  private func prepare(input: AudioStreamBasicDescription) -> Bool {
    inputDescription = input
    var output = AudioStreamBasicDescription(
      mSampleRate: outputSampleRate,
      mFormatID: kAudioFormatMPEG4AAC,
      mFormatFlags: 0,
      mBytesPerPacket: 0,
      mFramesPerPacket: framesPerPacket,
      mBytesPerFrame: 0,
      mChannelsPerFrame: outputChannels,
      mBitsPerChannel: 0,
      mReserved: 0
    )
    var converterRef: AudioConverterRef?
    var inputAsbd = inputDescription
    let status = AudioConverterNew(&inputAsbd, &output, &converterRef)
    guard status == noErr, let converterRef else {
      return false
    }
    converter = converterRef
    var bitrate: UInt32 = 128_000
    AudioConverterSetProperty(
      converterRef,
      kAudioConverterEncodeBitRate,
      UInt32(MemoryLayout<UInt32>.size),
      &bitrate
    )
    return true
  }

  private func convert(_ pcm: Data) -> Data? {
    guard let converter else {
      return nil
    }
    var pcmCopy = pcm
    var encoded = Data(count: 2048)
    var packetCount: UInt32 = 1
    var outputByteSize: UInt32 = 0
    let status = pcmCopy.withUnsafeMutableBytes { pcmBytes in
      encoded.withUnsafeMutableBytes { outBytes in
        var context = FillContext(
          bytes: pcmBytes.baseAddress,
          byteCount: UInt32(pcm.count),
          channels: inputDescription.mChannelsPerFrame,
          frames: framesPerPacket,
          consumed: false
        )
        var bufferList = AudioBufferList(
          mNumberBuffers: 1,
          mBuffers: AudioBuffer(
            mNumberChannels: outputChannels,
            mDataByteSize: 2048,
            mData: outBytes.baseAddress
          )
        )
        let result = AudioConverterFillComplexBuffer(
          converter,
          { _, ioPackets, ioData, _, userData in
            guard let userData else {
              ioPackets.pointee = 0
              return 1
            }
            let fill = userData.assumingMemoryBound(to: FillContext.self)
            if fill.pointee.consumed {
              ioPackets.pointee = 0
              return 1
            }
            let buffers = UnsafeMutableAudioBufferListPointer(ioData)
            buffers[0].mData = fill.pointee.bytes
            buffers[0].mDataByteSize = fill.pointee.byteCount
            buffers[0].mNumberChannels = fill.pointee.channels
            ioPackets.pointee = fill.pointee.frames
            fill.pointee.consumed = true
            return noErr
          },
          &context,
          &packetCount,
          &bufferList,
          nil
        )
        outputByteSize = bufferList.mBuffers.mDataByteSize
        return result
      }
    }
    if status != noErr || packetCount == 0 || outputByteSize == 0 {
      return nil
    }
    return encoded.prefix(Int(outputByteSize))
  }

  private func pcmData(from sample: CMSampleBuffer) -> Data? {
    var needed = 0
    CMSampleBufferGetAudioBufferListWithRetainedBlockBuffer(
      sample,
      bufferListSizeNeededOut: &needed,
      bufferListOut: nil,
      bufferListSize: 0,
      blockBufferAllocator: kCFAllocatorDefault,
      blockBufferMemoryAllocator: kCFAllocatorDefault,
      flags: 0,
      blockBufferOut: nil
    )
    guard needed > 0 else {
      return copyBlock(sample)
    }
    let raw = UnsafeMutableRawPointer.allocate(byteCount: needed, alignment: MemoryLayout<Int>.alignment)
    defer { raw.deallocate() }
    let list = raw.bindMemory(to: AudioBufferList.self, capacity: 1)
    var blockBuffer: CMBlockBuffer?
    let status = CMSampleBufferGetAudioBufferListWithRetainedBlockBuffer(
      sample,
      bufferListSizeNeededOut: nil,
      bufferListOut: list,
      bufferListSize: needed,
      blockBufferAllocator: kCFAllocatorDefault,
      blockBufferMemoryAllocator: kCFAllocatorDefault,
      flags: kCMSampleBufferFlag_AudioBufferList_Assure16ByteAlignment,
      blockBufferOut: &blockBuffer
    )
    guard status == noErr else {
      return copyBlock(sample)
    }
    var data = Data()
    let buffers = UnsafeMutableAudioBufferListPointer(list)
    for buffer in buffers {
      if let bytes = buffer.mData, buffer.mDataByteSize > 0 {
        data.append(Data(bytes: bytes, count: Int(buffer.mDataByteSize)))
      }
    }
    return data
  }

  private func copyBlock(_ sample: CMSampleBuffer) -> Data? {
    guard let block = CMSampleBufferGetDataBuffer(sample) else {
      return nil
    }
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
    return Data(bytes: pointer, count: length)
  }
}
