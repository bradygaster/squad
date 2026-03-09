#!/usr/bin/env node
/**
 * Squad Adoption Monitor
 * Daily automated tracking of Squad adoption metrics (Tier 1 automation)
 * 
 * Collects:
 * - GitHub repo metrics (stars, forks, watchers)
 * - Code search results (package.json imports, squad.agent.md files)
 * - npm download stats (weekly downloads)
 * - Recent forks and stargazers
 * 
 * Generates markdown reports in .squad/adoption/reports/{YYYY-MM-DD}.md
 */

import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const REPO_OWNER = 'bradygaster';
const REPO_NAME = 'squad';

async function fetchWithRetry(url, options = {}, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, options);
      
      // Check rate limit
      const remaining = response.headers.get('x-ratelimit-remaining');
      if (remaining && parseInt(remaining) < 10) {
        console.warn(`⚠️  GitHub API rate limit low: ${remaining} requests remaining`);
      }
      
      if (!response.ok && response.status !== 422) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      return response;
    } catch (error) {
      if (i === retries - 1) throw error;
      console.log(`Retry ${i + 1}/${retries} for ${url}`);
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
  throw new Error('Max retries exceeded');
}

async function getRepoMetrics() {
  const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}`;
  const response = await fetchWithRetry(url, {
    headers: {
      'Authorization': `Bearer ${GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'Squad-Adoption-Monitor'
    }
  });
  
  const data = await response.json();
  return {
    stars: data.stargazers_count || 0,
    forks: data.forks_count || 0,
    watchers: data.subscribers_count || 0
  };
}

async function searchCode(query) {
  const url = `https://api.github.com/search/code?q=${encodeURIComponent(query)}&per_page=1`;
  
  try {
    const response = await fetchWithRetry(url, {
      headers: {
        'Authorization': `Bearer ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Squad-Adoption-Monitor'
      }
    });
    
    const data = await response.json();
    return data.total_count || 0;
  } catch (error) {
    console.warn(`⚠️  Code search failed for "${query}": ${error && error.message ? error.message : 'Unknown error'}`);
    return 0;
  }
}

async function getSearchResults() {
  // Search for repos using Squad in package.json
  const packageJsonCount = await searchCode('"@bradygaster/squad" filename:package.json');
  
  // Search for repos with squad.agent.md files
  const agentMdCount = await searchCode('path:.github/agents filename:squad.agent.md');
  
  return { packageJsonCount, agentMdCount };
}

async function getNpmDownloads() {
  try {
    const [sdkResponse, cliResponse] = await Promise.all([
      fetch('https://api.npmjs.org/downloads/point/last-week/@bradygaster/squad-sdk'),
      fetch('https://api.npmjs.org/downloads/point/last-week/@bradygaster/squad-cli')
    ]);
    
    const sdkData = sdkResponse.ok ? await sdkResponse.json() : { downloads: 0 };
    const cliData = cliResponse.ok ? await cliResponse.json() : { downloads: 0 };
    
    return {
      sdk: sdkData.downloads || 0,
      cli: cliData.downloads || 0
    };
  } catch (error) {
    console.warn(`⚠️  npm API failed: ${error && error.message ? error.message : 'Unknown error'}`);
    return { sdk: 0, cli: 0 };
  }
}

async function getRecentForks() {
  const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/forks?sort=newest&per_page=30`;
  
  try {
    const response = await fetchWithRetry(url, {
      headers: {
        'Authorization': `Bearer ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Squad-Adoption-Monitor'
      }
    });
    
    const forks = await response.json();
    
    // Filter to last 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    return forks
      .filter(fork => new Date(fork.created_at) > sevenDaysAgo)
      .map(fork => ({
        owner: fork.owner,
        full_name: fork.full_name,
        created_at: fork.created_at,
        stargazers_count: fork.stargazers_count,
        language: fork.language,
        description: fork.description
      }));
  } catch (error) {
    console.warn(`⚠️  Failed to fetch recent forks: ${error && error.message ? error.message : 'Unknown error'}`);
    return [];
  }
}

async function getPreviousReport() {
  const reportsDir = join(REPO_ROOT, '.squad/adoption/reports');
  
  try {
    const files = await readdir(reportsDir);
    const reportFiles = files
      .filter(f => f.endsWith('.md') && f !== '.gitkeep')
      .sort()
      .reverse();
    
    if (reportFiles.length === 0) return null;
    
    const previousReportPath = join(reportsDir, reportFiles[0]);
    const content = await readFile(previousReportPath, 'utf-8');
    
    // Parse previous metrics from markdown
    const starsMatch = content.match(/\*\*Stars:\*\* (\d+)/);
    const forksMatch = content.match(/\*\*Forks:\*\* (\d+)/);
    const sdkMatch = content.match(/squad-sdk: (\d+)/);
    const cliMatch = content.match(/squad-cli: (\d+)/);
    const packageMatch = content.match(/\*\*Repos using Squad:\*\* ~?(\d+)/);
    const agentMatch = content.match(/\*\*Repos with squad\.agent\.md:\*\* ~?(\d+)/);
    
    return {
      date: reportFiles[0].replace('.md', ''),
      stars: starsMatch ? parseInt(starsMatch[1]) : 0,
      forks: forksMatch ? parseInt(forksMatch[1]) : 0,
      npmSdk: sdkMatch ? parseInt(sdkMatch[1]) : 0,
      npmCli: cliMatch ? parseInt(cliMatch[1]) : 0,
      packageJsonCount: packageMatch ? parseInt(packageMatch[1]) : 0,
      agentMdCount: agentMatch ? parseInt(agentMatch[1]) : 0
    };
  } catch (error) {
    return null;
  }
}

function calculateDelta(current, previous) {
  const delta = current - previous;
  if (delta === 0) return '(no change)';
  return delta > 0 ? `(+${delta} this week)` : `(${delta} this week)`;
}

function calculatePercentage(current, previous) {
  if (previous === 0) return 'N/A';
  const percentage = ((current - previous) / previous * 100).toFixed(1);
  return `${percentage}%`;
}

async function generateReport() {
  console.log('🚀 Collecting adoption metrics...\n');
  
  if (!GITHUB_TOKEN) {
    throw new Error('GITHUB_TOKEN environment variable is required');
  }
  
  const [repoMetrics, searchResults, npmDownloads, recentForks, previousReport] = await Promise.all([
    getRepoMetrics(),
    getSearchResults(),
    getNpmDownloads(),
    getRecentForks(),
    getPreviousReport()
  ]);
  
  const today = new Date().toISOString().split('T')[0];
  
  console.log('📊 Current metrics:');
  console.log(`   Stars: ${repoMetrics.stars}`);
  console.log(`   Forks: ${repoMetrics.forks}`);
  console.log(`   Watchers: ${repoMetrics.watchers}`);
  console.log(`   npm downloads (7d): SDK ${npmDownloads.sdk}, CLI ${npmDownloads.cli}`);
  console.log(`   Repos using Squad: ~${searchResults.packageJsonCount}`);
  console.log(`   Repos with squad.agent.md: ~${searchResults.agentMdCount}`);
  console.log(`   Recent forks (7d): ${recentForks.length}\n`);
  
  const report = `# Squad adoption report — ${today}

## Momentum metrics

- **Stars:** ${repoMetrics.stars} ${previousReport ? calculateDelta(repoMetrics.stars, previousReport.stars) : ''}
- **Forks:** ${repoMetrics.forks} ${previousReport ? calculateDelta(repoMetrics.forks, previousReport.forks) : ''}
- **Watchers:** ${repoMetrics.watchers}
- **npm downloads (7d):** squad-sdk: ${npmDownloads.sdk}${previousReport ? ` ${calculateDelta(npmDownloads.sdk, previousReport.npmSdk)}` : ''}, squad-cli: ${npmDownloads.cli}${previousReport ? ` ${calculateDelta(npmDownloads.cli, previousReport.npmCli)}` : ''}
- **Repos using Squad:** ~${searchResults.packageJsonCount} ${previousReport ? calculateDelta(searchResults.packageJsonCount, previousReport.packageJsonCount) : '(code search)'}
- **Repos with squad.agent.md:** ~${searchResults.agentMdCount} ${previousReport ? calculateDelta(searchResults.agentMdCount, previousReport.agentMdCount) : '(code search)'}

## New adopters (this week)

${recentForks.length > 0 ? `| Repo | Stars | Language | Description |
|------|-------|----------|-------------|
${recentForks.map(fork => `| ${fork.full_name} | ${fork.stargazers_count} | ${fork.language || 'N/A'} | ${(fork.description || 'No description').substring(0, 60)} |`).join('\n')}` : '_No new forks this week_'}

## Trend

${previousReport ? `- **Week-over-week star growth:** ${calculatePercentage(repoMetrics.stars, previousReport.stars)}
- **New forks this week:** ${recentForks.length}
- **npm download trend (SDK):** ${npmDownloads.sdk > previousReport.npmSdk ? '📈 Growing' : npmDownloads.sdk < previousReport.npmSdk ? '📉 Declining' : '➡️ Stable'}
- **Adoption velocity:** ${searchResults.packageJsonCount > previousReport.packageJsonCount ? '🚀 Accelerating' : searchResults.packageJsonCount < previousReport.packageJsonCount ? '🐌 Slowing' : '➡️ Steady'}` : '_First report — no trend data yet_'}

---

*Generated by [Squad Adoption Monitor](../../scripts/adoption-monitor.mjs)*
*Next report: ${new Date(Date.now() + 86400000).toISOString().split('T')[0]}*
`;
  
  const reportPath = join(REPO_ROOT, '.squad/adoption/reports', `${today}.md`);
  await writeFile(reportPath, report, 'utf-8');
  
  console.log(`✅ Report generated: ${reportPath}`);
}

// Run
generateReport().catch(error => {
  console.error('❌ Adoption monitor failed:', error);
  process.exit(1);
});
