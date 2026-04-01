import { describe, it, expect } from 'vitest'
import {
  calculateDistance,
  getGPSStatus,
  validateTouchpointLocation,
  isValidLatitude,
  isValidLongitude,
  GPS_THRESHOLDS,
  GPS_LIMITS,
} from '../../src/services/gps-validation'

describe('GPS Validation', () => {
  describe('calculateDistance', () => {
    it('should calculate distance between two coordinates in meters', () => {
      const lat1 = 14.5995
      const lng1 = 120.9842
      const lat2 = 14.6095
      const lng2 = 120.9942

      const distance = calculateDistance(lat1, lng1, lat2, lng2)

      expect(distance).toBeGreaterThan(0)
      expect(distance).toBeLessThan(2000) // Should be ~1.5km
    })

    it('should return 0 for identical coordinates', () => {
      const lat = 14.5995
      const lng = 120.9842

      const distance = calculateDistance(lat, lng, lat, lng)

      expect(distance).toBe(0)
    })
  })

  describe('getGPSStatus', () => {
    it('should return onsite for distance < 50m', () => {
      const status = getGPSStatus(49)
      expect(status).toBe('onsite')
    })

    it('should return near for distance 50-200m', () => {
      expect(getGPSStatus(50)).toBe('near')
      expect(getGPSStatus(200)).toBe('near')
      expect(getGPSStatus(150)).toBe('near')
    })

    it('should return offsite for distance > 200m', () => {
      expect(getGPSStatus(201)).toBe('offsite')
      expect(getGPSStatus(5000)).toBe('offsite')
    })

    // Boundary tests
    it('should return onsite for distance just under 50m', () => {
      expect(getGPSStatus(49.99)).toBe('onsite')
    })

    it('should return near for distance exactly at 50m', () => {
      expect(getGPSStatus(50)).toBe('near')
    })

    it('should return near for distance exactly at 200m', () => {
      expect(getGPSStatus(200)).toBe('near')
    })

    it('should return offsite for distance just over 200m', () => {
      expect(getGPSStatus(200.01)).toBe('offsite')
    })
  })

  describe('isValidLatitude', () => {
    it('should accept valid latitude values', () => {
      expect(isValidLatitude(0)).toBe(true)
      expect(isValidLatitude(45.5)).toBe(true)
      expect(isValidLatitude(-45.5)).toBe(true)
      expect(isValidLatitude(90)).toBe(true)
      expect(isValidLatitude(-90)).toBe(true)
    })

    it('should reject invalid latitude values', () => {
      expect(isValidLatitude(91)).toBe(false)
      expect(isValidLatitude(-91)).toBe(false)
      expect(isValidLatitude(100)).toBe(false)
      expect(isValidLatitude(-100)).toBe(false)
    })
  })

  describe('isValidLongitude', () => {
    it('should accept valid longitude values', () => {
      expect(isValidLongitude(0)).toBe(true)
      expect(isValidLongitude(120.5)).toBe(true)
      expect(isValidLongitude(-120.5)).toBe(true)
      expect(isValidLongitude(180)).toBe(true)
      expect(isValidLongitude(-180)).toBe(true)
    })

    it('should reject invalid longitude values', () => {
      expect(isValidLongitude(181)).toBe(false)
      expect(isValidLongitude(-181)).toBe(false)
      expect(isValidLongitude(200)).toBe(false)
      expect(isValidLongitude(-200)).toBe(false)
    })
  })

  describe('validateTouchpointLocation', () => {
    it('should return complete validation response', async () => {
      const touchpoint = {
        time_in_gps_lat: 14.5995,
        time_in_gps_lng: 120.9842,
        time_in_gps_address: 'Test Address'
      }
      const client = {
        latitude: 14.6095,
        longitude: 120.9942
      }

      const result = await validateTouchpointLocation(touchpoint, client)

      expect(result).toHaveProperty('distance')
      expect(result).toHaveProperty('status')
      expect(result).toHaveProperty('clientLocation')
      expect(result).toHaveProperty('touchpointLocation')
      expect(result).toHaveProperty('mapUrl')
    })

    it('should handle missing GPS coordinates gracefully', async () => {
      const touchpoint = {}
      const client = {}

      const result = await validateTouchpointLocation(touchpoint, client)

      expect(result.status).toBe('unknown')
    })

    it('should handle invalid GPS coordinates', async () => {
      const touchpoint = {
        time_in_gps_lat: 91, // Invalid latitude
        time_in_gps_lng: 120.9842,
        time_in_gps_address: 'Test Address'
      }
      const client = {
        latitude: 14.6095,
        longitude: 120.9942
      }

      const result = await validateTouchpointLocation(touchpoint, client)

      expect(result.status).toBe('unknown')
    })

    it('should handle invalid client coordinates', async () => {
      const touchpoint = {
        time_in_gps_lat: 14.5995,
        time_in_gps_lng: 120.9842,
        time_in_gps_address: 'Test Address'
      }
      const client = {
        latitude: 14.6095,
        longitude: 200 // Invalid longitude
      }

      const result = await validateTouchpointLocation(touchpoint, client)

      expect(result.status).toBe('unknown')
    })

    it('should include touchpointId in response when provided', async () => {
      const touchpoint = {
        time_in_gps_lat: 14.5995,
        time_in_gps_lng: 120.9842,
      }
      const client = {
        latitude: 14.6095,
        longitude: 120.9942
      }

      const result = await validateTouchpointLocation(touchpoint, client, 'tp-123')

      expect(result.touchpointId).toBe('tp-123')
    })
  })

  describe('GPS_THRESHOLDS', () => {
    it('should have correct threshold values', () => {
      expect(GPS_THRESHOLDS.ONSITE_MAX).toBe(50)
      expect(GPS_THRESHOLDS.NEAR_MAX).toBe(200)
    })
  })

  describe('GPS_LIMITS', () => {
    it('should have correct coordinate limits', () => {
      expect(GPS_LIMITS.MIN_LAT).toBe(-90)
      expect(GPS_LIMITS.MAX_LAT).toBe(90)
      expect(GPS_LIMITS.MIN_LNG).toBe(-180)
      expect(GPS_LIMITS.MAX_LNG).toBe(180)
    })
  })
})
