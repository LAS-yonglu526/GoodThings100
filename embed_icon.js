const fs = require('fs');
const sharp = require('sharp');

async function embed() {
  const icon = await sharp('assets/icon.png')
    .resize(256, 256)
    .png()
    .toBuffer();
  const b64 = 'data:image/png;base64,' + icon.toString('base64');
  let html = fs.readFileSync('download.html', 'utf8');
  html = html.replace(
    '<div class="logo">✨</div>',
    `<div class="logo"><img src="${b64}" style="width:96px;height:96px;border-radius:24px;object-fit:cover"></div>`
  );
  fs.writeFileSync('download.html', html);
  console.log('embedded');
}

embed();