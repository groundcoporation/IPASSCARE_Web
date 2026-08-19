import fs from 'fs';

const content = fs.readFileSync('src/components/admin/AdminPage.tsx', 'utf8');
const lines = content.split('\n');
lines.forEach((line, idx) => {
  if (line.includes('partnerLogoUrl') || line.includes('logo_url')) {
    console.log(`Line ${idx + 1}: ${line.trim()}`);
  }
});
