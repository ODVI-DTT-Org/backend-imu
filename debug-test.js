// Quick test to check mock database handler
const mockPhoneNumber = {
  id: '223e4567-e89b-12d3-a456-426614174200',
  client_id: '123e4567-e89b-12d3-a456-426614174100',
  label: 'Mobile',
  number: '09171234567',
  is_primary: true,
  deleted_at: null,
};

const mockClient = {
  id: '123e4567-e89b-12d3-a456-426614174100',
  user_id: 'user-1',
};

const query = 'SELECT * FROM phone_numbers WHERE id = $1 AND client_id = $2 AND deleted_at IS NULL';
const params = [mockPhoneNumber.id, mockClient.id];

const q = query.trim().toLowerCase();
console.log('Query:', q);
console.log('Params:', params);

// Check if handler would match
const hasSelect = q.includes('select');
const hasFrom = q.includes('from phone_numbers');
const hasWhereId = q.includes('where id');
const hasClientId = q.includes('client_id');

console.log('Pattern matches:');
console.log('  - select:', hasSelect);
console.log('  - from phone_numbers:', hasFrom);
console.log('  - where id:', hasWhereId);
console.log('  - client_id:', hasClientId);

// Check regex for client_id parameter
const clientIdMatch = q.match(/client_id\s*=\s*\$(\d+)/);
console.log('client_id parameter match:', clientIdMatch);
if (clientIdMatch) {
  const paramIndex = parseInt(clientIdMatch[1]) - 1;
  console.log('  - parameter index:', paramIndex);
  console.log('  - parameter value:', params[paramIndex]);
  console.log('  - expected client_id:', mockPhoneNumber.client_id);
}
