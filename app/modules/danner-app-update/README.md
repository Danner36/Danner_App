# danner-app-update

Android-only local Expo module that downloads a GitHub release APK, verifies its SHA-256, and opens the system package installer. It is absent from iPhone builds.

- The download and install run on a background coroutine, so other Expo module calls are not queued behind a large APK.
- Only one install runs per process. A second call rejects with `ERR_BUSY`; the JS wrapper reports the install already in progress to a hub that returns mid-download.
- Each download uses its own cache file. Leftover update APKs are deleted, and every failure path deletes the partial file, abandons the installer session, and unregisters its receiver.
- When the download finishes while the app is in the background, the installer opens the next time the app resumes.
