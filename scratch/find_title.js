import fs from 'fs';
import path from 'path';

function walkDir(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    let dirPath = path.join(dir, f);
    let isDirectory = fs.statSync(dirPath).isDirectory();
    if (isDirectory) {
      walkDir(dirPath, callback);
    } else {
      callback(dirPath);
    }
  });
}

console.log("Searching for document.title or 'ipasscare-web'...");
walkDir('src', (filePath) => {
  if (filePath.endsWith('.tsx') || filePath.endsWith('.ts')) {
    const content = fs.readFileSync(filePath, 'utf8');
    if (content.includes('document.title') || content.includes('ipasscare-web')) {
      console.log(`Found match in: ${filePath}`);
      // Log line containing match
      const lines = content.split('\n');
      lines.forEach((line, idx) => {
        if (line.includes('document.title') || line.includes('ipasscare-web')) {
          console.log(`  Line ${idx + 1}: ${line.trim()}`);
        }
      });
    }
  }
});
