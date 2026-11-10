// Counts running jobs (bot updates, alert rounds) so shutdown can let them finish before the final save.
export class Inflight {
  private running = 0;
  private wake: (() => void) | null = null;
  closed = false;

  async run<T>(job: () => Promise<T>): Promise<T> {
    this.running++;
    try {
      return await job();
    } finally {
      if (--this.running === 0) this.wake?.();
    }
  }

  /** Refuse new work and wait for running jobs, at most `ms`. True if everything finished in time. */
  close(ms: number): Promise<boolean> {
    this.closed = true;
    if (this.running === 0) return Promise.resolve(true);
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve(false), ms);
      this.wake = () => {
        clearTimeout(timer);
        resolve(true);
      };
    });
  }
}
