export type QueryAffectResult = {
  rowCount?: number | null;
  rows?: unknown[];
};

export type AddressEditUpdate = {
  addressId: unknown;
  fields: Record<string, unknown>;
};

const ADDRESS_EDIT_ALLOWED_FIELDS = [
  'type',
  'street',
  'street_address',
  'barangay',
  'city',
  'province',
  'postal_code',
  'latitude',
  'longitude',
  'is_primary',
  'psgc_id',
] as const;

export function buildAddressEditUpdate(notes: Record<string, unknown>): AddressEditUpdate {
  const { address_id: addressId, ...rawFields } = notes;
  const fields: Record<string, unknown> = {};

  for (const key of ADDRESS_EDIT_ALLOWED_FIELDS) {
    if (key in rawFields && rawFields[key] !== undefined) {
      fields[key] = rawFields[key];
    }
  }

  const longStreetAddress =
    rawFields.street_address ?? rawFields.full_address ?? rawFields.street;
  if (longStreetAddress !== undefined) {
    fields.street_address = longStreetAddress;
  }

  return { addressId, fields };
}

export function assertAffectedRows(
  result: QueryAffectResult,
  operation: string,
  targetId?: unknown,
): void {
  const affected = result.rowCount ?? result.rows?.length ?? 0;
  if (affected < 1) {
    const suffix = targetId ? ` for ${String(targetId)}` : '';
    throw new Error(`${operation} did not update any rows${suffix}`);
  }
}

export function errorMessageForApproval(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.slice(0, 1000);
  }
  return 'Approval processing failed';
}
