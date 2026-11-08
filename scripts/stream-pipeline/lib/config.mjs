// Reads STREAM_PIPELINE_CONFIG, merges it over config.defaults.json and resolves per-team rules.
// Every message is free of values and names a source by number, never a URL or host.

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { sourcesConfigProblem } from './sources.mjs';

const packageDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const defaultsPath = path.join(packageDir, 'config.defaults.json');

const NEEDLE_PATTERN = /^[a-z0-9-]{2,60}$/;
const SETUP_SECONDS = 60;
const PUBLISH_SECONDS = 45;
const PHONE_WAIT_SECONDS = 900;

function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isIntegerBetween(value, min, max) {
  return Number.isInteger(value) && value >= min && value <= max;
}

// Objects merge key by key; arrays and scalars from the secret replace the default.
export function mergeConfig(defaults, secret) {
  const merged = { ...defaults };
  for (const [key, value] of Object.entries(secret)) {
    merged[key] = isObject(value) && isObject(defaults[key]) ? mergeConfig(defaults[key], value) : value;
  }
  return merged;
}

// JSON.parse errors quote the text, so they are not passed on. An empty or missing file is a
// failure: there is no fallback to an example file.
export async function readSecretConfig(configPath) {
  if (!configPath) {
    return { problem: 'Pipeline config is not set: STREAM_PIPELINE_CONFIG_PATH or --config is required.' };
  }
  let text;
  try {
    text = await readFile(configPath, 'utf8');
  } catch {
    return { problem: 'Pipeline config file could not be read.' };
  }
  if (!text.trim()) {
    return { problem: 'Pipeline config is empty.' };
  }
  try {
    return { secret: JSON.parse(text) };
  } catch {
    return { problem: 'Pipeline config is not valid JSON.' };
  }
}

export async function readDefaults(filePath = defaultsPath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

function timingProblem(timing) {
  if (!isObject(timing)) {
    return 'timing is not an object.';
  }
  if (!isIntegerBetween(timing.leadMinutes, 5, 60)) {
    return 'timing.leadMinutes must be 5 to 60.';
  }
  const grace = timing.postStartGraceMinutes;
  if (
    !isObject(grace) ||
    grace.default === undefined ||
    Object.values(grace).some((value) => !isIntegerBetween(value, 60, 360))
  ) {
    return 'timing.postStartGraceMinutes must hold a default, and every value must be 60 to 360.';
  }
  for (const name of ['primary', 'backup']) {
    if (!isIntegerBetween(timing[name]?.navigationTimeoutSeconds, 15, 120)) {
      return `timing.${name}.navigationTimeoutSeconds must be 15 to 120.`;
    }
  }
  if (!isIntegerBetween(timing.backup.timeoutSeconds, 30, 300)) {
    return 'timing.backup.timeoutSeconds must be 30 to 300.';
  }
  if (!isIntegerBetween(timing.extractDeadlineSeconds, 120, 660)) {
    return 'timing.extractDeadlineSeconds must be 120 to 660.';
  }
  if (SETUP_SECONDS + timing.extractDeadlineSeconds + PUBLISH_SECONDS > PHONE_WAIT_SECONDS) {
    return `timing leaves no room: setup, extraction and publish must fit in ${PHONE_WAIT_SECONDS} seconds.`;
  }
  return undefined;
}

function teamKeyExists(key, catalog) {
  const [teamKey, sport, extra] = key.split('/');
  const team = catalog.teams.get(teamKey);
  if (!team || extra !== undefined) {
    return false;
  }
  return sport === undefined || (Array.isArray(team.sports) && team.sports.includes(sport));
}

function teamRulesProblem(teams, where, catalog) {
  if (teams === undefined) {
    return undefined;
  }
  if (!isObject(teams)) {
    return `${where} is not an object.`;
  }
  let position = 0;
  for (const [key, rule] of Object.entries(teams)) {
    position += 1;
    const entry = `${where} entry ${position}`;
    if (!teamKeyExists(key, catalog)) {
      return `${entry} does not name a catalog team and sport.`;
    }
    if (!isObject(rule)) {
      return `${entry} is not an object.`;
    }
    if (rule.hrefNeedles !== undefined) {
      if (
        !Array.isArray(rule.hrefNeedles) ||
        rule.hrefNeedles.length === 0 ||
        rule.hrefNeedles.some((needle) => typeof needle !== 'string' || !NEEDLE_PATTERN.test(needle))
      ) {
        return `${entry} hrefNeedles must be 2 to 60 lowercase letters, digits, or hyphens.`;
      }
    }
    if (rule.requireOpponent !== undefined && typeof rule.requireOpponent !== 'boolean') {
      return `${entry} requireOpponent must be true or false.`;
    }
  }
  return undefined;
}

function isHintList(value) {
  return Array.isArray(value) && value.every((hint) => typeof hint === 'string' && hint.length > 0);
}

function matchingProblem(matching, catalog) {
  if (!isObject(matching)) {
    return 'matching is not an object.';
  }
  if (!isHintList(matching.defaultLeagueHints)) {
    return 'matching.defaultLeagueHints must be a list of text values.';
  }
  if (!isObject(matching.leagues)) {
    return 'matching.leagues is not an object.';
  }
  let position = 0;
  for (const rule of Object.values(matching.leagues)) {
    position += 1;
    if (!isObject(rule)) {
      return `matching.leagues entry ${position} is not an object.`;
    }
    if (rule.leagueHints !== undefined && !isHintList(rule.leagueHints)) {
      return `matching.leagues entry ${position} leagueHints must be a list of text values.`;
    }
    if (rule.requireOpponent !== undefined && typeof rule.requireOpponent !== 'boolean') {
      return `matching.leagues entry ${position} requireOpponent must be true or false.`;
    }
  }
  return teamRulesProblem(matching.teams, 'matching.teams', catalog);
}

// `secret` is checked for its own schemaVersion and sources, because the defaults carry a
// schemaVersion too. The timing and matching checks run on the merged result.
export function configProblem(secret, merged, catalog) {
  const sourcesProblem = sourcesConfigProblem(secret);
  if (sourcesProblem) {
    return sourcesProblem;
  }
  const timing = timingProblem(merged.timing);
  if (timing) {
    return `Pipeline config ${timing}`;
  }
  if (!catalog) {
    return 'The team catalog could not be read.';
  }
  const matching = matchingProblem(merged.matching, catalog);
  if (matching) {
    return `Pipeline config ${matching}`;
  }
  for (const [index, source] of secret.sources.entries()) {
    const problem = teamRulesProblem(source.matching?.teams, `source ${index + 1} matching.teams`, catalog);
    if (problem) {
      return `Pipeline config ${problem}`;
    }
  }
  return undefined;
}

// The team rules for one source, most specific first: the source's key/sport and key, then the
// same two in the global matching block.
function teamRules(config, source, team) {
  const keys = team.sport ? [`${team.key}/${team.sport}`, team.key] : [team.key];
  const perSource = config.sources?.[source.number - 1]?.matching?.teams ?? {};
  const global = config.matching?.teams ?? {};
  return [...keys.map((key) => perSource[key]), ...keys.map((key) => global[key])].filter(Boolean);
}

export function hrefNeedlesFor(config, source, team) {
  return teamRules(config, source, team).find((rule) => rule.hrefNeedles?.length)?.hrefNeedles ?? team.hrefNeedles;
}

export function requireOpponentFor(config, source, team) {
  const rule = teamRules(config, source, team).find((candidate) => candidate.requireOpponent !== undefined);
  return (rule?.requireOpponent ?? config.matching?.leagues?.[team.league]?.requireOpponent) === true;
}

export function leagueHintsFor(config, team) {
  return config.matching?.leagues?.[team.league]?.leagueHints ?? config.matching?.defaultLeagueHints ?? [];
}

export function graceMinutesFor(config, team) {
  const grace = config.timing.postStartGraceMinutes;
  return grace[team.league] ?? grace.default;
}
