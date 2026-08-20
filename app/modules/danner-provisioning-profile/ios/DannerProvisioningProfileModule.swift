import ExpoModulesCore
import Foundation

public final class DannerProvisioningProfileModule: Module {
  public func definition() -> ModuleDefinition {
    Name("DannerProvisioningProfile")

    Function("getExpirationTimestamp") { () -> Double? in
      guard
        let profileURL = Bundle.main.url(
          forResource: "embedded",
          withExtension: "mobileprovision"
        ),
        let profileData = try? Data(contentsOf: profileURL),
        let plistData = Self.extractPlist(from: profileData),
        let plist = try? PropertyListSerialization.propertyList(
          from: plistData,
          options: [],
          format: nil
        ) as? [String: Any],
        let expirationDate = plist["ExpirationDate"] as? Date
      else {
        return nil
      }

      return expirationDate.timeIntervalSince1970 * 1_000
    }
  }

  private static func extractPlist(from profileData: Data) -> Data? {
    let bytes = [UInt8](profileData)
    let startMarker = Array("<?xml".utf8)
    let endMarker = Array("</plist>".utf8)

    guard
      let startIndex = firstIndex(of: startMarker, in: bytes),
      let endStartIndex = firstIndex(
        of: endMarker,
        in: bytes,
        startingAt: startIndex
      )
    else {
      return nil
    }

    let endIndex = endStartIndex + endMarker.count
    return Data(bytes[startIndex..<endIndex])
  }

  private static func firstIndex(
    of needle: [UInt8],
    in haystack: [UInt8],
    startingAt requestedStart: Int = 0
  ) -> Int? {
    guard !needle.isEmpty, haystack.count >= needle.count else {
      return nil
    }

    let start = max(0, requestedStart)
    let finalStart = haystack.count - needle.count
    guard start <= finalStart else {
      return nil
    }

    for index in start...finalStart
    where haystack[index..<(index + needle.count)].elementsEqual(needle) {
      return index
    }

    return nil
  }
}
