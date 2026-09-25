const fs = require('fs');
const src = fs.readFileSync('src/App.tsx', 'utf8');
const lines = src.split('\n');
console.log('Total lines:', lines.length);
console.log('Last 5 lines:');
for (let i = lines.length - 5; i < lines.length; i++) {
  console.log((i+1) + ': ' + JSON.stringify(lines[i]));
}
console.log('\nLast char code:', src.charCodeAt(src.length - 1));
console.log('Second to last:', src.charCodeAt(src.length - 2));
console.log('Third to last:', src.charCodeAt(src.length - 3));