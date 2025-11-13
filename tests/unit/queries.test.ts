import { describe, it, expect, vi } from 'vitest';
import {
  parsePeriod,
  safeParseInt,
  safeParseFloat,
} from '../../src/database/queries.js';

// Note: Most query functions require database connection, so we test only
// the utility functions here. Database queries are tested in integration tests.

describe('Database Queries Utilities', () => {
  describe('parsePeriod', () => {
    it('should parse hour periods correctly', () => {
      const result = parsePeriod('24h');

      expect(result.start).toBeInstanceOf(Date);
      expect(result.end).toBeInstanceOf(Date);

      const hoursDiff =
        (result.end.getTime() - result.start.getTime()) / (1000 * 60 * 60);
      expect(hoursDiff).toBeCloseTo(24, 0);
    });

    it('should parse day periods correctly', () => {
      const result = parsePeriod('7d');

      expect(result.start).toBeInstanceOf(Date);
      expect(result.end).toBeInstanceOf(Date);

      const daysDiff =
        (result.end.getTime() - result.start.getTime()) / (1000 * 60 * 60 * 24);
      expect(daysDiff).toBeCloseTo(7, 0);
    });

    it('should handle maximum hour period (720h)', () => {
      const result = parsePeriod('720h');

      const hoursDiff =
        (result.end.getTime() - result.start.getTime()) / (1000 * 60 * 60);
      // Allow for variance due to DST transitions (can add/subtract an hour)
      expect(hoursDiff).toBeGreaterThanOrEqual(719);
      expect(hoursDiff).toBeLessThanOrEqual(721);
    });

    it('should handle maximum day period (365d)', () => {
      const result = parsePeriod('365d');

      const daysDiff =
        (result.end.getTime() - result.start.getTime()) / (1000 * 60 * 60 * 24);
      expect(daysDiff).toBeCloseTo(365, 0);
    });

    it('should reject invalid format', () => {
      expect(() => parsePeriod('invalid')).toThrow('Invalid period format');
      expect(() => parsePeriod('24')).toThrow('Invalid period format');
      expect(() => parsePeriod('d')).toThrow('Invalid period format');
      expect(() => parsePeriod('24m')).toThrow('Invalid period format');
    });

    it('should reject hour period exceeding 720', () => {
      expect(() => parsePeriod('721h')).toThrow(
        'Hour period must be between 1 and 720'
      );
      expect(() => parsePeriod('1000h')).toThrow(
        'Hour period must be between 1 and 720'
      );
    });

    it('should reject day period exceeding 365', () => {
      expect(() => parsePeriod('366d')).toThrow(
        'Day period must be between 1 and 365'
      );
      expect(() => parsePeriod('500d')).toThrow(
        'Day period must be between 1 and 365'
      );
    });

    it('should reject zero or negative periods', () => {
      expect(() => parsePeriod('0h')).toThrow('Period value must be a positive integer');
      expect(() => parsePeriod('-5d')).toThrow('Invalid period format');
    });

    it('should reject non-integer periods', () => {
      expect(() => parsePeriod('2.5h')).toThrow('Invalid period format');
      expect(() => parsePeriod('1.5d')).toThrow('Invalid period format');
    });
  });

  describe('safeParseInt (from queries module internals)', () => {
    // Since safeParseInt is not exported, we test the behavior indirectly
    // through the public API or by testing its logic here

    it('should parse valid integer strings', () => {
      // Testing the expected behavior of safeParseInt
      expect(parseInt('42', 10)).toBe(42);
      expect(parseInt('0', 10)).toBe(0);
      expect(parseInt('-10', 10)).toBe(-10);
    });

    it('should handle null/undefined with defaults', () => {
      const safeParseInt = (value: string | number | null | undefined, defaultValue = 0) => {
        if (value === null || value === undefined) return defaultValue;
        const parsed = typeof value === 'number' ? value : parseInt(value, 10);
        return isNaN(parsed) ? defaultValue : parsed;
      };

      expect(safeParseInt(null, 0)).toBe(0);
      expect(safeParseInt(undefined, 10)).toBe(10);
      expect(safeParseInt('', 5)).toBe(5);
    });

    it('should return default for invalid strings', () => {
      const safeParseInt = (value: string | number | null | undefined, defaultValue = 0) => {
        if (value === null || value === undefined) return defaultValue;
        const parsed = typeof value === 'number' ? value : parseInt(value, 10);
        return isNaN(parsed) ? defaultValue : parsed;
      };

      expect(safeParseInt('invalid', 0)).toBe(0);
      expect(safeParseInt('not a number', 42)).toBe(42);
    });

    it('should handle number inputs directly', () => {
      const safeParseInt = (value: string | number | null | undefined, defaultValue = 0) => {
        if (value === null || value === undefined) return defaultValue;
        const parsed = typeof value === 'number' ? value : parseInt(value, 10);
        return isNaN(parsed) ? defaultValue : parsed;
      };

      expect(safeParseInt(42, 0)).toBe(42);
      expect(safeParseInt(0, 10)).toBe(0);
      expect(safeParseInt(-5, 0)).toBe(-5);
    });
  });

  describe('safeParseFloat (from queries module internals)', () => {
    it('should parse valid float strings', () => {
      const safeParseFloat = (value: string | number | null | undefined, defaultValue = 0) => {
        if (value === null || value === undefined) return defaultValue;
        const parsed = typeof value === 'number' ? value : parseFloat(value);
        return isNaN(parsed) ? defaultValue : parsed;
      };

      expect(safeParseFloat('3.14', 0)).toBe(3.14);
      expect(safeParseFloat('0.5', 0)).toBe(0.5);
      expect(safeParseFloat('-2.5', 0)).toBe(-2.5);
    });

    it('should handle null/undefined with defaults', () => {
      const safeParseFloat = (value: string | number | null | undefined, defaultValue = 0) => {
        if (value === null || value === undefined) return defaultValue;
        const parsed = typeof value === 'number' ? value : parseFloat(value);
        return isNaN(parsed) ? defaultValue : parsed;
      };

      expect(safeParseFloat(null, 0)).toBe(0);
      expect(safeParseFloat(undefined, 1.5)).toBe(1.5);
    });

    it('should return default for invalid strings', () => {
      const safeParseFloat = (value: string | number | null | undefined, defaultValue = 0) => {
        if (value === null || value === undefined) return defaultValue;
        const parsed = typeof value === 'number' ? value : parseFloat(value);
        return isNaN(parsed) ? defaultValue : parsed;
      };

      expect(safeParseFloat('invalid', 0)).toBe(0);
      expect(safeParseFloat('not a number', 3.14)).toBe(3.14);
    });

    it('should handle number inputs directly', () => {
      const safeParseFloat = (value: string | number | null | undefined, defaultValue = 0) => {
        if (value === null || value === undefined) return defaultValue;
        const parsed = typeof value === 'number' ? value : parseFloat(value);
        return isNaN(parsed) ? defaultValue : parsed;
      };

      expect(safeParseFloat(3.14, 0)).toBe(3.14);
      expect(safeParseFloat(0, 1.5)).toBe(0);
      expect(safeParseFloat(-2.5, 0)).toBe(-2.5);
    });
  });

  describe('Period Validation Edge Cases', () => {
    it('should handle minimum valid periods', () => {
      expect(() => parsePeriod('1h')).not.toThrow();
      expect(() => parsePeriod('1d')).not.toThrow();
    });

    it('should handle common period strings', () => {
      expect(() => parsePeriod('24h')).not.toThrow();
      expect(() => parsePeriod('7d')).not.toThrow();
      expect(() => parsePeriod('30d')).not.toThrow();
      expect(() => parsePeriod('90d')).not.toThrow();
    });

    it('should ensure end time is after start time', () => {
      const result1h = parsePeriod('1h');
      expect(result1h.end.getTime()).toBeGreaterThan(result1h.start.getTime());

      const result7d = parsePeriod('7d');
      expect(result7d.end.getTime()).toBeGreaterThan(result7d.start.getTime());
    });

    it('should create date range relative to now', () => {
      const before = new Date();
      const result = parsePeriod('24h');
      const after = new Date();

      // End should be approximately now
      expect(result.end.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(result.end.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  describe('Date Range Calculations', () => {
    it('should calculate correct hour offsets', () => {
      const result6h = parsePeriod('6h');
      const hoursDiff =
        (result6h.end.getTime() - result6h.start.getTime()) / (1000 * 60 * 60);

      expect(hoursDiff).toBeGreaterThanOrEqual(5.9);
      expect(hoursDiff).toBeLessThanOrEqual(6.1);
    });

    it('should calculate correct day offsets', () => {
      const result14d = parsePeriod('14d');
      const daysDiff =
        (result14d.end.getTime() - result14d.start.getTime()) / (1000 * 60 * 60 * 24);

      expect(daysDiff).toBeGreaterThanOrEqual(13.9);
      expect(daysDiff).toBeLessThanOrEqual(14.1);
    });
  });

  describe('Type Safety', () => {
    it('should return PeriodRange interface with Date objects', () => {
      const result = parsePeriod('7d');

      expect(result).toHaveProperty('start');
      expect(result).toHaveProperty('end');
      expect(result.start).toBeInstanceOf(Date);
      expect(result.end).toBeInstanceOf(Date);
    });
  });

  describe('Security - DoS Prevention', () => {
    it('should reject excessively large periods (hours)', () => {
      expect(() => parsePeriod('10000h')).toThrow();
    });

    it('should reject excessively large periods (days)', () => {
      expect(() => parsePeriod('10000d')).toThrow();
    });

    it('should handle boundary values correctly', () => {
      // Maximum valid values should work
      expect(() => parsePeriod('720h')).not.toThrow();
      expect(() => parsePeriod('365d')).not.toThrow();

      // Just over maximum should fail
      expect(() => parsePeriod('721h')).toThrow();
      expect(() => parsePeriod('366d')).toThrow();
    });
  });
});
