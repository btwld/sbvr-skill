import { describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import {
  buildCoverageMap,
  buildFindingCatalog,
  buildFlowCatalog,
  buildHotspotCatalog,
  materializeAgentReviewBundle,
} from "./agent-reviews";
import type {
  AgentAnalysis,
  RunManifest,
  RunSummary,
  VisualReport,
} from "./types";

function makeTempDir(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function makeAnalysis(
  agentId: string,
  domain: string,
  overrides?: Partial<AgentAnalysis>,
): AgentAnalysis {
  return {
    schemaVersion: "v1",
    agentId,
    domain,
    summary: {
      headline: `${domain} review`,
      riskLevel: "medium",
      confidence: "high",
      why: `${domain} needs review`,
    },
    reviewScope: {
      ownedPaths: [],
      supportingPaths: [],
      inputFiles: [],
      rawArtifacts: ["data/runs/service-finance/summary.json"],
    },
    metrics: {},
    flows: [],
    hotspots: [],
    findingClusters: [],
    recommendations: [],
    ...overrides,
  };
}

function makeSummary(hotspotFiles: string[]): RunSummary {
  return {
    schemaVersion: "v1",
    run: {
      target: "/Users/leofarias/Concepta/service-finance",
      resultsDir: "/tmp/results",
      overallStatus: "findings",
      generatedAt: "2026-04-10T00:00:00.000Z",
      steps: [],
    },
    size: {
      filesTotal: 0,
      linesTotal: 0,
      codeLines: 0,
      commentLines: 0,
      blankLines: 0,
      languages: [],
    },
    complexity: {
      functionsTotal: 0,
      thresholds: {
        ccnGte10: 0,
        ccnGte20: 0,
        nlocGte150: 0,
      },
      hotspots: [],
    },
    duplication: {
      cloneGroups: 0,
      duplicatedLines: 0,
      duplicatedTokens: 0,
      percentage: 0,
      topPairs: [],
      topFiles: [],
    },
    changeRisk: {
      topRevisions: [],
      ownershipHotspots: [],
      oldestFiles: [],
      topCouplings: [],
      effortByAuthor: [],
      notes: [],
    },
    dependencySecurity: {
      countsBySeverity: {
        critical: 0,
        high: 0,
        medium: 0,
        low: 0,
        warning: 0,
        info: 0,
      },
      directPackages: [],
      transitivePackages: [],
      sbomArtifact: null,
    },
    architecture: {
      modulesCruised: 0,
      dependenciesCruised: 0,
      cycleCount: 0,
      unresolvedCount: 0,
      coverageAssessment: {
        status: "weak",
        reason: "synthetic",
      },
    },
    deadCode: {
      counts: {
        unusedFiles: 0,
        unusedDependencies: 0,
        unusedDevDependencies: 0,
        unlistedPackages: 0,
        unresolvedImports: 0,
        unusedBinaries: 0,
      },
      unusedDependencies: [],
      unusedDevDependencies: [],
      unlistedPackages: [],
      unresolvedImports: [],
    },
    maintainability: {
      errorCount: 0,
      warningCount: 0,
      topRules: [],
      topFiles: [],
    },
    policy: {
      topRuleFamilies: [],
      topFiles: [],
    },
    secrets: {
      topRules: [],
      topFiles: [],
      noisyRules: [],
    },
    hotspots: hotspotFiles.map((file, index) => ({
      file,
      score: index + 1,
      signals: ["complexity"],
      notes: ["synthetic hotspot"],
    })),
  };
}

function makeVisualReport(): VisualReport {
  return {
    schemaVersion: "v1",
    run: {
      target: "/Users/leofarias/Concepta/service-finance",
      resultsDir: "/tmp/results",
      overallStatus: "findings",
      generatedAt: "2026-04-10T00:00:00.000Z",
      summaryPath: "summary.json",
      findingsPath: "findings.json",
    },
    facets: {
      sources: [],
      categories: [],
      severities: [],
      ruleFamilies: [],
      stepStatuses: [],
    },
    overview: {
      cards: [],
      stepStatus: [],
      findingMix: [],
    },
    executive: {
      cards: [],
      topRisks: {
        id: "top-risks",
        title: "Top risks",
        columns: [],
        rows: [],
      },
      security: {
        severityBreakdown: [],
        directPackages: {
          id: "direct",
          title: "Direct",
          columns: [],
          rows: [],
        },
        transitivePackages: {
          id: "transitive",
          title: "Transitive",
          columns: [],
          rows: [],
        },
      },
      quality: {
        cards: [],
        notes: [],
      },
    },
    engineering: {
      hotspots: {
        id: "hotspots",
        title: "Hotspots",
        columns: [],
        rows: [],
      },
      complexity: {
        cards: [],
        thresholds: [],
        hotspots: {
          id: "complexity",
          title: "Complexity",
          columns: [],
          rows: [],
        },
      },
      duplication: {
        cards: [],
        files: {
          id: "dup-files",
          title: "Dup files",
          columns: [],
          rows: [],
        },
        pairs: {
          id: "dup-pairs",
          title: "Dup pairs",
          columns: [],
          rows: [],
        },
      },
      changeRisk: {
        revisions: { id: "revisions", title: "Revisions", columns: [], rows: [] },
        ownership: { id: "ownership", title: "Ownership", columns: [], rows: [] },
        oldest: { id: "oldest", title: "Oldest", columns: [], rows: [] },
      },
      maintainability: {
        rules: { id: "rules", title: "Rules", columns: [], rows: [] },
        files: { id: "files", title: "Files", columns: [], rows: [] },
      },
      deadCode: {
        counts: [],
        dependencies: { id: "deps", title: "Deps", columns: [], rows: [] },
        devDependencies: { id: "dev-deps", title: "Dev deps", columns: [], rows: [] },
        unlistedPackages: { id: "unlisted", title: "Unlisted", columns: [], rows: [] },
        unresolvedImports: { id: "unresolved", title: "Unresolved", columns: [], rows: [] },
      },
      policy: {
        families: { id: "families", title: "Families", columns: [], rows: [] },
        files: { id: "policy-files", title: "Policy files", columns: [], rows: [] },
      },
      secrets: {
        rules: { id: "secret-rules", title: "Secret rules", columns: [], rows: [] },
        files: { id: "secret-files", title: "Secret files", columns: [], rows: [] },
        noisyRules: [],
      },
      architecture: {
        cards: [],
        coverageAssessment: {
          status: "weak",
          reason: "synthetic",
        },
      },
    },
    links: {
      artifacts: [],
    },
  };
}

describe("agent reviews", () => {
  test("merges coverage, flows, hotspots, and finding clusters across domain analyses", () => {
    const auth = makeAnalysis("01-auth-shell", "auth-shell", {
      reviewScope: {
        ownedPaths: ["src/scenes/SignOn", "App.tsx"],
        supportingPaths: ["src/providers/user"],
        inputFiles: ["src/scenes/SignOn/scenes/Login/index.tsx"],
        rawArtifacts: ["data/runs/service-finance/summary.json"],
      },
      flows: [
        {
          id: "auth-login",
          name: "Login Session",
          entryPoints: ["src/scenes/SignOn/scenes/Login/index.tsx"],
          services: ["src/services/UserAuthentication/index.ts"],
          stateOwners: ["src/providers/user/auth.provider.tsx"],
          sensitiveData: ["email", "password"],
          externalBoundaries: ["src/services/UserAuthentication/index.ts"],
          riskNotes: ["login state is spread across provider and screen"],
        },
      ],
      hotspots: [
        {
          file: "src/scenes/SignOn/scenes/Login/index.tsx",
          score: 4,
          reasons: ["complexity", "high-revisions"],
          sourceMetrics: {
            complexity: 39,
            duplication: 140,
            revisions: 171,
            findings: 13,
          },
          evidenceRefs: [
            "data/runs/service-finance/summary.json#/hotspots/0",
            "src/scenes/SignOn/scenes/Login/index.tsx",
          ],
        },
      ],
      findingClusters: [
        {
          clusterId: "auth-cluster-1",
          title: "Login flow concentrates complexity and churn",
          category: "change-risk",
          severity: "high",
          files: ["src/scenes/SignOn/scenes/Login/index.tsx"],
          evidenceRefs: ["data/runs/service-finance/summary.json#/hotspots/0"],
          recommendation: "Split login workflow state and submission behavior.",
        },
      ],
      recommendations: [
        {
          id: "auth-rec-1",
          priority: "p1",
          action: "Split login workflow state and submission behavior.",
          affectedFiles: ["src/scenes/SignOn/scenes/Login/index.tsx"],
          reason: "Complexity and churn are concentrated in one screen.",
        },
      ],
    });

    const intake = makeAnalysis("02-application-intake", "application-intake", {
      reviewScope: {
        ownedPaths: ["src/scenes/Main/CreateApplication", "src/scenes/Main/PreFill"],
        supportingPaths: ["src/services/Application"],
        inputFiles: ["src/scenes/Main/CreateApplication/Form/Form.tsx"],
        rawArtifacts: ["data/runs/service-finance/summary.json"],
      },
      flows: [
        {
          id: "intake-flow",
          name: "Application Intake",
          entryPoints: ["src/scenes/Main/CreateApplication/Form/Form.tsx"],
          services: ["src/services/Application/index.ts"],
          stateOwners: ["src/scenes/Main/CreateApplication/Form/flow/ApplicationFlows.tsx"],
          sensitiveData: ["ssn", "dob", "address"],
          externalBoundaries: ["src/services/Application/index.ts"],
          riskNotes: ["validation logic is spread across multiple modules"],
        },
      ],
      hotspots: [
        {
          file: "src/scenes/Main/CreateApplication/Form/Form.tsx",
          score: 3,
          reasons: ["complexity", "high-revisions"],
          sourceMetrics: {
            complexity: 28,
            duplication: 0,
            revisions: 99,
            findings: 8,
          },
          evidenceRefs: [
            "data/runs/service-finance/summary.json#/hotspots/4",
            "src/scenes/Main/CreateApplication/Form/Form.tsx",
          ],
        },
      ],
      findingClusters: [
        {
          clusterId: "intake-cluster-1",
          title: "Application intake validation is duplicated",
          category: "duplication",
          severity: "high",
          files: [
            "src/scenes/Main/CreateApplication/Form/Address.tsx",
            "src/scenes/Main/CreateApplication/Form/PrimaryAddress.tsx",
          ],
          evidenceRefs: ["data/runs/service-finance/visual-report.json#/engineering/duplication"],
          recommendation: "Extract a single address workflow and validation model.",
        },
      ],
      recommendations: [
        {
          id: "intake-rec-1",
          priority: "p0",
          action: "Extract a single address workflow and validation model.",
          affectedFiles: [
            "src/scenes/Main/CreateApplication/Form/Address.tsx",
            "src/scenes/Main/CreateApplication/Form/PrimaryAddress.tsx",
          ],
          reason: "Duplicate address flows make intake changes expensive.",
        },
      ],
    });

    const coverageMap = buildCoverageMap([auth, intake], makeSummary([
      "src/scenes/SignOn/scenes/Login/index.tsx",
      "src/scenes/Main/CreateApplication/Form/Form.tsx",
    ]));
    const flowCatalog = buildFlowCatalog("service-finance", [auth, intake]);
    const hotspotCatalog = buildHotspotCatalog("service-finance", [auth, intake]);
    const findingCatalog = buildFindingCatalog("service-finance", [auth, intake]);

    expect(coverageMap.entries).toContainEqual(
      expect.objectContaining({
        path: "src/scenes/SignOn",
        ownerAgentId: "01-auth-shell",
      }),
    );
    expect(coverageMap.ownershipConflicts).toEqual([]);
    expect(flowCatalog.flows.map((flow) => flow.name)).toEqual([
      "Application Intake",
      "Login Session",
    ]);
    expect(hotspotCatalog.hotspots[0]).toEqual(
      expect.objectContaining({
        file: "src/scenes/SignOn/scenes/Login/index.tsx",
      }),
    );
    expect(findingCatalog.findingClusters).toHaveLength(2);
  });

  test("coverage matching treats glob-like scope paths as prefixes", () => {
    const auth = makeAnalysis("01-auth-shell", "auth-shell", {
      reviewScope: {
        ownedPaths: ["src/scenes/SignOn/**", "src/providers/user/**"],
        supportingPaths: ["package.json"],
        inputFiles: [],
        rawArtifacts: ["data/runs/service-finance/summary.json"],
      },
    });

    const coverageMap = buildCoverageMap([auth], makeSummary([
      "src/scenes/SignOn/scenes/Login/index.tsx",
      "src/providers/user/auth.provider.tsx",
      "package.json",
    ]));

    expect(coverageMap.unownedHotspots).toEqual([]);
  });

  test("materializes the agent-review bundle with consolidated outputs", () => {
    const workspace = makeTempDir("code-analysis-agent-review-");
    const canonicalDataDir = join(workspace, "canonical");
    const outDir = join(workspace, "bundle");
    const schemaDir = join(workspace, "schemas");

    mkdirSync(canonicalDataDir, { recursive: true });
    mkdirSync(schemaDir, { recursive: true });

    const manifest: RunManifest = {
      target: "/Users/leofarias/Concepta/service-finance",
      startedAt: "2026-04-10T00:00:00.000Z",
      finishedAt: "2026-04-10T00:01:00.000Z",
      overallStatus: "findings",
      steps: [],
    };

    writeFileSync(join(canonicalDataDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    writeFileSync(join(canonicalDataDir, "summary.json"), `${JSON.stringify(makeSummary([
      "src/scenes/SignOn/scenes/Login/index.tsx",
      "src/scenes/Main/CreateApplication/Form/Form.tsx",
    ]), null, 2)}\n`);
    writeFileSync(join(canonicalDataDir, "findings.json"), "[]\n");
    writeFileSync(join(canonicalDataDir, "visual-report.json"), `${JSON.stringify(makeVisualReport(), null, 2)}\n`);
    writeFileSync(join(schemaDir, "agent-analysis.schema.json"), "{}\n");
    writeFileSync(join(schemaDir, "consolidated-analysis.schema.json"), "{}\n");

    const auth = makeAnalysis("01-auth-shell", "auth-shell", {
      reviewScope: {
        ownedPaths: ["src/scenes/SignOn"],
        supportingPaths: [],
        inputFiles: ["src/scenes/SignOn/scenes/Login/index.tsx"],
        rawArtifacts: ["data/runs/service-finance/summary.json"],
      },
      hotspots: [
        {
          file: "src/scenes/SignOn/scenes/Login/index.tsx",
          score: 4,
          reasons: ["complexity", "high-revisions"],
          sourceMetrics: {
            complexity: 39,
            duplication: 0,
            revisions: 171,
            findings: 13,
          },
          evidenceRefs: ["data/runs/service-finance/summary.json#/hotspots/0"],
        },
      ],
      findingClusters: [
        {
          clusterId: "auth-cluster-1",
          title: "Auth hotspot",
          category: "change-risk",
          severity: "high",
          files: ["src/scenes/SignOn/scenes/Login/index.tsx"],
          evidenceRefs: ["data/runs/service-finance/summary.json#/hotspots/0"],
          recommendation: "Split login responsibilities.",
        },
      ],
    });

    const intake = makeAnalysis("02-application-intake", "application-intake", {
      reviewScope: {
        ownedPaths: ["src/scenes/Main/CreateApplication"],
        supportingPaths: [],
        inputFiles: ["src/scenes/Main/CreateApplication/Form/Form.tsx"],
        rawArtifacts: ["data/runs/service-finance/summary.json"],
      },
      hotspots: [
        {
          file: "src/scenes/Main/CreateApplication/Form/Form.tsx",
          score: 3,
          reasons: ["complexity", "high-revisions"],
          sourceMetrics: {
            complexity: 28,
            duplication: 0,
            revisions: 99,
            findings: 8,
          },
          evidenceRefs: ["data/runs/service-finance/summary.json#/hotspots/1"],
        },
      ],
      recommendations: [
        {
          id: "intake-rec-1",
          priority: "p0",
          action: "Extract form workflow state.",
          affectedFiles: ["src/scenes/Main/CreateApplication/Form/Form.tsx"],
          reason: "One form owns too much workflow state.",
        },
      ],
    });

    const payment = makeAnalysis("04-payment-security", "payment-security");
    const loan = makeAnalysis("03-loan-pipeline", "loan-pipeline");
    const sharedUi = makeAnalysis("05-shared-ui", "shared-ui");
    const services = makeAnalysis("06-services-integrations", "services-integrations");

    const consolidation = makeAnalysis("07-consolidation", "consolidation", {
      metrics: {
        agentCount: 7,
        distinctHotspotFiles: 2,
        distinctFindingClusters: 1,
        crossDomainFiles: 0,
        sourceCoveragePercent: 100,
        reportReadyDatasetCount: 5,
        unownedHotspotCount: 0,
      },
    });

    materializeAgentReviewBundle({
      datasetId: "service-finance",
      canonicalDataDir,
      outDir,
      schemaDir,
      analyses: [auth, intake, loan, payment, sharedUi, services],
      consolidationAnalysis: consolidation,
    });

    expect(existsSync(join(outDir, "agents/01-auth-shell/analysis.json"))).toBeTrue();
    expect(existsSync(join(outDir, "agents/07-consolidation/analysis.json"))).toBeTrue();
    expect(existsSync(join(outDir, "consolidated/coverage-map.json"))).toBeTrue();
    expect(existsSync(join(outDir, "consolidated/overview.json"))).toBeTrue();
    expect(existsSync(join(outDir, "schemas/agent-analysis.schema.json"))).toBeTrue();
    expect(existsSync(join(outDir, "schemas/consolidated-analysis.schema.json"))).toBeTrue();

    const coverageMap = JSON.parse(readFileSync(join(outDir, "consolidated/coverage-map.json"), "utf8"));
    const overview = JSON.parse(readFileSync(join(outDir, "consolidated/overview.json"), "utf8"));
    const index = JSON.parse(readFileSync(join(outDir, "index.json"), "utf8"));

    expect(coverageMap.kind).toBe("coverage-map");
    expect(overview.kind).toBe("overview");
    expect(overview.counts.agentCount).toBe(7);
    expect(index.agents).toHaveLength(7);
  });
});
