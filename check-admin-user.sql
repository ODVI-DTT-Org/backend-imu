-- Check if admin@imu.test exists
SELECT id, email, first_name, last_name, role, created_at 
FROM users 
WHERE email = 'admin@imu.test' OR role = 'admin'
ORDER BY created_at;
