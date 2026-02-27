const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'controller', 'auth', 'auth.controller.ts');
const content = fs.readFileSync(filePath, 'utf8').split('\n');

// Lines are 1-indexed. Line 38 to 177 (inclusive) need to be removed.
// Indices are 0-indexed. Index 37 to 176.
const startDelete = 37;
const endDelete = 176;

const newContent = content.filter((_, index) => index < startDelete || index > endDelete);

fs.writeFileSync(filePath, newContent.join('\n'), 'utf8');
console.log('Successfully removed lines 38 to 177 from auth.controller.ts');
