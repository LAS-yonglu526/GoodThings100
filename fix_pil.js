const fs = require('fs');
let f = fs.readFileSync('src/screens/ListDetailScreen.tsx', 'utf8');
f = f.replace('lineHeight: 24', '');
fs.writeFileSync('src/screens/ListDetailScreen.tsx', f);
console.log('pil.t lineHeight removed');