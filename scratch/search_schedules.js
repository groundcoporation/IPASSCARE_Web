import fs from 'fs';

const content = fs.readFileSync('src/pages/admin/AdminPage.tsx', 'utf8');
const lines = content.split('\n');
lines.forEach((line, idx) => {
  if (line.includes('schedules') && line.includes('set') && line.includes('Modal')) {
    console.log(`Line ${idx + 1}: ${line.trim()}`);
  }
  if (line.includes('tab === "schedule"')) {
    console.log(`Line ${idx + 1}: ${line.trim()}`);
  }
});
