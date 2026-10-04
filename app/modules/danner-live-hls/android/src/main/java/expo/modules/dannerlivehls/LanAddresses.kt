package expo.modules.dannerlivehls

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import java.net.Inet4Address
import java.net.InetAddress
import java.net.NetworkInterface

/**
 * The phone's LAN address for the relay, looked up again on every start. The active network
 * wins when it is Wi-Fi or Ethernet (and not a VPN); otherwise a Wi-Fi, hotspot, or Ethernet
 * interface by name. Cellular, loopback, link-local, and the 192.0.0.0/29 range (464XLAT)
 * are never used, since a TV cannot reach them.
 */
internal object LanAddresses {
  const val FIRST_PORT = 8108
  const val LAST_PORT = 8127

  /** Name prefixes in preference order: Wi-Fi, Samsung hotspot, hotspot, Ethernet. */
  private val LAN_INTERFACE_PREFIXES = listOf("wlan", "swlan", "ap", "en", "eth")
  private val CELLULAR_INTERFACE_PREFIXES = listOf("rmnet", "ccmni", "v4-")

  fun select(context: Context): Inet4Address? {
    return activeNetworkAddress(context) ?: interfaceAddress()
  }

  private fun activeNetworkAddress(context: Context): Inet4Address? {
    return try {
      val connectivity = context.getSystemService(ConnectivityManager::class.java) ?: return null
      val network = connectivity.activeNetwork ?: return null
      val capabilities = connectivity.getNetworkCapabilities(network) ?: return null
      val local = capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) ||
        capabilities.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET)
      if (!local || capabilities.hasTransport(NetworkCapabilities.TRANSPORT_VPN)) {
        return null
      }
      val properties = connectivity.getLinkProperties(network) ?: return null
      if (isCellularInterface(properties.interfaceName.orEmpty())) {
        return null
      }
      properties.linkAddresses.firstNotNullOfOrNull { usable(it.address) }
    } catch (_: Exception) {
      null
    }
  }

  private fun interfaceAddress(): Inet4Address? {
    val interfaces = try {
      NetworkInterface.getNetworkInterfaces()?.toList()
    } catch (_: Exception) {
      null
    }
    if (interfaces == null) {
      return null
    }
    for (prefix in LAN_INTERFACE_PREFIXES) {
      for (network in interfaces) {
        val name = network.name ?: continue
        if (!name.startsWith(prefix) || isCellularInterface(name)) {
          continue
        }
        val up = try {
          network.isUp && !network.isLoopback
        } catch (_: Exception) {
          false
        }
        if (!up) {
          continue
        }
        for (address in network.inetAddresses.toList()) {
          usable(address)?.let { return it }
        }
      }
    }
    return null
  }

  private fun isCellularInterface(name: String): Boolean {
    return CELLULAR_INTERFACE_PREFIXES.any { name.startsWith(it) }
  }

  private fun usable(address: InetAddress?): Inet4Address? {
    if (address !is Inet4Address) {
      return null
    }
    if (address.isLoopbackAddress ||
      address.isLinkLocalAddress ||
      address.isAnyLocalAddress ||
      address.isMulticastAddress
    ) {
      return null
    }
    val bytes = address.address
    if (bytes.size == 4 &&
      (bytes[0].toInt() and 0xff) == 192 &&
      bytes[1].toInt() == 0 &&
      bytes[2].toInt() == 0 &&
      (bytes[3].toInt() and 0xff) < 8
    ) {
      return null
    }
    return address
  }
}
