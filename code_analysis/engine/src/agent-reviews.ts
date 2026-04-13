import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";

import type {
  AgentAnalysis,
  AgentFindingCluster,
  AgentFlow,
  ConsolidatedFindingCluster,
  ConsolidatedFlow,
  ConsolidatedHotspot,
  ConsolidatedOverview,
  CoverageMap,
  CoverageMapEntry,
  FindingCatalog,
  FlowCatalog,
  HotspotCatalog,
  RecommendationPriority,
  RunSummary,
  VisualReport,
} from "./types";

const AGENT_SCHEMA_FILE = "agent-analysis.schema.json";
const CONSOLIDATED_SCHEMA_FILE = "consolidated-analysis.schema.json";

export interface AgentReviewBundleOptions {
  datasetId: string;
  canonicalDataDir: string;
  outDir: string;
  schemaDir: string;
  analyses: AgentAnalysis[];
  consolidationAnalysis: AgentAnalysis;
}

export interface AgentReviewBundleArtifacts {
  coverageMap: CoverageMap;
  flowCatalog: FlowCatalog;
  hotspotCatalog: HotspotCatalog;
  findingCatalog: FindingCatalog;
  overview: ConsolidatedOverview;
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function ensureFile(path: string): void {
  if (!existsSync(path)) {
    throw new Error(`Required file is missing: ${path}`);
  }
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function normalizedSet(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.length > 0))].sort();
}

function priorityRank(priority: RecommendationPriority): number {
  return priority === "p0" ? 0 : priority === "p1" ? 1 : 2;
}

function unionStrings(target: string[], source: string[]): string[] {
  return normalizedSet([...target, ...source]);
}

function reasonKey(reasons: string[]): string {
  return normalizedSet(reasons).join("::");
}

function findingClusterKey(cluster: AgentFindingCluster): string {
  return [
    cluster.category,
    cluster.severity,
    normalizedSet(cluster.files).join("::"),
    cluster.recommendation.trim().toLowerCase(),
  ].join("|");
}

function dedupeAgentIds(analyses: AgentAnalysis[]): string[] {
  return normalizedSet(analyses.map((analysis) => analysis.agentId));
}

function dedupeDomains(analyses: AgentAnalysis[]): string[] {
  return normalizedSet(analyses.map((analysis) => analysis.domain));
}

function normalizeCoveragePath(path: string): string {
  const trimmed = path.endsWith("/**")
    ? path.slice(0, -3)
    : path.endsWith("/*")
      ? path.slice(0, -2)
      : path.endsWith("**")
        ? path.slice(0, -2)
        : path;

  return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
}

function coversPath(scopePath: string, filePath: string): boolean {
  const normalizedScope = normalizeCoveragePath(scopePath);
  if (normalizedScope.length === 0) {
    return false;
  }

  return filePath === normalizedScope || filePath.startsWith(`${normalizedScope}/`);
}

export function buildCoverageMap(
  analyses: AgentAnalysis[],
  summary: RunSummary,
): CoverageMap {
  const ownerMap = new Map<string, AgentAnalysis>();
  const supportingMap = new Map<string, AgentAnalysis[]>();
  const ownershipConflicts = new Set<string>();

  for (const analysis of analyses) {
    for (const ownedPath of analysis.reviewScope.ownedPaths) {
      const existing = ownerMap.get(ownedPath);
      if (existing && existing.agentId !== analysis.agentId) {
        ownershipConflicts.add(ownedPath);
      } else {
        ownerMap.set(ownedPath, analysis);
      }
    }

    for (const supportingPath of analysis.reviewScope.supportingPaths) {
      const current = supportingMap.get(supportingPath) ?? [];
      current.push(analysis);
      supportingMap.set(supportingPath, current);
    }
  }

  const allPaths = normalizedSet([
    ...ownerMap.keys(),
    ...supportingMap.keys(),
  ]);

  const entries: CoverageMapEntry[] = allPaths.map((path) => {
    const owner = ownerMap.get(path);
    const supporting = supportingMap.get(path) ?? [];
    return {
      path,
      ownerAgentId: owner?.agentId ?? "unowned",
      ownerDomain: owner?.domain ?? "unowned",
      supportingAgentIds: normalizedSet(supporting.map((analysis) => analysis.agentId)),
      supportingDomains: normalizedSet(supporting.map((analysis) => analysis.domain)),
    };
  });

  const unownedHotspots = normalizedSet(
    summary.hotspots
      .map((hotspot) => hotspot.file)
      .filter((file) => !entries.some((entry) => coversPath(entry.path, file))),
  );

  return {
    schemaVersion: "v1",
    kind: "coverage-map",
    datasetId: "service-finance",
    entries,
    ownershipConflicts: [...ownershipConflicts].sort(),
    unownedHotspots,
  };
}

export function buildFlowCatalog(
  datasetId: string,
  analyses: AgentAnalysis[],
): FlowCatalog {
  const flowMap = new Map<string, ConsolidatedFlow>();

  for (const analysis of analyses) {
    for (const flow of analysis.flows) {
      const key = flow.name.trim().toLowerCase();
      const existing = flowMap.get(key);
      if (!existing) {
        flowMap.set(key, {
          ...flow,
          agentIds: [analysis.agentId],
          domains: [analysis.domain],
          entryPoints: normalizedSet(flow.entryPoints),
          services: normalizedSet(flow.services),
          stateOwners: normalizedSet(flow.stateOwners),
          sensitiveData: normalizedSet(flow.sensitiveData),
          externalBoundaries: normalizedSet(flow.externalBoundaries),
          riskNotes: normalizedSet(flow.riskNotes),
        });
        continue;
      }

      existing.agentIds = unionStrings(existing.agentIds, [analysis.agentId]);
      existing.domains = unionStrings(existing.domains, [analysis.domain]);
      existing.entryPoints = unionStrings(existing.entryPoints, flow.entryPoints);
      existing.services = unionStrings(existing.services, flow.services);
      existing.stateOwners = unionStrings(existing.stateOwners, flow.stateOwners);
      existing.sensitiveData = unionStrings(existing.sensitiveData, flow.sensitiveData);
      existing.externalBoundaries = unionStrings(existing.externalBoundaries, flow.externalBoundaries);
      existing.riskNotes = unionStrings(existing.riskNotes, flow.riskNotes);
    }
  }

  return {
    schemaVersion: "v1",
    kind: "flow-catalog",
    datasetId,
    flows: [...flowMap.values()].sort((left, right) => left.name.localeCompare(right.name)),
  };
}

export function buildHotspotCatalog(
  datasetId: string,
  analyses: AgentAnalysis[],
): HotspotCatalog {
  const hotspotMap = new Map<string, ConsolidatedHotspot>();

  for (const analysis of analyses) {
    for (const hotspot of analysis.hotspots) {
      const key = `${hotspot.file}|${reasonKey(hotspot.reasons)}`;
      const existing = hotspotMap.get(key);
      if (!existing) {
        hotspotMap.set(key, {
          file: hotspot.file,
          score: hotspot.score,
          reasons: normalizedSet(hotspot.reasons),
          agentIds: [analysis.agentId],
          domains: [analysis.domain],
          sourceMetrics: { ...hotspot.sourceMetrics },
          evidenceRefs: normalizedSet(hotspot.evidenceRefs),
        });
        continue;
      }

      existing.score = Math.max(existing.score, hotspot.score);
      existing.agentIds = unionStrings(existing.agentIds, [analysis.agentId]);
      existing.domains = unionStrings(existing.domains, [analysis.domain]);
      existing.reasons = unionStrings(existing.reasons, hotspot.reasons);
      existing.evidenceRefs = unionStrings(existing.evidenceRefs, hotspot.evidenceRefs);
      existing.sourceMetrics = {
        complexity: Math.max(existing.sourceMetrics.complexity, hotspot.sourceMetrics.complexity),
        duplication: Math.max(existing.sourceMetrics.duplication, hotspot.sourceMetrics.duplication),
        revisions: Math.max(existing.sourceMetrics.revisions, hotspot.sourceMetrics.revisions),
        findings: Math.max(existing.sourceMetrics.findings, hotspot.sourceMetrics.findings),
      };
    }
  }

  return {
    schemaVersion: "v1",
    kind: "hotspot-catalog",
    datasetId,
    hotspots: [...hotspotMap.values()].sort(
      (left, right) =>
        right.score - left.score ||
        right.sourceMetrics.findings - left.sourceMetrics.findings ||
        left.file.localeCompare(right.file),
    ),
  };
}

export function buildFindingCatalog(
  datasetId: string,
  analyses: AgentAnalysis[],
): FindingCatalog {
  const clusterMap = new Map<string, ConsolidatedFindingCluster>();

  for (const analysis of analyses) {
    for (const cluster of analysis.findingClusters) {
      const key = findingClusterKey(cluster);
      const existing = clusterMap.get(key);
      if (!existing) {
        clusterMap.set(key, {
          ...cluster,
          files: normalizedSet(cluster.files),
          evidenceRefs: normalizedSet(cluster.evidenceRefs),
          agentIds: [analysis.agentId],
          domains: [analysis.domain],
        });
        continue;
      }

      existing.files = unionStrings(existing.files, cluster.files);
      existing.evidenceRefs = unionStrings(existing.evidenceRefs, cluster.evidenceRefs);
      existing.agentIds = unionStrings(existing.agentIds, [analysis.agentId]);
      existing.domains = unionStrings(existing.domains, [analysis.domain]);
    }
  }

  return {
    schemaVersion: "v1",
    kind: "finding-catalog",
    datasetId,
    findingClusters: [...clusterMap.values()].sort(
      (left, right) =>
        left.severity.localeCompare(right.severity) ||
        left.category.localeCompare(right.category) ||
        left.title.localeCompare(right.title),
    ),
  };
}

export function buildConsolidatedOverview(params: {
  datasetId: string;
  analyses: AgentAnalysis[];
  coverageMap: CoverageMap;
  hotspotCatalog: HotspotCatalog;
  findingCatalog: FindingCatalog;
}): ConsolidatedOverview {
  const sourceDomains = params.analyses.filter((analysis) => analysis.agentId !== "07-consolidation");
  const sourceCoveragePercent = params.coverageMap.entries.length === 0
    ? 0
    : Number(
        (
          (params.coverageMap.entries.filter((entry) => entry.ownerAgentId !== "unowned").length /
            params.coverageMap.entries.length) *
          100
        ).toFixed(2),
      );

  const crossDomainFiles = params.hotspotCatalog.hotspots.filter((hotspot) => hotspot.domains.length > 1).length;

  const priorityMap = new Map<string, {
    priority: RecommendationPriority;
    action: string;
    domains: string[];
    affectedFiles: string[];
    recommendationIds: string[];
  }>();

  for (const analysis of sourceDomains) {
    for (const recommendation of analysis.recommendations) {
      const key = `${recommendation.priority}|${recommendation.action.trim().toLowerCase()}`;
      const existing = priorityMap.get(key);
      if (!existing) {
        priorityMap.set(key, {
          priority: recommendation.priority,
          action: recommendation.action,
          domains: [analysis.domain],
          affectedFiles: normalizedSet(recommendation.affectedFiles),
          recommendationIds: [recommendation.id],
        });
        continue;
      }

      existing.domains = unionStrings(existing.domains, [analysis.domain]);
      existing.affectedFiles = unionStrings(existing.affectedFiles, recommendation.affectedFiles);
      existing.recommendationIds = unionStrings(existing.recommendationIds, [recommendation.id]);
    }
  }

  return {
    schemaVersion: "v1",
    kind: "overview",
    datasetId: params.datasetId,
    counts: {
      agentCount: params.analyses.length,
      distinctHotspotFiles: normalizedSet(params.hotspotCatalog.hotspots.map((hotspot) => hotspot.file)).length,
      distinctFindingClusters: params.findingCatalog.findingClusters.length,
      crossDomainFiles,
      sourceCoveragePercent,
      reportReadyDatasetCount: 5,
      unownedHotspotCount: params.coverageMap.unownedHotspots.length,
    },
    topPriorities: [...priorityMap.values()]
      .sort(
        (left, right) =>
          priorityRank(left.priority) - priorityRank(right.priority) ||
          left.action.localeCompare(right.action),
      )
      .slice(0, 15),
    reportInputs: [
      "data/runs/service-finance/summary.json",
      "data/runs/service-finance/findings.json",
      "data/runs/service-finance/visual-report.json",
      "data/agent-reviews/service-finance/consolidated/coverage-map.json",
      "data/agent-reviews/service-finance/consolidated/flow-catalog.json",
      "data/agent-reviews/service-finance/consolidated/hotspot-catalog.json",
      "data/agent-reviews/service-finance/consolidated/finding-catalog.json",
      "data/agent-reviews/service-finance/consolidated/overview.json",
    ],
  };
}

export function buildConsolidationAnalysis(params: {
  canonicalDataDir: string;
  analyses: AgentAnalysis[];
  coverageMap: CoverageMap;
  flowCatalog: FlowCatalog;
  hotspotCatalog: HotspotCatalog;
  findingCatalog: FindingCatalog;
  overview: ConsolidatedOverview;
}): AgentAnalysis {
  const sourceAnalyses = params.analyses.filter((analysis) => analysis.agentId !== "07-consolidation");
  const highestRisk = sourceAnalyses.some((analysis) => analysis.summary.riskLevel === "critical")
    ? "critical"
    : sourceAnalyses.some((analysis) => analysis.summary.riskLevel === "high")
      ? "high"
      : sourceAnalyses.some((analysis) => analysis.summary.riskLevel === "medium")
        ? "medium"
        : "low";

  return {
    schemaVersion: "v1",
    agentId: "07-consolidation",
    domain: "consolidation",
    summary: {
      headline: "Merged service-finance review dataset is ready for reporting and drilldown.",
      riskLevel: highestRisk,
      confidence: params.coverageMap.ownershipConflicts.length === 0 ? "high" : "medium",
      why: `${params.overview.counts.distinctHotspotFiles} hotspot files and ${params.overview.counts.distinctFindingClusters} grouped finding clusters were consolidated across ${sourceAnalyses.length} domain reviews.`,
    },
    reviewScope: {
      ownedPaths: sourceAnalyses.map((analysis) => `data/agent-reviews/service-finance/agents/${analysis.agentId}/analysis.json`),
      supportingPaths: [
        `${params.canonicalDataDir}/manifest.json`,
        `${params.canonicalDataDir}/summary.json`,
        `${params.canonicalDataDir}/findings.json`,
        `${params.canonicalDataDir}/visual-report.json`,
      ],
      inputFiles: [
        `${params.canonicalDataDir}/summary.json`,
        `${params.canonicalDataDir}/findings.json`,
        `${params.canonicalDataDir}/visual-report.json`,
        ...sourceAnalyses.map((analysis) => `data/agent-reviews/service-finance/agents/${analysis.agentId}/analysis.json`),
      ],
      rawArtifacts: [
        `${params.canonicalDataDir}/summary.json`,
        `${params.canonicalDataDir}/findings.json`,
        `${params.canonicalDataDir}/visual-report.json`,
      ],
    },
    metrics: {
      agentCount: sourceAnalyses.length + 1,
      distinctHotspotFiles: params.overview.counts.distinctHotspotFiles,
      distinctFindingClusters: params.overview.counts.distinctFindingClusters,
      crossDomainFiles: params.overview.counts.crossDomainFiles,
      sourceCoveragePercent: params.overview.counts.sourceCoveragePercent,
      reportReadyDatasetCount: params.overview.counts.reportReadyDatasetCount,
      unownedHotspotCount: params.overview.counts.unownedHotspotCount,
    },
    flows: params.flowCatalog.flows.slice(0, 25).map((flow) => ({
      id: flow.id,
      name: flow.name,
      entryPoints: flow.entryPoints,
      services: flow.services,
      stateOwners: flow.stateOwners,
      sensitiveData: flow.sensitiveData,
      externalBoundaries: flow.externalBoundaries,
      riskNotes: flow.riskNotes,
    })),
    hotspots: params.hotspotCatalog.hotspots.slice(0, 25).map((hotspot) => ({
      file: hotspot.file,
      score: hotspot.score,
      reasons: hotspot.reasons,
      sourceMetrics: hotspot.sourceMetrics,
      evidenceRefs: hotspot.evidenceRefs,
    })),
    findingClusters: params.findingCatalog.findingClusters.slice(0, 25).map((cluster) => ({
      clusterId: cluster.clusterId,
      title: cluster.title,
      category: cluster.category,
      severity: cluster.severity,
      files: cluster.files,
      evidenceRefs: cluster.evidenceRefs,
      recommendation: cluster.recommendation,
    })),
    recommendations: params.overview.topPriorities.slice(0, 15).map((priority, index) => ({
      id: `07-consolidation-rec-${index + 1}`,
      priority: priority.priority,
      action: priority.action,
      affectedFiles: priority.affectedFiles,
      reason: `Shared recommendation across ${priority.domains.join(", ")}.`,
    })),
  };
}

export function buildAgentReviewIndex(params: {
  datasetId: string;
  analyses: AgentAnalysis[];
  overview: ConsolidatedOverview;
}): Record<string, unknown> {
  const baseDir = `data/agent-reviews/${params.datasetId}`;
  return {
    schemaVersion: "v1",
    generatedAt: new Date().toISOString(),
    datasetId: params.datasetId,
    files: [
      { id: "readme", path: `${baseDir}/README.md`, kind: "documentation" },
      { id: "dictionary", path: `${baseDir}/data-dictionary.json`, kind: "dictionary" },
      { id: "coverage-map", path: `${baseDir}/consolidated/coverage-map.json`, kind: "consolidated" },
      { id: "flow-catalog", path: `${baseDir}/consolidated/flow-catalog.json`, kind: "consolidated" },
      { id: "hotspot-catalog", path: `${baseDir}/consolidated/hotspot-catalog.json`, kind: "consolidated" },
      { id: "finding-catalog", path: `${baseDir}/consolidated/finding-catalog.json`, kind: "consolidated" },
      { id: "overview", path: `${baseDir}/consolidated/overview.json`, kind: "consolidated" },
    ],
    agents: params.analyses.map((analysis) => ({
      agentId: analysis.agentId,
      domain: analysis.domain,
      path: `${baseDir}/agents/${analysis.agentId}/analysis.json`,
      riskLevel: analysis.summary.riskLevel,
      confidence: analysis.summary.confidence,
    })),
    counts: params.overview.counts,
    reportInputs: params.overview.reportInputs,
  };
}

export function buildAgentReviewDictionary(datasetId: string): Record<string, unknown> {
  const baseDir = `data/agent-reviews/${datasetId}`;
  return {
    schemaVersion: "v1",
    description: "Dictionary for the multi-agent review bundle.",
    files: {
      agentAnalysis: {
        schemaPath: `${baseDir}/schemas/${AGENT_SCHEMA_FILE}`,
        purpose: "Per-domain agent review with metrics, flow maps, grouped findings, hotspots, and recommendations.",
        topLevelFields: {
          summary: "One-paragraph domain position, risk level, and confidence.",
          reviewScope: "Owned and supporting paths plus evidence inputs.",
          metrics: "Fixed numeric metrics defined per agent domain.",
          flows: "User-visible and system-visible flows in the reviewed domain.",
          hotspots: "Important risky files in scope with metric evidence.",
          findingClusters: "Grouped domain insights backed by evidence references.",
          recommendations: "Prioritized next actions for the reviewed domain.",
        },
      },
      consolidatedArtifacts: {
        schemaPath: `${baseDir}/schemas/${CONSOLIDATED_SCHEMA_FILE}`,
        purpose: "Merged catalogs and overview derived from the domain analyses.",
        artifactKinds: {
          "coverage-map": "Ownership and support mapping for reviewed paths.",
          "flow-catalog": "Merged flow inventory across all domain agents.",
          "hotspot-catalog": "Merged hotspot set deduped by file and reason set.",
          "finding-catalog": "Merged grouped findings deduped by category, severity, file set, and recommendation.",
          overview: "Top-level counts, priorities, and report-builder inputs.",
        },
      },
    },
  };
}

export function buildAgentReviewReadme(datasetId: string): string {
  return `# Agent Reviews: ${datasetId}

This directory contains the multi-agent review dataset for the canonical \`${datasetId}\` run.

## Structure

- \`agents/*/analysis.json\`: one JSON review per domain agent
- \`consolidated/coverage-map.json\`: exact owner/support mapping for reviewed paths
- \`consolidated/flow-catalog.json\`: merged flow inventory
- \`consolidated/hotspot-catalog.json\`: merged hotspot inventory
- \`consolidated/finding-catalog.json\`: merged grouped findings
- \`consolidated/overview.json\`: top-level report inputs and counts
- \`schemas/\`: schemas for agent analysis and consolidated artifacts

## Consumption Order

1. Read \`consolidated/overview.json\`
2. Read \`consolidated/hotspot-catalog.json\` and \`consolidated/finding-catalog.json\`
3. Read individual \`agents/*/analysis.json\` for domain detail
4. Use \`data/runs/service-finance/*\` only when raw evidence is needed
`;
}

export function buildAgentReviewBundle(
  options: AgentReviewBundleOptions,
): AgentReviewBundleArtifacts {
  const summary = readJson<RunSummary>(join(options.canonicalDataDir, "summary.json"));
  const visualReport = readJson<VisualReport>(join(options.canonicalDataDir, "visual-report.json"));
  void visualReport;

  const coverageMap = buildCoverageMap(options.analyses, summary);
  coverageMap.datasetId = options.datasetId;
  const flowCatalog = buildFlowCatalog(options.datasetId, options.analyses);
  const hotspotCatalog = buildHotspotCatalog(options.datasetId, options.analyses);
  const findingCatalog = buildFindingCatalog(options.datasetId, options.analyses);
  const overview = buildConsolidatedOverview({
    datasetId: options.datasetId,
    analyses: [...options.analyses, options.consolidationAnalysis],
    coverageMap,
    hotspotCatalog,
    findingCatalog,
  });

  return {
    coverageMap,
    flowCatalog,
    hotspotCatalog,
    findingCatalog,
    overview,
  };
}

export function materializeAgentReviewBundle(
  options: AgentReviewBundleOptions,
): AgentReviewBundleArtifacts {
  ensureFile(join(options.canonicalDataDir, "manifest.json"));
  ensureFile(join(options.canonicalDataDir, "summary.json"));
  ensureFile(join(options.canonicalDataDir, "findings.json"));
  ensureFile(join(options.canonicalDataDir, "visual-report.json"));
  ensureFile(join(options.schemaDir, AGENT_SCHEMA_FILE));
  ensureFile(join(options.schemaDir, CONSOLIDATED_SCHEMA_FILE));

  const artifacts = buildAgentReviewBundle(options);
  const bundleDir = resolve(options.outDir);
  const agentsDir = join(bundleDir, "agents");
  const consolidatedDir = join(bundleDir, "consolidated");
  const schemasDir = join(bundleDir, "schemas");

  rmSync(schemasDir, { recursive: true, force: true });
  mkdirSync(agentsDir, { recursive: true });
  mkdirSync(consolidatedDir, { recursive: true });
  mkdirSync(schemasDir, { recursive: true });

  for (const analysis of [...options.analyses, options.consolidationAnalysis]) {
    writeJson(join(agentsDir, analysis.agentId, "analysis.json"), analysis);
  }

  writeJson(join(consolidatedDir, "coverage-map.json"), artifacts.coverageMap);
  writeJson(join(consolidatedDir, "flow-catalog.json"), artifacts.flowCatalog);
  writeJson(join(consolidatedDir, "hotspot-catalog.json"), artifacts.hotspotCatalog);
  writeJson(join(consolidatedDir, "finding-catalog.json"), artifacts.findingCatalog);
  writeJson(join(consolidatedDir, "overview.json"), artifacts.overview);

  cpSync(join(options.schemaDir, AGENT_SCHEMA_FILE), join(schemasDir, AGENT_SCHEMA_FILE));
  cpSync(join(options.schemaDir, CONSOLIDATED_SCHEMA_FILE), join(schemasDir, CONSOLIDATED_SCHEMA_FILE));

  writeJson(
    join(bundleDir, "index.json"),
    buildAgentReviewIndex({
      datasetId: options.datasetId,
      analyses: [...options.analyses, options.consolidationAnalysis],
      overview: artifacts.overview,
    }),
  );
  writeJson(join(bundleDir, "data-dictionary.json"), buildAgentReviewDictionary(options.datasetId));
  writeFileSync(join(bundleDir, "README.md"), buildAgentReviewReadme(options.datasetId));

  return artifacts;
}
