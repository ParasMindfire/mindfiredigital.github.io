import https from "https";
import fs from "fs";
import path from "path";

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  GITHUB_TOKEN: "",
  OWNER: "mindfiredigital",

  // Input files
  CONTRIBUTORS_FILE: "./src/app/projects/assets/contributors.json",
  PROJECTS_FILE: "./src/app/projects/assets/projects.json",
  CONTRIBUTOR_MAPPING_FILE:
    "./src/app/projects/assets/contributor-mapping.json",

  // Output cache file
  CACHE_FILE: "./src/app/projects/assets/leaderboard-cache.json",

  // Special projects to include (check ALL contributors for these)
  SPECIAL_PROJECTS: [
    {
      id: "special-website",
      title: "Mindfire Digital Website",
      repoName: "mindfiredigital.github.io",
    },
  ],

  // Bot filtering
  SKIP_BOTS: true,
  BOT_PATTERNS: [
    "github-actions",
    "dependabot",
    "renovate",
    "snyk-bot",
    "codecov",
    "greenkeeper",
    "[bot]",
  ],

  // API settings
  DELAY_MS: 100,
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchGitHub(url) {
  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        Authorization: `Bearer ${CONFIG.GITHUB_TOKEN}`,
        "User-Agent": "GitHub-Leaderboard-Fetcher",
        Accept: "application/vnd.github.v3+json",
      },
    };

    https
      .get(url, options, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          if (res.statusCode !== 200) {
            reject(new Error(`HTTP ${res.statusCode}: ${data}`));
          } else {
            resolve(JSON.parse(data));
          }
        });
      })
      .on("error", reject);
  });
}

function isBot(username) {
  if (!username) return false;
  const lower = username.toLowerCase();
  return CONFIG.BOT_PATTERNS.some((pattern) =>
    lower.includes(pattern.toLowerCase())
  );
}

function readJsonFile(filePath) {
  try {
    const fullPath = path.resolve(filePath);
    if (!fs.existsSync(fullPath)) {
      console.warn(`⚠️  File not found: ${filePath}`);
      return null;
    }
    const data = fs.readFileSync(fullPath, "utf8");
    return JSON.parse(data);
  } catch (error) {
    console.error(`❌ Error reading ${filePath}:`, error.message);
    return null;
  }
}

function writeJsonFile(filePath, data) {
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
    return true;
  } catch (error) {
    console.error(`❌ Error writing to ${filePath}:`, error.message);
    return false;
  }
}

// ============================================================================
// FETCH DEFAULT BRANCH
// ============================================================================

async function fetchDefaultBranch(owner, repo) {
  try {
    const url = `https://api.github.com/repos/${owner}/${repo}`;
    await delay(CONFIG.DELAY_MS);
    const repoData = await fetchGitHub(url);
    return repoData.default_branch;
  } catch (error) {
    console.error(`   ⚠️ Error fetching default branch: ${error.message}`);
    return "main";
  }
}

// ============================================================================
// FETCH ALL COMMITS FROM DEFAULT BRANCH
// ============================================================================

async function fetchAllCommitsFromDefaultBranch(owner, repo, defaultBranch) {
  console.log(`   🔍 Fetching commits from ${defaultBranch}...`);
  let page = 1;
  let allCommits = [];
  let apiCalls = 0;

  while (true) {
    const url = `https://api.github.com/repos/${owner}/${repo}/commits?sha=${defaultBranch}&per_page=100&page=${page}`;

    try {
      await delay(CONFIG.DELAY_MS);
      const commits = await fetchGitHub(url);
      apiCalls++;

      if (!commits || commits.length === 0) break;

      // Filter out bot commits
      const humanCommits = commits.filter(
        (c) => !isBot(c.author?.login) && !isBot(c.commit?.author?.name)
      );

      allCommits = allCommits.concat(humanCommits);

      if (commits.length < 100) break;
      page++;
    } catch (error) {
      console.error(`      ⚠️ Error fetching commits: ${error.message}`);
      break;
    }
  }

  console.log(
    `   ✅ Found ${allCommits.length} commits (${apiCalls} API calls)`
  );
  return allCommits;
}

// ============================================================================
// FETCH ALL MERGED PRS TO DEFAULT BRANCH
// ============================================================================

async function fetchAllMergedPRsToDefault(owner, repo, defaultBranch) {
  console.log(`   🔍 Fetching merged PRs to ${defaultBranch}...`);
  let page = 1;
  let allPRs = [];
  let apiCalls = 0;

  while (true) {
    const url = `https://api.github.com/repos/${owner}/${repo}/pulls?state=closed&per_page=100&page=${page}&sort=updated&direction=desc`;

    try {
      await delay(CONFIG.DELAY_MS);
      const prs = await fetchGitHub(url);
      apiCalls++;

      if (!prs || prs.length === 0) break;

      // Filter: only merged PRs to default branch
      const mergedPRs = prs.filter((pr) => {
        const isDefaultBranch = pr.base?.ref === defaultBranch;
        const isMerged = pr.merged_at !== null;
        const notBot = !isBot(pr.user?.login);
        return isDefaultBranch && isMerged && notBot;
      });

      allPRs = allPRs.concat(mergedPRs);

      if (prs.length < 100) break;
      page++;
    } catch (error) {
      console.error(`      ⚠️ Error fetching PRs: ${error.message}`);
      break;
    }
  }

  console.log(
    `   ✅ Found ${allPRs.length} merged PRs (${apiCalls} API calls)`
  );
  return allPRs;
}

// ============================================================================
// FETCH CATEGORIZED ISSUES
// ============================================================================

async function fetchCategorizedIssues(owner, repo) {
  console.log(`   🔍 Fetching categorized issues...`);
  let page = 1;
  const issues = {
    bugs: [],
    enhancements: [],
    documentation: [],
    others: [],
  };
  let apiCalls = 0;

  while (true) {
    const url = `https://api.github.com/repos/${owner}/${repo}/issues?state=all&per_page=100&page=${page}`;

    try {
      await delay(CONFIG.DELAY_MS);
      const allIssues = await fetchGitHub(url);
      apiCalls++;

      if (!allIssues || allIssues.length === 0) break;

      for (const issue of allIssues) {
        // Skip pull requests
        if (issue.pull_request) continue;

        // Skip bot issues
        if (isBot(issue.user?.login)) continue;

        const labels = issue.labels.map((label) => label.name.toLowerCase());
        const issueData = {
          number: issue.number,
          author: issue.user?.login,
          title: issue.title,
          labels: labels,
          created_at: issue.created_at,
          state: issue.state,
        };

        // Categorize based on labels
        if (labels.some((l) => l.includes("bug") || l.includes("fix"))) {
          issues.bugs.push(issueData);
        } else if (
          labels.some(
            (l) =>
              l.includes("enhancement") ||
              l.includes("feature") ||
              l.includes("improvement")
          )
        ) {
          issues.enhancements.push(issueData);
        } else if (
          labels.some(
            (l) =>
              l.includes("documentation") ||
              l.includes("docs") ||
              l.includes("doc")
          )
        ) {
          issues.documentation.push(issueData);
        } else {
          issues.others.push(issueData);
        }
      }

      if (allIssues.length < 100) break;
      page++;
    } catch (error) {
      console.error(`      ⚠️ Error fetching issues: ${error.message}`);
      break;
    }
  }

  console.log(
    `   ✅ Found ${issues.bugs.length} bugs, ${issues.enhancements.length} enhancements, ${issues.documentation.length} docs, ${issues.others.length} others (${apiCalls} API calls)`
  );
  return issues;
}

// ============================================================================
// PROCESS SINGLE PROJECT
// ============================================================================

async function processProject(projectId, projectTitle, repoName) {
  console.log(`\n📊 Processing: ${projectTitle}`);

  try {
    // Step 1: Get default branch
    const defaultBranch = await fetchDefaultBranch(CONFIG.OWNER, repoName);
    console.log(`   🌿 Default branch: ${defaultBranch}`);

    // Step 2: Fetch all data in parallel
    const [commits, mergedPRs, issues] = await Promise.all([
      fetchAllCommitsFromDefaultBranch(CONFIG.OWNER, repoName, defaultBranch),
      fetchAllMergedPRsToDefault(CONFIG.OWNER, repoName, defaultBranch),
      fetchCategorizedIssues(CONFIG.OWNER, repoName),
    ]);

    return {
      project_id: projectId,
      project_title: projectTitle,
      repo_name: repoName,
      default_branch: defaultBranch,
      fetched_at: new Date().toISOString(),
      commits: commits.map((c) => ({
        sha: c.sha,
        author_login: c.author?.login || null,
        author_name: c.commit?.author?.name || null,
        date: c.commit?.author?.date || null,
        message: c.commit?.message || null,
      })),
      merged_prs: mergedPRs.map((pr) => ({
        number: pr.number,
        author: pr.user?.login,
        title: pr.title,
        merged_at: pr.merged_at,
        created_at: pr.created_at,
      })),
      issues: {
        bugs: issues.bugs.map((i) => ({
          number: i.number,
          author: i.author,
          title: i.title,
          created_at: i.created_at,
        })),
        enhancements: issues.enhancements.map((i) => ({
          number: i.number,
          author: i.author,
          title: i.title,
          created_at: i.created_at,
        })),
        documentation: issues.documentation.map((i) => ({
          number: i.number,
          author: i.author,
          title: i.title,
          created_at: i.created_at,
        })),
        others: issues.others.map((i) => ({
          number: i.number,
          author: i.author,
          title: i.title,
          created_at: i.created_at,
        })),
      },
      stats: {
        total_commits: commits.length,
        total_merged_prs: mergedPRs.length,
        total_bugs: issues.bugs.length,
        total_enhancements: issues.enhancements.length,
        total_documentation: issues.documentation.length,
        total_others: issues.others.length,
      },
    };
  } catch (error) {
    console.error(`   ❌ Error processing ${projectTitle}: ${error.message}`);
    return null;
  }
}

// ============================================================================
// MAIN CACHING LOGIC
// ============================================================================

async function cacheLeaderboardData() {
  console.log("\n" + "=".repeat(80));
  console.log("🏆 LEADERBOARD DATA FETCHER");
  console.log("=".repeat(80));
  console.log(`Fetching:`);
  console.log(`  📝 Commits in default branch`);
  console.log(`  🔀 Merged PRs to default branch`);
  console.log(`  🐛 Categorized issues (bugs, enhancements, docs, others)`);
  console.log(`  📊 Project participation\n`);

  // Load files
  const contributors = readJsonFile(CONFIG.CONTRIBUTORS_FILE) || [];
  const projects = readJsonFile(CONFIG.PROJECTS_FILE) || [];
  const contributorMapping =
    readJsonFile(CONFIG.CONTRIBUTOR_MAPPING_FILE) || {};

  if (contributors.length === 0) {
    console.error("❌ No contributors found!");
    return;
  }

  console.log(`📦 Loaded:`);
  console.log(`   Contributors: ${contributors.length}`);
  console.log(`   Projects: ${projects.length}`);
  console.log(`   Special projects: ${CONFIG.SPECIAL_PROJECTS.length}\n`);

  // Filter bots
  const humanContributors = contributors.filter((c) => !isBot(c.login));
  console.log(
    `👥 Human contributors: ${humanContributors.length} (${
      contributors.length - humanContributors.length
    } bots filtered)\n`
  );

  const allProjectsData = {};
  const totalProjects = projects.length + CONFIG.SPECIAL_PROJECTS.length;
  let processedCount = 0;

  // Process regular projects
  for (const project of projects) {
    processedCount++;
    console.log(`\n[${processedCount}/${totalProjects}] 📌 ${project.title}`);

    const repoMatch = (
      project.githubUrl ||
      project.github_repository_link ||
      ""
    ).match(/github\.com\/[^\/]+\/([^\/]+)/);

    if (!repoMatch) {
      console.log(`   ⚠️ Skipping - no valid GitHub URL\n`);
      continue;
    }

    const repoName = repoMatch[1];
    const projectData = await processProject(
      project.id,
      project.title,
      repoName
    );

    if (projectData) {
      allProjectsData[project.id] = projectData;
    }
  }

  // Process special projects (website, etc.)
  // For these, we fetch ALL data and the leaderboard generator will match contributors
  for (const specialProject of CONFIG.SPECIAL_PROJECTS) {
    processedCount++;
    console.log(
      `\n[${processedCount}/${totalProjects}] 🌟 ${specialProject.title}`
    );

    const projectData = await processProject(
      specialProject.id,
      specialProject.title,
      specialProject.repoName
    );

    if (projectData) {
      allProjectsData[specialProject.id] = projectData;
    }
  }

  // Save results
  console.log("\n" + "=".repeat(80));
  console.log("💾 Saving cached data...");
  const success = writeJsonFile(CONFIG.CACHE_FILE, allProjectsData);

  if (success) {
    const stats = {
      totalProjects: Object.keys(allProjectsData).length,
      totalCommits: Object.values(allProjectsData).reduce(
        (sum, p) => sum + (p.stats?.total_commits || 0),
        0
      ),
      totalMergedPRs: Object.values(allProjectsData).reduce(
        (sum, p) => sum + (p.stats?.total_merged_prs || 0),
        0
      ),
      totalIssues: Object.values(allProjectsData).reduce(
        (sum, p) =>
          sum +
          (p.stats?.total_bugs || 0) +
          (p.stats?.total_enhancements || 0) +
          (p.stats?.total_documentation || 0) +
          (p.stats?.total_others || 0),
        0
      ),
    };

    console.log(`✅ Successfully cached:`);
    console.log(`   Projects: ${stats.totalProjects}`);
    console.log(`   Total Commits: ${stats.totalCommits}`);
    console.log(`   Total Merged PRs: ${stats.totalMergedPRs}`);
    console.log(`   Total Issues: ${stats.totalIssues}`);
    console.log(`📁 Saved to: ${CONFIG.CACHE_FILE}`);
  }

  console.log("=".repeat(80) + "\n");
  return allProjectsData;
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================

const startTime = Date.now();

cacheLeaderboardData()
  .then(() => {
    const duration = Math.round((Date.now() - startTime) / 1000);
    const minutes = Math.floor(duration / 60);
    const seconds = duration % 60;
    console.log(`✅ Completed in ${minutes}m ${seconds}s`);
  })
  .catch((error) => {
    console.error("\n❌ Fatal error:", error);
    console.error(error.stack);
    process.exit(1);
  });
