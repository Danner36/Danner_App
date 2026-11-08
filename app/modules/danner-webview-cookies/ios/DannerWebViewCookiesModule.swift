import ExpoModulesCore
import Foundation
import WebKit

private let sessionCookieNames: Set<String> = ["SID", "__Secure-1PSID", "__Secure-3PSID"]

private func hostFromCookieDomain(_ domain: String) -> String {
  let lowered = domain.lowercased()
  return lowered.hasPrefix(".") ? String(lowered.dropFirst()) : lowered
}

private func isHost(_ host: String, in parent: String) -> Bool {
  return host == parent || host.hasSuffix("." + parent)
}

private func isYouTubeSessionCookie(_ cookie: HTTPCookie) -> Bool {
  let host = hostFromCookieDomain(cookie.domain)
  return isHost(host, in: "google.com") || isHost(host, in: "youtube.com")
}

private func isAccountsCookie(_ cookie: HTTPCookie) -> Bool {
  let host = hostFromCookieDomain(cookie.domain)
  return host == "google.com" || host == "accounts.google.com"
}

public final class DannerWebViewCookiesModule: Module {
  public func definition() -> ModuleDefinition {
    Name("DannerWebViewCookies")

    // sharedCookiesEnabled copies HTTPCookieStorage into the WebView, so both stores are
    // cleared before the promise resolves.
    AsyncFunction("clearYouTubeSession") { (promise: Promise) in
      let cookieStorage = HTTPCookieStorage.shared
      for cookie in (cookieStorage.cookies ?? []) where isYouTubeSessionCookie(cookie) {
        cookieStorage.deleteCookie(cookie)
      }

      let dataStore = WKWebsiteDataStore.default()
      let dataTypes = WKWebsiteDataStore.allWebsiteDataTypes()
      dataStore.fetchDataRecords(ofTypes: dataTypes) { records in
        let matching = records.filter { record in
          let name = record.displayName.lowercased()
          return name.contains("google") || name.contains("youtube")
        }
        dataStore.removeData(ofTypes: dataTypes, for: matching) {
          promise.resolve(true)
        }
      }
    }.runOnQueue(.main)

    // Only cookie names are compared; values never leave this function.
    AsyncFunction("youTubeSessionState") { (promise: Promise) in
      WKWebsiteDataStore.default().httpCookieStore.getAllCookies { cookies in
        let signedIn = cookies.contains { cookie in
          isAccountsCookie(cookie) && sessionCookieNames.contains(cookie.name)
        }
        promise.resolve(signedIn ? "signed-in" : "signed-out")
      }
    }.runOnQueue(.main)
  }
}
