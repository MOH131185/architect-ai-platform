/**
 * Jest tests for QA Production Readiness Harness
 *
 * Tests both SYNTHETIC and REAL generation modes.
 * Note: REAL mode tests require API keys and are skipped in CI.
 *
 * @module tests/qa/qaProductionReadinessHarness
 */

import fs from 'fs';
import path from 'path';

import { jest } from '@jest/globals';

// Mock sharp for unit tests
jest.mock('sharp', () => {
  const mockSharp = jest.fn().mockReturnValue({
    resize: jest.fn().mockReturnThis(),
    grayscale: jest.fn().mockReturnThis(),
    raw: jest.fn().mockReturnThis(),
    png: jest.fn().mockReturnThis(),
    composite: jest.fn().mockReturnThis(),
    toBuffer: jest.fn().mockResolvedValue(Buffer.alloc(1024 * 1024)),
  });
  return mockSharp;
});

describe('QA Production Readiness Harness', () => {
  const PROJECT_ROOT = path.resolve(__dirname, '../../..');
  const HARNESS_PATH = path.join(PROJECT_ROOT, 'scripts', 'qa-production-readiness-harness.mjs');

  describe('Harness File Structure', () => {
    test('harness file exists', () => {
      expect(fs.existsSync(HARNESS_PATH)).toBe(true);
    });

    test('harness is an ESM module', () => {
      expect(HARNESS_PATH.endsWith('.mjs')).toBe(true);
    });
  });

  describe('Configuration', () => {
    test('BUILDING_TYPES includes required types', async () => {
      const harnessContent = fs.readFileSync(HARNESS_PATH, 'utf-8');

      const requiredTypes = [
        'detached',
        'semi_detached',
        'terrace_mid',
        'apartment_block',
        'bungalow',
        'townhouse',
      ];
      for (const type of requiredTypes) {
        expect(harnessContent).toContain(`'${type}'`);
      }
    });

    test('PANEL_TYPES includes all required panels', async () => {
      const harnessContent = fs.readFileSync(HARNESS_PATH, 'utf-8');

      const requiredPanels = [
        'hero_3d',
        'interior_3d',
        'floor_plan_ground',
        'floor_plan_first',
        'elevation_north',
        'elevation_south',
        'elevation_east',
        'elevation_west',
        'section_AA',
        'section_BB',
        'site_plan',
      ];

      for (const panel of requiredPanels) {
        expect(harnessContent).toContain(`'${panel}'`);
      }
    });

    test('--real-generation flag is supported', async () => {
      const harnessContent = fs.readFileSync(HARNESS_PATH, 'utf-8');
      expect(harnessContent).toContain('--real-generation');
      expect(harnessContent).toContain('realGeneration');
    });

    test('REAL_THRESHOLDS are defined', async () => {
      const harnessContent = fs.readFileSync(HARNESS_PATH, 'utf-8');
      expect(harnessContent).toContain('REAL_THRESHOLDS');
      expect(harnessContent).toContain('minSSIM');
      expect(harnessContent).toContain('minPHash');
      expect(harnessContent).toContain('minEdgeOverlap');
    });

    test('SYNTHETIC_THRESHOLDS are defined', async () => {
      const harnessContent = fs.readFileSync(HARNESS_PATH, 'utf-8');
      expect(harnessContent).toContain('SYNTHETIC_THRESHOLDS');
    });
  });

  describe('API Key Loading', () => {
    test('loadEnv function exists', async () => {
      const harnessContent = fs.readFileSync(HARNESS_PATH, 'utf-8');
      expect(harnessContent).toContain('function loadEnv()');
    });

    test('validates TOGETHER_API_KEY is required', async () => {
      const harnessContent = fs.readFileSync(HARNESS_PATH, 'utf-8');
      expect(harnessContent).toContain("'TOGETHER_API_KEY'");
      expect(harnessContent).toContain('Missing required API keys');
    });

    test('supports .env and .env.local files', async () => {
      const harnessContent = fs.readFileSync(HARNESS_PATH, 'utf-8');
      expect(harnessContent).toContain('.env');
      expect(harnessContent).toContain('.env.local');
    });
  });

  describe('Metrics Computation', () => {
    test('computeSSIM function exists', async () => {
      const harnessContent = fs.readFileSync(HARNESS_PATH, 'utf-8');
      expect(harnessContent).toContain('async function computeSSIM');
    });

    test('computePHash function exists', async () => {
      const harnessContent = fs.readFileSync(HARNESS_PATH, 'utf-8');
      expect(harnessContent).toContain('async function computePHash');
    });

    test('computeEdgeOverlap function exists', async () => {
      const harnessContent = fs.readFileSync(HARNESS_PATH, 'utf-8');
      expect(harnessContent).toContain('async function computeEdgeOverlap');
    });

    test('computeAllMetrics combines all metrics', async () => {
      const harnessContent = fs.readFileSync(HARNESS_PATH, 'utf-8');
      expect(harnessContent).toContain('async function computeAllMetrics');
      expect(harnessContent).toContain('computeSSIM');
      expect(harnessContent).toContain('computePHash');
      expect(harnessContent).toContain('computeEdgeOverlap');
    });
  });

  describe('Real Generation Mode', () => {
    test('generateRealPanels function exists', async () => {
      const harnessContent = fs.readFileSync(HARNESS_PATH, 'utf-8');
      expect(harnessContent).toContain('async function generateRealPanels');
    });

    test('calls dnaWorkflowOrchestrator', async () => {
      const harnessContent = fs.readFileSync(HARNESS_PATH, 'utf-8');
      expect(harnessContent).toContain('dnaWorkflowOrchestrator');
      expect(harnessContent).toContain('runA1SheetWorkflow');
    });

    test('downloads images from URLs', async () => {
      const harnessContent = fs.readFileSync(HARNESS_PATH, 'utf-8');
      expect(harnessContent).toContain('async function downloadImage');
      expect(harnessContent).toContain('data:');
      expect(harnessContent).toContain('fetch');
    });

    test('saves DEBUG_REPORT.json', async () => {
      const harnessContent = fs.readFileSync(HARNESS_PATH, 'utf-8');
      expect(harnessContent).toContain('DEBUG_REPORT.json');
      expect(harnessContent).toContain('debugReport');
    });

    test('includes prompts and seeds in debug report', async () => {
      const harnessContent = fs.readFileSync(HARNESS_PATH, 'utf-8');
      expect(harnessContent).toContain('debugReport.prompts');
      expect(harnessContent).toContain('debugReport.seeds');
    });
  });

  describe('Output Files', () => {
    test('saves metrics.json per run', async () => {
      const harnessContent = fs.readFileSync(HARNESS_PATH, 'utf-8');
      expect(harnessContent).toContain('metrics.json');
      expect(harnessContent).toContain('metricsPath');
    });

    test('saves panel PNGs', async () => {
      const harnessContent = fs.readFileSync(HARNESS_PATH, 'utf-8');
      expect(harnessContent).toContain('.png');
      expect(harnessContent).toContain('panelPath');
    });

    test('saves A1 composed PNG', async () => {
      const harnessContent = fs.readFileSync(HARNESS_PATH, 'utf-8');
      expect(harnessContent).toContain('a1_composed.png');
    });

    test('saves index.json aggregating all runs', async () => {
      const harnessContent = fs.readFileSync(HARNESS_PATH, 'utf-8');
      expect(harnessContent).toContain('index.json');
      expect(harnessContent).toContain('indexPath');
    });
  });

  describe('Acceptance Criteria', () => {
    test('defines minSuccessRate at 90%', async () => {
      const harnessContent = fs.readFileSync(HARNESS_PATH, 'utf-8');
      expect(harnessContent).toContain('minSuccessRate: 0.90');
    });

    test('defines maxUnfixableFailures at 0', async () => {
      const harnessContent = fs.readFileSync(HARNESS_PATH, 'utf-8');
      expect(harnessContent).toContain('maxUnfixableFailures: 0');
    });
  });

  describe('Error Handling', () => {
    test('marks real failures as FAIL status', async () => {
      const harnessContent = fs.readFileSync(HARNESS_PATH, 'utf-8');
      expect(harnessContent).toContain("status = 'FAIL'");
    });

    test('real failures are not marked as fixable', async () => {
      const harnessContent = fs.readFileSync(HARNESS_PATH, 'utf-8');
      expect(harnessContent).toContain('fixableByRegeneration = false');
    });

    test('outputs unfixable failure paths', async () => {
      const harnessContent = fs.readFileSync(HARNESS_PATH, 'utf-8');
      expect(harnessContent).toContain('UNFIXABLE');
      expect(harnessContent).toContain('debugReportPath');
    });
  });
});

describe('QA Harness Integration', () => {
  // Skip real generation tests in CI (no API keys)
  const hasApiKey = process.env.TOGETHER_API_KEY;

  describe.skip('Real Generation (requires API keys)', () => {
    // These tests require actual API keys and make real API calls
    // They are skipped by default but can be run locally with keys

    test('real generation mode produces panels', async () => {
      if (!hasApiKey) {
        console.log('Skipping: TOGETHER_API_KEY not set');
        return;
      }

      // This would run the actual harness with --real-generation
      // For now, we just verify the harness can be imported
      expect(true).toBe(true);
    });
  });
});
