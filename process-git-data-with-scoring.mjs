import fs from "fs";
import path from "path";

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  // Input files
  INPUT_FILES: {
    contributors: "./src/app/projects/assets/contributors.json",
    projects: "./src/app/projects/assets/projects.json",
    contributorMapping: "./src/app/projects/assets/contributor-mapping.json",
    cachedData: "./src/app/projects/assets/leaderboard-cache.json",
  },

  // Output files
  OUTPUT_FILES: {
    leaderboard: "./src/app/projects/assets/leaderboard.json",
    topScorers: "./src/app/projects/assets/top-scorers.json",
  },

  // Special projects that should be checked for ALL contributors
  SPECIAL_PROJECT_IDS: ["special-website"],
};

// ============================================================================
// SCORING WEIGHTS
// ============================================================================

const SCORING = {
  COMMIT_IN_DEFAULT: 2,
  PR_MERGED_TO_DEFAULT: 5,
  BUG_FIX_ISSUE: 3,
  ENHANCEMENT_ISSUE: 3,
  DOCUMENTATION_ISSUE: 3,
  OTHER_ISSUE: 2,
  PROJECT_PARTICIPATION: 10,
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

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
    console.log(`✅ Successfully wrote to ${filePath}`);
    return true;
  } catch (error) {
    console.error(`❌ Error writing to ${filePath}:`, error.message);
    return false;
  }
}

// ============================================================================
// ANALYZE USER IN PROJECT
// ============================================================================

function analyzeUserInProject(username, projectData) {
  const stats = {
    commits: 0,
    prs: 0,
    issues: {
      bugs: 0,
      enhancements: 0,
      documentation: 0,
      others: 0,
    },
  };

  // Count commits by this user
  if (projectData.commits) {
    stats.commits = projectData.commits.filter(
      (commit) =>
        commit.author_login === username ||
        commit.author_name?.toLowerCase().includes(username.toLowerCase())
    ).length;
  }

  // Count merged PRs by this user
  if (projectData.merged_prs) {
    stats.prs = projectData.merged_prs.filter(
      (pr) => pr.author === username
    ).length;
  }

  // Count categorized issues by this user
  if (projectData.issues) {
    stats.issues.bugs = projectData.issues.bugs.filter(
      (issue) => issue.author === username
    ).length;
    stats.issues.enhancements = projectData.issues.enhancements.filter(
      (issue) => issue.author === username
    ).length;
    stats.issues.documentation = projectData.issues.documentation.filter(
      (issue) => issue.author === username
    ).length;
    stats.issues.others = projectData.issues.others.filter(
      (issue) => issue.author === username
    ).length;
  }

  return stats;
}

// ============================================================================
// CALCULATE SCORE
// ============================================================================

function calculateScore(userStats) {
  const breakdown = {
    commits: userStats.totalCommits * SCORING.COMMIT_IN_DEFAULT,
    prs: userStats.totalPRs * SCORING.PR_MERGED_TO_DEFAULT,
    bugs: userStats.issues.bugs * SCORING.BUG_FIX_ISSUE,
    enhancements: userStats.issues.enhancements * SCORING.ENHANCEMENT_ISSUE,
    documentation: userStats.issues.documentation * SCORING.DOCUMENTATION_ISSUE,
    others: userStats.issues.others * SCORING.OTHER_ISSUE,
    projects: userStats.projectsWorkingOn * SCORING.PROJECT_PARTICIPATION,
  };

  const totalScore =
    breakdown.commits +
    breakdown.prs +
    breakdown.bugs +
    breakdown.enhancements +
    breakdown.documentation +
    breakdown.others +
    breakdown.projects;

  return {
    total: totalScore,
    breakdown,
  };
}

// ============================================================================
// GENERATE LEADERBOARD
// ============================================================================

function generateLeaderboard() {
  console.log("\n" + "=".repeat(80));
  console.log("🏆 STEP 2: GENERATING LEADERBOARD");
  console.log("=".repeat(80) + "\n");

  // Read input files
  const contributors = readJsonFile(CONFIG.INPUT_FILES.contributors) || [];
  const projects = readJsonFile(CONFIG.INPUT_FILES.projects) || [];
  const contributorMapping =
    readJsonFile(CONFIG.INPUT_FILES.contributorMapping) || {};
  const cachedData = readJsonFile(CONFIG.INPUT_FILES.cachedData) || {};

  console.log(`📦 Loaded Data:`);
  console.log(`   Contributors: ${contributors.length}`);
  console.log(`   Projects: ${projects.length}`);
  console.log(`   Cached Projects: ${Object.keys(cachedData).length}\n`);

  console.log("🔍 Processing contributors...\n");

  const leaderboardData = [];

  for (const contributor of contributors) {
    const username = contributor.login;
    console.log(`📌 Processing ${username}...`);

    // Get projects this user worked on from mapping
    const userMappedProjectIds = contributorMapping[username] || [];

    // Also check special projects (like website) for ALL contributors
    const allProjectIds = [
      ...new Set([...userMappedProjectIds, ...CONFIG.SPECIAL_PROJECT_IDS]),
    ];

    const userStats = {
      totalCommits: 0,
      totalPRs: 0,
      issues: {
        bugs: 0,
        enhancements: 0,
        documentation: 0,
        others: 0,
        total: 0,
      },
      projectsWorkingOn: 0,
      projects: [],
      byProject: {},
    };

    // Analyze each project (mapped projects + special projects)
    for (const projectId of allProjectIds) {
      const projectData = cachedData[projectId];

      if (!projectData) {
        console.log(`   ⚠️ No cached data for project ID ${projectId}`);
        continue;
      }

      const projectStats = analyzeUserInProject(username, projectData);

      // Only count this project if user actually contributed to it
      const hasContributions =
        projectStats.commits > 0 ||
        projectStats.prs > 0 ||
        projectStats.issues.bugs > 0 ||
        projectStats.issues.enhancements > 0 ||
        projectStats.issues.documentation > 0 ||
        projectStats.issues.others > 0;

      if (hasContributions) {
        // Aggregate stats
        userStats.totalCommits += projectStats.commits;
        userStats.totalPRs += projectStats.prs;
        userStats.issues.bugs += projectStats.issues.bugs;
        userStats.issues.enhancements += projectStats.issues.enhancements;
        userStats.issues.documentation += projectStats.issues.documentation;
        userStats.issues.others += projectStats.issues.others;

        // Store per-project stats
        userStats.byProject[projectData.project_title] = projectStats;

        // Track project names
        userStats.projects.push(projectData.project_title);
        userStats.projectsWorkingOn++;

        console.log(
          `   ✓ ${projectData.project_title}: ${projectStats.commits} commits, ${projectStats.prs} PRs`
        );
      }
    }

    // Skip contributors with no contributions
    if (userStats.projectsWorkingOn === 0) {
      console.log(`   ⚠️ ${username}: No contributions found, skipping\n`);
      continue;
    }

    // Calculate total issues
    userStats.issues.total =
      userStats.issues.bugs +
      userStats.issues.enhancements +
      userStats.issues.documentation +
      userStats.issues.others;

    // Calculate average commits per PR
    const avgCommitsPerPR =
      userStats.totalPRs > 0
        ? (userStats.totalCommits / userStats.totalPRs).toFixed(2)
        : 0;

    // Calculate score
    const scoreData = calculateScore(userStats);

    leaderboardData.push({
      username: username,
      id: contributor.id,
      avatar_url: contributor.avatar_url,
      html_url: contributor.html_url,
      totalCommits: userStats.totalCommits,
      totalPRs: userStats.totalPRs,
      avgCommitsPerPR: parseFloat(avgCommitsPerPR),
      issues: userStats.issues,
      projectsWorkingOn: userStats.projectsWorkingOn,
      projects: userStats.projects,
      byProject: userStats.byProject,
      score: scoreData.total,
      scoreBreakdown: scoreData.breakdown,
      lastActiveDays: contributor.lastActiveDays || null,
    });

    console.log(
      `   ✅ ${username}: Score ${scoreData.total} (${userStats.totalCommits} commits, ${userStats.totalPRs} PRs, ${userStats.projectsWorkingOn} projects)\n`
    );
  }

  // Sort by score (descending)
  leaderboardData.sort((a, b) => b.score - a.score);

  // Add rank
  leaderboardData.forEach((contributor, index) => {
    contributor.rank = index + 1;
  });

  return leaderboardData;
}

// ============================================================================
// DISPLAY TOP SCORERS
// ============================================================================

function displayTopScorers(leaderboard, topN = 10) {
  console.log("\n" + "=".repeat(80));
  console.log(`🏆 TOP ${topN} CONTRIBUTORS`);
  console.log("=".repeat(80) + "\n");

  const topScorers = leaderboard.slice(0, topN);

  topScorers.forEach((contributor, index) => {
    const rank = index + 1;
    const medal =
      rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : `${rank}.`;

    console.log(`${medal} ${contributor.username}`);
    console.log(
      `   Score: ${contributor.score} points (Rank #${contributor.rank})`
    );
    console.log(
      `   Commits: ${contributor.totalCommits} | PRs: ${contributor.totalPRs} | Avg Commits/PR: ${contributor.avgCommitsPerPR}`
    );
    console.log(
      `   Issues: ${contributor.issues.total} (🐛 ${contributor.issues.bugs} | ✨ ${contributor.issues.enhancements} | 📝 ${contributor.issues.documentation} | 🔧 ${contributor.issues.others})`
    );
    console.log(`   Projects: ${contributor.projectsWorkingOn}`);
    console.log(
      `   Score Breakdown: Commits(${contributor.scoreBreakdown.commits}) + PRs(${contributor.scoreBreakdown.prs}) + Bugs(${contributor.scoreBreakdown.bugs}) + Enhancements(${contributor.scoreBreakdown.enhancements}) + Docs(${contributor.scoreBreakdown.documentation}) + Others(${contributor.scoreBreakdown.others}) + Projects(${contributor.scoreBreakdown.projects})`
    );
    console.log("");
  });

  console.log("=".repeat(80) + "\n");
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================

function main() {
  try {
    console.log("🚀 Starting Leaderboard Generation...\n");
    console.log("📊 Scoring System:");
    console.log(
      `   - Commit in default branch: ${SCORING.COMMIT_IN_DEFAULT} points`
    );
    console.log(
      `   - PR merged to default: ${SCORING.PR_MERGED_TO_DEFAULT} points`
    );
    console.log(`   - Bug fix issue: ${SCORING.BUG_FIX_ISSUE} points`);
    console.log(`   - Enhancement issue: ${SCORING.ENHANCEMENT_ISSUE} points`);
    console.log(
      `   - Documentation issue: ${SCORING.DOCUMENTATION_ISSUE} points`
    );
    console.log(`   - Other issue: ${SCORING.OTHER_ISSUE} points`);
    console.log(
      `   - Project participation: ${SCORING.PROJECT_PARTICIPATION} points\n`
    );

    const leaderboard = generateLeaderboard();

    // Calculate summary statistics
    const summary = {
      total_contributors: leaderboard.length,
      total_commits: leaderboard.reduce((sum, c) => sum + c.totalCommits, 0),
      total_prs: leaderboard.reduce((sum, c) => sum + c.totalPRs, 0),
      total_issues: leaderboard.reduce((sum, c) => sum + c.issues.total, 0),
      total_bugs: leaderboard.reduce((sum, c) => sum + c.issues.bugs, 0),
      total_enhancements: leaderboard.reduce(
        (sum, c) => sum + c.issues.enhancements,
        0
      ),
      total_documentation: leaderboard.reduce(
        (sum, c) => sum + c.issues.documentation,
        0
      ),
      total_others: leaderboard.reduce((sum, c) => sum + c.issues.others, 0),
      avg_score:
        leaderboard.length > 0
          ? Math.round(
              leaderboard.reduce((sum, c) => sum + c.score, 0) /
                leaderboard.length
            )
          : 0,
      avg_commits_per_contributor:
        leaderboard.length > 0
          ? Math.round(
              leaderboard.reduce((sum, c) => sum + c.totalCommits, 0) /
                leaderboard.length
            )
          : 0,
      avg_prs_per_contributor:
        leaderboard.length > 0
          ? Math.round(
              leaderboard.reduce((sum, c) => sum + c.totalPRs, 0) /
                leaderboard.length
            )
          : 0,
    };

    const outputData = {
      generated_at: new Date().toISOString(),
      scoring_weights: SCORING,
      summary: summary,
      leaderboard: leaderboard,
    };

    // Save full leaderboard
    writeJsonFile(CONFIG.OUTPUT_FILES.leaderboard, outputData);

    // Save top 50 scorers
    const top50 = {
      generated_at: new Date().toISOString(),
      scoring_weights: SCORING,
      top_scorers: leaderboard.slice(0, 50),
    };
    writeJsonFile(CONFIG.OUTPUT_FILES.topScorers, top50);

    // Display top scorers in console
    displayTopScorers(leaderboard, 10);

    // Display summary
    console.log("📈 SUMMARY STATISTICS:");
    console.log(`   Total Contributors: ${summary.total_contributors}`);
    console.log(`   Total Commits: ${summary.total_commits}`);
    console.log(`   Total PRs: ${summary.total_prs}`);
    console.log(`   Total Issues: ${summary.total_issues}`);
    console.log(`   Average Score: ${summary.avg_score}`);
    console.log(
      `   Highest Score: ${leaderboard[0]?.score || 0} (${
        leaderboard[0]?.username || "N/A"
      })`
    );
    console.log();

    console.log("✅ Leaderboard generation completed successfully!\n");

    return leaderboard;
  } catch (error) {
    console.error("\n❌ Fatal error:", error);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
