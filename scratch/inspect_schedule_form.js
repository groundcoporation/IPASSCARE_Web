import fs from 'fs';

const content = fs.readFileSync('src/components/admin/AdminPage.tsx', 'utf8');
const lines = content.split('\n');

console.log("Searching for schedule modals or input fields in AdminPage.tsx...");
lines.forEach((line, idx) => {
  if (line.includes('class_schedules') && (line.includes('insert') || line.includes('upsert') || line.includes('update'))) {
    console.log(`Line ${idx + 1}: ${line.trim()}`);
  }
  if (line.includes('target_class') && line.includes('input') && line.includes('value')) {
    console.log(`Line ${idx + 1}: ${line.trim()}`);
  }
});
