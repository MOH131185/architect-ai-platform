import logger from '../utils/logger.js';

const MIN_INTERVAL_FLOOR = 6000;

function getInitialMinInterval() {
  try {
    const flagsRaw = sessionStorage.getItem('featureFlags');
    if (flagsRaw) {
      const flags = JSON.parse(flagsRaw);
      if (flags.togetherImageMinIntervalMs) {
        return Math.max(MIN_INTERVAL_FLOOR, Number(flags.togetherImageMinIntervalMs));
      }
    }
  } catch (error) {
    logger.debug('Feature flag session storage unavailable for min interval', error);
  }
  return 9000;
}

function now() {
  return Date.now();
}

class ImageRequestQueue {
  constructor(minIntervalMs) {
    this.minIntervalMs = Math.max(MIN_INTERVAL_FLOOR, minIntervalMs || MIN_INTERVAL_FLOOR);
    this.lastAt = 0;
    this.queue = Promise.resolve();
    this.diagnostics = {
      sampleCount: 0,
      intervals: [],
      lastInterval: null,
      lastRunAt: null,
      minIntervalViolations: 0,
      lastViolationAt: null,
      last429At: null,
      lastRetryAfterMs: null,
      consecutiveRateLimits: 0
    };
    this.statusListeners = new Set();
    this.cooldown = { active: false, until: null, reason: '' };
    this.cooldownTimer = null;
  }

  async wait(ms) {
    if (ms <= 0) return;
    await new Promise(resolve => setTimeout(resolve, ms));
  }

  schedule(task) {
    const runTask = this.queue
      .catch(() => {})
      .then(async () => {
        const cooldownDelay = this.getCooldownDelay();
        if (cooldownDelay > 0) {
          logger.warn(`⏸ Together AI cooldown active — waiting ${Math.ceil(cooldownDelay / 1000)}s before next request`);
          await this.wait(cooldownDelay);
        }

        const previousRunAt = this.diagnostics.lastRunAt;
        const enforcedWait = Math.max(0, this.lastAt + this.minIntervalMs - now());
        if (enforcedWait > 0) {
          const jitter = Math.random() * 500;
          await this.wait(enforcedWait + jitter);
        }

        this.lastAt = now();
        this.diagnostics.lastRunAt = this.lastAt;
        if (previousRunAt) {
          this.recordInterval(this.lastAt - previousRunAt);
        }

        try {
          const result = await task();
          this.recordSuccess();
          return result;
        } catch (error) {
          throw error;
        }
      });

    this.queue = runTask.catch(error => {
      logger.debug('Image request queue task failed', { message: error?.message });
    });

    return runTask;
  }

  recordInterval(interval) {
    if (!interval) return;
    this.diagnostics.lastInterval = interval;
    this.diagnostics.sampleCount += 1;
    this.diagnostics.intervals.push(interval);
    if (this.diagnostics.intervals.length > 25) {
      this.diagnostics.intervals.shift();
    }

    if (interval + 150 < this.minIntervalMs) {
      this.diagnostics.minIntervalViolations += 1;
      this.diagnostics.lastViolationAt = now();
      logger.warn('⚠️ Together pacing guard detected interval shorter than configured minimum', {
        interval,
        minInterval: this.minIntervalMs
      });
      this.emitStatus();
    }
  }

  recordRateLimit(retryAfterMs, reason = 'Temporarily throttled by Together.ai') {
    const delayMs = Math.max(this.minIntervalMs, retryAfterMs || this.minIntervalMs);
    this.diagnostics.last429At = now();
    this.diagnostics.lastRetryAfterMs = delayMs;
    this.diagnostics.consecutiveRateLimits += 1;
    const multiplier = Math.min(4, this.diagnostics.consecutiveRateLimits || 1);
    const cooldownDuration = delayMs * multiplier + 2000;
    this.startCooldown(cooldownDuration, reason);
  }

  recordSuccess() {
    this.diagnostics.consecutiveRateLimits = 0;
    if (!this.cooldown.active) {
      this.emitStatus();
    }
  }

  setMinInterval(ms) {
    const nextValue = Math.max(MIN_INTERVAL_FLOOR, ms);
    if (nextValue === this.minIntervalMs) return;
    this.minIntervalMs = nextValue;
    this.emitStatus();
  }

  shouldPause() {
    const cooldownDelay = this.getCooldownDelay();
    if (cooldownDelay > 0) {
      return cooldownDelay;
    }

    if (this.diagnostics.consecutiveRateLimits >= 2) {
      const extraDelay = Math.max(this.diagnostics.lastRetryAfterMs || this.minIntervalMs, this.minIntervalMs);
      return extraDelay + 2000;
    }

    return 0;
  }

  getCooldownDelay() {
    if (!this.cooldown.active || !this.cooldown.until) {
      return 0;
    }
    return Math.max(0, this.cooldown.until - now());
  }

  startCooldown(durationMs, reason = 'Temporarily throttled') {
    const until = now() + Math.max(0, durationMs);
    this.cooldown = {
      active: true,
      until,
      reason
    };
    this.emitStatus();

    if (this.cooldownTimer) {
      clearInterval(this.cooldownTimer);
    }

    this.cooldownTimer = setInterval(() => {
      if (!this.cooldown.active) {
        clearInterval(this.cooldownTimer);
        this.cooldownTimer = null;
        return;
      }

      if (now() >= this.cooldown.until) {
        this.clearCooldown();
        return;
      }

      this.emitStatus();
    }, 1000);
  }

  clearCooldown() {
    if (this.cooldownTimer) {
      clearInterval(this.cooldownTimer);
      this.cooldownTimer = null;
    }
    this.cooldown = { active: false, until: null, reason: '' };
    this.emitStatus();
  }

  subscribe(listener) {
    if (typeof listener !== 'function') {
      return () => {};
    }
    this.statusListeners.add(listener);
    try {
      listener(this.getStatus());
    } catch (error) {
      logger.warn('Queue status listener error on subscribe', error);
    }
    return () => {
      this.statusListeners.delete(listener);
    };
  }

  emitStatus() {
    const status = this.getStatus();
    this.statusListeners.forEach(listener => {
      try {
        listener(status);
      } catch (error) {
        logger.warn('Queue status listener error', error);
      }
    });
  }

  getStatus() {
    const cooldownRemainingMs = this.getCooldownDelay();
    const intervals = this.diagnostics.intervals;
    const avgInterval = intervals.length
      ? Math.round(intervals.reduce((sum, value) => sum + value, 0) / intervals.length)
      : null;
    const minInterval = intervals.length ? Math.min(...intervals) : null;

    return {
      minIntervalMs: this.minIntervalMs,
      lastInterval: this.diagnostics.lastInterval,
      avgInterval,
      minInterval,
      cooldownActive: this.cooldown.active,
      cooldownRemainingMs,
      reason: this.cooldown.reason,
      consecutiveRateLimits: this.diagnostics.consecutiveRateLimits
    };
  }

  getDiagnostics() {
    return {
      ...this.getStatus(),
      sampleCount: this.diagnostics.sampleCount,
      minIntervalViolations: this.diagnostics.minIntervalViolations,
      lastViolationAt: this.diagnostics.lastViolationAt,
      last429At: this.diagnostics.last429At,
      lastRetryAfterMs: this.diagnostics.lastRetryAfterMs
    };
  }
}

const imageRequestQueue = new ImageRequestQueue(getInitialMinInterval());

export function subscribeToImageQueueStatus(listener) {
  return imageRequestQueue.subscribe(listener);
}

export function getImageQueueStatus() {
  return imageRequestQueue.getStatus();
}

export default imageRequestQueue;
