package expo.modules.dannerlivehls

import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioPlaybackCaptureConfiguration
import android.media.AudioRecord
import android.media.MediaCodec
import android.media.MediaCodecInfo
import android.media.MediaFormat
import android.media.projection.MediaProjection
import android.os.Handler
import android.os.HandlerThread
import android.view.Surface
import java.io.ByteArrayOutputStream

internal class ScreenHlsPipeline(
  private val mediaProjection: MediaProjection,
  private val width: Int,
  private val height: Int,
  private val densityDpi: Int,
  private val window: HlsWindow,
  private val onSegment: (count: Int) -> Unit,
) {
  private val lock = Any()
  private val codecBufferInfo = MediaCodec.BufferInfo()
  private val audNal = byteArrayOf(0, 0, 0, 1, 0x09, 0xF0.toByte())
  private val audioSampleRate = 44_100
  private val audioChannels = 2

  private var videoEncoder: MediaCodec? = null
  private var audioEncoder: MediaCodec? = null
  private var inputSurface: Surface? = null
  private var virtualDisplay: VirtualDisplay? = null
  private var audioRecord: AudioRecord? = null
  private var muxer = MpegTsMuxer()
  private var segment = ByteArrayOutputStream()
  private var videoHeader: ByteArray? = null
  private var segmentStartUs = -1L
  private var lastVideoUs = 0L
  private var includeAudio = false
  private var running = false
  private var audioThread: Thread? = null
  private var encoderThread: HandlerThread? = null
  private var encoderHandler: Handler? = null

  fun start() {
    running = true
    val video = createVideoEncoder()
    videoEncoder = video
    inputSurface = video.createInputSurface()
    video.start()
    val audio = createAudioCapture()
    audioRecord = audio.first
    audioEncoder = audio.second
    includeAudio = audio.second != null
    audio.second?.start()
    audio.first?.startRecording()
    virtualDisplay = mediaProjection.createVirtualDisplay(
      "danner-live-hls",
      width,
      height,
      densityDpi,
      DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
      inputSurface,
      null,
      null,
    )
    val thread = HandlerThread("danner-live-hls-encoder")
    thread.start()
    encoderThread = thread
    encoderHandler = Handler(thread.looper)
    drainLoop()
    if (audio.first != null && audio.second != null) {
      audioThread = Thread({ captureAudio() }, "danner-live-hls-audio").also { it.start() }
    }
  }

  fun stop() {
    running = false
    try {
      audioRecord?.stop()
    } catch (_: Exception) {
    }
    audioThread?.join(1_000)
    audioThread = null
    encoderHandler?.post {
      signalVideoEnd()
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
    releaseCodec(videoEncoder)
    releaseCodec(audioEncoder)
    videoEncoder = null
    audioEncoder = null
    try {
      inputSurface?.release()
    } catch (_: Exception) {
    }
    inputSurface = null
    try {
      audioRecord?.release()
    } catch (_: Exception) {
    }
    audioRecord = null
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

  private fun signalVideoEnd() {
    try {
      videoEncoder?.signalEndOfInputStream()
    } catch (_: Exception) {
    }
    drainVideo()
    drainAudio()
    publishSegmentIfNeeded(force = true)
  }

  private fun createVideoEncoder(): MediaCodec {
    val format = MediaFormat.createVideoFormat(MediaFormat.MIMETYPE_VIDEO_AVC, width, height)
    format.setInteger(
      MediaFormat.KEY_COLOR_FORMAT,
      MediaCodecInfo.CodecCapabilities.COLOR_FormatSurface,
    )
    format.setInteger(MediaFormat.KEY_BIT_RATE, 2_500_000)
    format.setInteger(MediaFormat.KEY_FRAME_RATE, 30)
    format.setInteger(MediaFormat.KEY_I_FRAME_INTERVAL, 2)
    format.setInteger(MediaFormat.KEY_PROFILE, MediaCodecInfo.CodecProfileLevel.AVCProfileBaseline)
    format.setInteger(MediaFormat.KEY_LEVEL, MediaCodecInfo.CodecProfileLevel.AVCLevel31)
    val codec = MediaCodec.createEncoderByType(MediaFormat.MIMETYPE_VIDEO_AVC)
    try {
      codec.configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
    } catch (_: Exception) {
      format.removeKey(MediaFormat.KEY_PROFILE)
      format.removeKey(MediaFormat.KEY_LEVEL)
      codec.configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
    }
    return codec
  }

  private fun createAudioCapture(): Pair<AudioRecord?, MediaCodec?> {
    val config = AudioPlaybackCaptureConfiguration.Builder(mediaProjection)
      .addMatchingUsage(AudioAttributes.USAGE_MEDIA)
      .addMatchingUsage(AudioAttributes.USAGE_GAME)
      .addMatchingUsage(AudioAttributes.USAGE_UNKNOWN)
      .build()
    val pcm = AudioFormat.Builder()
      .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
      .setSampleRate(audioSampleRate)
      .setChannelMask(AudioFormat.CHANNEL_IN_STEREO)
      .build()
    val bufferSize = AudioRecord.getMinBufferSize(
      audioSampleRate,
      AudioFormat.CHANNEL_IN_STEREO,
      AudioFormat.ENCODING_PCM_16BIT,
    ) * 2
    val record = try {
      AudioRecord.Builder()
        .setAudioFormat(pcm)
        .setBufferSizeInBytes(bufferSize.coerceAtLeast(4096))
        .setAudioPlaybackCaptureConfig(config)
        .build()
    } catch (_: Exception) {
      return Pair(null, null)
    }
    if (record.state != AudioRecord.STATE_INITIALIZED) {
      record.release()
      return Pair(null, null)
    }
    val format = MediaFormat.createAudioFormat(
      MediaFormat.MIMETYPE_AUDIO_AAC,
      audioSampleRate,
      audioChannels,
    )
    format.setInteger(MediaFormat.KEY_AAC_PROFILE, MediaCodecInfo.CodecProfileLevel.AACObjectLC)
    format.setInteger(MediaFormat.KEY_BIT_RATE, 128_000)
    format.setInteger(MediaFormat.KEY_MAX_INPUT_SIZE, bufferSize.coerceAtLeast(4096))
    val encoder = try {
      MediaCodec.createEncoderByType(MediaFormat.MIMETYPE_AUDIO_AAC).also { codec ->
        codec.configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
      }
    } catch (_: Exception) {
      record.release()
      return Pair(null, null)
    }
    return Pair(record, encoder)
  }

  private fun captureAudio() {
    val record = audioRecord ?: return
    val encoder = audioEncoder ?: return
    val startNs = System.nanoTime()
    val buffer = ByteArray(4096)
    while (running) {
      val read = record.read(buffer, 0, buffer.size)
      if (read <= 0) {
        continue
      }
      val ptsUs = (System.nanoTime() - startNs) / 1_000L
      var offset = 0
      while (offset < read && running) {
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
        val copy = minOf(read - offset, input.remaining())
        input.put(buffer, offset, copy)
        try {
          encoder.queueInputBuffer(index, 0, copy, ptsUs, 0)
        } catch (_: Exception) {
          return
        }
        offset += copy
      }
    }
  }

  private fun drainVideo() {
    val encoder = videoEncoder ?: return
    while (true) {
      val index = try {
        encoder.dequeueOutputBuffer(codecBufferInfo, 0)
      } catch (_: Exception) {
        return
      }
      if (index == MediaCodec.INFO_TRY_AGAIN_LATER) {
        return
      }
      if (index < 0) {
        continue
      }
      val output = encoder.getOutputBuffer(index)
      if (output != null && codecBufferInfo.size > 0) {
        val bytes = ByteArray(codecBufferInfo.size)
        output.position(codecBufferInfo.offset)
        output.get(bytes)
        if (codecBufferInfo.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG != 0) {
          videoHeader = audNal + MpegTsMuxer.annexB(bytes, null)
        } else {
          val keyframe = codecBufferInfo.flags and MediaCodec.BUFFER_FLAG_KEY_FRAME != 0
          muxVideo(bytes, codecBufferInfo.presentationTimeUs, keyframe)
        }
      }
      try {
        encoder.releaseOutputBuffer(index, false)
      } catch (_: Exception) {
        return
      }
      if (codecBufferInfo.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) {
        return
      }
    }
  }

  private fun drainAudio() {
    val encoder = audioEncoder ?: return
    while (true) {
      val index = try {
        encoder.dequeueOutputBuffer(codecBufferInfo, 0)
      } catch (_: Exception) {
        return
      }
      if (index == MediaCodec.INFO_TRY_AGAIN_LATER) {
        return
      }
      if (index < 0) {
        continue
      }
      val output = encoder.getOutputBuffer(index)
      if (output != null &&
        codecBufferInfo.size > 0 &&
        codecBufferInfo.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG == 0
      ) {
        val bytes = ByteArray(codecBufferInfo.size)
        output.position(codecBufferInfo.offset)
        output.get(bytes)
        muxAudio(bytes, codecBufferInfo.presentationTimeUs)
      }
      try {
        encoder.releaseOutputBuffer(index, false)
      } catch (_: Exception) {
        return
      }
    }
  }

  private fun muxVideo(sample: ByteArray, ptsUs: Long, keyframe: Boolean) {
    synchronized(lock) {
      if (segmentStartUs < 0L) {
        if (!keyframe) {
          return
        }
        beginSegment(ptsUs)
      } else if (keyframe && ptsUs - segmentStartUs >= 1_800_000L) {
        publishSegment(ptsUs - segmentStartUs)
        beginSegment(ptsUs)
      }
      lastVideoUs = ptsUs
      val header = if (keyframe) videoHeader ?: audNal else audNal
      val accessUnit = MpegTsMuxer.annexB(sample, header)
      val pts90k = MpegTsMuxer.pts90kFromUs(ptsUs)
      segment.write(
        muxer.pesPackets(
          MpegTsMuxer.VIDEO_PID,
          MpegTsMuxer.VIDEO_STREAM_ID,
          accessUnit,
          pts90k,
          pts90k,
          false,
        ),
      )
    }
  }

  private fun muxAudio(sample: ByteArray, ptsUs: Long) {
    synchronized(lock) {
      if (segmentStartUs < 0L) {
        return
      }
      val framed = MpegTsMuxer.adtsFrame(sample, audioSampleRate, audioChannels)
      val pts90k = MpegTsMuxer.pts90kFromUs(ptsUs)
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
  }

  private fun beginSegment(ptsUs: Long) {
    muxer = MpegTsMuxer()
    segment.reset()
    segment.write(muxer.patPacket())
    segment.write(muxer.pmtPacket(includeAudio))
    segmentStartUs = ptsUs
  }

  private fun publishSegment(durationUs: Long) {
    val payload = segment.toByteArray()
    if (payload.isEmpty()) {
      return
    }
    val durationSeconds = (durationUs.coerceAtLeast(1_000_000L) / 1_000_000.0)
    window.add(durationSeconds.coerceAtMost(3.0), payload)
    onSegment(window.size())
  }

  private fun publishSegmentIfNeeded(force: Boolean) {
    synchronized(lock) {
      if (segmentStartUs < 0L) {
        return
      }
      val durationUs = lastVideoUs - segmentStartUs
      if (force || durationUs >= 1_800_000L) {
        publishSegment(durationUs)
        segmentStartUs = -1L
        segment.reset()
      }
    }
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
}
