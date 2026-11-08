// Compares the basketball board capability flags in app/leagues/espn/basketballRules.ts with the
// newest committed live capture of each NCAA basketball adapter. A flag that is on must be backed
// by that capture; with no capture every flag must be off. A flag that is off although the capture
// supports it is only noted, because turning a flag on is an owner-approved app change.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { basketballBoardFromSummary } from '../../app/leagues/espn/basketballBoard.ts';
import { BASKETBALL_ADAPTER_KEYS, basketballRulesFor } from '../../app/leagues/espn/basketballRules.ts';
import { parseArgs } from './http.mjs';
import { adapterDirName } from './leagues.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const FLAG_CONTRADICTION_EXIT = 2;
const SUBSTITUTION_TYPE_ID = '584';
const ON_FLOOR = 'floor';
const PLAYER_FLAGS = { bonus: true, lastFoul: true, players: true, rebounds: true, teamFouls: true };
// Flags whose evidence is the presence of paths, so "off with evidence" is worth noting.
const PATH_BACKED = ['players', 'rebounds', 'teamFouls', 'bonus', 'lastFoul'];

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

// Reads the committed captures of `adapter`. Returns the newest event that holds an in-progress
// poll, as { event, polls }, or null. Newest is the latest capturedAt of an in-progress poll.
export function newestLiveCapture(root, adapter) {
  const capturesDir = path.join(root, 'tests', 'leagues', adapterDirName(adapter), 'captures');
  if (!existsSync(capturesDir)) {
    return null;
  }
  let newest = null;
  for (const event of readdirSync(capturesDir)) {
    const eventDir = path.join(capturesDir, event);
    if (!/^\d+$/.test(event) || !statSync(eventDir).isDirectory()) {
      continue;
    }
    const polls = readdirSync(eventDir)
      .filter((name) => name.endsWith('.json.gz'))
      .sort()
      .map((name) => JSON.parse(gunzipSync(readFileSync(path.join(eventDir, name))).toString('utf8')))
      .filter((poll) => poll?.header?.competitions?.[0]?.status?.type?.state === 'in');
    if (polls.length === 0) {
      continue;
    }
    const latest = polls.reduce((max, poll) => (String(poll.capturedAt) > max ? String(poll.capturedAt) : max), '');
    if (!newest || latest > newest.latest) {
      newest = { event, latest, polls };
    }
  }
  return newest ? { event: newest.event, polls: newest.polls } : null;
}

function boxGroups(poll) {
  return asArray(poll?.boxscore?.players).map((team) => team?.statistics?.[0]);
}

function athletesOf(group) {
  return asArray(group?.athletes);
}

function boxHoldsPlayers(poll) {
  const groups = boxGroups(poll);
  return (
    groups.length === 2 &&
    groups.every((group) => {
      const athletes = athletesOf(group);
      const keys = asArray(group?.keys);
      return (
        keys.includes('points') &&
        keys.includes('fouls') &&
        athletes.filter((entry) => entry?.starter === true).length === 5 &&
        athletes.every((entry) => entry?.athlete?.id !== undefined && typeof entry?.athlete?.jersey === 'string')
      );
    })
  );
}

function matchesFoulPlay(play, match) {
  const typeId = String(play?.type?.id);
  if (match?.kind === 'typeIds') {
    return match.typeIds.includes(typeId);
  }
  if (match?.kind === 'text') {
    const text = String(play?.type?.text ?? '').toLowerCase();
    return text.includes(match.includes) && !match.excludes.some((word) => text.includes(word));
  }
  return false;
}

function boxAthleteIds(poll) {
  return new Set(boxGroups(poll).flatMap((group) => athletesOf(group).map((entry) => String(entry?.athlete?.id))));
}

function activeIds(poll, teamId) {
  const team = asArray(poll?.boxscore?.players).find((entry) => String(entry?.team?.id) === String(teamId));
  return athletesOf(team?.statistics?.[0])
    .filter((entry) => entry?.active === true)
    .map((entry) => String(entry?.athlete?.id))
    .sort();
}

function showsRemainingTimeouts(poll) {
  const competitors = asArray(poll?.header?.competitions?.[0]?.competitors);
  if (competitors.some((competitor) => Number(competitor?.timeoutsRemaining) > 0)) {
    return true;
  }
  const situation = poll?.coreSituation?.body;
  return (
    Number(situation?.homeTimeouts?.timeoutsRemainingCurrent) > 0 ||
    Number(situation?.awayTimeouts?.timeoutsRemainingCurrent) > 0
  );
}

// What the polls of a live capture support. `rules` is the adapter's row from basketballRules.ts;
// `boardFromSummary` is the board parser.
export function flagEvidence(polls, rules, boardFromSummary) {
  const evidence = {
    activeLineup: false,
    bonus: false,
    lastFoul: false,
    players: false,
    possessionArrow: false,
    rebounds: false,
    teamFouls: false,
    timeouts: false,
  };
  if (polls.length === 0) {
    return evidence;
  }
  const playsOf = (poll) => asArray(poll?.plays);
  const models = polls.map((poll) => boardFromSummary(poll, rules, { now: 0 }));
  const substitutions = polls.some((poll) => playsOf(poll).some((play) => String(play?.type?.id) === SUBSTITUTION_TYPE_ID));
  evidence.players =
    substitutions &&
    polls.every(boxHoldsPlayers) &&
    models.some((model) => model?.away?.lineup === ON_FLOOR && model?.home?.lineup === ON_FLOOR);
  evidence.rebounds = polls.every((poll) => boxGroups(poll).every((group) => asArray(group?.keys).includes('rebounds')));
  const foulPlays = polls.flatMap((poll) => playsOf(poll).filter((play) => matchesFoulPlay(play, rules.teamFoulPlays)));
  evidence.teamFouls = foulPlays.some((play) => play?.team?.id !== undefined);
  evidence.bonus =
    evidence.teamFouls && polls.some((poll) => poll?.format?.regulation?.periods === rules.regulationPeriods);
  evidence.lastFoul = polls.some((poll) =>
    playsOf(poll).some((play) => {
      const athleteId = play?.participants?.[0]?.athlete?.id;
      return matchesFoulPlay(play, rules.teamFoulPlays) && athleteId !== undefined && boxAthleteIds(poll).has(String(athleteId));
    }),
  );
  evidence.timeouts = polls.some(showsRemainingTimeouts);
  evidence.activeLineup = polls.every((poll, index) =>
    [models[index]?.away, models[index]?.home].every((side) => {
      if (side?.lineup !== ON_FLOOR) {
        return true;
      }
      const active = activeIds(poll, side.teamId);
      return active.length === 5 && [...side.players.map((player) => String(player.athleteId))].sort().join() === active.join();
    }),
  );
  return evidence;
}

// Per-adapter agreement of app flags with the newest capture. `agrees` is false when a flag is on
// without evidence; `offWithEvidence` lists path-backed flags the capture would allow.
export function compareFlags(flags, evidence, newest) {
  const onWithoutEvidence = Object.keys(flags).filter((name) => flags[name] === true && evidence[name] !== true);
  const offWithEvidence = PATH_BACKED.filter((name) => flags[name] !== true && evidence[name] === true);
  return {
    agrees: onWithoutEvidence.length === 0,
    evidence,
    flags,
    newestCapture: newest?.event ?? null,
    offWithEvidence,
    onWithoutEvidence,
    polls: newest?.polls.length ?? 0,
  };
}

export async function evaluateBoardFlags(root, { boardFromSummary = basketballBoardFromSummary, rulesFor = basketballRulesFor } = {}) {
  const report = {};
  for (const adapter of BASKETBALL_ADAPTER_KEYS) {
    const newest = newestLiveCapture(root, adapter);
    const appRules = rulesFor(adapter);
    const parserRules = rulesFor(adapter, PLAYER_FLAGS);
    const evidence = flagEvidence(newest?.polls ?? [], parserRules, boardFromSummary);
    report[adapter] = compareFlags(appRules.flags, evidence, newest);
  }
  return report;
}

// Checks one adapter with the checkout's captures as they stand. Returns FLAG_CONTRADICTION_EXIT
// when a flag that is on has no evidence in the newest capture, else 0. An adapter without board
// flags returns 0.
export async function runFlagCheck({ adapter, log = console.log, options, root = REPO_ROOT }) {
  const entry = (await evaluateBoardFlags(root, options))[adapter];
  if (!entry || entry.agrees) {
    log(`board-flags: ${adapter} agrees`);
    return 0;
  }
  log(`board-flags: ${adapter} capture ${entry.newestCapture ?? 'none'} has no evidence for ${entry.onWithoutEvidence.join(', ')}`);
  return FLAG_CONTRADICTION_EXIT;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { adapter } = parseArgs(process.argv.slice(2));
  if (typeof adapter !== 'string') {
    console.log('usage: node board-flags.mjs --adapter <adapter key>');
    process.exitCode = 1;
  } else {
    process.exitCode = await runFlagCheck({ adapter });
  }
}
