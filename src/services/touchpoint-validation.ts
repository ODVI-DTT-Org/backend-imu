import { ValidationError } from '../errors/index.js';

// // Touchpoint sequence pattern (COMMENTED OUT for Unli Touchpoint)
// const TOUCHPOINT_PATTERN: Record<number, 'Visit' | 'Call'> = {
//   1: 'Visit',
//   2: 'Call',
//   3: 'Call',
//   4: 'Visit',
//   5: 'Call',
//   6: 'Call',
//   7: 'Visit'
// } as const;

// // Role-based touchpoint permissions (COMMENTED OUT for Unli Touchpoint)
// const ROLE_TOUCHPOINT_PERMISSIONS: Record<string, {
//   canCreate: number[];
//   types: ('Visit' | 'Call')[];
// }> = {
//   admin: { canCreate: [1, 2, 3, 4, 5, 6, 7], types: ['Visit', 'Call'] },
//   area_manager: { canCreate: [1, 2, 3, 4, 5, 6, 7], types: ['Visit', 'Call'] },
//   assistant_area_manager: { canCreate: [1, 2, 3, 4, 5, 6, 7], types: ['Visit', 'Call'] },
//   caravan: { canCreate: [1, 4, 7], types: ['Visit'] },
//   tele: { canCreate: [2, 3, 5, 6], types: ['Call'] }
// };

// /**
//  * Validates touchpoint sequence (max 7, correct order)
//  * COMMENTED OUT for Unli Touchpoint - no 7-touchpoint limit
//  */
// export function validateTouchpointSequence(
//   currentCount: number,
//   proposedNumber: number
// ): void {
//   // Validation: Max 7 touchpoints
//   if (currentCount >= 7) {
//     throw new ValidationError(
//       'Maximum touchpoints reached (7). No more touchpoints can be created.'
//     );
//   }
//
//   // Validation: Ensure correct sequence
//   const expectedNumber = currentCount + 1;
//   if (proposedNumber !== expectedNumber) {
//     throw new ValidationError(
//       `Invalid touchpoint number. Expected ${expectedNumber}, got ${proposedNumber}.`
//     );
//   }
// }

// /**
//  * Validates role-based permissions for touchpoint creation
//  * COMMENTED OUT for Unli Touchpoint - no pattern restrictions
//  */
// export function validateRoleBasedTouchpoint(
//   role: string,
//   touchpointNumber: number,
//   touchpointType: 'Visit' | 'Call'
// ): void {
//   const permissions = ROLE_TOUCHPOINT_PERMISSIONS[role];
//
//   if (!permissions) {
//     throw new ValidationError(`Invalid role: ${role}`);
//   }
//
//   // Validation: Check if role can create this touchpoint number
//   if (!permissions.canCreate.includes(touchpointNumber)) {
//     throw new ValidationError(
//       `Role ${role} cannot create touchpoint ${touchpointNumber}. ` +
//       `Allowed: ${permissions.canCreate.join(', ')}`
//     );
//   }
//
//   // Validation: Check if role can create this touchpoint type
//   if (!permissions.types.includes(touchpointType)) {
//     throw new ValidationError(
//       `Role ${role} cannot create ${touchpointType} touchpoints. ` +
//       `Allowed: ${permissions.types.join(' or ')}`
//     );
//   }
//
//   // Validation: Ensure type matches the pattern
//   const expectedType = TOUCHPOINT_PATTERN[touchpointNumber];
//   if (touchpointType !== expectedType) {
//     throw new ValidationError(
//       `Touchpoint ${touchpointNumber} must be ${expectedType}, got ${touchpointType}.`
//     );
//   }
// }

// /**
//  * Gets the next touchpoint type for a given count
//  * COMMENTED OUT for Unli Touchpoint - no pattern restrictions
//  */
// export function getNextTouchpointType(count: number): 'Visit' | 'Call' | null {
//   if (count >= 7) return null;
//
//   if ([0, 3, 6].includes(count)) return 'Visit';
//   if ([1, 2, 4, 5].includes(count)) return 'Call';
//   return 'Visit';
// }

/**
 * Auto-calculates next touchpoint number for a client (unlimited)
 * @param db - Database instance
 * @param clientId - Client UUID
 * @returns Next touchpoint number
 */
export async function getNextTouchpointNumber(
  db: any,
  clientId: string
): Promise<number> {
  const result = await db.query(`
    SELECT COALESCE(MAX(touchpoint_number), 0) + 1 as next_number
    FROM touchpoints
    WHERE client_id = $1
  `, [clientId]);
  return result[0]?.next_number || 1;
}
