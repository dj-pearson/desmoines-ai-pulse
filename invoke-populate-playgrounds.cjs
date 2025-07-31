const https = require('https');

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
    'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind0a2hmcXBtY2VnemNibmdyb3VpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM1Mzc5NzcsImV4cCI6MjA2OTExMzk3N30.a-qKhaxy7l72IyT0eLq7kYuxm-wypuMxgycDy95r1aE',
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
