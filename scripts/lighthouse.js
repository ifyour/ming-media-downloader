import lighthouse from 'lighthouse';
import * as chromeLauncher from 'chrome-launcher';
import fs from 'fs';

const chrome = await chromeLauncher.launch({ chromeFlags: ['--headless'] });
const options = {
  logLevel: 'info',
  output: 'html',
  onlyCategories: ['performance', 'pwa', 'accessibility', 'best-practices', 'seo'],
  port: chrome.port,
};

const runnerResult = await lighthouse('http://localhost:4173/', options);

const reportHtml = runnerResult.report;
fs.writeFileSync('lighthouse-report.html', reportHtml);

console.log('Report saved to lighthouse-report.html');
console.log('Performance:', runnerResult.lhr.categories.performance.score * 100);
console.log('PWA:', runnerResult.lhr.categories.pwa?.score * 100 || 'N/A');
console.log('Accessibility:', runnerResult.lhr.categories.accessibility.score * 100);
console.log('Best Practices:', runnerResult.lhr.categories['best-practices'].score * 100);
console.log('SEO:', runnerResult.lhr.categories.seo.score * 100);

await chrome.kill();