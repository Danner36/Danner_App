package expo.modules.dannerlivehls

import java.net.URL

/**
 * Rewrites an MPD so every media request goes back through the relay. Upstream directories
 * become signed relay directories (`/<token>/d/<base64url>/<sig>/`), so relative segment
 * templates keep resolving without the relay knowing each segment name.
 */
internal object DashManifest {
  const val CONTENT_TYPE = "application/dash+xml"

  private val LOCATION = Regex("<Location\\b[^>]*>.*?</Location>", RegexOption.DOT_MATCHES_ALL)
  private val MPD_OPEN = Regex("<MPD\\b[^>]*>")
  private val DYNAMIC = Regex("\\stype\\s*=\\s*[\"']dynamic[\"']")

  /** BaseURL elements (group 1 is the text) and the container tags that scope them. */
  private val STRUCTURE = Regex(
    "<BaseURL(?:\\s[^>]*)?(?<!/)>(.*?)</BaseURL>" +
      "|<(/?)(MPD|Period|AdaptationSet|Representation)\\b[^>]*>",
    RegexOption.DOT_MATCHES_ALL,
  )
  private val URL_ATTRIBUTE =
    Regex("(\\s(?:media|initialization|index|sourceURL)\\s*=\\s*)([\"'])(.*?)\\2")

  fun isManifest(body: String): Boolean = body.contains("<MPD")

  /** True when the root `<MPD>` element declares `type="dynamic"`. */
  fun isDynamic(body: String): Boolean {
    val root = MPD_OPEN.find(body)?.value ?: return false
    return DYNAMIC.containsMatchIn(root)
  }

  /**
   * [manifestUrl] is the MPD URL after redirects. Each BaseURL resolves against its parent
   * level's BaseURL (the MPD URL at the top), as a DASH client would resolve it.
   */
  fun rewrite(body: String, manifestUrl: URL, relayDirectory: (String) -> String): String {
    val source = LOCATION.replace(body, "")
    val output = StringBuilder(source.length + 1024)
    // First resolved BaseURL of each open MPD, Period, AdaptationSet, and Representation.
    val levels = ArrayList<String?>()
    var topLevelBase = false
    var last = 0
    for (match in STRUCTURE.findAll(source)) {
      val text = match.groups[1]
      if (text == null) {
        val closing = match.groups[2]?.value == "/"
        when {
          closing -> if (levels.isNotEmpty()) levels.removeAt(levels.size - 1)
          !match.value.endsWith("/>") -> levels.add(null)
        }
        continue
      }
      if (levels.size <= 1) {
        topLevelBase = true
      }
      val parent = levels.subList(0, maxOf(levels.size - 1, 0)).lastOrNull { it != null }
        ?: manifestUrl.toString()
      val resolved = try {
        URL(URL(parent), xmlUnescape(text.value.trim())).toString()
      } catch (_: Exception) {
        null
      }
      if (resolved == null || !isHttpUrl(resolved)) {
        continue
      }
      if (levels.isNotEmpty() && levels[levels.size - 1] == null) {
        levels[levels.size - 1] = resolved
      }
      val (directory, remainder) = splitDirectory(resolved)
      output.append(source, last, text.range.first)
      output.append(relayDirectory(directory)).append(xmlEscape(remainder))
      last = text.range.last + 1
    }
    output.append(source, last, source.length)

    var rewritten = output.toString()
    if (!topLevelBase) {
      val open = MPD_OPEN.find(rewritten)
      if (open != null) {
        val directory = splitDirectory(manifestUrl.toString()).first
        val insertAt = open.range.last + 1
        rewritten = rewritten.substring(0, insertAt) +
          "<BaseURL>" + relayDirectory(directory) + "</BaseURL>" +
          rewritten.substring(insertAt)
      }
    }

    return URL_ATTRIBUTE.replace(rewritten) { match ->
      val quote = match.groupValues[2]
      val relayed = relayAbsoluteTemplate(xmlUnescape(match.groupValues[3]), relayDirectory)
      if (relayed == null) {
        match.value
      } else {
        match.groupValues[1] + quote + relayed + quote
      }
    }
  }

  /** An absolute `media`/`initialization`/`index`/`sourceURL` value, split before its template or query. */
  private fun relayAbsoluteTemplate(value: String, relayDirectory: (String) -> String): String? {
    if (!isHttpUrl(value)) {
      return null
    }
    val stop = value.indexOfAny(charArrayOf('$', '?')).let { if (it < 0) value.length else it }
    val slash = if (stop == 0) -1 else value.lastIndexOf('/', stop - 1)
    if (slash < value.indexOf("//") + 2) {
      return null
    }
    return relayDirectory(value.substring(0, slash + 1)) + xmlEscape(value.substring(slash + 1))
  }

  /** The URL up to and including the last `/` of its path, and whatever follows. */
  private fun splitDirectory(absolute: String): Pair<String, String> {
    val pathEnd = absolute.indexOfAny(charArrayOf('?', '#')).let { if (it < 0) absolute.length else it }
    val authorityStart = absolute.indexOf("//").let { if (it < 0) 0 else it + 2 }
    val slash = if (pathEnd == 0) -1 else absolute.lastIndexOf('/', pathEnd - 1)
    if (slash < authorityStart) {
      return Pair(absolute.substring(0, pathEnd) + "/", absolute.substring(pathEnd))
    }
    return Pair(absolute.substring(0, slash + 1), absolute.substring(slash + 1))
  }

  private fun isHttpUrl(value: String): Boolean {
    return value.startsWith("http://", ignoreCase = true) || value.startsWith("https://", ignoreCase = true)
  }

  private fun xmlUnescape(value: String): String {
    if (!value.contains('&')) {
      return value
    }
    return value
      .replace("&lt;", "<")
      .replace("&gt;", ">")
      .replace("&quot;", "\"")
      .replace("&apos;", "'")
      .replace("&amp;", "&")
  }

  private fun xmlEscape(value: String): String {
    return value
      .replace("&", "&amp;")
      .replace("<", "&lt;")
      .replace(">", "&gt;")
      .replace("\"", "&quot;")
      .replace("'", "&apos;")
  }
}
