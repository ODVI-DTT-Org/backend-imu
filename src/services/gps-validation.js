// GPS Distance Thresholds (in meters)
export const GPS_THRESHOLDS = {
    ONSITE_MAX: 50, // < 50m is considered onsite
    NEAR_MAX: 200, // 50-200m is considered near
    // > 200m is considered offsite
};
// GPS Coordinate Validation Limits
export const GPS_LIMITS = {
    MIN_LAT: -90,
    MAX_LAT: 90,
    MIN_LNG: -180,
    MAX_LNG: 180,
};
/**
 * Validate if a latitude value is within valid range
 */
export function isValidLatitude(lat) {
    return lat >= GPS_LIMITS.MIN_LAT && lat <= GPS_LIMITS.MAX_LAT;
}
/**
 * Validate if a longitude value is within valid range
 */
export function isValidLongitude(lng) {
    return lng >= GPS_LIMITS.MIN_LNG && lng <= GPS_LIMITS.MAX_LNG;
}
/**
 * Calculate distance between two coordinates using Haversine formula
 * Returns distance in meters
 */
export function calculateDistance(lat1, lng1, lat2, lng2) {
    const R = 6371e3; // Earth's radius in meters
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lng2 - lng1) * Math.PI) / 180;
    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
        Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}
/**
 * Get GPS status based on distance
 */
export function getGPSStatus(distance) {
    if (distance < GPS_THRESHOLDS.ONSITE_MAX)
        return 'onsite';
    if (distance <= GPS_THRESHOLDS.NEAR_MAX)
        return 'near';
    return 'offsite';
}
/**
 * Validate touchpoint location against client location
 */
export async function validateTouchpointLocation(touchpoint, client, touchpointId) {
    // Check if coordinates are available and valid
    const hasClientCoords = client.latitude !== null &&
        client.latitude !== undefined &&
        isValidLatitude(client.latitude) &&
        client.longitude !== null &&
        client.longitude !== undefined &&
        isValidLongitude(client.longitude);
    const hasTouchpointCoords = touchpoint.time_in_gps_lat !== null &&
        touchpoint.time_in_gps_lat !== undefined &&
        isValidLatitude(touchpoint.time_in_gps_lat) &&
        touchpoint.time_in_gps_lng !== null &&
        touchpoint.time_in_gps_lng !== undefined &&
        isValidLongitude(touchpoint.time_in_gps_lng);
    if (!hasClientCoords || !hasTouchpointCoords) {
        return {
            touchpointId,
            clientLocation: {
                lat: client.latitude ?? null,
                lng: client.longitude ?? null,
                address: null
            },
            touchpointLocation: {
                lat: touchpoint.time_in_gps_lat ?? null,
                lng: touchpoint.time_in_gps_lng ?? null,
                address: touchpoint.time_in_gps_address ?? null
            },
            distance: null,
            status: 'unknown',
            mapUrl: ''
        };
    }
    const distance = calculateDistance(client.latitude, client.longitude, touchpoint.time_in_gps_lat, touchpoint.time_in_gps_lng);
    const status = getGPSStatus(distance);
    // Create Google Maps URL
    const mapUrl = `https://www.google.com/maps/dir/?api=1&origin=${client.latitude},${client.longitude}&destination=${touchpoint.time_in_gps_lat},${touchpoint.time_in_gps_lng}`;
    return {
        touchpointId,
        clientLocation: {
            lat: client.latitude,
            lng: client.longitude,
            address: null
        },
        touchpointLocation: {
            lat: touchpoint.time_in_gps_lat,
            lng: touchpoint.time_in_gps_lng,
            address: touchpoint.time_in_gps_address ?? null
        },
        distance,
        status,
        mapUrl
    };
}
