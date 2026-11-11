import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

import {
  PLAYER_CELLS_CARRY_MS,
  basketballBoardFromScheduleEvent,
  basketballBoardFromSummary,
} from '../../app/leagues/espn/basketballBoard.ts';
import {
  BASKETBALL_ADAPTER_KEYS,
  basketballRulesFor,
} from '../../app/leagues/espn/basketballRules.ts';

// basketballBoardFromSummary on the trimmed archived ESPN summaries under archived/ (post-game
// bodies, so box values are final at every prefix) and on synthetic summaries.

// basketballRules.ts holds the NCAA rows only. The archived NBA and WNBA games and the pro foul
// cases run with these rule-book values, in the shape of a rules row.
const PRO_ADAPTERS = ['nba', 'wnba'];
const ARCHIVED_ADAPTERS = [...BASKETBALL_ADAPTER_KEYS, ...PRO_ADAPTERS];

function proRulesFor(adapter, flagOverrides = {}) {
  const flags = { ...basketballRulesFor('ncaa/mens-basketball').flags };
  for (const name of Object.keys(flags)) {
    if (typeof flagOverrides[name] === 'boolean') {
      flags[name] = flagOverrides[name];
    }
  }
  return {
    adapter,
    bonus: { bonusAt: 4, lateFouls: { foulsInSpan: 1, secondsLeft: 120 }, overtimeBonusAt: 3 },
    flags,
    foulWindow: { overtime: 'eachPeriod' },
    playerFoulLimit: 6,
    regulationPeriods: 4,
    teamFoulPlays: {
      excludes: ['offensive', 'technical', 'double', 'turnover', 'free throw'],
      includes: 'foul',
      kind: 'text',
    },
    technicalsCountTowardFoulLimit: false,
  };
}

function rulesFor(adapter, flagOverrides) {
  return PRO_ADAPTERS.includes(adapter)
    ? proRulesFor(adapter, flagOverrides)
    : basketballRulesFor(adapter, flagOverrides);
}

const ARCHIVED_ROOT = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'archived',
);

// Launch flags with the player-derived cells on; activeLineup, timeouts and possessionArrow
// stay off.
const PLAYER_FLAGS = {
  bonus: true,
  lastFoul: true,
  players: true,
  rebounds: true,
  teamFouls: true,
};

const NO_SUBSTITUTION_EVENT = '401638645';

let cases = 0;

function check(name, run) {
  try {
    run();
  } catch (error) {
    error.message = `${name}: ${error.message}`;
    throw error;
  }
  cases += 1;
}

function archivedGames() {
  const games = [];
  for (const adapter of ARCHIVED_ADAPTERS) {
    const folder = path.join(ARCHIVED_ROOT, adapter.replace('/', '-'));
    if (!fs.existsSync(folder)) {
      continue;
    }
    for (const file of fs.readdirSync(folder).sort()) {
      if (file.endsWith('.json.gz')) {
        games.push({ adapter, event: file.replace('.json.gz', ''), folder });
      }
    }
  }
  return games;
}

const summaries = new Map();

function archived(adapter, event) {
  const key = `${adapter}/${event}`;
  if (!summaries.has(key)) {
    const file = path.join(ARCHIVED_ROOT, adapter.replace('/', '-'), `${event}.json.gz`);
    summaries.set(key, JSON.parse(zlib.gunzipSync(fs.readFileSync(file)).toString('utf8')));
  }
  return summaries.get(key);
}

function withPlays(summary, plays) {
  return { ...summary, plays };
}

// The summary with a pregame status and no score, as before the tip.
function beforeTip(summary) {
  const [competition, ...rest] = summary.header.competitions;
  return {
    ...summary,
    header: {
      ...summary.header,
      competitions: [
        {
          ...competition,
          competitors: competition.competitors.map((competitor) => ({ ...competitor, score: '0' })),
          status: { period: 1, type: { name: 'STATUS_SCHEDULED', state: 'pre' } },
        },
        ...rest,
      ],
    },
  };
}

function prefix(summary, length) {
  return withPlays(summary, summary.plays.slice(0, length));
}

function ids(side) {
  return side.players.map((player) => player.athleteId).sort();
}

function sideOfTeam(model, teamId) {
  return model.away.teamId === teamId ? 'away' : 'home';
}

function boxAthletes(summary, teamId) {
  const entry = summary.boxscore.players.find((box) => box.team.id === teamId);
  return entry.statistics[0].athletes;
}

function participants(play) {
  return (play.participants ?? []).map((entry) => entry.athlete.id);
}

function isSubstitution(play) {
  return play.type.id === '584';
}

const NCAA_ADAPTERS = new Set(['ncaa/mens-basketball', 'ncaa/womens-basketball']);
const games = archivedGames();

check('17 archived games, one folder per adapter', () => {
  assert.equal(games.length, 17);
  assert.deepEqual(
    [...new Set(games.map((game) => game.adapter))],
    ARCHIVED_ADAPTERS,
  );
  for (const game of games) {
    const summary = archived(game.adapter, game.event);
    assert.deepEqual(
      Object.keys(summary).filter(
        (key) => !['header', 'format', 'boxscore', 'plays', 'timeouts', 'situation'].includes(key),
      ),
      [],
    );
  }
});

// Every archived game replays to the final active five per team; the 2024 men's final logs no
// substitution and falls back to top scorers.
for (const game of games) {
  check(`archived ${game.adapter} ${game.event} replays`, () => {
    const summary = archived(game.adapter, game.event);
    const rules = rulesFor(game.adapter, PLAYER_FLAGS);
    const model = basketballBoardFromSummary(summary, rules, { now: 0 });
    assert.ok(model);
    assert.equal(model.kind, 'basketball');
    assert.equal(model.source, 'summary');
    assert.equal(model.eventId, game.event);
    assert.equal(model.phase, 'final');
    assert.equal(model.regulationPeriods, summary.format.regulation.periods);
    assert.ok(model.period >= model.regulationPeriods);
    assert.equal(model.foulLimit, rules.playerFoulLimit);
    assert.equal(model.stale.playsLength, summary.plays.length);
    assert.equal(model.stale.playerCellsAppliedAt, 0);
    assert.ok(model.lastFoul);
    for (const key of ['away', 'home']) {
      const side = model[key];
      assert.equal(side.players.length, 5);
      assert.equal(side.bonus, 'none');
      assert.equal(typeof side.teamFouls, 'number');
      assert.equal(typeof side.score, 'number');
      for (const player of side.players) {
        assert.equal(typeof player.jersey, 'string');
        assert.equal(typeof player.points, 'number');
        assert.equal(typeof player.fouls, 'number');
        assert.equal(typeof player.rebounds, 'number');
      }
      const athletes = boxAthletes(summary, side.teamId);
      if (game.event === NO_SUBSTITUTION_EVENT) {
        assert.equal(side.lineup, 'topScorers');
        assert.equal(athletes.filter((athlete) => athlete.active).length, 0);
        const chosen = new Set(ids(side));
        const lowestShown = Math.min(...side.players.map((player) => player.points));
        const keys = summary.boxscore.players.find((box) => box.team.id === side.teamId)
          .statistics[0].keys;
        const others = athletes
          .filter((athlete) => !chosen.has(athlete.athlete.id))
          .map((athlete) => Number(athlete.stats[keys.indexOf('points')] ?? -1));
        assert.ok(others.every((points) => !(points > lowestShown)));
      } else {
        assert.equal(side.lineup, 'floor');
        assert.deepEqual(
          ids(side),
          athletes
            .filter((athlete) => athlete.active)
            .map((athlete) => athlete.athlete.id)
            .sort(),
        );
      }
    }
  });
}

// Reference replay for the NCAA prefix property: one-participant swaps in array order, and the
// set as of the last non-substitution play while a team has other than 5.
function referenceReplay(summary) {
  const teamOf = new Map();
  const sets = new Map();
  for (const box of summary.boxscore.players) {
    const starters = new Set();
    for (const athlete of box.statistics[0].athletes) {
      teamOf.set(athlete.athlete.id, box.team.id);
      if (athlete.starter) {
        starters.add(athlete.athlete.id);
      }
    }
    sets.set(box.team.id, { set: starters, settled: new Set(starters) });
  }
  const shownByPrefix = [];
  const record = () => {
    const shown = new Map();
    for (const [teamId, team] of sets) {
      shown.set(teamId, {
        inGroup: team.set.size !== 5,
        shown: [...(team.set.size === 5 ? team.set : team.settled)].sort(),
      });
    }
    shownByPrefix.push(shown);
  };
  record();
  for (const play of summary.plays) {
    const [athleteId] = participants(play);
    if (isSubstitution(play)) {
      const team = sets.get(teamOf.get(athleteId));
      if (/subbing in/i.test(play.text)) {
        team.set.add(athleteId);
      } else {
        team.set.delete(athleteId);
      }
    } else {
      for (const team of sets.values()) {
        team.settled = new Set(team.set);
      }
    }
    record();
  }
  return shownByPrefix;
}

// Every prefix of each NCAA game: never other than 5 shown, and never a failed check labelled as
// on the floor.
for (const game of games.filter((entry) => NCAA_ADAPTERS.has(entry.adapter))) {
  check(`prefix replay ${game.adapter} ${game.event}`, () => {
    const summary = archived(game.adapter, game.event);
    const rules = rulesFor(game.adapter, PLAYER_FLAGS);
    const expected = referenceReplay(summary);
    const failedAt = {};
    let insideGroup = 0;
    for (let length = 0; length <= summary.plays.length; length += 1) {
      const model = basketballBoardFromSummary(
        length === 0 ? beforeTip(prefix(summary, 0)) : prefix(summary, length),
        rules,
      );
      for (const key of ['away', 'home']) {
        const side = model[key];
        assert.equal(side.players.length, 5, `prefix ${length} ${key}`);
        if (length === 0) {
          assert.equal(side.lineup, 'starters');
          continue;
        }
        if (failedAt[key] !== undefined) {
          assert.equal(side.lineup, 'topScorers', `prefix ${length} ${key} after a failure`);
          continue;
        }
        if (side.lineup !== 'floor') {
          assert.equal(side.lineup, 'topScorers');
          failedAt[key] = length;
          continue;
        }
        const reference = expected[length].get(side.teamId);
        assert.deepEqual(ids(side), reference.shown, `prefix ${length} ${key}`);
        if (reference.inGroup) {
          insideGroup += 1;
        }
        // A team on the floor has no player off the shown set in its plays since the last
        // substitution (late-inserted plays aside; NCAA rules skip no technical or ejection
        // play).
        const shown = new Set(ids(side));
        const teamIds = new Set(boxAthletes(summary, side.teamId).map((athlete) => athlete.athlete.id));
        for (let index = length - 1; index >= 0; index -= 1) {
          const play = summary.plays[index];
          if (isSubstitution(play)) {
            break;
          }
          const late =
            index > 0 && Date.parse(play.wallclock) < Date.parse(summary.plays[index - 1].wallclock);
          if (late) {
            continue;
          }
          for (const athleteId of participants(play)) {
            if (teamIds.has(athleteId)) {
              assert.ok(shown.has(athleteId), `prefix ${length} ${key} play ${index}`);
            }
          }
        }
      }
    }
    if (game.event === NO_SUBSTITUTION_EVENT) {
      assert.equal(summary.plays.filter(isSubstitution).length, 0);
      assert.ok(failedAt.away > 0 && failedAt.home > 0);
    } else {
      assert.deepEqual(failedAt, {});
      assert.ok(insideGroup > 0, 'some prefixes end inside a substitution group');
    }
  });
}

check('401856552: fouled-out player on the floor for 7 plays at one clock', () => {
  const adapter = 'ncaa/womens-basketball';
  const summary = archived(adapter, '401856552');
  const rules = rulesFor(adapter, PLAYER_FLAGS);
  const fouledOut = '4698733';
  const replacement = participants(summary.plays[359])[0];
  const fifthFoul = summary.plays[350];
  assert.equal(fifthFoul.type.id, '519');
  assert.deepEqual(participants(fifthFoul), [fouledOut]);
  assert.equal(fifthFoul.period.number, 5);
  for (let index = 351; index <= 357; index += 1) {
    assert.equal(summary.plays[index].clock.displayValue, '3:57');
    assert.ok(!isSubstitution(summary.plays[index]));
  }
  assert.match(summary.plays[358].text, /subbing out/);
  assert.match(summary.plays[359].text, /subbing in/);
  const teamId = fifthFoul.team.id;
  assert.ok(
    boxAthletes(summary, teamId).some((athlete) => athlete.athlete.id === fouledOut),
  );

  // Through play 357 the clock has not run, and through the pending exit at 358 the set as of
  // play 357 still shows.
  for (let length = 351; length <= 359; length += 1) {
    const model = basketballBoardFromSummary(prefix(summary, length), rules);
    const side = model[sideOfTeam(model, teamId)];
    assert.equal(side.lineup, 'floor', `prefix ${length}`);
    const player = side.players.find((entry) => entry.athleteId === fouledOut);
    assert.ok(player, `prefix ${length}`);
    assert.equal(player.fouls, 5);
    assert.equal(player.out, 'fouledOut');
  }
  const swapped = basketballBoardFromSummary(prefix(summary, 360), rules);
  const swappedSide = swapped[sideOfTeam(swapped, teamId)];
  assert.equal(swappedSide.lineup, 'floor');
  assert.ok(!ids(swappedSide).includes(fouledOut));
  assert.ok(ids(swappedSide).includes(replacement));

  // Without the swap, the clock runs to 3:42 with the fouled-out player in the set: the check
  // fails.
  const unswapped = basketballBoardFromSummary(
    withPlays(summary, [...summary.plays.slice(0, 358), summary.plays[360]]),
    rules,
  );
  assert.equal(unswapped[sideOfTeam(unswapped, teamId)].lineup, 'topScorers');
  assert.equal(unswapped[sideOfTeam(unswapped, teamId) === 'away' ? 'home' : 'away'].lineup, 'floor');
});

check('401866759: ejections from play 517, not the box flag', () => {
  const adapter = 'nba';
  const summary = archived(adapter, '401866759');
  const rules = rulesFor(adapter, PLAYER_FLAGS);
  const green = '6589';
  const booker = '3136193';
  assert.equal(summary.plays[444].type.id, '517');
  assert.deepEqual(participants(summary.plays[444]), [green]);
  assert.equal(summary.plays[451].type.id, '517');
  assert.deepEqual(participants(summary.plays[451]), [booker]);
  const boxLines = summary.boxscore.players.flatMap((box) => box.statistics[0].athletes);
  for (const athleteId of [green, booker]) {
    assert.equal(boxLines.find((line) => line.athlete.id === athleteId).ejected, false);
  }

  const final = basketballBoardFromSummary(summary, rules);
  assert.equal(final.away.lineup, 'floor');
  assert.equal(final.home.lineup, 'floor');
  assert.ok(![...ids(final.away), ...ids(final.home)].includes(green));
  assert.ok(![...ids(final.away), ...ids(final.home)].includes(booker));
  assert.deepEqual(final.lastFoul, {
    athleteId: green,
    fouls: 6,
    jersey: '23',
    out: 'ejected',
    side: 'away',
  });

  // Before Booker's ejection play, Booker is on the floor and not out (box PF 4).
  const beforeEjection = basketballBoardFromSummary(prefix(summary, 445), rules);
  assert.equal(beforeEjection.lastFoul.out, 'ejected');
  const bookerRow = beforeEjection.home.players.find((player) => player.athleteId === booker);
  assert.ok(bookerRow);
  assert.equal(bookerRow.fouls, 4);
  assert.equal(bookerRow.out, undefined);

  // Booker's exit (play 446) removed: Booker is still in the set when the clock runs at play
  // 452.
  assert.deepEqual(participants(summary.plays[446])[1], booker);
  const unswapped = basketballBoardFromSummary(
    withPlays(summary, [...summary.plays.slice(0, 446), ...summary.plays.slice(447, 453)]),
    rules,
  );
  assert.equal(unswapped.home.lineup, 'topScorers');
  assert.equal(unswapped.away.lineup, 'floor');
  const bookerLeader = unswapped.home.players.find((player) => player.athleteId === booker);
  assert.equal(bookerLeader?.out, 'ejected');
});

check('technical and ejection plays skip the check only where technicals miss the foul limit', () => {
  // Caruso's technical (401871327 play 235) names a player on the bench.
  const summary = archived('nba', '401871327');
  const caruso = '2991350';
  const technical = summary.plays[235];
  assert.equal(technical.type.text, 'Technical Foul');
  assert.deepEqual(participants(technical), [caruso]);
  const pro = proRulesFor('nba', PLAYER_FLAGS);
  const strict = { ...pro, technicalsCountTowardFoulLimit: true };
  const skipped = basketballBoardFromSummary(prefix(summary, 236), pro);
  const key = sideOfTeam(skipped, technical.team.id);
  const other = key === 'away' ? 'home' : 'away';
  assert.equal(skipped[key].lineup, 'floor');
  assert.ok(!ids(skipped[key]).includes(caruso));
  const checked = basketballBoardFromSummary(prefix(summary, 236), strict);
  assert.equal(checked[key].lineup, 'topScorers');
  assert.equal(checked[other].lineup, 'floor');

  // The double technical on Green and Booker (401866759 play 441) names a player off the set.
  const ejections = archived('nba', '401866759');
  assert.equal(ejections.plays[441].type.text, 'Double Technical Foul');
  const before = basketballBoardFromSummary(prefix(ejections, 441), strict);
  const at = basketballBoardFromSummary(prefix(ejections, 442), strict);
  assert.deepEqual([before.away.lineup, before.home.lineup], ['floor', 'floor']);
  assert.ok([at.away.lineup, at.home.lineup].includes('topScorers'));
  const proAt = basketballBoardFromSummary(prefix(ejections, 442), pro);
  assert.deepEqual([proAt.away.lineup, proAt.home.lineup], ['floor', 'floor']);
});

check('401851289: NCAA box PF counts technical fouls', () => {
  const adapter = 'ncaa/mens-basketball';
  const summary = archived(adapter, '401851289');
  const rules = rulesFor(adapter, PLAYER_FLAGS);
  const johnson = '5189257';
  const diop = '5311903';
  const foulPlays = (athleteId, typeId) =>
    summary.plays.filter(
      (play) => play.type.id === typeId && participants(play)[0] === athleteId,
    ).length;
  assert.equal(foulPlays(johnson, '519'), 4);
  assert.equal(foulPlays(johnson, '521'), 1);
  assert.equal(foulPlays(diop, '519'), 3);
  assert.equal(foulPlays(diop, '521'), 1);

  const afterJohnson = basketballBoardFromSummary(prefix(summary, 161), rules);
  assert.deepEqual(afterJohnson.lastFoul, {
    athleteId: johnson,
    fouls: 5,
    jersey: '2',
    out: 'fouledOut',
    side: sideOfTeam(afterJohnson, '9'),
  });
  const afterDiop = basketballBoardFromSummary(prefix(summary, 184), rules);
  assert.equal(afterDiop.lastFoul.athleteId, diop);
  assert.equal(afterDiop.lastFoul.fouls, 4);
  assert.equal(afterDiop.lastFoul.out, undefined);

  // The team technical (play 186) has no participant: it counts as a team foul but is never the
  // last foul.
  assert.equal(summary.plays[186].type.id, '521');
  assert.equal(summary.plays[186].participants, undefined);
  const afterTeamTechnical = basketballBoardFromSummary(prefix(summary, 187), rules);
  assert.equal(afterTeamTechnical.lastFoul.athleteId, diop);

  // First-half team fouls count PersonalFoul and Technical Foul plays.
  const endOfHalf = summary.plays.findIndex((play) => play.type.id === '412');
  const firstHalf = summary.plays.slice(0, endOfHalf + 1);
  const count = (teamId, typeId) =>
    firstHalf.filter((play) => play.type.id === typeId && play.team?.id === teamId).length;
  const half = basketballBoardFromSummary(withPlays(summary, firstHalf), rules);
  assert.equal(half.period, 1);
  assert.equal(count('9', '521'), 3);
  assert.equal(half[sideOfTeam(half, '9')].teamFouls, count('9', '519') + 3);
  assert.equal(half[sideOfTeam(half, '66')].teamFouls, count('66', '519') + count('66', '521'));
});

check('401856573: a late-inserted foul is skipped by the check and still the last foul', () => {
  const adapter = 'ncaa/mens-basketball';
  const summary = archived(adapter, '401856573');
  const rules = rulesFor(adapter, PLAYER_FLAGS);
  const late = summary.plays[446];
  assert.equal(late.type.id, '519');
  assert.ok(Date.parse(late.wallclock) < Date.parse(summary.plays[445].wallclock));
  const fouler = participants(late)[0];

  const model = basketballBoardFromSummary(prefix(summary, 447), rules);
  const key = sideOfTeam(model, late.team.id);
  assert.equal(model[key].lineup, 'floor');
  assert.ok(!ids(model[key]).includes(fouler));
  assert.equal(model.lastFoul.athleteId, fouler);
  assert.equal(model.lastFoul.side, key);

  // The same play in wallclock order fails the check.
  const inOrder = summary.plays.map((play, index) =>
    index === 446 ? { ...play, wallclock: summary.plays[445].wallclock } : play,
  );
  const failed = basketballBoardFromSummary(withPlays(summary, inOrder.slice(0, 447)), rules);
  assert.equal(failed[key].lineup, 'topScorers');
  assert.equal(failed[key === 'away' ? 'home' : 'away'].lineup, 'floor');
});

check('foul windows: NCAA overtime continues the last regulation period, NBA does not', () => {
  const womens = archived('ncaa/womens-basketball', '401856552');
  const womensModel = basketballBoardFromSummary(
    womens,
    basketballRulesFor('ncaa/womens-basketball', PLAYER_FLAGS),
  );
  assert.equal(womensModel.period, 6);
  for (const key of ['away', 'home']) {
    const teamId = womensModel[key].teamId;
    const expected = womens.plays.filter(
      (play) =>
        ['519', '521'].includes(play.type.id) &&
        play.team?.id === teamId &&
        play.period.number >= 4,
    ).length;
    assert.equal(womensModel[key].teamFouls, expected);
  }

  const nba = archived('nba', '401873341');
  const nbaModel = basketballBoardFromSummary(nba, proRulesFor('nba', PLAYER_FLAGS));
  assert.equal(nbaModel.period, 5);
  for (const key of ['away', 'home']) {
    const teamId = nbaModel[key].teamId;
    const expected = nba.plays.filter((play) => {
      const text = play.type.text.toLowerCase();
      return (
        play.team?.id === teamId &&
        play.period.number === 5 &&
        text.includes('foul') &&
        !/offensive|technical|double|turnover|free throw/.test(text)
      );
    }).length;
    assert.equal(nbaModel[key].teamFouls, expected);
  }
});

// Synthetic summaries. Home team 1 (h1-h8), away team 2 (a1-a8); players 1-5 start.

let sequence = 0;

function play(typeId, typeText, options = {}) {
  sequence += 1;
  const {
    athletes = [],
    clock = '10:00',
    period = 1,
    team,
    text = '',
    wallclock = new Date(Date.UTC(2026, 0, 1, 0, 0, 0) + sequence * 1000).toISOString(),
  } = options;
  const entry = {
    clock: { displayValue: clock },
    id: String(sequence),
    period: { number: period },
    text,
    type: { id: typeId, text: typeText },
    wallclock,
  };
  if (team) {
    entry.team = { id: team };
  }
  if (athletes.length) {
    entry.participants = athletes.map((id) => ({ athlete: { id } }));
  }
  return entry;
}

const teamOfId = (id) => (id.startsWith('h') ? '1' : '2');
const shot = (id, options) =>
  play('558', 'JumpShot', { athletes: [id], team: teamOfId(id), text: `${id} jumper`, ...options });
const ncaaFoul = (id, options) =>
  play('519', 'PersonalFoul', { athletes: [id], team: teamOfId(id), text: `Foul on ${id}.`, ...options });
const subIn = (id, options) =>
  play('584', 'Substitution', { athletes: [id], team: teamOfId(id), text: `${id} subbing in for Team`, ...options });
const subOut = (id, options) =>
  play('584', 'Substitution', { athletes: [id], team: teamOfId(id), text: `${id} subbing out for Team`, ...options });
const proSub = (entering, leaving, options) =>
  play('584', 'Substitution', {
    athletes: [entering, leaving],
    team: teamOfId(entering),
    text: `${entering} enters the game for ${leaving}`,
    ...options,
  });
const proFoul = (typeText, id, options) =>
  play('45', typeText, { athletes: [id], team: teamOfId(id), text: `${id} ${typeText}`, ...options });
const endPeriod = (period) => play('412', 'End Period', { clock: '0:00', period });

function roster(prefixLetter, overrides = {}) {
  return Array.from({ length: 8 }, (_, index) => {
    const id = `${prefixLetter}${index + 1}`;
    const line = {
      active: index < 5,
      athlete: { id, jersey: String(index * 11), shortName: `P. ${id}` },
      didNotPlay: false,
      ejected: false,
      starter: index < 5,
      stats: [String(20 - index), String(index), String(index % 3)],
      ...overrides[id],
    };
    return line;
  });
}

function synthetic(options = {}) {
  const {
    away = roster('a'),
    home = roster('h'),
    keys = ['points', 'rebounds', 'fouls'],
    labels = ['PTS', 'REB', 'PF'],
    periods = 2,
    plays = [],
    scores = { away: '38', home: '40' },
    status = {
      displayClock: '8:00',
      period: 1,
      type: { detail: '8:00 - 1st Half', name: 'STATUS_IN_PROGRESS', state: 'in' },
    },
  } = options;
  const summary = {
    boxscore: {
      players: [
        { statistics: [{ athletes: away, keys, labels }], team: { id: '2' } },
        { statistics: [{ athletes: home, keys, labels }], team: { id: '1' } },
      ],
    },
    format: { regulation: { periods } },
    header: {
      competitions: [
        {
          competitors: [
            {
              homeAway: 'home',
              id: '1',
              score: scores.home,
              team: {
                abbreviation: 'HOM',
                alternateColor: 'ffc72a',
                color: 'ae192d',
                displayName: 'Home Cyclones',
                id: '1',
                name: 'Cyclones',
              },
            },
            {
              homeAway: 'away',
              id: '2',
              score: scores.away,
              team: {
                abbreviation: 'AWY',
                alternateColor: '000000',
                color: '0051ba',
                displayName: 'Away Jayhawks',
                id: '2',
                name: 'Jayhawks',
              },
            },
          ],
          id: '900',
          status,
        },
      ],
      id: '900',
    },
    plays,
  };
  if (options.omitPlays) {
    delete summary.plays;
  }
  return summary;
}

const mensRules = basketballRulesFor('ncaa/mens-basketball', PLAYER_FLAGS);
const womensRules = basketballRulesFor('ncaa/womens-basketball', PLAYER_FLAGS);
const nbaRules = proRulesFor('nba', PLAYER_FLAGS);
const starters = (letter) => [1, 2, 3, 4, 5].map((n) => `${letter}${n}`).sort();

const NO_SCORE = { away: '0', home: '0' };
const PREGAME = { period: 1, type: { name: 'STATUS_SCHEDULED', state: 'pre' } };

check('starters before the first play', () => {
  const model = basketballBoardFromSummary(synthetic({ scores: NO_SCORE }), mensRules);
  assert.equal(model.home.lineup, 'starters');
  assert.deepEqual(ids(model.home), starters('h'));
  assert.equal(model.home.teamFouls, 0);
  const noArray = basketballBoardFromSummary(
    synthetic({ omitPlays: true, scores: NO_SCORE }),
    mensRules,
  );
  assert.equal(noArray.away.lineup, 'starters');
  assert.equal(noArray.away.teamFouls, undefined);
  assert.equal(noArray.stale.playsLength, undefined);
  const pregame = basketballBoardFromSummary(synthetic({ status: PREGAME }), mensRules);
  assert.equal(pregame.phase, 'pregame');
  assert.equal(pregame.home.lineup, 'starters');
});

check('no plays after the tip: top scorers and no team fouls or bonus', () => {
  const status = {
    displayClock: '6:12',
    period: 3,
    type: { name: 'STATUS_IN_PROGRESS', state: 'in' },
  };
  for (const omitPlays of [false, true]) {
    for (const summary of [
      synthetic({ omitPlays, periods: 4, status }),
      synthetic({ omitPlays }),
    ]) {
      const model = basketballBoardFromSummary(summary, womensRules);
      for (const key of ['away', 'home']) {
        assert.equal(model[key].lineup, 'topScorers');
        assert.equal(model[key].players.length, 5);
        assert.ok(!('teamFouls' in model[key]));
        assert.equal(model[key].bonus, 'none');
      }
      assert.ok(!('lastFoul' in model));
    }
  }
  // The same in an archived women's game with the plays removed, third quarter in progress.
  const summary = archived('ncaa/womens-basketball', '401856504');
  const [competition] = summary.header.competitions;
  const midGame = {
    ...summary,
    header: {
      ...summary.header,
      competitions: [{ ...competition, status: { displayClock: '4:00', period: 3, type: { name: 'STATUS_IN_PROGRESS', state: 'in' } } }],
    },
  };
  delete midGame.plays;
  const model = basketballBoardFromSummary(midGame, womensRules);
  assert.equal(model.away.lineup, 'topScorers');
  assert.equal(model.home.lineup, 'topScorers');
  assert.ok(!('teamFouls' in model.away));
});

check('NCAA one-participant swaps and NBA two-participant swaps', () => {
  const ncaa = basketballBoardFromSummary(
    synthetic({ plays: [shot('h1'), subOut('h5'), subIn('h6'), shot('h6'), shot('a1')] }),
    mensRules,
  );
  assert.equal(ncaa.home.lineup, 'floor');
  assert.deepEqual(ids(ncaa.home), ['h1', 'h2', 'h3', 'h4', 'h6']);
  assert.equal(ncaa.away.lineup, 'floor');
  const pro = basketballBoardFromSummary(
    synthetic({ periods: 4, plays: [shot('h1'), proSub('h7', 'h2'), shot('h7')] }),
    nbaRules,
  );
  assert.equal(pro.home.lineup, 'floor');
  assert.deepEqual(ids(pro.home), ['h1', 'h3', 'h4', 'h5', 'h7']);
});

check('pending substitution group at the end of the array', () => {
  const base = [shot('h1'), shot('a1')];
  const cases = [
    { plays: [...base, subOut('h5')], shown: starters('h') },
    { plays: [...base, subIn('h6')], shown: starters('h') },
    { plays: [...base, subOut('h5'), subIn('h6')], shown: ['h1', 'h2', 'h3', 'h4', 'h6'] },
    {
      plays: [...base, subOut('h5'), subIn('h6'), subOut('h4')],
      shown: starters('h'),
    },
    {
      plays: [...base, subOut('h5'), subOut('h4'), subIn('h6')],
      shown: starters('h'),
    },
  ];
  for (const { plays, shown } of cases) {
    const model = basketballBoardFromSummary(synthetic({ plays }), mensRules);
    assert.equal(model.home.lineup, 'floor');
    assert.deepEqual(ids(model.home), shown);
    assert.equal(model.away.lineup, 'floor');
  }
});

check('bad swaps, unknown ids and starter counts fail one team only', () => {
  const failing = [
    // Exit logged before its entry.
    [shot('h1'), subOut('h6'), subIn('h6')],
    // Duplicate entry.
    [shot('h1'), subIn('h2'), subOut('h5')],
    // Unknown id in a substitution.
    [shot('h1'), subOut('h5'), subIn('h99'), shot('h1')],
    // Unknown id as participants[0] of a shot: the play's team fails.
    [shot('h1'), play('558', 'JumpShot', { athletes: ['h99'], team: '1', text: 'h99 jumper' })],
    // Unknown id as participants[0] of a foul.
    [ncaaFoul('h99', { team: '1' })],
    // A set of 4 at a non-substitution play.
    [subOut('h5'), shot('h1')],
    // Text that names neither direction.
    [play('584', 'Substitution', { athletes: ['h5'], team: '1', text: 'h5 substitution' }), shot('h1')],
  ];
  for (const plays of failing) {
    const model = basketballBoardFromSummary(synthetic({ plays: [...plays, shot('a2')] }), mensRules);
    assert.equal(model.home.lineup, 'topScorers');
    assert.deepEqual(ids(model.home), starters('h'));
    assert.equal(model.away.lineup, 'floor');
  }
  for (const starterCount of [4, 6]) {
    const home = roster('h', {
      h5: { starter: starterCount === 6 },
      h6: { starter: starterCount === 6 },
    });
    const model = basketballBoardFromSummary(
      synthetic({ home, plays: [shot('h1'), shot('a1')] }),
      mensRules,
    );
    assert.equal(model.home.lineup, 'topScorers');
    assert.equal(model.away.lineup, 'floor');
    const beforeTip = basketballBoardFromSummary(synthetic({ home, scores: NO_SCORE }), mensRules);
    assert.equal(beforeTip.home.lineup, 'topScorers');
    assert.equal(beforeTip.away.lineup, 'starters');
  }
  // Unknown id in a later slot (an assist or a block of either team), or as participants[0] with
  // no team: both teams fail.
  for (const plays of [
    [shot('h1', { athletes: ['h1', 'x99'] })],
    [play('558', 'JumpShot', { athletes: ['x99'], text: 'x99 jumper' })],
  ]) {
    const model = basketballBoardFromSummary(synthetic({ plays: [...plays, shot('a2')] }), mensRules);
    assert.equal(model.home.lineup, 'topScorers');
    assert.equal(model.away.lineup, 'topScorers');
  }
  // A participant without an athlete id names no player and is not checked.
  const noId = shot('h1');
  noId.participants.push({ type: 'assist' });
  const noIdModel = basketballBoardFromSummary(synthetic({ plays: [noId, shot('a2')] }), mensRules);
  assert.equal(noIdModel.home.lineup, 'floor');
  assert.equal(noIdModel.away.lineup, 'floor');
});

check('top scorers: points, then box order', () => {
  const home = roster('h', {
    h7: { stats: ['30', '0', '0'] },
    h8: { stats: ['16', '0', '0'] },
  });
  const model = basketballBoardFromSummary(
    synthetic({ home, plays: [shot('h7')] }),
    mensRules,
  );
  assert.equal(model.home.lineup, 'topScorers');
  assert.deepEqual(
    model.home.players.map((player) => player.athleteId),
    ['h1', 'h2', 'h3', 'h4', 'h7'],
  );
});

check('known gap: an unlogged substitution pair shows the wrong five until the new player appears', () => {
  // h6 replaced h5 with no play logged.
  const plays = [shot('h1'), shot('a1'), shot('h2', { clock: '9:00' })];
  const before = basketballBoardFromSummary(synthetic({ plays }), mensRules);
  assert.equal(before.home.lineup, 'floor');
  assert.deepEqual(ids(before.home), starters('h'));
  const after = basketballBoardFromSummary(
    synthetic({ plays: [...plays, shot('h6', { clock: '8:30' })] }),
    mensRules,
  );
  assert.equal(after.home.lineup, 'topScorers');
  assert.equal(after.away.lineup, 'floor');
});

check('known gap: unlogged changes at the start of periods 2 and 3', () => {
  // h6 replaced h5 for period 2 and a6 replaced a5 for period 3, with no 584 play.
  const plays = [
    shot('h1', { period: 1 }),
    shot('a1', { period: 1 }),
    endPeriod(1),
    shot('h2', { clock: '9:00', period: 2 }),
    endPeriod(2),
    shot('a2', { clock: '9:00', period: 3 }),
  ];
  const status = { displayClock: '9:00', period: 3, type: { name: 'STATUS_IN_PROGRESS', state: 'in' } };
  const wrong = basketballBoardFromSummary(synthetic({ periods: 4, plays, status }), womensRules);
  assert.equal(wrong.home.lineup, 'floor');
  assert.deepEqual(ids(wrong.home), starters('h'));
  assert.equal(wrong.away.lineup, 'floor');
  assert.deepEqual(ids(wrong.away), starters('a'));
  const caught = basketballBoardFromSummary(
    synthetic({
      periods: 4,
      plays: [...plays, shot('h6', { clock: '8:00', period: 3 }), shot('a6', { clock: '7:00', period: 3 })],
      status,
    }),
    womensRules,
  );
  assert.equal(caught.home.lineup, 'topScorers');
  assert.equal(caught.away.lineup, 'topScorers');
});

check('a fouled-out player left in the set after the clock runs fails the check', () => {
  const fifthClock = '14:00';
  const fouls = ['18:00', '17:00', '16:00', '15:00', fifthClock].map((clock) =>
    ncaaFoul('h1', { clock }),
  );
  const sameClock = [...fouls, shot('a1', { clock: fifthClock }), shot('h2', { clock: fifthClock })];
  const home = roster('h', { h1: { stats: ['20', '0', '5'] } });
  const held = basketballBoardFromSummary(synthetic({ home, plays: sameClock }), mensRules);
  assert.equal(held.home.lineup, 'floor');
  assert.equal(held.home.players.find((player) => player.athleteId === 'h1').out, 'fouledOut');

  const ran = basketballBoardFromSummary(
    synthetic({ home, plays: [...sameClock, shot('h2', { clock: '13:40' })] }),
    mensRules,
  );
  assert.equal(ran.home.lineup, 'topScorers');
  assert.equal(ran.away.lineup, 'floor');

  const left = basketballBoardFromSummary(
    synthetic({
      home,
      plays: [...sameClock, subOut('h1', { clock: fifthClock }), subIn('h6', { clock: fifthClock }), shot('h2', { clock: '13:40' })],
    }),
    mensRules,
  );
  assert.equal(left.home.lineup, 'floor');
  assert.ok(!ids(left.home).includes('h1'));

  // A later period counts as the clock having run.
  const nextPeriod = basketballBoardFromSummary(
    synthetic({ home, plays: [...sameClock, endPeriod(1), shot('a1', { clock: '19:50', period: 2 })] }),
    mensRules,
  );
  assert.equal(nextPeriod.home.lineup, 'topScorers');
});

check('activeLineup fallback: five active athletes covering the plays since the last substitution', () => {
  const home = roster('h', { h5: { active: false }, h6: { active: true } });
  const plays = [shot('h1'), shot('h6', { clock: '9:00' }), shot('a1', { clock: '8:50' })];
  const off = basketballBoardFromSummary(synthetic({ home, plays }), mensRules);
  assert.equal(off.home.lineup, 'topScorers');
  const on = basketballBoardFromSummary(
    synthetic({ home, plays }),
    basketballRulesFor('ncaa/mens-basketball', { ...PLAYER_FLAGS, activeLineup: true }),
  );
  assert.equal(on.home.lineup, 'floor');
  assert.deepEqual(ids(on.home), ['h1', 'h2', 'h3', 'h4', 'h6']);
  const notCovered = basketballBoardFromSummary(
    synthetic({ home, plays: [...plays, shot('h7', { clock: '8:00' })] }),
    basketballRulesFor('ncaa/mens-basketball', { ...PLAYER_FLAGS, activeLineup: true }),
  );
  assert.equal(notCovered.home.lineup, 'topScorers');
  const archivedFinal = basketballBoardFromSummary(
    archived('ncaa/mens-basketball', NO_SUBSTITUTION_EVENT),
    basketballRulesFor('ncaa/mens-basketball', { ...PLAYER_FLAGS, activeLineup: true }),
  );
  assert.equal(archivedFinal.away.lineup, 'topScorers');
  assert.equal(archivedFinal.home.lineup, 'topScorers');
});

check('team fouls and bonus: NCAA men', () => {
  const awayFouls = (count, period = 2) =>
    Array.from({ length: count }, (_, index) =>
      ncaaFoul(`a${(index % 5) + 1}`, { clock: '15:00', period }),
    );
  const status = (period, name = 'STATUS_IN_PROGRESS') => ({
    displayClock: '5:00',
    period,
    type: { name, state: 'in' },
  });
  const firstHalf = [...awayFouls(8, 1), endPeriod(1)];
  const cases = [
    { count: 5, expected: 'none' },
    { count: 6, expected: 'bonus' },
    { count: 8, expected: 'bonus' },
    { count: 9, expected: 'double' },
  ];
  for (const { count, expected } of cases) {
    const model = basketballBoardFromSummary(
      synthetic({ plays: [...firstHalf, ...awayFouls(count)], status: status(2) }),
      basketballRulesFor('ncaa/mens-basketball', { ...PLAYER_FLAGS, players: false }),
    );
    assert.equal(model.away.teamFouls, count);
    assert.equal(model.home.teamFouls, 0);
    assert.equal(model.home.bonus, expected, `${count} fouls`);
    assert.equal(model.away.bonus, 'none');
  }
  // Overtime continues the second half.
  const overtime = basketballBoardFromSummary(
    synthetic({
      plays: [...firstHalf, ...awayFouls(5), endPeriod(2), ...awayFouls(1, 3)],
      status: status(3),
    }),
    mensRules,
  );
  assert.equal(overtime.away.teamFouls, 6);
  assert.equal(overtime.home.bonus, 'bonus');
  // Hidden at halftime and between periods, with the count still shown.
  for (const name of ['STATUS_HALFTIME', 'STATUS_END_PERIOD']) {
    const paused = basketballBoardFromSummary(
      synthetic({ plays: awayFouls(7, 1), status: status(1, name) }),
      mensRules,
    );
    assert.equal(paused.away.teamFouls, 7);
    assert.equal(paused.home.bonus, 'none');
  }
  // Hidden when ESPN's format differs from the rules row; fouls then count per quarter.
  const quarters = basketballBoardFromSummary(
    synthetic({ periods: 4, plays: [...awayFouls(3, 1), ...awayFouls(7, 2)], status: status(2) }),
    mensRules,
  );
  assert.equal(quarters.regulationPeriods, 4);
  assert.equal(quarters.away.teamFouls, 7);
  assert.equal(quarters.home.bonus, 'none');
  // A count other than 2 or 4 keeps the row's periods and windows, and still hides the bonus.
  for (const periods of [1, 3, 6]) {
    const odd = basketballBoardFromSummary(
      synthetic({ periods, plays: [...firstHalf, ...awayFouls(9)], status: status(2) }),
      mensRules,
    );
    assert.equal(odd.regulationPeriods, 2);
    assert.equal(odd.away.teamFouls, 9);
    assert.equal(odd.home.bonus, 'none', `${periods} periods`);
  }
  const rowFormat = basketballBoardFromSummary(
    synthetic({ plays: [...firstHalf, ...awayFouls(9)], status: status(2) }),
    mensRules,
  );
  assert.equal(rowFormat.home.bonus, 'double');
  // Technical Foul plays count; other play types do not.
  const technical = basketballBoardFromSummary(
    synthetic({
      plays: [
        play('521', 'Technical Foul', { team: '2', text: 'Technical Foul on Away.' }),
        play('580', 'OfficialTVTimeOut', { athletes: [], text: 'Official TV Timeout' }),
      ],
      status: status(1),
    }),
    mensRules,
  );
  assert.equal(technical.away.teamFouls, 1);
});

check('team fouls and bonus: NCAA women and NBA', () => {
  const womens = basketballBoardFromSummary(
    synthetic({
      periods: 4,
      plays: [ncaaFoul('h1'), ncaaFoul('h2'), ncaaFoul('h3'), ncaaFoul('h4')],
      status: { displayClock: '5:00', period: 1, type: { name: 'STATUS_IN_PROGRESS', state: 'in' } },
    }),
    womensRules,
  );
  assert.equal(womens.away.bonus, 'bonus');
  assert.equal(womens.home.bonus, 'none');

  const proStatus = (period, clock) => ({
    displayClock: clock,
    period,
    type: { name: 'STATUS_IN_PROGRESS', state: 'in' },
  });
  const homeFouls = (count, period, clock = '6:00') =>
    Array.from({ length: count }, (_, index) =>
      proFoul('Personal Foul', `h${(index % 5) + 1}`, { clock, period }),
    );
  const pro = (plays, period, clock) =>
    basketballBoardFromSummary(synthetic({ periods: 4, plays, status: proStatus(period, clock) }), nbaRules);

  assert.equal(pro(homeFouls(3, 1), 1, '5:00').away.bonus, 'none');
  assert.equal(pro(homeFouls(4, 1), 1, '5:00').away.bonus, 'bonus');
  // Offensive, technical, double and turnover fouls are not team fouls.
  const excluded = [
    proFoul('Offensive Foul', 'h1'),
    proFoul('Offensive Charge', 'h1'),
    proFoul('Technical Foul', 'h1'),
    proFoul('Double Personal Foul', 'h1'),
    proFoul('Offensive Foul Turnover', 'h1'),
    proFoul('Shooting Foul', 'h2'),
  ];
  assert.equal(pro(excluded, 1, '5:00').home.teamFouls, 1);
  // Overtime: each period its own window, bonus at 3.
  const overtime = pro([...homeFouls(4, 4), ...homeFouls(3, 5)], 5, '3:00');
  assert.equal(overtime.home.teamFouls, 3);
  assert.equal(overtime.away.bonus, 'bonus');
  assert.equal(pro([...homeFouls(4, 4), ...homeFouls(2, 5)], 5, '3:00').away.bonus, 'none');
  // Last 2:00: one foul inside the span gives the bonus.
  assert.equal(pro(homeFouls(1, 2, '1:50'), 2, '1:30').away.bonus, 'bonus');
  assert.equal(pro(homeFouls(1, 2, '2:30'), 2, '1:30').away.bonus, 'none');
  assert.equal(pro(homeFouls(1, 2, '1:50'), 2, '').away.bonus, 'none');
  assert.equal(pro(homeFouls(1, 2, '57.1'), 2, '42.0').away.bonus, 'bonus');
});

check('last foul: newest foul play in array order, participants[0], box PF and arrow side', () => {
  const home = roster('h', { h3: { stats: ['5', '1', '4'] } });
  const plays = [
    ncaaFoul('a2', { clock: '9:00' }),
    ncaaFoul('h3', { clock: '9:30' }),
    play('521', 'Technical Foul', { team: '2', text: 'Technical Foul on Away.' }),
    play('540', 'MadeFreeThrow', { athletes: ['a1'], team: '2', text: 'a1 makes free throw' }),
  ];
  const model = basketballBoardFromSummary(synthetic({ home, plays }), mensRules);
  assert.deepEqual(model.lastFoul, { athleteId: 'h3', fouls: 4, jersey: '22', side: 'home' });
  const pro = basketballBoardFromSummary(
    synthetic({
      periods: 4,
      plays: [
        proFoul('Personal Foul', 'h1'),
        proFoul('Offensive Foul Turnover', 'a1'),
        play('103', 'Free Throw - Technical', { athletes: ['a2'], team: '2' }),
      ],
    }),
    nbaRules,
  );
  assert.equal(pro.lastFoul.athleteId, 'h1');
  assert.equal(basketballBoardFromSummary(synthetic(), mensRules).lastFoul, undefined);
});

check('fouled out at the limit, ejected from play 517, foul trouble left to the text module', () => {
  const home = roster('h', {
    h1: { stats: ['2', '0', '4'] },
    h2: { stats: ['2', '0', '5'] },
    h3: { stats: ['2', '0', '1'] },
  });
  const plays = [shot('h1'), play('517', 'Ejection', { athletes: ['h3'], team: '1', text: 'h3 ejected' })];
  const model = basketballBoardFromSummary(synthetic({ home, plays }), mensRules);
  const row = (id) => model.home.players.find((player) => player.athleteId === id);
  assert.equal(model.foulLimit, 5);
  assert.equal(row('h1').out, undefined);
  assert.equal(row('h2').out, 'fouledOut');
  assert.equal(row('h3').out, 'ejected');
  const nba = basketballBoardFromSummary(synthetic({ home, periods: 4, plays: [shot('h1')] }), nbaRules);
  assert.equal(nba.foulLimit, 6);
  assert.equal(nba.home.players.find((player) => player.athleteId === 'h2').out, undefined);
});

check('shorter plays array: previous player cells within 30 s, then the shorter array applies', () => {
  const full = [shot('h1'), ncaaFoul('a1'), subOut('h5'), subIn('h6'), shot('h6'), ncaaFoul('h2')];
  const first = basketballBoardFromSummary(synthetic({ plays: full }), mensRules, { now: 1_000 });
  assert.deepEqual(first.stale, { playerCellsAppliedAt: 1_000, playsLength: 6 });
  assert.equal(first.lastFoul.athleteId, 'h2');

  const shorter = synthetic({ plays: full.slice(0, 2) });
  shorter.header.competitions[0].competitors[0].score = '45';
  const within = basketballBoardFromSummary(shorter, mensRules, {
    now: 1_000 + 10_000,
    previous: first,
  });
  assert.equal(within.home.score, 45);
  for (const key of ['away', 'home']) {
    assert.deepEqual(within[key].players, first[key].players);
    assert.equal(within[key].lineup, first[key].lineup);
    assert.equal(within[key].teamFouls, first[key].teamFouls);
    assert.equal(within[key].bonus, first[key].bonus);
  }
  assert.deepEqual(within.lastFoul, first.lastFoul);
  assert.deepEqual(within.stale, { playerCellsAppliedAt: 1_000, playsLength: 6 });

  const still = basketballBoardFromSummary(shorter, mensRules, {
    now: 1_000 + PLAYER_CELLS_CARRY_MS - 1,
    previous: within,
  });
  assert.deepEqual(still.stale, { playerCellsAppliedAt: 1_000, playsLength: 6 });

  const after = basketballBoardFromSummary(shorter, mensRules, {
    now: 1_000 + PLAYER_CELLS_CARRY_MS,
    previous: still,
  });
  assert.deepEqual(after.stale, { playerCellsAppliedAt: 1_000 + PLAYER_CELLS_CARRY_MS, playsLength: 2 });
  assert.equal(after.lastFoul.athleteId, 'a1');
  assert.deepEqual(ids(after.home), starters('h'));

  // The shorter length is the new baseline.
  const next = basketballBoardFromSummary(synthetic({ plays: full.slice(0, 3) }), mensRules, {
    now: 1_000 + PLAYER_CELLS_CARRY_MS + 5_000,
    previous: after,
  });
  assert.equal(next.stale.playsLength, 3);

  // Another event never carries.
  const other = synthetic({ plays: full.slice(0, 2) });
  other.header.id = '901';
  const otherModel = basketballBoardFromSummary(other, mensRules, { now: 2_000, previous: first });
  assert.equal(otherModel.stale.playsLength, 2);
  assert.equal(otherModel.lastFoul.athleteId, 'a1');

  // A carried bonus is hidden once the phase leaves inPlay.
  const bonusPlays = [1, 2, 3, 4, 5, 6].map((n) => ncaaFoul(`a${(n % 5) + 1}`));
  const inBonus = basketballBoardFromSummary(synthetic({ plays: bonusPlays }), mensRules, { now: 0 });
  assert.equal(inBonus.home.bonus, 'bonus');
  const halftime = synthetic({
    plays: bonusPlays.slice(0, 1),
    status: { period: 1, type: { name: 'STATUS_HALFTIME', state: 'in' } },
  });
  const carriedHalftime = basketballBoardFromSummary(halftime, mensRules, { now: 5_000, previous: inBonus });
  assert.equal(carriedHalftime.away.teamFouls, 6);
  assert.equal(carriedHalftime.home.bonus, 'none');
});

check('players carry forward for 30 s when the box has no players', () => {
  const plays = [shot('h1'), shot('a1')];
  const first = basketballBoardFromSummary(synthetic({ plays }), mensRules, { now: 0 });
  const noBox = synthetic({ plays });
  delete noBox.boxscore;
  const within = basketballBoardFromSummary(noBox, mensRules, { now: 20_000, previous: first });
  assert.equal(within.home.lineup, 'floor');
  assert.deepEqual(within.home.players, first.home.players);
  assert.equal(within.stale.playerCellsAppliedAt, 0);
  const after = basketballBoardFromSummary(noBox, mensRules, { now: 30_000, previous: within });
  assert.equal(after.home.lineup, 'unavailable');
  assert.deepEqual(after.home.players, []);
  assert.equal(after.away.lineup, 'unavailable');
  assert.equal(after.stale.playerCellsAppliedAt, 30_000);
});

check('flags off omit cells', () => {
  const summary = synthetic({
    plays: [shot('h1'), ncaaFoul('a1'), ncaaFoul('a2')],
  });
  summary.header.competitions[0].possessionArrowAvailable = true;
  summary.header.competitions[0].competitors[0].possession = true;
  summary.situation = { awayTimeouts: 2, homeTimeouts: 3 };
  const off = basketballBoardFromSummary(
    summary,
    basketballRulesFor('ncaa/mens-basketball', {
      bonus: false,
      lastFoul: false,
      players: false,
      rebounds: false,
      teamFouls: false,
    }),
  );
  assert.deepEqual(
    basketballRulesFor('ncaa/womens-basketball').flags,
    basketballRulesFor('ncaa/mens-basketball').flags,
  );
  assert.deepEqual(basketballRulesFor('ncaa/mens-basketball').flags, {
    ...off.flags,
    bonus: true,
    lastFoul: true,
    players: true,
    rebounds: true,
    teamFouls: true,
  });
  assert.deepEqual(off.flags, {
    activeLineup: false,
    bonus: false,
    lastFoul: false,
    players: false,
    possessionArrow: false,
    rebounds: false,
    teamFouls: false,
    timeouts: false,
  });
  for (const key of ['away', 'home']) {
    assert.equal(off[key].lineup, 'unavailable');
    assert.deepEqual(off[key].players, []);
    assert.equal(off[key].bonus, 'none');
    assert.ok(!('teamFouls' in off[key]));
    assert.ok(!('timeoutsLeft' in off[key]));
  }
  assert.ok(!('lastFoul' in off));
  assert.ok(!('possessionArrow' in off));
  assert.equal(off.clock, '8:00');
  assert.equal(off.period, 1);
  assert.equal(off.home.score, 40);
  assert.equal(off.away.score, 38);
  assert.equal(off.home.color, '#AE192D');
  assert.equal(off.home.alternateColor, '#FFC72A');
  assert.equal(off.home.nickname, 'Cyclones');

  const noRebounds = basketballBoardFromSummary(
    summary,
    basketballRulesFor('ncaa/mens-basketball', { players: true, rebounds: false }),
  );
  assert.equal(noRebounds.home.lineup, 'floor');
  assert.ok(noRebounds.home.players.every((player) => !('rebounds' in player)));
  const withRebounds = basketballBoardFromSummary(
    summary,
    basketballRulesFor('ncaa/mens-basketball', { players: true, rebounds: true }),
  );
  assert.ok(withRebounds.home.players.every((player) => typeof player.rebounds === 'number'));

  const allOn = basketballBoardFromSummary(
    summary,
    basketballRulesFor('ncaa/mens-basketball', {
      ...PLAYER_FLAGS,
      possessionArrow: true,
      timeouts: true,
    }),
  );
  assert.equal(allOn.home.timeoutsLeft, 3);
  assert.equal(allOn.away.timeoutsLeft, 2);
  assert.equal(allOn.possessionArrow, 'home');
  assert.equal(allOn.away.teamFouls, 2);
  summary.header.competitions[0].competitors[1].possession = true;
  delete summary.situation;
  const ambiguous = basketballBoardFromSummary(
    summary,
    basketballRulesFor('ncaa/mens-basketball', { possessionArrow: true, timeouts: true }),
  );
  assert.ok(!('possessionArrow' in ambiguous));
  assert.ok(!('timeoutsLeft' in ambiguous.home));
});

function assertNoNaN(value, where = 'model') {
  if (typeof value === 'number') {
    assert.ok(Number.isFinite(value), where);
  } else if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoNaN(entry, `${where}[${index}]`));
  } else if (value && typeof value === 'object') {
    for (const [key, entry] of Object.entries(value)) {
      assert.notEqual(entry, undefined, `${where}.${key} is present but undefined`);
      assertNoNaN(entry, `${where}.${key}`);
    }
  }
}

check('missing values become dash fields', () => {
  const home = roster('h', {
    h1: { athlete: { id: 'h1', shortName: 'P. h1' }, stats: ['--', '', 'x'] },
    h6: { didNotPlay: true, stats: [] },
  });
  const summary = synthetic({
    home,
    plays: [shot('h1')],
    status: { type: { name: 'STATUS_IN_PROGRESS', state: 'in' } },
  });
  delete summary.header.competitions[0].competitors[0].score;
  delete summary.header.competitions[0].competitors[1].team.color;
  const model = basketballBoardFromSummary(summary, mensRules);
  assertNoNaN(model);
  assert.ok(!('score' in model.home));
  assert.ok(!('clock' in model));
  assert.equal(model.period, 1);
  assert.ok(!('color' in model.away));
  const h1 = model.home.players.find((player) => player.athleteId === 'h1');
  assert.deepEqual(h1, { athleteId: 'h1', shortName: 'P. h1' });

  // Columns found by labels when keys are missing, and never by position.
  const byLabels = basketballBoardFromSummary(
    synthetic({ keys: null, labels: ['REB', 'PF', 'PTS'], plays: [shot('h1')] }),
    mensRules,
  );
  const row = byLabels.home.players.find((player) => player.athleteId === 'h2');
  assert.equal(row.rebounds, 19);
  assert.equal(row.fouls, 1);
  assert.equal(row.points, 1);
  const noColumns = basketballBoardFromSummary(
    synthetic({ keys: ['minutes'], labels: ['MIN'], plays: [shot('h1')] }),
    mensRules,
  );
  assert.deepEqual(noColumns.home.players.find((player) => player.athleteId === 'h2'), {
    athleteId: 'h2',
    jersey: '11',
    shortName: 'P. h2',
  });

  assert.equal(basketballBoardFromSummary({}, mensRules), undefined);
  assert.equal(basketballBoardFromSummary(null, mensRules), undefined);
  const oneSide = synthetic();
  oneSide.header.competitions[0].competitors.pop();
  assert.equal(basketballBoardFromSummary(oneSide, mensRules), undefined);
});

check('phase, period, clock and regulation periods', () => {
  const statusOf = (type, extra = {}) => ({ ...extra, type });
  const phase = (status, plays = [], periods = 2, rules = mensRules) =>
    basketballBoardFromSummary(synthetic({ periods, plays, status }), rules);
  assert.equal(phase(statusOf({ name: 'STATUS_SCHEDULED', state: 'pre' })).phase, 'pregame');
  assert.equal(phase(statusOf({ name: 'STATUS_IN_PROGRESS', state: 'in' })).phase, 'inPlay');
  assert.equal(phase(statusOf({ name: 'STATUS_HALFTIME', state: 'in' })).phase, 'halftime');
  assert.equal(phase(statusOf({ name: 'STATUS_END_PERIOD', state: 'in' })).phase, 'endOfPeriod');
  assert.equal(phase(statusOf({ name: 'STATUS_FINAL', state: 'post' })).phase, 'final');
  const delayed = phase(statusOf({ detail: 'Delayed', name: 'STATUS_DELAYED', state: 'in' }));
  assert.equal(delayed.phase, 'unknown');
  assert.equal(delayed.statusName, 'STATUS_DELAYED');
  assert.equal(delayed.statusDetail, 'Delayed');
  assert.equal(phase(statusOf({ name: 'STATUS_DELAYED', state: 'post' })).phase, 'final');

  // No status name or state: the last play decides.
  assert.equal(phase({}, [shot('h1'), endPeriod(1)]).phase, 'halftime');
  assert.equal(phase({}, [shot('h1'), endPeriod(1)], 4, womensRules).phase, 'endOfPeriod');
  assert.equal(phase({}, [shot('h1', { period: 2 }), endPeriod(2)], 4, womensRules).phase, 'halftime');
  assert.equal(phase({}, [shot('h1'), play('402', 'End Game')]).phase, 'final');
  assert.equal(phase({}, [shot('h1')]).phase, 'inPlay');
  assert.equal(phase({}, []).phase, 'unknown');
  assert.equal(phase(statusOf({ state: 'in' }), []).phase, 'inPlay');

  const overtime = phase(
    { displayClock: '57.1', period: 3, type: { name: 'STATUS_IN_PROGRESS', state: 'in' } },
    [shot('h1', { period: 3 })],
  );
  assert.equal(overtime.period, 3);
  assert.equal(overtime.regulationPeriods, 2);
  assert.equal(overtime.clock, '57.1');
  assert.equal(phase({}, [shot('h1', { period: 2 })]).period, 2);

  const noFormat = synthetic();
  delete noFormat.format;
  assert.equal(basketballBoardFromSummary(noFormat, womensRules).regulationPeriods, 4);
});

check('schedule builder: scores, clock and period only', () => {
  const event = {
    competitions: [
      {
        competitors: [
          { homeAway: 'home', id: '66', score: '52', team: { color: 'ae192d', displayName: 'Iowa State Cyclones', id: '66', name: 'Cyclones' } },
          { homeAway: 'away', id: '2305', score: '48', team: { displayName: 'Kansas Jayhawks', id: '2305', name: 'Jayhawks' } },
        ],
        id: '401999999',
        status: {
          displayClock: '12:34',
          period: 2,
          type: { detail: '12:34 - 2nd Half', name: 'STATUS_IN_PROGRESS', state: 'in' },
        },
      },
    ],
    id: '401999999',
  };
  const model = basketballBoardFromScheduleEvent(
    event,
    basketballRulesFor('ncaa/mens-basketball', PLAYER_FLAGS),
  );
  assert.deepEqual(model, {
    away: {
      bonus: 'none',
      displayName: 'Kansas Jayhawks',
      lineup: 'unavailable',
      nickname: 'Jayhawks',
      players: [],
      score: 48,
      teamId: '2305',
    },
    clock: '12:34',
    eventId: '401999999',
    flags: { ...basketballRulesFor('ncaa/mens-basketball', PLAYER_FLAGS).flags },
    foulLimit: 5,
    home: {
      bonus: 'none',
      displayName: 'Iowa State Cyclones',
      lineup: 'unavailable',
      nickname: 'Cyclones',
      players: [],
      score: 52,
      teamId: '66',
    },
    kind: 'basketball',
    period: 2,
    phase: 'inPlay',
    regulationPeriods: 2,
    source: 'schedule',
    stale: {},
    statusDetail: '12:34 - 2nd Half',
    statusName: 'STATUS_IN_PROGRESS',
  });
  assert.equal(
    basketballBoardFromScheduleEvent(event, basketballRulesFor('ncaa/womens-basketball')).regulationPeriods,
    4,
  );
  assert.equal(basketballBoardFromScheduleEvent({ competitions: [] }, mensRules), undefined);
});

// Live captures committed by scripts/espn-capture/ under tests/leagues/<adapter>/captures/. With
// the adapter's shipped rules, every captured poll labels both teams as on the floor, and each
// table equals ESPN's active athletes.
function liveCaptures() {
  const out = [];
  const leagues = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'leagues');
  for (const adapter of BASKETBALL_ADAPTER_KEYS) {
    const capturesDir = path.join(leagues, adapter.replace('/', '-'), 'captures');
    if (!fs.existsSync(capturesDir)) continue;
    for (const event of fs.readdirSync(capturesDir).sort()) {
      const eventDir = path.join(capturesDir, event);
      for (const file of fs.readdirSync(eventDir).filter((name) => name.endsWith('.json.gz')).sort()) {
        const summary = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(eventDir, file))).toString('utf8'));
        out.push({ adapter, event, file, summary });
      }
    }
  }
  return out;
}

// This game's substitution log fails the lineup check, so its tables hold the top scorers.
const TOP_SCORER_EVENTS = new Set(['401917691']);

for (const capture of liveCaptures()) {
  check(`live capture ${capture.adapter} ${capture.event}/${capture.file}`, () => {
    const rules = basketballRulesFor(capture.adapter);
    const model = basketballBoardFromSummary(capture.summary, rules, { now: 0 });
    assert.ok(model);
    if (!rules.flags.players) return;
    for (const side of [model.away, model.home]) {
      if (TOP_SCORER_EVENTS.has(capture.event)) {
        assert.equal(side.lineup, 'topScorers', `${side.teamId} lineup`);
        continue;
      }
      assert.equal(side.lineup, 'floor', `${side.teamId} lineup`);
      const active = boxAthletes(capture.summary, side.teamId)
        .filter((entry) => entry.active === true)
        .map((entry) => String(entry.athlete.id))
        .sort();
      // ESPN sometimes marks fewer than five players active mid-substitution (401909773 poll 030
      // lists four for one team), so only a full five is a lineup to compare against.
      if (active.length !== 5) {
        assert.equal(side.players.length, 5, `${side.teamId} floor size`);
        continue;
      }
      assert.deepEqual(side.players.map((player) => String(player.athleteId)).sort(), active);
    }
  });
}

console.log(`board.mjs: ${cases} cases passed`);
