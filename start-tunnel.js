// 一键点火脚本：Expo + bore 隧道 + 终端二维码
const { spawn } = require('child_process');

console.log('\n🔥 点火中...\n');

// 1. 启动 Expo localhost
const expo = spawn('npx', ['expo', 'start', '--localhost', '--port', '8081'], {
  stdio: 'inherit',
  cwd: __dirname,
  shell: true,
});

// 2. 启动 bore 隧道
const bore = spawn('npx', ['bore', 'local', '8081', '--to', 'bore.pub'], {
  stdio: 'pipe',
  shell: true,
});

let tunnelUrl = '';

bore.stdout.on('data', (data) => {
  const text = data.toString();
  process.stdout.write(text); // 原样输出
  const match = text.match(/listening at bore\.pub:(\d+)/i);
  if (match && !tunnelUrl) {
    const port = match[1];
    tunnelUrl = `exp://bore.pub:${port}`;
    console.log('\n✅ 隧道已打通:', tunnelUrl, '\n');

    // 3. 终端打印二维码
    const qr = spawn('npx', ['-y', 'qrcode-terminal', tunnelUrl], {
      stdio: 'inherit',
      shell: true,
    });
    qr.on('close', () => {
      console.log('📱 拿出 iPhone 扫上方二维码即可打开 App\n');
    });
  }
});

bore.stderr.on('data', (d) => process.stderr.write(d));

// cleanup
process.on('SIGINT', () => { expo.kill(); bore.kill(); process.exit(); });
process.on('exit', () => { expo.kill(); bore.kill(); });