import Foundation

final class MpegTsMuxer {
  static let audioPid = 0x0101
  static let audioStreamId = 0xC0
  static let patPid = 0x0000
  static let pmtPid = 0x1000
  static let videoPid = 0x0100
  static let videoStreamId = 0xE0

  private var continuity = Array(repeating: 0, count: 8192)

  func patPacket() -> Data {
    var section = Data()
    section.append(contentsOf: [0x00, 0x00, 0xB0, 0x0D, 0x00, 0x01, 0xC1, 0x00, 0x00, 0x00, 0x01, 0xF0, 0x00])
    appendCrc(&section)
    return tsPackets(pid: Self.patPid, payload: section, payloadStart: true, pcr90k: nil)
  }

  func pmtPacket(includeAudio: Bool) -> Data {
    var body = Data()
    body.append(contentsOf: [0x00, 0x01, 0xC1, 0x00, 0x00, 0xE1, 0x00, 0xF0, 0x00, 0x1B, 0xE1, 0x00, 0xF0, 0x00])
    if includeAudio {
      body.append(contentsOf: [0x0F, 0xE1, 0x01, 0xF0, 0x00])
    }
    let sectionLength = body.count + 4
    var section = Data()
    section.append(0x00)
    section.append(0x02)
    section.append(UInt8(0xB0 | ((sectionLength >> 8) & 0x0F)))
    section.append(UInt8(sectionLength & 0xFF))
    section.append(body)
    appendCrc(&section)
    return tsPackets(pid: Self.pmtPid, payload: section, payloadStart: true, pcr90k: nil)
  }

  func pesPackets(
    pid: Int,
    streamId: Int,
    payload: Data,
    pts90k: UInt64,
    pcr90k: UInt64?,
    setLength: Bool
  ) -> Data {
    var header = Data()
    header.append(contentsOf: [0x00, 0x00, 0x01, UInt8(streamId)])
    let pesPayloadLength = 8 + payload.count
    if setLength && pesPayloadLength <= 65535 {
      header.append(UInt8((pesPayloadLength >> 8) & 0xFF))
      header.append(UInt8(pesPayloadLength & 0xFF))
    } else {
      header.append(contentsOf: [0x00, 0x00])
    }
    header.append(contentsOf: [0x80, 0x80, 0x05])
    header.append(Self.ptsBytes(pts90k))
    header.append(payload)
    return tsPackets(pid: pid, payload: header, payloadStart: true, pcr90k: pcr90k)
  }

  static func pts90k(fromSeconds seconds: Double) -> UInt64 {
    return UInt64(max(0, seconds * 90_000))
  }

  static func adtsFrame(aacFrame: Data, sampleRateHz: Int, channelCount: Int) -> Data {
    let frameLength = aacFrame.count + 7
    let samplingIndex = samplingIndex(sampleRateHz)
    var header = Data(count: 7)
    header[0] = 0xFF
    header[1] = 0xF1
    header[2] = UInt8((1 << 6) | (samplingIndex << 2) | ((channelCount >> 2) & 0x1))
    header[3] = UInt8(((channelCount & 0x3) << 6) | ((frameLength >> 11) & 0x3))
    header[4] = UInt8((frameLength >> 3) & 0xFF)
    header[5] = UInt8(((frameLength & 0x7) << 5) | 0x1F)
    header[6] = 0xFC
    var framed = Data()
    framed.append(header)
    framed.append(aacFrame)
    return framed
  }

  private func tsPackets(pid: Int, payload: Data, payloadStart: Bool, pcr90k: UInt64?) -> Data {
    var out = Data()
    var offset = 0
    var start = payloadStart
    var writePcr = pcr90k != nil
    let payloadBytesTotal = payload.count
    while offset < payloadBytesTotal || start {
      var packet = Data(repeating: 0xFF, count: 188)
      packet[0] = 0x47
      let pidHigh = (pid >> 8) & 0x1F
      packet[1] = UInt8((start ? 0x40 : 0) | pidHigh)
      packet[2] = UInt8(pid & 0xFF)
      let remaining = max(0, payloadBytesTotal - offset)
      let pcrData: Data? = writePcr ? Self.pcrBytes(pcr90k!) : nil
      let minAdaptation: Int
      if pcrData != nil {
        minAdaptation = 8
      } else if remaining < 184 {
        minAdaptation = max(1, 184 - remaining)
      } else {
        minAdaptation = 0
      }
      let payloadBytes = min(remaining, 184 - minAdaptation)
      let stuffing = 184 - payloadBytes
      let continuityValue = continuity[pid] & 0x0F
      continuity[pid] = (continuityValue + 1) & 0x0F
      if stuffing > 0 {
        packet[3] = UInt8(0x30 | continuityValue)
        packet[4] = UInt8(stuffing - 1)
        var cursor = 5
        if stuffing > 1 {
          packet[5] = pcrData != nil ? 0x10 : 0x00
          cursor = 6
          if let pcrData {
            packet.replaceSubrange(cursor..<(cursor + pcrData.count), with: pcrData)
            cursor += pcrData.count
          }
        }
        while cursor < 4 + stuffing {
          packet[cursor] = 0xFF
          cursor += 1
        }
        if payloadBytes > 0 {
          let slice = payload[offset..<(offset + payloadBytes)]
          packet.replaceSubrange((4 + stuffing)..<(4 + stuffing + payloadBytes), with: slice)
        }
        writePcr = false
      } else {
        packet[3] = UInt8(0x10 | continuityValue)
        let slice = payload[offset..<(offset + payloadBytes)]
        packet.replaceSubrange(4..<(4 + payloadBytes), with: slice)
      }
      out.append(packet)
      offset += payloadBytes
      start = false
      if payloadBytes == 0 && remaining == 0 {
        break
      }
    }
    return out
  }

  private func appendCrc(_ section: inout Data) {
    let crc = Self.mpegCrc32(section, offset: 1, length: section.count - 1)
    section.append(UInt8((crc >> 24) & 0xFF))
    section.append(UInt8((crc >> 16) & 0xFF))
    section.append(UInt8((crc >> 8) & 0xFF))
    section.append(UInt8(crc & 0xFF))
  }

  private static func ptsBytes(_ pts90k: UInt64) -> Data {
    let pts = pts90k & 0x1FFFFFFFF
    return Data([
      UInt8(0x20 | (((Int(pts >> 30) & 0x07) << 1) | 1)),
      UInt8((pts >> 22) & 0xFF),
      UInt8((((Int(pts >> 15) & 0x7F) << 1) | 1)),
      UInt8((pts >> 7) & 0xFF),
      UInt8((((Int(pts) & 0x7F) << 1) | 1)),
    ])
  }

  private static func pcrBytes(_ pcr90k: UInt64) -> Data {
    let base = pcr90k & 0x1FFFFFFFF
    return Data([
      UInt8(base >> 25),
      UInt8(base >> 17),
      UInt8(base >> 9),
      UInt8(base >> 1),
      UInt8(((base & 1) << 7) | 0x7E),
      0x00,
    ])
  }

  private static func samplingIndex(_ sampleRateHz: Int) -> Int {
    let rates = [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350]
    return rates.firstIndex(of: sampleRateHz) ?? 4
  }

  private static func mpegCrc32(_ data: Data, offset: Int, length: Int) -> UInt32 {
    var crc: UInt32 = 0xFFFFFFFF
    for index in offset..<(offset + length) {
      crc ^= UInt32(data[index]) << 24
      for _ in 0..<8 {
        if crc & 0x80000000 != 0 {
          crc = (crc << 1) ^ 0x04C11DB7
        } else {
          crc <<= 1
        }
      }
    }
    return crc
  }
}
