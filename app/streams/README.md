# streams

Approved-video data per team key, through Worker v2.

- `sources.ts` is the pure parser and the streams-path rule shared with the pipeline; unknown keys are ignored.
- `fetchSources.ts` is the fetch chain and the on-phone cache `danner.sources.<TeamKey>.v1`.
- `getVideo.ts` is the Get video request, the poll and the phone text for each run state.
- `workerConfig.ts` is the only reader of `EXPO_PUBLIC_DANNER_WORKER_URL` and `EXPO_PUBLIC_DANNER_APP_KEY`.

Rules are in [Streams.md](../../Docs/Domain/Streams.md).
