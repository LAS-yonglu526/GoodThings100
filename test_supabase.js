const https = require('https');

const HOST = 'kbkvdsavgsiikscqengi.supabase.co';
const API_KEY = 'sb_publishable__eEKJReopqi6U5BgrySAog_8jNrhJWc';

function request(method, path, body) {
  return new Promise((resolve) => {
    const req = https.request({
      hostname: HOST, path, method,
      rejectUnauthorized: false,
      headers: { apikey: API_KEY, 'Content-Type': 'application/json' }
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, body: data.slice(0, 300) }));
    });
    req.on('error', (e) => resolve({ error: e.message }));
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function main() {
  console.log('🔍 测试 Supabase 连通性...\n');

  // Test 1: Auth health
  const r1 = await request('GET', '/auth/v1/health');
  console.log('1. Auth health:', r1.status || r1.error);

  // Test 2: OTP endpoint
  const r2 = await request('POST', '/auth/v1/otp', { email: 'test@example.com' });
  console.log('2. OTP (预期 429 限流):', r2.status, r2.body?.slice(0, 100));

  // Test 3: Password login (wrong pw, expected 400)
  const r3 = await request('POST', '/auth/v1/token?grant_type=password', { email: 'test@test.com', password: 'wrong' });
  console.log('3. Password login (预期 400):', r3.status, r3.body?.slice(0, 100));

  console.log('\n✅ Supabase 服务器连通状态确认完毕');
}

main();