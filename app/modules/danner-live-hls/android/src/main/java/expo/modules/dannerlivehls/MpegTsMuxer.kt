package expo.modules.dannerlivehls

import java.io.ByteArrayOutputStream
import java.util.Arrays

internal class MpegTsMuxer {
  private val continuity = IntArray(8192)

  fun patPacket(): ByteArray {
    val section = ByteArrayOutputStream()
    section.write(0x00)
    section.write(0x00)
    section.write(0xB0)
    section.write(0x0D)
    section.write(0x00)
    section.write(0x01)
    section.write(0xC1)
    section.write(0x00)
    section.write(0x00)
    section.write(0x00)
    section.write(0x01)
    section.write(0xF0)
    section.write(0x00)
    writeCrc(section)
    return tsPackets(PAT_PID, section.toByteArray(), payloadStart = true, pcr90k = null)
  }

  fun pmtPacket(includeAudio: Boolean): ByteArray {
    val body = ByteArrayOutputStream()
    body.write(0x00)
    body.write(0x01)
    body.write(0xC1)
    body.write(0x00)
    body.write(0x00)
    body.write(0xE1)
    body.write(0x00)
    body.write(0xF0)
    body.write(0x00)
    body.write(0x1B)
    body.write(0xE1)
    body.write(0x00)
    body.write(0xF0)
    body.write(0x00)
    if (includeAudio) {
      body.write(0x0F)
      body.write(0xE1)
      body.write(0x01)
      body.write(0xF0)
      body.write(0x00)
    }
    val bodyBytes = body.toByteArray()
    val sectionLength = bodyBytes.size + 4
    val section = ByteArrayOutputStream()
    section.write(0x00)
    section.write(0x02)
    section.write(0xB0 or ((sectionLength shr 8) and 0x0F))
    section.write(sectionLength and 0xFF)
    section.write(bodyBytes)
    writeCrc(section)
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
    val pts = ptsBytes(pts90k)
    val header = ByteArrayOutputStream()
    header.write(0x00)
    header.write(0x00)
    header.write(0x01)
    header.write(streamId)
    val pesPayloadLength = 8 + payload.size
    if (setLength && pesPayloadLength <= 65535) {
      header.write((pesPayloadLength shr 8) and 0xFF)
      header.write(pesPayloadLength and 0xFF)
    } else {
      header.write(0x00)
      header.write(0x00)
    }
    header.write(0x80)
    header.write(0x80)
    header.write(0x05)
    header.write(pts)
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
    while (offset < payload.size || start) {
      val packet = ByteArray(TS_PACKET_SIZE)
      Arrays.fill(packet, 0xFF.toByte())
      packet[0] = 0x47
      val pidHigh = (pid shr 8) and 0x1F
      packet[1] = ((if (start) 0x40 else 0) or pidHigh).toByte()
      packet[2] = (pid and 0xFF).toByte()
      var remaining = payload.size - offset
      if (remaining < 0) {
        remaining = 0
      }
      val pcrBytes = if (writePcr) pcrBytes(pcr90k!!) else null
      val minAdaptation = when {
        pcrBytes != null -> 8
        remaining < TS_PAYLOAD_SIZE -> maxOf(1, TS_PAYLOAD_SIZE - remaining)
        else -> 0
      }
      val payloadBytes = minOf(remaining, TS_PAYLOAD_SIZE - minAdaptation)
      val stuffing = TS_PAYLOAD_SIZE - payloadBytes
      val continuityValue = continuity[pid] and 0x0F
      continuity[pid] = (continuityValue + 1) and 0x0F
      if (stuffing > 0) {
        packet[3] = (0x30 or continuityValue).toByte()
        packet[4] = (stuffing - 1).toByte()
        var cursor = 5
        if (stuffing > 1) {
          packet[5] = if (pcrBytes != null) 0x10 else 0x00
          cursor = 6
          if (pcrBytes != null) {
            System.arraycopy(pcrBytes, 0, packet, cursor, pcrBytes.size)
            cursor += pcrBytes.size
          }
        }
        while (cursor < 4 + stuffing) {
          packet[cursor] = 0xFF.toByte()
          cursor += 1
        }
        if (payloadBytes > 0) {
          System.arraycopy(payload, offset, packet, 4 + stuffing, payloadBytes)
        }
        writePcr = false
      } else {
        packet[3] = (0x10 or continuityValue).toByte()
        System.arraycopy(payload, offset, packet, 4, payloadBytes)
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

  companion object {
    const val AUDIO_PID = 0x0101
    const val AUDIO_STREAM_ID = 0xC0
    const val PAT_PID = 0x0000
    const val PMT_PID = 0x1000
    const val VIDEO_PID = 0x0100
    const val VIDEO_STREAM_ID = 0xE0
    private const val TS_PACKET_SIZE = 188
    private const val TS_PAYLOAD_SIZE = 184

    fun annexB(accessUnit: ByteArray, extraHeader: ByteArray?): ByteArray {
      val unit = toAnnexB(accessUnit)
      if (extraHeader == null || extraHeader.isEmpty()) {
        return unit
      }
      val combined = ByteArray(extraHeader.size + unit.size)
      System.arraycopy(extraHeader, 0, combined, 0, extraHeader.size)
      System.arraycopy(unit, 0, combined, extraHeader.size, unit.size)
      return combined
    }

    fun adtsFrame(
      aacFrame: ByteArray,
      sampleRateHz: Int,
      channelCount: Int,
    ): ByteArray {
      val frameLength = aacFrame.size + 7
      val samplingIndex = samplingIndex(sampleRateHz)
      val header = ByteArray(7)
      header[0] = 0xFF.toByte()
      header[1] = 0xF1.toByte()
      header[2] = (((1 shl 6) or (samplingIndex shl 2) or ((channelCount shr 2) and 0x1))).toByte()
      header[3] = (((channelCount and 0x3) shl 6) or ((frameLength shr 11) and 0x3)).toByte()
      header[4] = ((frameLength shr 3) and 0xFF).toByte()
      header[5] = (((frameLength and 0x7) shl 5) or 0x1F).toByte()
      header[6] = 0xFC.toByte()
      val framed = ByteArray(frameLength)
      System.arraycopy(header, 0, framed, 0, 7)
      System.arraycopy(aacFrame, 0, framed, 7, aacFrame.size)
      return framed
    }

    fun pts90kFromUs(presentationTimeUs: Long): Long {
      return presentationTimeUs * 9L / 100L
    }

    private fun toAnnexB(sample: ByteArray): ByteArray {
      if (sample.size >= 4 &&
        sample[0] == 0.toByte() &&
        sample[1] == 0.toByte() &&
        sample[2] == 0.toByte() &&
        sample[3] == 1.toByte()
      ) {
        return sample
      }
      if (sample.size >= 3 &&
        sample[0] == 0.toByte() &&
        sample[1] == 0.toByte() &&
        sample[2] == 1.toByte()
      ) {
        return sample
      }
      val out = ByteArrayOutputStream()
      var offset = 0
      while (offset + 4 <= sample.size) {
        val nalLength =
          ((sample[offset].toInt() and 0xFF) shl 24) or
            ((sample[offset + 1].toInt() and 0xFF) shl 16) or
            ((sample[offset + 2].toInt() and 0xFF) shl 8) or
            (sample[offset + 3].toInt() and 0xFF)
        offset += 4
        if (nalLength <= 0 || offset + nalLength > sample.size) {
          break
        }
        out.write(0x00)
        out.write(0x00)
        out.write(0x00)
        out.write(0x01)
        out.write(sample, offset, nalLength)
        offset += nalLength
      }
      val converted = out.toByteArray()
      return if (converted.isEmpty()) sample else converted
    }

    private fun samplingIndex(sampleRateHz: Int): Int {
      val rates = intArrayOf(
        96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350,
      )
      val index = rates.indexOf(sampleRateHz)
      return if (index >= 0) index else 4
    }

    private fun ptsBytes(pts90k: Long): ByteArray {
      val pts = pts90k and 0x1FFFFFFFFL
      return byteArrayOf(
        (0x20 or (((pts shr 30).toInt() and 0x07) shl 1) or 1).toByte(),
        ((pts shr 22).toInt() and 0xFF).toByte(),
        ((((pts shr 15).toInt() and 0x7F) shl 1) or 1).toByte(),
        ((pts shr 7).toInt() and 0xFF).toByte(),
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
        (((base and 1L) shl 7) or 0x7E).toByte(),
        0x00,
      )
    }

    private fun writeCrc(section: ByteArrayOutputStream) {
      val bytes = section.toByteArray()
      val crc = mpegCrc32(bytes, 1, bytes.size - 1)
      section.write((crc shr 24) and 0xFF)
      section.write((crc shr 16) and 0xFF)
      section.write((crc shr 8) and 0xFF)
      section.write(crc and 0xFF)
    }

    private fun mpegCrc32(data: ByteArray, offset: Int, length: Int): Int {
      var crc = -1
      for (index in offset until offset + length) {
        crc = crc xor ((data[index].toInt() and 0xFF) shl 24)
        repeat(8) {
          crc = if (crc < 0) (crc shl 1) xor 0x04C11DB7 else crc shl 1
        }
      }
      return crc
    }
  }
}
