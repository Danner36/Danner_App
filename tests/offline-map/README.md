# Offline map

Checks that a map pin keeps its coordinates and receives the correct Census city label. It does not open YouTube or send locations to Google.

```powershell
npm run test:offline-map
```

The runner reads `app/assets/offline-us-map.json` and `app/assets/offline-us-map.html` from `app/`, runs the selection code shipped inside the HTML, and requires it to agree with `app/tvLocation/offlineMapSelection.ts`.
