import assert from 'node:assert/strict';

import {
  PROVISIONING_WARNING_INSTRUCTION,
  getProvisioningWarning,
} from '../../app/hub/provisioningWarning.ts';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const now = Date.UTC(2026, 7, 20, 12, 0, 0);

assert.equal(getProvisioningWarning(undefined, now), undefined);
assert.equal(getProvisioningWarning(Number.NaN, now), undefined);
assert.equal(getProvisioningWarning(now + 49 * HOUR_MS, now), undefined);
assert.deepEqual(getProvisioningWarning(now + 48 * HOUR_MS, now), {
  instruction: PROVISIONING_WARNING_INSTRUCTION,
  title: 'Expires in 2 days',
});
assert.deepEqual(getProvisioningWarning(now + DAY_MS, now), {
  instruction: PROVISIONING_WARNING_INSTRUCTION,
  title: 'Expires in 1 day',
});
assert.deepEqual(getProvisioningWarning(now + 23 * HOUR_MS, now), {
  instruction: PROVISIONING_WARNING_INSTRUCTION,
  title: 'Expires in 23 hours',
});
assert.deepEqual(getProvisioningWarning(now + 59 * 60 * 1000, now), {
  instruction: PROVISIONING_WARNING_INSTRUCTION,
  title: 'Expires in less than 1 hour',
});
assert.deepEqual(getProvisioningWarning(now - HOUR_MS, now), {
  instruction: PROVISIONING_WARNING_INSTRUCTION,
  title: 'App refresh needed',
});

console.log('Provisioning warning states passed.');
