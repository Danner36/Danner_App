package expo.modules.dannerlivehls

import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import java.security.SecureRandom
import java.util.Base64
import java.util.concurrent.CompletableFuture
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

/** One logcat filter covers the whole relay. */
internal const val RELAY_TAG = "DannerLiveHls"

internal const val ERR_UNSUPPORTED = "ERR_UNSUPPORTED"
internal const val ERR_NO_NETWORK = "ERR_NO_NETWORK"
internal const val ERR_SOURCE = "ERR_SOURCE"
internal const val ERR_RELAY = "ERR_RELAY"

/** A `startProxy` failure; [code] is the rejection code the JS wrapper maps. */
internal class RelayStartException(
  val code: String,
  message: String,
  cause: Throwable? = null,
) : Exception(message, cause)

/** Media shape a session forwards. [wire] is the value the JS wrapper passes and receives. */
internal enum class RelayKind(val wire: String, val fileName: String, val contentType: String) {
  HLS("hls", "live.m3u8", "application/x-mpegURL"),
  DASH("dash", "live.mpd", "application/dash+xml"),
  MP4("mp4", "media.mp4", "video/mp4");

  companion object {
    fun fromWire(value: String): RelayKind? = RelayKind.entries.firstOrNull { it.wire == value }
  }
}

/** A fully downloaded upstream object held for the live edge. */
internal class CachedMedia(
  val bytes: ByteArray,
  val contentType: String?,
  val acceptRanges: String?,
)

/**
 * One relay session: the source it forwards, the random token every route lives under, and the
 * HMAC key that signs each upstream URL the relay hands out. A new start makes a new session,
 * so URLs from an earlier session stop resolving.
 */
internal class RelaySession(
  val origin: String,
  val kind: RelayKind,
  val sourceUrl: String,
  val referer: String,
) {
  val token: String
  private val mac: Mac

  init {
    val random = SecureRandom()
    val tokenBytes = ByteArray(TOKEN_BYTES)
    random.nextBytes(tokenBytes)
    token = hex(tokenBytes, tokenBytes.size)
    val key = ByteArray(KEY_BYTES)
    random.nextBytes(key)
    mac = Mac.getInstance(HMAC_ALGORITHM)
    mac.init(SecretKeySpec(key, HMAC_ALGORITHM))
  }

  /** Path of the entry the receiver loads: playlist, manifest, or file. */
  val mediaPath: String
    get() = "/$token/${kind.fileName}"

  private val cache = LinkedHashMap<String, CachedMedia>(16, 0.75f, true)
  private var cacheBytes = 0L
  private val loads = ConcurrentHashMap<String, CompletableFuture<CachedMedia?>>()

  fun matchesToken(candidate: String): Boolean {
    return MessageDigest.isEqual(
      token.toByteArray(StandardCharsets.US_ASCII),
      candidate.toByteArray(StandardCharsets.US_ASCII),
    )
  }

  /** Lowercase hex of the first 16 bytes of HMAC-SHA256 over the UTF-8 bytes of [value]. */
  fun sign(value: String): String {
    val digest = synchronized(mac) {
      mac.doFinal(value.toByteArray(StandardCharsets.UTF_8))
    }
    return hex(digest, SIGNATURE_BYTES)
  }

  fun verify(value: String, signature: String?): Boolean {
    if (signature.isNullOrEmpty()) {
      return false
    }
    return MessageDigest.isEqual(
      sign(value).toByteArray(StandardCharsets.US_ASCII),
      signature.toByteArray(StandardCharsets.US_ASCII),
    )
  }

  /** Relay path for one upstream object: `/<token>/s?u=<base64url>&k=<sig>`. */
  fun signedPath(absoluteUrl: String): String {
    return "/$token/s?u=${base64Url(absoluteUrl)}&k=${sign(absoluteUrl)}"
  }

  /** Absolute relay directory for an upstream directory ending in `/`. */
  fun relayDirectory(directory: String): String {
    return "$origin/$token/d/${base64Url(directory)}/${sign(directory)}/"
  }

  fun cached(url: String): CachedMedia? {
    synchronized(cache) {
      return cache[url]
    }
  }

  fun isLoading(url: String): Boolean = loads.containsKey(url)

  /**
   * One download per URL. The receiver and the live-edge prefetch share it, so a cache miss
   * still does not pull the same object twice.
   */
  fun load(url: String, waitMs: Long, download: () -> CachedMedia?): CachedMedia? {
    cached(url)?.let { return it }
    val created = CompletableFuture<CachedMedia?>()
    val prior = loads.putIfAbsent(url, created)
    if (prior != null) {
      return try {
        prior.get(waitMs, TimeUnit.MILLISECONDS)
      } catch (_: Exception) {
        null
      }
    }
    var media: CachedMedia? = null
    try {
      media = download()
      if (media != null) {
        remember(url, media)
      }
    } catch (_: Exception) {
      media = null
    } catch (_: OutOfMemoryError) {
      media = null
    } finally {
      created.complete(media)
      loads.remove(url, created)
    }
    return media
  }

  private fun remember(url: String, media: CachedMedia) {
    val size = media.bytes.size
    if (size == 0 || size > MAX_CACHED_OBJECT_BYTES) {
      return
    }
    synchronized(cache) {
      cache.remove(url)?.let { cacheBytes -= it.bytes.size }
      cache[url] = media
      cacheBytes += size
      val entries = cache.entries.iterator()
      while ((cache.size > CACHE_ENTRIES || cacheBytes > CACHE_BYTES) && entries.hasNext()) {
        val eldest = entries.next()
        if (eldest.key == url) {
          continue
        }
        cacheBytes -= eldest.value.bytes.size
        entries.remove()
      }
    }
  }

  companion object {
    private const val TOKEN_BYTES = 16
    private const val KEY_BYTES = 32
    private const val SIGNATURE_BYTES = 16
    private const val HMAC_ALGORITHM = "HmacSHA256"
    private const val CACHE_ENTRIES = 12
    private const val CACHE_BYTES = 32L * 1024L * 1024L
    const val MAX_CACHED_OBJECT_BYTES = 8 * 1024 * 1024
  }
}

private val HEX_DIGITS = "0123456789abcdef".toCharArray()

internal fun hex(bytes: ByteArray, count: Int): String {
  val output = CharArray(count * 2)
  for (index in 0 until count) {
    val value = bytes[index].toInt() and 0xff
    output[index * 2] = HEX_DIGITS[value ushr 4]
    output[index * 2 + 1] = HEX_DIGITS[value and 0x0f]
  }
  return String(output)
}

/** URL-safe base64 of the UTF-8 bytes, without padding. */
internal fun base64Url(value: String): String {
  return Base64.getUrlEncoder().withoutPadding()
    .encodeToString(value.toByteArray(StandardCharsets.UTF_8))
}

internal fun decodeBase64Url(value: String): String? {
  return try {
    String(Base64.getUrlDecoder().decode(value), StandardCharsets.UTF_8)
  } catch (_: IllegalArgumentException) {
    null
  }
}
