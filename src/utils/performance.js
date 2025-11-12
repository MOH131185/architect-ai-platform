/**
 * Performance Monitoring Utility
 *
 * Tracks and reports on application performance metrics.
 * Helps identify bottlenecks and optimize critical paths.
 */

import logger from './logger';

class PerformanceMonitor {
  constructor() {
    this.metrics = new Map();
    this.timers = new Map();
    this.counters = new Map();
    this.thresholds = new Map();
    this.enabled = process.env.NODE_ENV !== 'production' ||
                   process.env.REACT_APP_ENABLE_PERFORMANCE_MONITORING === 'true';

    // Default thresholds for common operations (in ms)
    this.setThreshold('api_call', 3000);
    this.setThreshold('image_generation', 10000);
    this.setThreshold('dna_generation', 5000);
    this.setThreshold('rendering', 16); // 60fps target
    this.setThreshold('component_mount', 100);

    // Memory monitoring
    this.memoryCheckInterval = null;
    this.memoryHistory = [];
    this.maxMemoryHistorySize = 100;

    // Performance marks for Navigation API
    this.navigationMarks = new Map();
  }

  /**
   * Start timing an operation
   */
  startTimer(label, metadata = {}) {
    if (!this.enabled) return;

    const timer = {
      label,
      startTime: performance.now(),
      metadata,
      id: `${label}_${Date.now()}_${Math.random()}`
    };

    this.timers.set(timer.id, timer);

    // Use Performance API if available
    if (typeof performance !== 'undefined' && performance.mark) {
      performance.mark(`${label}_start`);
    }

    return timer.id;
  }

  /**
   * End timing an operation and record the metric
   */
  endTimer(timerId) {
    if (!this.enabled || !timerId) return null;

    const timer = this.timers.get(timerId);
    if (!timer) {
      logger.warn('Timer not found:', timerId);
      return null;
    }

    const endTime = performance.now();
    const duration = endTime - timer.startTime;

    // Record the metric
    const metric = {
      label: timer.label,
      duration,
      timestamp: new Date().toISOString(),
      metadata: timer.metadata
    };

    // Store metric
    if (!this.metrics.has(timer.label)) {
      this.metrics.set(timer.label, []);
    }
    this.metrics.get(timer.label).push(metric);

    // Use Performance API if available
    if (typeof performance !== 'undefined' && performance.mark && performance.measure) {
      performance.mark(`${timer.label}_end`);
      try {
        performance.measure(
          timer.label,
          `${timer.label}_start`,
          `${timer.label}_end`
        );
      } catch (e) {
        // Marks might not exist
      }
    }

    // Check threshold
    const threshold = this.thresholds.get(timer.label);
    if (threshold && duration > threshold) {
      logger.warn(`Performance threshold exceeded for ${timer.label}`, {
        duration: `${duration.toFixed(2)}ms`,
        threshold: `${threshold}ms`,
        exceeded: `${(duration - threshold).toFixed(2)}ms`
      });
    }

    // Clean up
    this.timers.delete(timerId);

    // Log if in debug mode
    if (process.env.REACT_APP_LOG_LEVEL === 'DEBUG') {
      logger.debug(`Performance: ${timer.label}`, {
        duration: `${duration.toFixed(2)}ms`,
        ...timer.metadata
      });
    }

    return metric;
  }

  /**
   * Increment a counter
   */
  incrementCounter(name, value = 1) {
    if (!this.enabled) return;

    const current = this.counters.get(name) || 0;
    this.counters.set(name, current + value);
  }

  /**
   * Get counter value
   */
  getCounter(name) {
    return this.counters.get(name) || 0;
  }

  /**
   * Reset a counter
   */
  resetCounter(name) {
    this.counters.delete(name);
  }

  /**
   * Set performance threshold for an operation
   */
  setThreshold(operation, thresholdMs) {
    this.thresholds.set(operation, thresholdMs);
  }

  /**
   * Track a custom metric
   */
  trackMetric(name, value, unit = 'ms', metadata = {}) {
    if (!this.enabled) return;

    const metric = {
      name,
      value,
      unit,
      timestamp: new Date().toISOString(),
      metadata
    };

    if (!this.metrics.has(name)) {
      this.metrics.set(name, []);
    }
    this.metrics.get(name).push(metric);
  }

  /**
   * Get metrics for a specific operation
   */
  getMetrics(label) {
    return this.metrics.get(label) || [];
  }

  /**
   * Get all metrics
   */
  getAllMetrics() {
    const result = {};
    for (const [label, metrics] of this.metrics.entries()) {
      result[label] = metrics;
    }
    return result;
  }

  /**
   * Calculate statistics for a metric
   */
  getStats(label) {
    const metrics = this.getMetrics(label);
    if (metrics.length === 0) return null;

    const values = metrics.map(m => m.duration || m.value);
    const sum = values.reduce((a, b) => a + b, 0);
    const avg = sum / values.length;
    const sorted = [...values].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const min = Math.min(...values);
    const max = Math.max(...values);
    const p95 = sorted[Math.floor(sorted.length * 0.95)];
    const p99 = sorted[Math.floor(sorted.length * 0.99)];

    return {
      count: values.length,
      sum: sum.toFixed(2),
      avg: avg.toFixed(2),
      median: median.toFixed(2),
      min: min.toFixed(2),
      max: max.toFixed(2),
      p95: p95 ? p95.toFixed(2) : max.toFixed(2),
      p99: p99 ? p99.toFixed(2) : max.toFixed(2)
    };
  }

  /**
   * Get performance report
   */
  getReport() {
    const report = {
      timestamp: new Date().toISOString(),
      metrics: {},
      counters: {},
      memory: this.getMemoryInfo(),
      navigation: this.getNavigationTiming()
    };

    // Add metric statistics
    for (const [label, metrics] of this.metrics.entries()) {
      if (metrics.length > 0) {
        report.metrics[label] = this.getStats(label);
      }
    }

    // Add counters
    for (const [name, value] of this.counters.entries()) {
      report.counters[name] = value;
    }

    return report;
  }

  /**
   * Clear all metrics
   */
  clearMetrics() {
    this.metrics.clear();
    this.timers.clear();
    this.counters.clear();
    this.memoryHistory = [];
  }

  /**
   * Monitor memory usage
   */
  startMemoryMonitoring(intervalMs = 5000) {
    if (!this.enabled || this.memoryCheckInterval) return;

    this.memoryCheckInterval = setInterval(() => {
      const memInfo = this.getMemoryInfo();
      if (memInfo) {
        this.memoryHistory.push({
          timestamp: Date.now(),
          ...memInfo
        });

        // Keep history size manageable
        if (this.memoryHistory.length > this.maxMemoryHistorySize) {
          this.memoryHistory.shift();
        }

        // Check for memory leaks
        if (this.memoryHistory.length >= 10) {
          const recent = this.memoryHistory.slice(-10);
          const avgGrowth = recent.reduce((sum, m, i) => {
            if (i === 0) return sum;
            return sum + (m.usedJSHeapSize - recent[i - 1].usedJSHeapSize);
          }, 0) / (recent.length - 1);

          if (avgGrowth > 1000000) { // 1MB per interval
            logger.warn('Potential memory leak detected', {
              averageGrowth: `${(avgGrowth / 1048576).toFixed(2)} MB per ${intervalMs}ms`,
              currentUsage: `${(memInfo.usedJSHeapSize / 1048576).toFixed(2)} MB`
            });
          }
        }
      }
    }, intervalMs);
  }

  /**
   * Stop memory monitoring
   */
  stopMemoryMonitoring() {
    if (this.memoryCheckInterval) {
      clearInterval(this.memoryCheckInterval);
      this.memoryCheckInterval = null;
    }
  }

  /**
   * Get current memory information
   */
  getMemoryInfo() {
    if (typeof performance !== 'undefined' && performance.memory) {
      return {
        usedJSHeapSize: performance.memory.usedJSHeapSize,
        totalJSHeapSize: performance.memory.totalJSHeapSize,
        jsHeapSizeLimit: performance.memory.jsHeapSizeLimit,
        usedMB: (performance.memory.usedJSHeapSize / 1048576).toFixed(2),
        totalMB: (performance.memory.totalJSHeapSize / 1048576).toFixed(2),
        limitMB: (performance.memory.jsHeapSizeLimit / 1048576).toFixed(2)
      };
    }
    return null;
  }

  /**
   * Get navigation timing information
   */
  getNavigationTiming() {
    if (typeof performance !== 'undefined' && performance.timing) {
      const timing = performance.timing;
      const navigationStart = timing.navigationStart;

      return {
        domContentLoaded: timing.domContentLoadedEventEnd - navigationStart,
        loadComplete: timing.loadEventEnd - navigationStart,
        domInteractive: timing.domInteractive - navigationStart,
        firstByte: timing.responseStart - navigationStart,
        dns: timing.domainLookupEnd - timing.domainLookupStart,
        tcp: timing.connectEnd - timing.connectStart,
        request: timing.responseStart - timing.requestStart,
        response: timing.responseEnd - timing.responseStart,
        domParsing: timing.domInteractive - timing.domLoading,
        resourceLoading: timing.loadEventStart - timing.domContentLoadedEventEnd
      };
    }
    return null;
  }

  /**
   * Mark a navigation point
   */
  markNavigation(label) {
    if (!this.enabled) return;

    this.navigationMarks.set(label, performance.now());

    if (typeof performance !== 'undefined' && performance.mark) {
      performance.mark(`nav_${label}`);
    }
  }

  /**
   * Measure between navigation points
   */
  measureNavigation(startLabel, endLabel) {
    if (!this.enabled) return null;

    const start = this.navigationMarks.get(startLabel);
    const end = this.navigationMarks.get(endLabel);

    if (!start || !end) return null;

    const duration = end - start;

    if (typeof performance !== 'undefined' && performance.measure) {
      try {
        performance.measure(
          `${startLabel}_to_${endLabel}`,
          `nav_${startLabel}`,
          `nav_${endLabel}`
        );
      } catch (e) {
        // Marks might not exist
      }
    }

    return duration;
  }

  /**
   * Log performance report to console
   */
  logReport() {
    const report = this.getReport();

    console.group('Performance Report');

    console.group('Metrics');
    for (const [label, stats] of Object.entries(report.metrics)) {
      console.log(`${label}:`, stats);
    }
    console.groupEnd();

    if (Object.keys(report.counters).length > 0) {
      console.group('Counters');
      for (const [name, value] of Object.entries(report.counters)) {
        console.log(`${name}: ${value}`);
      }
      console.groupEnd();
    }

    if (report.memory) {
      console.group('Memory');
      console.log(`Used: ${report.memory.usedMB} MB`);
      console.log(`Total: ${report.memory.totalMB} MB`);
      console.log(`Limit: ${report.memory.limitMB} MB`);
      console.groupEnd();
    }

    if (report.navigation) {
      console.group('Navigation Timing');
      console.log(`DOM Ready: ${report.navigation.domContentLoaded}ms`);
      console.log(`Page Load: ${report.navigation.loadComplete}ms`);
      console.log(`First Byte: ${report.navigation.firstByte}ms`);
      console.groupEnd();
    }

    console.groupEnd();
  }
}

// Create singleton instance
const performanceMonitor = new PerformanceMonitor();

// Convenience methods for common operations
performanceMonitor.timeAPI = function(endpoint, operation) {
  return this.startTimer('api_call', { endpoint, operation });
};

performanceMonitor.timeGeneration = function(type, view) {
  return this.startTimer('image_generation', { type, view });
};

performanceMonitor.timeDNA = function(step) {
  return this.startTimer('dna_generation', { step });
};

performanceMonitor.timeRender = function(component) {
  return this.startTimer('rendering', { component });
};

// Auto-start memory monitoring in development
if (process.env.NODE_ENV === 'development') {
  performanceMonitor.startMemoryMonitoring(10000); // Check every 10 seconds
}

// Export singleton instance
export default performanceMonitor;

// Also export the class for advanced use
export { PerformanceMonitor };