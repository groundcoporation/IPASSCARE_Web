import fs from 'fs';

const content = fs.readFileSync('src/components/admin/AdminPage.tsx', 'utf8');
const lines = content.split('\n');
lines.forEach((line, idx) => {
  if (line.includes('function BranchFilter') || line.includes('const BranchFilter')) {
    console.log(`Line ${idx + 1}: ${line.trim()}`);
  }
});
// Let's print around the BranchFilter rendering in Payments tab to see how it works
lines.forEach((line, idx) => {
  if (line.includes('<BranchFilter')) {
    console.log(`Line ${idx + 1}: ${line.trim()}`);
  }
});
