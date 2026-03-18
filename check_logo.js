const fs = require('fs');
const path = require('path');

const logo = path.join(__dirname, 'assets', 'logo.png');
const buffer = fs.readFileSync(logo);
// PNG signature: 89 50 4e 47 0d 0a 1a 0a
if (buffer.readUInt32BE(0) === 0x89504E47) {
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  console.log(`Logo dimensions: ${width}x${height}`);
} else {
  console.log('Not a PNG');
}
