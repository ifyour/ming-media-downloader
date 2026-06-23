import { spawn } from 'child_process';
import { setTimeout } from 'timers/promises';
import lighthouse from 'lighthouse';
import * as chromeLauncher from 'chrome-launcher';
import fs from 'fs';

const preview = spawn('pnpm', ['preview', '--port', '4173'], {
  stdio: 'inherit',
  shell: true,
  cwd: process.cwd()
});

await setTimeout(3000);

const chrome = await chromeLauncher.launch({ chromeFlags: ['--headless'] });
const config = {
  extends: 'lighthouse:default',
  settings: {
    formFactor: 'mobile',
    throttling: {
      rttMs: 150,
      throughputKbps: 1638.4,
      cpuSlowdownMultiplier: 4,
      requestLatencyMs: 562.5,
      downloadThroughputKbps: 1474.5600000000002,
      uploadThroughputKbps: 675,
    },
    screenEmulation: {
      mobile: true,
      width: 360,
      height: 640,
      deviceScaleFactor: 2,
      disabled: false,
    },
    emulatedUserAgent: 'Mozilla/5.0 (Linux; Android 11; moto g power (2022)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Mobile Safari/537.36',
  },
};
const options = {
  logLevel: 'info',
  output: 'html',
  port: chrome.port,
};

try {
  const runnerResult = await lighthouse('http://localhost:4173/', options, config);
  const reportHtml = runnerResult.report;
  fs.writeFileSync('lighthouse-report.html', reportHtml);

  console.log('\n=== Lighthouse Results ===');
  console.log('Performance:', runnerResult.lhr.categories.performance.score * 100);
  console.log('Accessibility:', runnerResult.lhr.categories.accessibility.score * 100);
  console.log('Best Practices:', runnerResult.lhr.categories['best-practices'].score * 100);
  console.log('SEO:', runnerResult.lhr.categories.seo.score * 100);
  console.log('Report saved to lighthouse-report.html');
} finally {
  await chrome.kill();
  preview.kill();
}