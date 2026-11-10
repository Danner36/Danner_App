# playback

The player stack every team screen uses: `StreamPlayer.tsx` (the full-screen modal with the native player and the isolated WebView), `AudioPlayer.tsx`, `CastButton.tsx`, and `TvRouteButton.tsx` with the relay driver. Team strings arrive as props.

The injections and the user agent keep their reasons in place. On iPhone, isolated `web` pages report an Android browser so a page that branches on the user agent serves its non-iPhone player; that branch keeps iPhone playback on native HLS, and a Media Source Extensions player cannot be sent to AirPlay, so removing the override removes iPhone AirPlay. Android WebViews never set `incognito`, because it clears every WebView cookie in the app and signs TV Location out of Google. Playback rules are in [Streams.md](../../Docs/Domain/Streams.md).

- A single tap on a web player's picture does not pause it (`webTapGuardInjection.ts`); its own buttons, sliders and double tap still work. On Android the navigation bar is hidden while a player is open, so a page's fullscreen video fills the screen; the player modal keeps its own bar.
