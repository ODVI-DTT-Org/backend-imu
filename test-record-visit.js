import { FormData } from 'formdata-node';
import { FormData as FormDataPolyfill } from 'formdata-node';
import fs from 'fs';
import fetch from 'node-fetch';

// Test the record visit endpoint
async function testRecordVisit() {
  const apiUrl = 'http://localhost:4000/api/my-day/visits';
  
  // Create a test image buffer (1x1 red pixel PNG)
  const testImageBuffer = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==',
    'base64'
  );
  
  // Create form data with the required fields
  const formData = new FormData();
  formData.append('client_id', 'test-client-123');
  formData.append('touchpoint_number', '1');
  formData.append('type', 'Visit');
  formData.append('reason', 'LOAN_INQUIRY');
  formData.append('status', 'Interested');
  formData.append('notes', 'Test visit for debugging');
  formData.append('time_arrival', new Date().toISOString());
  formData.append('time_departure', new Date(Date.now() + 5*60000).toISOString());
  formData.append('latitude', '14.5995');
  formData.append('longitude', '120.9842');
  formData.append('address', 'Test Address, Manila');
  
  // Create a Blob from the test image
  const blob = new Blob([testImageBuffer], { type: 'image/png' });
  formData.append('photo', blob, 'test-photo.png');

  console.log('Testing record visit endpoint...');
  console.log('API URL:', apiUrl);
  
  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      body: formData,
      headers: {
        'Authorization': 'Bearer test-token', // You'll need a real token
      },
    });
    
    console.log('Response status:', response.status);
    const data = await response.json();
    console.log('Response data:', data);
  } catch (error) {
    console.error('Error:', error.message);
  }
}

testRecordVisit();
