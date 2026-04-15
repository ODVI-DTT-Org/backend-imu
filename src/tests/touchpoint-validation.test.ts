import { describe, it, expect } from 'vitest';
import {
  validateTouchpointSequence,
  validateRoleBasedTouchpoint,
  getNextTouchpointType
} from '../services/touchpoint-validation.js';
import { ValidationError } from '../errors/index.js';

describe('Touchpoint Validation Service', () => {
  describe('validateTouchpointSequence', () => {
    it('should allow touchpoint 1 for new client', () => {
      expect(() => validateTouchpointSequence(0, 1)).not.toThrow();
    });

    it('should reject touchpoint 8', () => {
      expect(() => validateTouchpointSequence(7, 8)).toThrow(ValidationError);
    });

    it('should reject out-of-sequence touchpoint', () => {
      expect(() => validateTouchpointSequence(1, 3)).toThrow(ValidationError);
    });

    it('should provide helpful error message', () => {
      expect(() => validateTouchpointSequence(1, 3))
        .toThrow(ValidationError);
      try {
        validateTouchpointSequence(1, 3);
      } catch (e) {
        expect((e as ValidationError).message).toContain('Expected 2');
      }
    });
  });

  describe('validateRoleBasedTouchpoint', () => {
    it('should allow caravan to create visit touchpoint 1', () => {
      expect(() => validateRoleBasedTouchpoint('caravan', 1, 'Visit')).not.toThrow();
    });

    it('should reject caravan creating call touchpoint', () => {
      expect(() => validateRoleBasedTouchpoint('caravan', 2, 'Call')).toThrow(ValidationError);
    });

    it('should allow tele to create call touchpoint 2', () => {
      expect(() => validateRoleBasedTouchpoint('tele', 2, 'Call')).not.toThrow();
    });

    it('should reject tele creating visit touchpoint', () => {
      expect(() => validateRoleBasedTouchpoint('tele', 1, 'Visit')).toThrow(ValidationError);
    });

    it('should allow admin to create any touchpoint', () => {
      expect(() => validateRoleBasedTouchpoint('admin', 1, 'Visit')).not.toThrow();
      expect(() => validateRoleBasedTouchpoint('admin', 2, 'Call')).not.toThrow();
      expect(() => validateRoleBasedTouchpoint('admin', 7, 'Visit')).not.toThrow();
    });

    it('should reject invalid role', () => {
      expect(() => validateRoleBasedTouchpoint('invalid_role', 1, 'Visit')).toThrow(ValidationError);
    });

    it('should enforce type matching pattern', () => {
      // Touchpoint 2 must be Call
      expect(() => validateRoleBasedTouchpoint('admin', 2, 'Visit')).toThrow(ValidationError);

      // Touchpoint 1 must be Visit
      expect(() => validateRoleBasedTouchpoint('admin', 1, 'Call')).toThrow(ValidationError);
    });
  });

  describe('getNextTouchpointType', () => {
    it('should return correct next touchpoint types', () => {
      expect(getNextTouchpointType(0)).toBe('Visit');
      expect(getNextTouchpointType(1)).toBe('Call');
      expect(getNextTouchpointType(2)).toBe('Call');
      expect(getNextTouchpointType(3)).toBe('Visit');
      expect(getNextTouchpointType(4)).toBe('Call');
      expect(getNextTouchpointType(5)).toBe('Call');
      expect(getNextTouchpointType(6)).toBe('Visit');
      expect(getNextTouchpointType(7)).toBeNull();
    });
  });
});
