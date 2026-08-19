import fs from 'fs';

const content = fs.readFileSync('src/components/admin/AdminPage.tsx', 'utf8');
const lines = content.split('\n');
lines.forEach((line, idx) => {
  if (line.includes('from("payments")') || line.includes('select(') && line.includes('payments')) {
    console.log(`Line ${idx + 1}: ${line.trim()}`);
  }
  if (line.includes('products:')) {
    console.log(`Line ${idx + 1}: ${line.trim()}`);
  }
});
