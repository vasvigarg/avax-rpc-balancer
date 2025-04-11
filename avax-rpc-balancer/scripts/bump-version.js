const fs = require('fs');
const path = require('path');

const versionFile = path.join(__dirname, '../version.json');
const packageFile = path.join(__dirname, '../package.json');

// Read current versions
const versionData = JSON.parse(fs.readFileSync(versionFile, 'utf8'));
const packageData = JSON.parse(fs.readFileSync(packageFile, 'utf8'));

// Parse version components
const [major, minor, patch] = versionData.version.split('.').map(Number);

// Determine bump type from args
const bumpType = process.argv[2] || 'patch';

// Calculate new version
let newVersion;
switch (bumpType) {
  case 'major':
    newVersion = `${major + 1}.0.0`;
    break;
  case 'minor':
    newVersion = `${major}.${minor + 1}.0`;
    break;
  default:
    newVersion = `${major}.${minor}.${patch + 1}`;
}

// Update files
versionData.version = newVersion;
packageData.version = newVersion;

fs.writeFileSync(versionFile, JSON.stringify(versionData, null, 2));
fs.writeFileSync(packageFile, JSON.stringify(packageData, null, 2));

console.log(`Version bumped to ${newVersion}`);