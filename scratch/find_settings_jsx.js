import fs from 'fs';

const content = fs.readFileSync('src/components/admin/AdminPage.tsx', 'utf8');
const lines = content.split('\n');
lines.forEach((line, idx) => {
  if (line.includes('settings') && line.includes('===') && line.trim().startsWith('{tab')) {
    console.log(`Line ${idx + 1}: ${line.trim()}`);
  }
});
lines.forEach((line, idx) => {
  if (line.includes('tab === "settings"') && line.trim().startsWith('{tab')) {
    console.log(`Line ${idx + 1}: ${line.trim()}`);
  }
  if (line.includes('tab === "partners"') && line.trim().startsWith('{tab')) {
    console.log(`Line ${idx + 1}: ${line.trim()}`);
  }
});
