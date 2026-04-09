// Check PSGC fixture
const mockPSGC = {
  id: 1,
  code: '130000000',
  region: 'National Capital Region (NCR)',
  province: 'Metro Manila',
  city_municipality: 'Manila',
  barangay: 'Ermita',
};

console.log('Original PSGC:', mockPSGC);
console.log('PSGC properties:', Object.keys(mockPSGC));
console.log('PSGC.region:', mockPSGC.region);

// Check spread operator
const spreadPSGC = { ...mockPSGC };
console.log('Spread PSGC:', spreadPSGC);
console.log('Spread PSGC properties:', Object.keys(spreadPSGC));
console.log('Spread PSGC.region:', spreadPSGC.region);

// Check conditional spread
const conditionalPSGC = mockPSGC ? { ...mockPSGC } : null;
console.log('Conditional spread PSGC:', conditionalPSGC);
console.log('Conditional spread PSGC properties:', conditionalPSGC ? Object.keys(conditionalPSGC) : 'null');
console.log('Conditional spread PSGC.region:', conditionalPSGC?.region);

// Check address object
const address = {
  id: '123e4567-e89b-12d3-a456-426614174200',
  psgc_id: 1,
};

// Find PSGC
const psgcList = [mockPSGC];
const foundPSGC = psgcList.find(p => p.id === address.psgc_id);
console.log('Found PSGC:', foundPSGC);
console.log('Found PSGC properties:', Object.keys(foundPSGC || {}));
console.log('Found PSGC.region:', foundPSGC?.region);
