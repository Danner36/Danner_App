// Abuse limits for Get video. Plain classes over an injected storage object, so the same code runs
// inside the Durable Object shells and as the per-isolate fallback.

const MINUTE_MS = 60 * 1000;
const TEN_MINUTES_MS = 10 * MINUTE_MS;
const HOUR_MS = 60 * MINUTE_MS;
const IN_FLIGHT_TTL_MS = 20 * MINUTE_MS;
const RUN_STATE_TTL_MS = 30 * MINUTE_MS;
const GAME_RECORD_TTL_MS = 48 * HOUR_MS;
const GAME_LIMIT_RETRY_SECONDS = 3600;
const SEEN_RUNS_MAX = 20;
const REQUESTED_STEP = { k: 0, n: 0, step: 'requested' };

export const DEFAULT_LIMITS = Object.freeze({
  cooldownSeconds: 180,
  gameDispatchMax: 10,
  globalDispatchPerHour: 60,
  globalInFlightMax: 15,
  ipDispatchPerHour: 20,
  ipFailedKeyPerHour: 10,
  ipTeamDispatchPer10Min: 3,
});

function wholeNumberOr(value, fallback) {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN;
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

// Each limit is a Worker var; a missing or malformed value keeps its default.
export function readLimits(env) {
  return {
    cooldownSeconds: wholeNumberOr(env.COOLDOWN_SECONDS, DEFAULT_LIMITS.cooldownSeconds),
    gameDispatchMax: wholeNumberOr(env.GAME_DISPATCH_MAX, DEFAULT_LIMITS.gameDispatchMax),
    globalDispatchPerHour: wholeNumberOr(env.GLOBAL_DISPATCH_PER_HOUR, DEFAULT_LIMITS.globalDispatchPerHour),
    globalInFlightMax: wholeNumberOr(env.GLOBAL_IN_FLIGHT_MAX, DEFAULT_LIMITS.globalInFlightMax),
    ipDispatchPerHour: wholeNumberOr(env.IP_DISPATCH_PER_HOUR, DEFAULT_LIMITS.ipDispatchPerHour),
    ipFailedKeyPerHour: wholeNumberOr(env.IP_FAILED_KEY_PER_HOUR, DEFAULT_LIMITS.ipFailedKeyPerHour),
    ipTeamDispatchPer10Min: wholeNumberOr(env.IP_TEAM_DISPATCH_PER_10_MIN, DEFAULT_LIMITS.ipTeamDispatchPer10Min),
  };
}

// Same interface as Durable Object storage, kept in a Map.
export class MemoryStorage {
  constructor() {
    this.map = new Map();
  }

  async get(key) {
    return this.map.get(key);
  }

  async put(key, value) {
    this.map.set(key, value);
  }

  async delete(key) {
    return this.map.delete(key);
  }

  async list({ prefix = '' } = {}) {
    return new Map([...this.map].filter(([key]) => key.startsWith(prefix)));
  }
}

function recent(stamps, nowMs, windowMs) {
  return (stamps ?? []).filter((stamp) => nowMs - stamp < windowMs);
}

function retryAfterSeconds(stamps, nowMs, windowMs) {
  const oldest = stamps.length > 0 ? Math.min(...stamps) : nowMs - windowMs + MINUTE_MS;
  return Math.max(1, Math.ceil((oldest + windowMs - nowMs) / 1000));
}

function withoutOne(stamps, value) {
  const index = (stamps ?? []).indexOf(value);
  return index === -1 ? (stamps ?? []) : stamps.filter((_, position) => position !== index);
}

// Writes the list, or removes the key once nothing is left in it.
async function storeList(storage, key, list) {
  if (list.length === 0) {
    await storage.delete(key);
  } else {
    await storage.put(key, list);
  }
}

// One instance per team key.
export class TeamGateCore {
  constructor(storage, limits, now = () => Date.now()) {
    this.limits = limits;
    this.now = now;
    this.storage = storage;
  }

  gameKey(eventId) {
    return `game:${eventId}`;
  }

  async game(eventId) {
    return (await this.storage.get(this.gameKey(eventId))) ?? { lastDispatchAt: 0, runs: 0 };
  }

  fresh(item, nowMs) {
    return item !== undefined && nowMs - item.at < RUN_STATE_TTL_MS;
  }

  // Checks the cooldown, the IP+team limit and the per-game cap in that order. An allowed call
  // counts against all three until `release` undoes it.
  async reserve(ip, eventId) {
    const nowMs = this.now();
    const game = await this.game(eventId);
    const cooldownMs = this.limits.cooldownSeconds * 1000;

    if (game.lastDispatchAt > 0 && nowMs - game.lastDispatchAt < cooldownMs) {
      if (!this.fresh(game.progress, nowMs)) {
        game.progress = { ...REQUESTED_STEP, at: nowMs };
        await this.storage.put(this.gameKey(eventId), game);
      }
      return {
        code: 'in_progress',
        ok: false,
        retryAfterSeconds: Math.max(1, Math.ceil((game.lastDispatchAt + cooldownMs - nowMs) / 1000)),
      };
    }

    const ipKey = `ip:${ip}`;
    const stamps = recent(await this.storage.get(ipKey), nowMs, TEN_MINUTES_MS);
    if (stamps.length >= this.limits.ipTeamDispatchPer10Min) {
      return {
        code: 'rate_limited',
        ok: false,
        retryAfterSeconds: retryAfterSeconds(stamps, nowMs, TEN_MINUTES_MS),
      };
    }
    if (game.runs >= this.limits.gameDispatchMax) {
      return { code: 'game_limit', ok: false, retryAfterSeconds: GAME_LIMIT_RETRY_SECONDS };
    }

    const previousLastDispatchAt = game.lastDispatchAt;
    game.lastDispatchAt = nowMs;
    game.runs += 1;
    await this.storage.put(ipKey, [...stamps, nowMs]);
    await this.storage.put(this.gameKey(eventId), game);
    return { ok: true, reservation: { at: nowMs, eventId, ip, previousLastDispatchAt } };
  }

  async release({ at, eventId, ip, previousLastDispatchAt }) {
    const ipKey = `ip:${ip}`;
    await storeList(this.storage, ipKey, withoutOne(await this.storage.get(ipKey), at));
    const game = await this.game(eventId);
    game.runs = Math.max(0, game.runs - 1);
    if (game.lastDispatchAt === at) {
      game.lastDispatchAt = previousLastDispatchAt;
    }
    await this.storage.put(this.gameKey(eventId), game);
  }

  async markQueued(eventId) {
    const nowMs = this.now();
    const game = await this.game(eventId);
    const outstanding =
      game.state?.code === 'queued' && this.fresh(game.state, nowMs) ? game.state.outstanding : 0;
    game.state = { at: nowMs, code: 'queued', outstanding: outstanding + 1 };
    game.progress = { ...REQUESTED_STEP, at: nowMs };
    await this.storage.put(this.gameKey(eventId), game);
  }

  // Records a run's final code. A run already seen for this game is ignored, so a replayed report
  // cannot release a second in-flight slot. While a later dispatch for the game is still running,
  // an unsuccessful earlier run leaves the state at `queued`.
  async recordStatus({ code, eventId, runId }) {
    const nowMs = this.now();
    const game = await this.game(eventId);
    const seenRuns = game.seenRuns ?? [];
    if (seenRuns.includes(runId)) {
      return { fresh: false };
    }
    game.seenRuns = [...seenRuns, runId].slice(-SEEN_RUNS_MAX);

    const resolved = code === 'published' || code === 'video_ready' || code === 'unchanged';
    const queued = game.state?.code === 'queued' && this.fresh(game.state, nowMs) ? game.state : undefined;
    const alreadyPublished = game.state?.code === 'published' && this.fresh(game.state, nowMs);
    if (queued && !resolved && queued.outstanding > 1) {
      game.state = { ...queued, at: nowMs, outstanding: queued.outstanding - 1 };
    } else if (!alreadyPublished || resolved) {
      game.state = { at: nowMs, code, outstanding: 0 };
    }
    await this.storage.put(this.gameKey(eventId), game);
    return { fresh: true };
  }

  async recordProgress({ eventId, k, n, step }) {
    const game = await this.game(eventId);
    game.progress = { at: this.now(), k, n, step };
    await this.storage.put(this.gameKey(eventId), game);
  }

  // { state, progress } for the game. `progress` is undefined when no step is recorded.
  async readState(eventId) {
    const nowMs = this.now();
    const game = await this.game(eventId);
    return {
      progress: this.fresh(game.progress, nowMs)
        ? {
            k: game.progress.k,
            n: game.progress.n,
            step: game.progress.step,
            updatedSecondsAgo: Math.max(0, Math.floor((nowMs - game.progress.at) / 1000)),
          }
        : undefined,
      state: this.fresh(game.state, nowMs) ? game.state.code : 'none',
    };
  }

  // Deletes expired records. Returns true while any remain.
  async sweep() {
    const nowMs = this.now();
    let remaining = 0;
    for (const [key, game] of await this.storage.list({ prefix: 'game:' })) {
      const newest = Math.max(game.lastDispatchAt, game.state?.at ?? 0, game.progress?.at ?? 0);
      if (nowMs - newest >= GAME_RECORD_TTL_MS) {
        await this.storage.delete(key);
      } else {
        remaining += 1;
      }
    }
    for (const [key, stamps] of await this.storage.list({ prefix: 'ip:' })) {
      if (recent(stamps, nowMs, TEN_MINUTES_MS).length === 0) {
        await this.storage.delete(key);
      } else {
        remaining += 1;
      }
    }
    return remaining > 0;
  }
}

// One instance for the whole Worker.
export class GlobalGateCore {
  constructor(storage, limits, now = () => Date.now()) {
    this.limits = limits;
    this.now = now;
    this.storage = storage;
  }

  async flight(nowMs) {
    return ((await this.storage.get('flight')) ?? []).filter((item) => nowMs - item.at < IN_FLIGHT_TTL_MS);
  }

  // Counts one key attempt before the key is compared, in a single atomic call, so a parallel burst
  // from one IP cannot pass before the first failure is recorded. A correct key refunds it.
  async consumeKeyAttempt(ip) {
    const nowMs = this.now();
    const key = `failed:${ip}`;
    const stamps = recent(await this.storage.get(key), nowMs, HOUR_MS);
    if (stamps.length >= this.limits.ipFailedKeyPerHour) {
      return {
        code: 'rate_limited',
        ok: false,
        retryAfterSeconds: retryAfterSeconds(stamps, nowMs, HOUR_MS),
      };
    }
    await this.storage.put(key, [...stamps, nowMs]);
    return { at: nowMs, ok: true };
  }

  async refundKeyAttempt(ip, at) {
    const key = `failed:${ip}`;
    await storeList(this.storage, key, withoutOne(await this.storage.get(key), at));
  }

  // Checks the IP hourly limit, the in-flight cap and the global hourly limit in that order.
  async reserve(ip, runKey) {
    const nowMs = this.now();
    const ipKey = `ip:${ip}`;
    const ipStamps = recent(await this.storage.get(ipKey), nowMs, HOUR_MS);
    if (ipStamps.length >= this.limits.ipDispatchPerHour) {
      return {
        code: 'rate_limited',
        ok: false,
        retryAfterSeconds: retryAfterSeconds(ipStamps, nowMs, HOUR_MS),
      };
    }

    const flight = await this.flight(nowMs);
    if (flight.length >= this.limits.globalInFlightMax) {
      return {
        code: 'busy',
        ok: false,
        retryAfterSeconds: retryAfterSeconds(flight.map((item) => item.at), nowMs, IN_FLIGHT_TTL_MS),
      };
    }

    const hour = recent(await this.storage.get('hour'), nowMs, HOUR_MS);
    if (hour.length >= this.limits.globalDispatchPerHour) {
      return {
        code: 'busy',
        ok: false,
        retryAfterSeconds: retryAfterSeconds(hour, nowMs, HOUR_MS),
      };
    }

    await this.storage.put(ipKey, [...ipStamps, nowMs]);
    await this.storage.put('flight', [...flight, { at: nowMs, key: runKey }]);
    await this.storage.put('hour', [...hour, nowMs]);
    return { ok: true, reservation: { at: nowMs, ip, runKey } };
  }

  async release({ at, ip, runKey }) {
    const ipKey = `ip:${ip}`;
    await storeList(this.storage, ipKey, withoutOne(await this.storage.get(ipKey), at));
    await storeList(this.storage, 'hour', withoutOne(await this.storage.get('hour'), at));
    const flight = await this.flight(this.now());
    await storeList(
      this.storage,
      'flight',
      flight.filter((item) => !(item.key === runKey && item.at === at)),
    );
  }

  // Frees the oldest in-flight slot held by this game.
  async completeRun(runKey) {
    const flight = await this.flight(this.now());
    const index = flight.findIndex((item) => item.key === runKey);
    if (index !== -1) {
      flight.splice(index, 1);
    }
    await storeList(this.storage, 'flight', flight);
  }

  // Deletes expired records. Returns true while any remain.
  async sweep() {
    const nowMs = this.now();
    let remaining = 0;
    for (const prefix of ['ip:', 'failed:']) {
      for (const [key, stamps] of await this.storage.list({ prefix })) {
        if (recent(stamps, nowMs, HOUR_MS).length === 0) {
          await this.storage.delete(key);
        } else {
          remaining += 1;
        }
      }
    }
    const flight = await this.flight(nowMs);
    await storeList(this.storage, 'flight', flight);
    const hour = recent(await this.storage.get('hour'), nowMs, HOUR_MS);
    await storeList(this.storage, 'hour', hour);
    return remaining > 0 || flight.length > 0 || hour.length > 0;
  }
}

// Runs a gate's methods one at a time, as a Durable Object's input gate does.
export function serialized(core) {
  let tail = Promise.resolve();
  return new Proxy(core, {
    get(target, name) {
      const member = target[name];
      if (typeof member !== 'function') {
        return member;
      }
      return (...args) => {
        const run = tail.then(() => member.apply(target, args));
        tail = run.catch(() => {});
        return run;
      };
    },
  });
}

// In-memory stand-ins for the two Durable Objects, one set per isolate, using the same limits.
export function createLocalGates(now) {
  const teams = new Map();
  let globalGate;
  const TEAM_GATES_MAX = 4096;

  return {
    global(env) {
      globalGate ??= serialized(new GlobalGateCore(new MemoryStorage(), readLimits(env), now));
      return globalGate;
    },
    team(env, teamKey) {
      let gate = teams.get(teamKey);
      if (!gate) {
        if (teams.size >= TEAM_GATES_MAX) {
          teams.delete(teams.keys().next().value);
        }
        gate = serialized(new TeamGateCore(new MemoryStorage(), readLimits(env), now));
        teams.set(teamKey, gate);
      }
      return gate;
    },
  };
}

const IPV4_PATTERN = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

function ipv4Key(address) {
  const match = address.match(IPV4_PATTERN);
  if (!match || match.slice(1).some((part) => Number(part) > 255)) {
    return undefined;
  }
  return `v4:${match.slice(1).map(Number).join('.')}`;
}

// First four hextets of an IPv6 address, or undefined when it does not parse.
function ipv6Prefix64(address) {
  let value = address.toLowerCase().split('%')[0];
  if (value.includes('.')) {
    const lastColon = value.lastIndexOf(':');
    const embedded = value.slice(lastColon + 1).match(IPV4_PATTERN);
    if (!embedded || embedded.slice(1).some((part) => Number(part) > 255)) {
      return undefined;
    }
    const [a, b, c, d] = embedded.slice(1).map(Number);
    value = `${value.slice(0, lastColon + 1)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const halves = value.split('::');
  if (halves.length > 2) {
    return undefined;
  }
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const missing = 8 - head.length - tail.length;
  if (halves.length === 1 ? missing !== 0 : missing < 1) {
    return undefined;
  }
  const groups = [...head, ...Array(halves.length === 2 ? missing : 0).fill('0'), ...tail];
  if (groups.some((group) => !/^[0-9a-f]{1,4}$/.test(group))) {
    return undefined;
  }
  return groups.slice(0, 4).map((group) => group.padStart(4, '0')).join(':');
}

// One bucket per IPv4 address and per IPv6 /64, the block a single subscriber is normally given.
// Keying on the full IPv6 address would let one client rotate through its /64.
export function rateLimitKey(request) {
  const address = (request.headers.get('CF-Connecting-IP') ?? '').trim();
  if (!address) {
    return 'unknown';
  }
  const mapped = address.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i);
  const v4 = ipv4Key(mapped ? mapped[1] : address);
  if (v4) {
    return v4;
  }
  const prefix = address.includes(':') ? ipv6Prefix64(address) : undefined;
  return prefix ? `v6:${prefix}::/64` : `raw:${address.toLowerCase()}`;
}
