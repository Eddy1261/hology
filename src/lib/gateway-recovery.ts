// G-2.1: bounded gateway recovery while offline.
//
// Single-timer controller: probes every `intervalMs` ONLY while the gateway
// is offline; stops as soon as it is online again; never overlaps probes;
// restartable if the gateway later goes down. Timers are injectable so tests
// run deterministically without real setInterval.

export interface GatewayRecoveryOptions {
  /** Current online state (from the app store). */
  isOnline: () => boolean;
  /** Soft probe — must NOT throw; returns true when the gateway is healthy. */
  probe: () => Promise<boolean>;
  /** Runs after a successful probe (rehydrate shared state). */
  onRecovered: () => void | Promise<void>;
  intervalMs?: number;
  setIntervalFn?: (fn: () => void, ms: number) => unknown;
  clearIntervalFn?: (id: unknown) => void;
}

export interface GatewayRecovery {
  start(): void;
  stop(): void;
  readonly running: boolean;
  /** Resolves when the most recent tick's async work finished (tests). */
  flush(): Promise<void>;
}

export function createGatewayRecovery(opts: GatewayRecoveryOptions): GatewayRecovery {
  const intervalMs = opts.intervalMs ?? 3000;
  const setInt =
    opts.setIntervalFn ?? ((fn: () => void) => setInterval(fn, intervalMs));
  const clearInt =
    opts.clearIntervalFn ?? ((id: unknown) => clearInterval(id as ReturnType<typeof setInterval>));

  let timer: unknown = null;
  let pending = false;
  let started = false;
  let tickPromise: Promise<void> = Promise.resolve();

  async function tick(): Promise<void> {
    if (pending) return; // never overlap probes
    if (opts.isOnline()) {
      stop();
      return;
    }
    pending = true;
    try {
      if (await opts.probe()) {
        await opts.onRecovered();
        stop();
      }
    } catch {
      // probe() is contractually soft; a throw here must not kill the loop.
    } finally {
      pending = false;
    }
  }

  function start(): void {
    if (started) return;
    started = true;
    timer = setInt(() => {
      tickPromise = tick();
    }, intervalMs);
  }

  function stop(): void {
    if (!started) return;
    started = false;
    if (timer !== null) {
      clearInt(timer);
      timer = null;
    }
  }

  return {
    start,
    stop,
    get running(): boolean {
      return started;
    },
    flush: () => tickPromise,
  };
}