import fs from 'fs';

const content = fs.readFileSync('src/components/admin/AdminPage.tsx', 'utf8');
const lines = content.split('\n');
for (let i = 1395; i < 1475; i++) {
  console.log(`${i + 1}: ${lines[i]}`);
}
