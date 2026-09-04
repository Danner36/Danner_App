import ExpoModulesCore
import Foundation

public final class DannerLiveHlsModule: Module {
  public func definition() -> ModuleDefinition {
    Name("DannerLiveHls")

    AsyncFunction("startProxy") { (_ sourceUrl: String, _ referer: String) -> [String: Any] in
      let result = try HlsProxyServer.shared.start(source: sourceUrl, referer: referer)
      return [
        "origin": result.origin,
        "port": result.port,
      ]
    }

    AsyncFunction("stopProxy") {
      HlsProxyServer.shared.stop()
    }

    AsyncFunction("getProxyStatus") { () -> [String: Any] in
      var status: [String: Any] = [
        "running": HlsProxyServer.shared.running,
      ]
      if let origin = HlsProxyServer.shared.origin {
        status["origin"] = origin
      }
      if HlsProxyServer.shared.port != 0 {
        status["port"] = HlsProxyServer.shared.port
      }
      return status
    }
  }
}
