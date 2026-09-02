const https = require('https');

if (!process.env.VITE_SUPABASE_ANON_KEY) {
  throw new Error('VITE_SUPABASE_ANON_KEY is not set');
}

// Get radius_meters from command-line arguments, default to 5000 if not provided
//node invoke-populate-playgrounds.cjs 5000
const radius_meters = process.argv[2] ? parseInt(process.argv[2], 10) : 5000;

if (isNaN(radius_meters)) {
  console.error('Error: radius_meters must be a number.');
  process.exit(1);
}

const postData = JSON.stringify({
  radius_meters: radius_meters
});

const options = {
  hostname: 'wtkhfqpmcegzcbngroui.supabase.co',
  port: 443,
  path: '/functions/v1/populate-playgrounds',
  method: 'POST',
  headers: {
    // WEB-SEC-032: read from the environment, never committed.
    'Authorization': `Bearer ${process.env.VITE_SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(postData)
  }
};

const req = https.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  res.on('end', () => {
    console.log(data);
  });
});

req.on('error', (error) => {
  console.error(error);
});

req.write(postData);
req.end();
