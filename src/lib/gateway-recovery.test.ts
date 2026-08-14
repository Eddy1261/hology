// G-2.1: gateway recovery state machine — deterministic fake-timer tests.

import { test } from "node:test";
import { strict as assert } from "node:assert";
import { createGatewayRecovery, type GatewayRecoveryOptions } from "./gateway-recovery.ts";

interface FakeTimer {
  setInt: (fn: () => void, ms: number) => unknown;
  clearInt: (id: unknown) => void;
  run(): void;
  count(): number;
}

function fakeTimer(): FakeTimer {
  let id = 0;
  const registry = new Map<unknown, () => void>();
  return {
    setInt: (fn) => {
      const i = ++id;
      registry.set(i, fn);
      return i;
    },
    clearInt: (i) => {
      registry.delete(i);
    },
    run: () => {
      for (const fn of [...registry.values()]) fn();
    },
    count: () => registry.size,
  };
}

function harness(overrides: Partial<GatewayRecoveryOptions>) {
  const timers = fakeTimer();
  const calls: string[] = [];
  const options: GatewayRecoveryOptions = {
    isOnline: () => false,
    probe: async () => true,
    onRecovered: () => void calls.push("recovered"),
    intervalMs: 3000,
    setIntervalFn: timers.setInt,
    clearIntervalFn: timers.clearInt,
    ...overrides,
  };
  const recovery = createGatewayRecovery(options);
  return { timers, calls, recovery };
}

test("offline → probe → recovered → loop stops", async () => {
  const { timers, calls, recovery } = harness({});
  recovery.start();
  assert.equal(recovery.running, true);
  assert.equal(timers.count(), 1);
  timers.run();
  await recovery.flush(); // let the async tick settle
  // first tick: probe ok → onRecovered → stop
  assert.deepEqual(calls, ["recovered"]);
  assert.equal(recovery.running, false);
  assert.equal(timers.count(), 0);
});

test("stays offline → keeps probing every tick, no overlap", async () => {
  let probeCount = 0;
  const { timers, recovery } = harness({
    probe: async () => {
      probeCount += 1;
      return false;
    },
  });
  recovery.start();
  timers.run();
  await recovery.flush();
  timers.run();
  await recovery.flush();
  timers.run();
  await recovery.flush();
  assert.equal(probeCount, 3);
  assert.equal(recovery.running, true);
});

test("never starts while already online", async () => {
  const { timers, recovery } = harness({ isOnline: () => true });
  recovery.start();
  timers.run();
  await recovery.flush(); // tick sees online → stops
  assert.equal(recovery.running, false);
  assert.equal(timers.count(), 0);
});

test("overlapping ticks never double-probe (pending guard)", async () => {
  let probes = 0;
  let resolveProbe: () => void = () => {};
  const { timers, recovery } = harness({
    probe: () => {
      probes += 1;
      return new Promise<boolean>((res) => {
        resolveProbe = () => res(false);
      });
    },
  });
  recovery.start();
  timers.run(); // starts a pending probe
  timers.run(); // second tick while pending → must be dropped
  resolveProbe();
  await recovery.flush();
  timers.run(); // pending cleared; a third tick probes again
  resolveProbe(); // settle the third probe
  await recovery.flush();
  assert.equal(probes, 2);
});

test("restartable after stop", async () => {
  const { timers, recovery } = harness({ probe: async () => false });
  recovery.start();
  timers.run();
  await recovery.flush();
  recovery.stop();
  recovery.start(); // gateway went down again
  timers.run();
  await recovery.flush();
  assert.equal(recovery.running, true);
  assert.equal(timers.count(), 1);
});

test("start() is idempotent — single timer", async () => {
  const { timers, recovery } = harness({ probe: async () => false });
  recovery.start();
  recovery.start();
  recovery.start();
  assert.equal(timers.count(), 1);
});