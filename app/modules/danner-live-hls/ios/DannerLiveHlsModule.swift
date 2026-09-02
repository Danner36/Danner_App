import ExpoModulesCore
import Foundation

public final class DannerLiveHlsModule: Module {
  public func definition() -> ModuleDefinition {
    Name("DannerLiveHls")

    AsyncFunction("start") { (_ cropX: Double, _ cropY: Double, _ cropWidth: Double, _ cropHeight: Double) -> [String: Any] in
      let result = try LiveHlsEngine.shared.start()
      return [
        "origin": result.origin,
        "port": result.port,
      ]
    }

    AsyncFunction("stop") {
      LiveHlsEngine.shared.stop()
    }

    AsyncFunction("getStatus") { () -> [String: Any] in
      var status: [String: Any] = [
        "running": LiveHlsEngine.shared.running,
      ]
      if let origin = LiveHlsEngine.shared.origin {
        status["origin"] = origin
      }
      if LiveHlsEngine.shared.port != 0 {
        status["port"] = LiveHlsEngine.shared.port
      }
      return status
    }

    AsyncFunction("showAirPlayPicker") {
      LiveHlsEngine.shared.showAirPlayPicker()
    }
  }
}
