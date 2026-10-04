import ExpoModulesCore
import Foundation

public final class DannerLiveHlsModule: Module {
  public func definition() -> ModuleDefinition {
    Name("DannerLiveHls")

    // Resolves from the relay queue once the source answered and the listener is accepting,
    // so the upstream round trips do not hold Expo's queue.
    AsyncFunction("startProxy") { (sourceUrl: String, referer: String, kind: String, promise: Promise) in
      HlsProxyServer.shared.start(source: sourceUrl, referer: referer, kind: kind) { outcome in
        switch outcome {
        case .success(let result):
          promise.resolve(result)
        case .failure(let failure):
          promise.reject(failure.code, failure.message)
        }
      }
    }

    AsyncFunction("stopProxy") {
      HlsProxyServer.shared.stop()
    }

    AsyncFunction("getProxyStatus") { () -> [String: Any] in
      HlsProxyServer.shared.status()
    }

    OnDestroy {
      HlsProxyServer.shared.stop()
    }
  }
}
