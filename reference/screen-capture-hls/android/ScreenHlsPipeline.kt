package expo.modules.dannerlivehls

import android.graphics.PixelFormat
import android.graphics.Rect
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.Image
import android.media.ImageReader
import android.media.MediaCodec
import android.media.MediaCodecInfo
import android.media.MediaFormat
import android.media.projection.MediaProjection
import android.os.Handler
import android.os.HandlerThread
import android.os.SystemClock
import java.io.ByteArrayOutputStream

/**
 * Crops MediaProjection to the player rectangle, encodes H.264 plus silent AAC, and
 * publishes a sliding MPEG-TS HLS window for as long as capture runs.
 */
internal class ScreenHlsPipeline(
  private val mediaProjection: MediaProjection,
  private val captureWidth: Int,
  private val captureHeight: Int,
  private val encodeWidth: Int,
  private val encodeHeight: Int,
  private val crop: Rect,
  private val densityDpi: Int,
  private val window: HlsWindow,
  private val onSegment: (count: Int) -> Unit,
) {
  private val lock = Any()
  private val videoBufferInfo = MediaCodec.BufferInfo()
  private val audioBufferInfo = MediaCodec.BufferInfo()
  private val audioSampleRate = 44_100
  private val audioChannels = 2
  private val muxer = MpegTsMuxer()
  private val nv12 = ByteArray(encodeWidth * encodeHeight * 3 / 2)
  private val aud = byteArrayOf(0x00, 0x00, 0x00, 0x01, 0x09, 0xF0.toByte())

  private var videoEncoder: MediaCodec? = null
  private var audioEncoder: MediaCodec? = null
  private var imageReader: ImageReader? = null
  private var virtualDisplay: VirtualDisplay? = null
  private var codecConfig = ByteArray(0)
  private var segment = ByteArrayOutputStream()
  private var segmentStartUs = -1L
  private var lastVideoUs = 0L
  private var publishedCount = 0
  private var highProfile = true

  @Volatile
  private var baseUs = -1L
  private var running = false
  private var silenceThread: Thread? = null
  private var encoderThread: HandlerThread? = null
  private var encoderHandler: Handler? = null

  fun start() {
    running = true
    val video = createVideoEncoder()
    window.setProgram(
      encodeWidth,
      encodeHeight,
      if (highProfile) "avc1.640028,mp4a.40.2" else "avc1.42E01E,mp4a.40.2",
    )
    videoEncoder = video
    video.start()
    val audio = createSilentAudioEncoder()
    audioEncoder = audio
    audio.start()
    val thread = HandlerThread("danner-live-hls-encoder")
    thread.start()
    encoderThread = thread
    encoderHandler = Handler(thread.looper)
    val reader = ImageReader.newInstance(
      captureWidth,
      captureHeight,
      PixelFormat.RGBA_8888,
      2,
    )
    reader.setOnImageAvailableListener({ incoming ->
      val image = incoming.acquireLatestImage() ?: return@setOnImageAvailableListener
      try {
        if (running) {
          feedVideoFrame(image)
        }
      } finally {
        image.close()
      }
    }, encoderHandler)
    imageReader = reader
    virtualDisplay = mediaProjection.createVirtualDisplay(
      "danner-live-hls",
      captureWidth,
      captureHeight,
      densityDpi,
      DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
      reader.surface,
      null,
      null,
    )
    android.util.Log.i(
      "DannerLiveHls",
      "live ts ${encodeWidth}x${encodeHeight} crop=${crop.width()}x${crop.height()} " +
        "from ${crop.left},${crop.top}",
    )
    drainLoop()
    silenceThread = Thread({ feedSilence() }, "danner-live-hls-silence").also { it.start() }
  }

  fun stop() {
    running = false
    encoderHandler?.removeCallbacksAndMessages(null)
    silenceThread?.join(1_000)
    silenceThread = null
    encoderHandler?.post {
      drainVideo()
      drainAudio()
      if (segment.size() > 0 && lastVideoUs > segmentStartUs) {
        publishSegment(lastVideoUs - segmentStartUs)
      }
    }
    encoderThread?.quitSafely()
    encoderThread?.join(1_000)
    encoderThread = null
    encoderHandler = null
    try {
      virtualDisplay?.release()
    } catch (_: Exception) {
    }
    virtualDisplay = null
    try {
      imageReader?.close()
    } catch (_: Exception) {
    }
    imageReader = null
    releaseCodec(videoEncoder)
    releaseCodec(audioEncoder)
    videoEncoder = null
    audioEncoder = null
    try {
      mediaProjection.stop()
    } catch (_: Exception) {
    }
  }

  private fun drainLoop() {
    encoderHandler?.post(object : Runnable {
      override fun run() {
        if (!running) {
          return
        }
        drainVideo()
        drainAudio()
        encoderHandler?.postDelayed(this, 8)
      }
    })
  }

  private fun createVideoEncoder(): MediaCodec {
    val format = MediaFormat.createVideoFormat(
      MediaFormat.MIMETYPE_VIDEO_AVC,
      encodeWidth,
      encodeHeight,
    )
    format.setInteger(
      MediaFormat.KEY_COLOR_FORMAT,
      MediaCodecInfo.CodecCapabilities.COLOR_FormatYUV420SemiPlanar,
    )
    format.setInteger(MediaFormat.KEY_BIT_RATE, 2_500_000)
    format.setInteger(MediaFormat.KEY_FRAME_RATE, 30)
    format.setInteger(MediaFormat.KEY_I_FRAME_INTERVAL, 2)
    format.setInteger(MediaFormat.KEY_MAX_INPUT_SIZE, nv12.size)
    format.setInteger(MediaFormat.KEY_PROFILE, MediaCodecInfo.CodecProfileLevel.AVCProfileHigh)
    format.setInteger(MediaFormat.KEY_LEVEL, MediaCodecInfo.CodecProfileLevel.AVCLevel4)
    val codec = MediaCodec.createEncoderByType(MediaFormat.MIMETYPE_VIDEO_AVC)
    try {
      codec.configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
    } catch (_: Exception) {
      highProfile = false
      format.removeKey(MediaFormat.KEY_PROFILE)
      format.removeKey(MediaFormat.KEY_LEVEL)
      try {
        codec.configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
      } catch (_: Exception) {
        format.setInteger(
          MediaFormat.KEY_COLOR_FORMAT,
          MediaCodecInfo.CodecCapabilities.COLOR_FormatYUV420Flexible,
        )
        codec.configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
      }
    }
    return codec
  }

  private fun createSilentAudioEncoder(): MediaCodec {
    val format = MediaFormat.createAudioFormat(
      MediaFormat.MIMETYPE_AUDIO_AAC,
      audioSampleRate,
      audioChannels,
    )
    format.setInteger(MediaFormat.KEY_AAC_PROFILE, MediaCodecInfo.CodecProfileLevel.AACObjectLC)
    format.setInteger(MediaFormat.KEY_BIT_RATE, 64_000)
    format.setInteger(MediaFormat.KEY_MAX_INPUT_SIZE, 8192)
    val codec = MediaCodec.createEncoderByType(MediaFormat.MIMETYPE_AUDIO_AAC)
    codec.configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
    return codec
  }

  private fun feedSilence() {
    val encoder = audioEncoder ?: return
    val frameBytes = 1024 * audioChannels * 2
    val pcm = ByteArray(frameBytes)
    val stepUs = 1024L * 1_000_000L / audioSampleRate
    while (running) {
      queuePcm(encoder, pcm, pcm.size, SystemClock.elapsedRealtimeNanos() / 1_000L)
      try {
        Thread.sleep(stepUs / 1_000L)
      } catch (_: InterruptedException) {
        return
      }
    }
  }

  private fun queuePcm(encoder: MediaCodec, buffer: ByteArray, length: Int, ptsUs: Long) {
    var offset = 0
    while (offset < length && running) {
      val index = try {
        encoder.dequeueInputBuffer(10_000)
      } catch (_: Exception) {
        return
      }
      if (index < 0) {
        break
      }
      val input = encoder.getInputBuffer(index) ?: break
      input.clear()
      val copy = minOf(length - offset, input.remaining())
      input.put(buffer, offset, copy)
      try {
        encoder.queueInputBuffer(index, 0, copy, ptsUs, 0)
      } catch (_: Exception) {
        return
      }
      offset += copy
    }
  }

  private fun feedVideoFrame(image: Image) {
    val encoder = videoEncoder ?: return
    rgbaToNv12(image)
    val index = try {
      encoder.dequeueInputBuffer(0)
    } catch (_: Exception) {
      return
    }
    if (index < 0) {
      return
    }
    val input = encoder.getInputBuffer(index) ?: return
    input.clear()
    val copy = minOf(nv12.size, input.remaining())
    input.put(nv12, 0, copy)
    val ptsUs = SystemClock.elapsedRealtimeNanos() / 1_000L
    try {
      encoder.queueInputBuffer(index, 0, copy, ptsUs, 0)
    } catch (_: Exception) {
    }
  }

  private fun rgbaToNv12(image: Image) {
    val plane = image.planes[0]
    val src = plane.buffer
    val rowStride = plane.rowStride
    val pixelStride = plane.pixelStride
    val cropW = crop.width().coerceAtLeast(1)
    val cropH = crop.height().coerceAtLeast(1)
    val maxX = (image.width - 1).coerceAtLeast(0)
    val maxY = (image.height - 1).coerceAtLeast(0)
    val ySize = encodeWidth * encodeHeight
    for (dy in 0 until encodeHeight) {
      val sy = (crop.top + (dy * cropH) / encodeHeight).coerceIn(0, maxY)
      for (dx in 0 until encodeWidth) {
        val sx = (crop.left + (dx * cropW) / encodeWidth).coerceIn(0, maxX)
        val index = sy * rowStride + sx * pixelStride
        if (index < 0 || index + 2 >= src.limit()) {
          continue
        }
        val r = src.get(index).toInt() and 0xFF
        val g = src.get(index + 1).toInt() and 0xFF
        val b = src.get(index + 2).toInt() and 0xFF
        val y = ((66 * r + 129 * g + 25 * b + 128) shr 8) + 16
        nv12[dy * encodeWidth + dx] = y.toByte()
        if (dy and 1 == 0 && dx and 1 == 0) {
          val u = ((-38 * r - 74 * g + 112 * b + 128) shr 8) + 128
          val v = ((112 * r - 94 * g - 18 * b + 128) shr 8) + 128
          val uvIndex = ySize + (dy / 2) * encodeWidth + dx
          nv12[uvIndex] = u.toByte()
          nv12[uvIndex + 1] = v.toByte()
        }
      }
    }
  }

  private fun drainVideo() {
    val encoder = videoEncoder ?: return
    while (true) {
      val index = try {
        encoder.dequeueOutputBuffer(videoBufferInfo, 0)
      } catch (_: Exception) {
        return
      }
      if (index == MediaCodec.INFO_TRY_AGAIN_LATER) {
        return
      }
      if (index == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
        continue
      }
      if (index < 0) {
        continue
      }
      val buffer = encoder.getOutputBuffer(index)
      if (buffer != null && videoBufferInfo.size > 0) {
        val copy = ByteArray(videoBufferInfo.size)
        buffer.position(videoBufferInfo.offset)
        buffer.get(copy)
        synchronized(lock) {
          muxVideo(copy, videoBufferInfo)
        }
      }
      try {
        encoder.releaseOutputBuffer(index, false)
      } catch (_: Exception) {
        return
      }
      if (videoBufferInfo.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) {
        return
      }
    }
  }

  private fun drainAudio() {
    val encoder = audioEncoder ?: return
    while (true) {
      val index = try {
        encoder.dequeueOutputBuffer(audioBufferInfo, 0)
      } catch (_: Exception) {
        return
      }
      if (index == MediaCodec.INFO_TRY_AGAIN_LATER) {
        return
      }
      if (index == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
        continue
      }
      if (index < 0) {
        continue
      }
      val buffer = encoder.getOutputBuffer(index)
      if (buffer != null && audioBufferInfo.size > 0) {
        val copy = ByteArray(audioBufferInfo.size)
        buffer.position(audioBufferInfo.offset)
        buffer.get(copy)
        synchronized(lock) {
          muxAudio(copy, audioBufferInfo)
        }
      }
      try {
        encoder.releaseOutputBuffer(index, false)
      } catch (_: Exception) {
        return
      }
    }
  }

  private fun muxVideo(encoded: ByteArray, info: MediaCodec.BufferInfo) {
    if (info.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG != 0) {
      codecConfig = encoded.copyOf()
      return
    }
    val rawUs = info.presentationTimeUs
    val secondsUs = normalizedUs(rawUs)
    val keyframe =
      info.flags and MediaCodec.BUFFER_FLAG_KEY_FRAME != 0 || isIdr(encoded)
    if (segmentStartUs < 0) {
      if (!keyframe) {
        return
      }
      beginSegment(secondsUs)
    } else if (keyframe && secondsUs - segmentStartUs >= SEGMENT_US) {
      publishSegment(secondsUs - segmentStartUs)
      beginSegment(secondsUs)
    }
    lastVideoUs = secondsUs
    val accessUnit = accessUnit(encoded, keyframe)
    val pts90k = MpegTsMuxer.pts90kFromUs(secondsUs)
    val pcr90k = if (pts90k > MpegTsMuxer.PCR_LEAD_90K) {
      pts90k - MpegTsMuxer.PCR_LEAD_90K
    } else {
      0L
    }
    segment.write(
      muxer.pesPackets(
        MpegTsMuxer.VIDEO_PID,
        MpegTsMuxer.VIDEO_STREAM_ID,
        accessUnit,
        pts90k,
        pcr90k,
        false,
      ),
    )
  }

  private fun muxAudio(encoded: ByteArray, info: MediaCodec.BufferInfo) {
    if (info.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG != 0) {
      return
    }
    if (segmentStartUs < 0 || baseUs < 0) {
      return
    }
    val secondsUs = normalizedUs(info.presentationTimeUs)
    val framed = MpegTsMuxer.adtsFrame(encoded, audioSampleRate, audioChannels)
    val pts90k = MpegTsMuxer.pts90kFromUs(secondsUs)
    segment.write(
      muxer.pesPackets(
        MpegTsMuxer.AUDIO_PID,
        MpegTsMuxer.AUDIO_STREAM_ID,
        framed,
        pts90k,
        null,
        true,
      ),
    )
  }

  private fun beginSegment(secondsUs: Long) {
    segment.reset()
    segment.write(muxer.patPacket())
    segment.write(muxer.pmtPacket(includeAudio = true))
    segmentStartUs = secondsUs
  }

  private fun publishSegment(durationUs: Long) {
    val payload = segment.toByteArray()
    if (payload.size < 188) {
      return
    }
    val durationSeconds = maxOf(durationUs / 1_000_000.0, MIN_SEGMENT_SECONDS)
    val index = window.add(durationSeconds, payload)
    publishedCount += 1
    android.util.Log.i(
      "DannerLiveHls",
      "segment $index duration=${"%.3f".format(durationSeconds)} bytes=${payload.size}",
    )
    onSegment(publishedCount)
  }

  private fun isIdr(encoded: ByteArray): Boolean {
    var index = 0
    while (index + 4 < encoded.size) {
      val start =
        encoded[index] == 0.toByte() &&
          encoded[index + 1] == 0.toByte() &&
          encoded[index + 2] == 0.toByte() &&
          encoded[index + 3] == 1.toByte()
      if (!start) {
        index += 1
        continue
      }
      val nal = encoded[index + 4].toInt() and 0x1F
      if (nal == 5) {
        return true
      }
      index += 4
    }
    return false
  }

  private fun accessUnit(encoded: ByteArray, keyframe: Boolean): ByteArray {
    val header = if (keyframe && codecConfig.isNotEmpty()) {
      aud + codecConfig
    } else {
      aud
    }
    return header + encoded
  }

  private fun normalizedUs(rawUs: Long): Long {
    if (baseUs < 0L) {
      baseUs = rawUs
    }
    return (rawUs - baseUs).coerceAtLeast(0L) + TIMELINE_START_US
  }

  private fun releaseCodec(codec: MediaCodec?) {
    if (codec == null) {
      return
    }
    try {
      codec.stop()
    } catch (_: Exception) {
    }
    try {
      codec.release()
    } catch (_: Exception) {
    }
  }

  private companion object {
    const val MIN_SEGMENT_SECONDS = 1.0 / 30.0
    const val SEGMENT_US = 1_800_000L
    const val TIMELINE_START_US = 1_000_000L
  }
}
