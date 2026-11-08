// Durable Object shells. Every rule lives in gates.js; these classes only bind it to Cloudflare
// storage and schedule the cleanup of expired records.

import { DurableObject } from 'cloudflare:workers';
import { GlobalGateCore, TeamGateCore, readLimits } from './gates.js';

const SWEEP_INTERVAL_MS = 60 * 60 * 1000;

class GateShell extends DurableObject {
  async scheduleSweep() {
    if ((await this.ctx.storage.getAlarm()) === null) {
      await this.ctx.storage.setAlarm(Date.now() + SWEEP_INTERVAL_MS);
    }
  }

  async alarm() {
    if (await this.gate.sweep()) {
      await this.ctx.storage.setAlarm(Date.now() + SWEEP_INTERVAL_MS);
    }
  }
}

export class TeamGate extends GateShell {
  constructor(ctx, env) {
    super(ctx, env);
    this.gate = new TeamGateCore(ctx.storage, readLimits(env));
  }

  async reserve(ip, eventId) {
    await this.scheduleSweep();
    return this.gate.reserve(ip, eventId);
  }

  release(reservation) {
    return this.gate.release(reservation);
  }

  markQueued(eventId) {
    return this.gate.markQueued(eventId);
  }

  async recordStatus(report) {
    await this.scheduleSweep();
    return this.gate.recordStatus(report);
  }

  async recordProgress(report) {
    await this.scheduleSweep();
    return this.gate.recordProgress(report);
  }

  readState(eventId) {
    return this.gate.readState(eventId);
  }
}

export class GlobalGate extends GateShell {
  constructor(ctx, env) {
    super(ctx, env);
    this.gate = new GlobalGateCore(ctx.storage, readLimits(env));
  }

  async consumeKeyAttempt(ip) {
    await this.scheduleSweep();
    return this.gate.consumeKeyAttempt(ip);
  }

  refundKeyAttempt(ip, at) {
    return this.gate.refundKeyAttempt(ip, at);
  }

  async reserve(ip, runKey) {
    await this.scheduleSweep();
    return this.gate.reserve(ip, runKey);
  }

  release(reservation) {
    return this.gate.release(reservation);
  }

  completeRun(runKey) {
    return this.gate.completeRun(runKey);
  }
}
