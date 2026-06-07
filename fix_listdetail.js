const fs = require('fs');
let f = fs.readFileSync('src/screens/ListDetailScreen.tsx', 'utf8');

// 1. Remove flex:1 from pil.t - it compresses text width to 0 in fluid mode
f = f.replace("t: { color: '#2D3436', fontWeight: '600', flex: 1 }", "t: { color: '#2D3436', fontWeight: '600' }");

// 2. Restore gallery to vertical column layout (v7.0 behavior)
f = f.replace(
  "galleryContainer: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 12, paddingTop: 10, paddingBottom: 100, gap: 12 }",
  "galleryContainer: { flexDirection: 'column', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 60, paddingTop: 12, gap: 12 }"
);

fs.writeFileSync('src/screens/ListDetailScreen.tsx', f);
console.log('Fixed: pil.t flex:1 removed, gallery restored to column layout');