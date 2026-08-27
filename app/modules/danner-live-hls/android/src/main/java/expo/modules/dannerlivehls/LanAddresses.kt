package expo.modules.dannerlivehls

import java.net.Inet4Address
import java.net.NetworkInterface

internal object LanAddresses {
  const val FIRST_PORT = 8108
  const val LAST_PORT = 8127

  fun originForPort(port: Int): String {
    return "http://${ipv4()}:$port"
  }

  fun ipv4(): String {
    val candidates = mutableListOf<String>()
    val interfaces = NetworkInterface.getNetworkInterfaces() ?: return "127.0.0.1"
    for (network in interfaces) {
      if (!network.isUp || network.isLoopback) {
        continue
      }
      val addresses = network.inetAddresses
      while (addresses.hasMoreElements()) {
        val address = addresses.nextElement()
        if (address is Inet4Address && !address.isLoopbackAddress && !address.isLinkLocalAddress) {
          val host = address.hostAddress ?: continue
          if (network.name.startsWith("wlan") || network.name.startsWith("ap") || network.name.startsWith("en")) {
            return host
          }
          candidates.add(host)
        }
      }
    }
    return candidates.firstOrNull() ?: "127.0.0.1"
  }
}
