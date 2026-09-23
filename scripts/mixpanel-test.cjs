// One-off: send a single test event to Mixpanel to verify the project token
// accepts events. Prints the API response (1 = accepted, 0 = rejected).
const TOKEN = 'fbc611ffa32a79803571f6d6420c00e4';

const payload = [
  {
    event: 'Appsurge Integration Test',
    properties: {
      token: TOKEN,
      time: Math.floor(Date.now() / 1000),
      distinct_id: 'integration-test-agent',
      $insert_id: 'it3-' + Date.now(),
      client: 'mobile',
      os: 'android',
      source: 'agent-verification',
    },
  },
];

const data = JSON.stringify(payload);

fetch('https://api.mixpanel.com/track', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: 'data=' + encodeURIComponent(data) + '&verbose=1',
})
  .then((r) => r.text())
  .then((t) => console.log('MIXPANEL RESPONSE:', t))
  .catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
