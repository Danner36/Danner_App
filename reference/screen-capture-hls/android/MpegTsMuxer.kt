package expo.modules.dannerlivehls

import java.io.ByteArrayOutputStream

/**
 * PAT / PMT / PES packets for H.264 plus ADTS AAC, matching the iPhone muxer.
 */
internal class MpegTsMuxer {
  private val continuity = IntArray(8192)

  fun patPacket(): ByteArray {
    val section = ByteArrayOutputStream()
    section.write(
      byteArrayOf(
        0x00,
        0x00,
        0xB0.toByte(),
        0x0D,
        0x00,
        0x01,
        0xC1.toByte(),
        0x00,
        0x00,
        0x00,
        0x01,
        0xF0.toByte(),
        0x00,
      ),
    )
    appendCrc(section)
    return tsPackets(PAT_PID, section.toByteArray(), payloadStart = true, pcr90k = null)
  }

  fun pmtPacket(includeAudio: Boolean): ByteArray {
    val body = ByteArrayOutputStream()
    body.write(
      byteArrayOf(
        0x00,
        0x01,
        0xC1.toByte(),
        0x00,
        0x00,
        0xE1.toByte(),
        0x00,
        0xF0.toByte(),
        0x00,
        0x1B,
        0xE1.toByte(),
        0x00,
        0xF0.toByte(),
        0x00,
      ),
    )
    if (includeAudio) {
      body.write(
        byteArrayOf(
          0x0F,
          0xE1.toByte(),
          0x01,
          0xF0.toByte(),
          0x00,
        ),
      )
    }
    val bodyBytes = body.toByteArray()
    val sectionLength = bodyBytes.size + 4
    val section = ByteArrayOutputStream()
    section.write(0x00)
    section.write(0x02)
    section.write(0xB0 or ((sectionLength shr 8) and 0x0F))
    section.write(sectionLength and 0xFF)
    section.write(bodyBytes)
    appendCrc(section)
    return tsPackets(PMT_PID, section.toByteArray(), payloadStart = true, pcr90k = null)
  }

  fun pesPackets(
    pid: Int,
    streamId: Int,
    payload: ByteArray,
    pts90k: Long,
    pcr90k: Long?,
    setLength: Boolean,
  ): ByteArray {
    val header = ByteArrayOutputStream()
    header.write(byteArrayOf(0x00, 0x00, 0x01, streamId.toByte()))
    val pesPayloadLength = 8 + payload.size
    if (setLength && pesPayloadLength <= 65535) {
      header.write((pesPayloadLength shr 8) and 0xFF)
      header.write(pesPayloadLength and 0xFF)
    } else {
      header.write(byteArrayOf(0x00, 0x00))
    }
    header.write(byteArrayOf(0x80.toByte(), 0x80.toByte(), 0x05))
    header.write(ptsBytes(pts90k))
    header.write(payload)
    return tsPackets(pid, header.toByteArray(), payloadStart = true, pcr90k = pcr90k)
  }

  private fun tsPackets(
    pid: Int,
    payload: ByteArray,
    payloadStart: Boolean,
    pcr90k: Long?,
  ): ByteArray {
    val out = ByteArrayOutputStream()
    var offset = 0
    var start = payloadStart
    var writePcr = pcr90k != null
    val payloadBytesTotal = payload.size
    while (offset < payloadBytesTotal || start) {
      val packet = ByteArray(188) { 0xFF.toByte() }
      packet[0] = 0x47
      val pidHigh = (pid shr 8) and 0x1F
      packet[1] = ((if (start) 0x40 else 0) or pidHigh).toByte()
      packet[2] = (pid and 0xFF).toByte()
      val remaining = maxOf(0, payloadBytesTotal - offset)
      val pcrData = if (writePcr && pcr90k != null) pcrBytes(pcr90k) else null
      val minAdaptation = when {
        pcrData != null -> 8
        remaining < 184 -> maxOf(1, 184 - remaining)
        else -> 0
      }
      val payloadBytes = minOf(remaining, 184 - minAdaptation)
      val stuffing = 184 - payloadBytes
      val continuityValue = continuity[pid] and 0x0F
      continuity[pid] = (continuityValue + 1) and 0x0F
      if (stuffing > 0) {
        packet[3] = (0x30 or continuityValue).toByte()
        packet[4] = (stuffing - 1).toByte()
        var cursor = 5
        if (stuffing > 1) {
          packet[5] = if (pcrData != null) 0x10 else 0x00
          cursor = 6
          if (pcrData != null) {
            pcrData.copyInto(packet, cursor)
            cursor += pcrData.size
          }
        }
        while (cursor < 4 + stuffing) {
          packet[cursor] = 0xFF.toByte()
          cursor += 1
        }
        if (payloadBytes > 0) {
          payload.copyInto(packet, 4 + stuffing, offset, offset + payloadBytes)
        }
        writePcr = false
      } else {
        packet[3] = (0x10 or continuityValue).toByte()
        payload.copyInto(packet, 4, offset, offset + payloadBytes)
      }
      out.write(packet)
      offset += payloadBytes
      start = false
      if (payloadBytes == 0 && remaining == 0) {
        break
      }
    }
    return out.toByteArray()
  }

  private fun appendCrc(section: ByteArrayOutputStream) {
    val bytes = section.toByteArray()
    val crc = mpegCrc32(bytes, 1, bytes.size - 1)
    section.write((crc shr 24) and 0xFF)
    section.write((crc shr 16) and 0xFF)
    section.write((crc shr 8) and 0xFF)
    section.write(crc and 0xFF)
  }

  companion object {
    const val AUDIO_PID = 0x0101
    const val AUDIO_STREAM_ID = 0xC0
    const val PAT_PID = 0x0000
    const val PMT_PID = 0x1000
    const val VIDEO_PID = 0x0100
    const val VIDEO_STREAM_ID = 0xE0
    const val PCR_LEAD_90K = 18_000L

    fun pts90kFromUs(us: Long): Long {
      return (us.coerceAtLeast(0L) * 9L) / 100L
    }

    fun adtsFrame(aacFrame: ByteArray, sampleRateHz: Int, channelCount: Int): ByteArray {
      val frameLength = aacFrame.size + 7
      val samplingIndex = samplingIndex(sampleRateHz)
      val header = ByteArray(7)
      header[0] = 0xFF.toByte()
      header[1] = 0xF1.toByte()
      header[2] = ((1 shl 6) or (samplingIndex shl 2) or ((channelCount shr 2) and 0x1)).toByte()
      header[3] = (((channelCount and 0x3) shl 6) or ((frameLength shr 11) and 0x3)).toByte()
      header[4] = ((frameLength shr 3) and 0xFF).toByte()
      header[5] = (((frameLength and 0x7) shl 5) or 0x1F).toByte()
      header[6] = 0xFC.toByte()
      return header + aacFrame
    }

    private fun ptsBytes(pts90k: Long): ByteArray {
      val pts = pts90k and 0x1FFFFFFFFL
      return byteArrayOf(
        (0x20 or ((((pts shr 30).toInt() and 0x07) shl 1) or 1)).toByte(),
        ((pts shr 22) and 0xFF).toByte(),
        ((((pts shr 15).toInt() and 0x7F) shl 1) or 1).toByte(),
        ((pts shr 7) and 0xFF).toByte(),
        (((pts.toInt() and 0x7F) shl 1) or 1).toByte(),
      )
    }

    private fun pcrBytes(pcr90k: Long): ByteArray {
      val base = pcr90k and 0x1FFFFFFFFL
      return byteArrayOf(
        (base shr 25).toByte(),
        (base shr 17).toByte(),
        (base shr 9).toByte(),
        (base shr 1).toByte(),
        ((((base and 1L) shl 7) or 0x7E).toByte()),
        0x00,
      )
    }

    private fun samplingIndex(sampleRateHz: Int): Int {
      val rates = intArrayOf(
        96_000, 88_200, 64_000, 48_000, 44_100, 32_000, 24_000, 22_050, 16_000, 12_000, 11_025, 8_000, 7_350,
      )
      val index = rates.indexOf(sampleRateHz)
      return if (index >= 0) index else 4
    }

    private fun mpegCrc32(data: ByteArray, offset: Int, length: Int): Int {
      var crc = 0xFFFFFFFF.toInt()
      for (index in offset until (offset + length)) {
        crc = crc xor (data[index].toInt() and 0xFF shl 24)
        repeat(8) {
          crc = if (crc and 0x80000000.toInt() != 0) {
            (crc shl 1) xor 0x04C11DB7
          } else {
            crc shl 1
          }
        }
      }
      return crc
    }
  }
}
