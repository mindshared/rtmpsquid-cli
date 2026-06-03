#!/usr/bin/env node

// Platform Compatibility Check for RTMP Squid CLI

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('\n╔════════════════════════════════════════════════════════╗');
console.log('║  RTMP Squid CLI - Platform Compatibility Check        ║');
console.log('╚════════════════════════════════════════════════════════╝\n');

const checks = [];

// Check 1: Platform
console.log('📋 System Information:');
console.log(`   Platform: ${process.platform}`);
console.log(`   Architecture: ${process.arch}`);
console.log(`   Node.js: ${process.version}`);

const minNodeVersion = 18;
const currentVersion = parseInt(process.version.slice(1).split('.')[0]);

if (currentVersion >= minNodeVersion) {
  checks.push({ name: 'Node.js Version', status: 'PASS', detail: process.version });
} else {
  checks.push({ name: 'Node.js Version', status: 'FAIL', detail: `${process.version} (need v${minNodeVersion}+)` });
}

// Check 2: FFmpeg
console.log('\n🎥 Checking FFmpeg:');
try {
  const ffmpegVersion = execSync('ffmpeg -version 2>&1 | head -1', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
  console.log(`   ${ffmpegVersion.trim()}`);
  checks.push({ name: 'FFmpeg', status: 'PASS', detail: 'Installed' });
} catch (error) {
  console.log('   ✗ FFmpeg not found');
  checks.push({ name: 'FFmpeg', status: 'FAIL', detail: 'Not installed' });
}

// Check 3: Dependencies
console.log('\n📦 Checking Dependencies:');
const packageJsonPath = path.join(__dirname, 'package.json');
if (fs.existsSync(packageJsonPath)) {
  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
  const deps = Object.keys(pkg.dependencies || {});
  
  const nodeModulesPath = path.join(__dirname, 'node_modules');
  if (fs.existsSync(nodeModulesPath)) {
    let allInstalled = true;
    deps.forEach(dep => {
      const depPath = path.join(nodeModulesPath, dep);
      if (fs.existsSync(depPath)) {
        console.log(`   ✓ ${dep}`);
      } else {
        console.log(`   ✗ ${dep} (missing)`);
        allInstalled = false;
      }
    });
    
    if (allInstalled) {
      checks.push({ name: 'Dependencies', status: 'PASS', detail: `${deps.length} packages` });
    } else {
      checks.push({ name: 'Dependencies', status: 'FAIL', detail: 'Run npm install' });
    }
  } else {
    console.log('   ✗ node_modules not found');
    checks.push({ name: 'Dependencies', status: 'FAIL', detail: 'Run npm install' });
  }
} else {
  checks.push({ name: 'Dependencies', status: 'FAIL', detail: 'package.json not found' });
}

// Check 4: File permissions
console.log('\n🔐 Checking File Permissions:');
const files = ['stream.js', 'start.sh'];
files.forEach(file => {
  const filePath = path.join(__dirname, file);
  if (fs.existsSync(filePath)) {
    try {
      fs.accessSync(filePath, fs.constants.X_OK);
      console.log(`   ✓ ${file} (executable)`);
    } catch {
      console.log(`   ⚠ ${file} (not executable - run: chmod +x ${file})`);
    }
  } else {
    console.log(`   ✗ ${file} (not found)`);
  }
});

// Check 5: Test video folder access
console.log('\n📁 File System Access:');
try {
  const testDir = path.join(__dirname, '.test_dir_' + Date.now());
  fs.mkdirSync(testDir);
  fs.rmdirSync(testDir);
  console.log('   ✓ Read/Write permissions OK');
  checks.push({ name: 'File System', status: 'PASS', detail: 'Read/Write OK' });
} catch (error) {
  console.log('   ✗ File system access issues');
  checks.push({ name: 'File System', status: 'FAIL', detail: error.message });
}

// Check 6: Network (basic)
console.log('\n🌐 Network:');
console.log('   ✓ No special ports required (outbound only)');
checks.push({ name: 'Network', status: 'PASS', detail: 'Outbound only' });

// Summary
console.log('\n' + '═'.repeat(56));
console.log('📊 COMPATIBILITY SUMMARY:');
console.log('═'.repeat(56));

let passed = 0;
let failed = 0;

checks.forEach(check => {
  const icon = check.status === 'PASS' ? '✓' : '✗';
  const status = check.status === 'PASS' ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m';
  console.log(`   ${icon} ${check.name.padEnd(20)} ${status}  ${check.detail}`);
  
  if (check.status === 'PASS') passed++;
  else failed++;
});

console.log('═'.repeat(56));

if (failed === 0) {
  console.log('\n✅ All checks passed! Your system is ready to run RTMP Squid CLI.\n');
  console.log('   Run: ./start.sh (Linux/macOS) or start.bat (Windows)\n');
  process.exit(0);
} else {
  console.log(`\n⚠️  ${failed} check(s) failed. Please fix the issues above.\n`);
  
  if (checks.find(c => c.name === 'Node.js Version' && c.status === 'FAIL')) {
    console.log('   → Install Node.js 18+: https://nodejs.org/\n');
  }
  
  if (checks.find(c => c.name === 'FFmpeg' && c.status === 'FAIL')) {
    console.log('   → Install FFmpeg:');
    console.log('     • Ubuntu/Debian: sudo apt install ffmpeg');
    console.log('     • macOS: brew install ffmpeg');
    console.log('     • Windows: https://ffmpeg.org/download.html\n');
  }
  
  if (checks.find(c => c.name === 'Dependencies' && c.status === 'FAIL')) {
    console.log('   → Install dependencies: npm install\n');
  }
  
  process.exit(1);
}

