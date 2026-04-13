export type StepStatus =
  | "passed"
  | "findings"
  | "failed"
  | "skipped"
  | "unsupported";

export interface StepResult {
  id: string;
  status: StepStatus;
  durationMs: number;
  exitCode?: number;
  reason?: string;
  artifacts: string[];
}

export interface RunManifest {
  target: string;
  startedAt: string;
  finishedAt: string;
  overallStatus: StepStatus;
  steps: StepResult[];
}

export interface SummaryRunStep {
  id: string;
  status: StepStatus;
  artifacts: string[];
}

export interface SummaryRunInfo {
  target: string;
  resultsDir: string;
  overallStatus: StepStatus;
  generatedAt: string;
  steps: SummaryRunStep[];
}

export interface SummaryLanguageMetric {
  name: string;
  files: number;
  lines: number;
  codeLines: number;
  commentLines: number;
}

export interface SummaryComplexityHotspot {
  file: string;
  function: string;
  ccn: number;
  nloc: number;
  startLine: number;
  endLine: number;
}

export interface SummaryDuplicationPair {
  leftFile: string;
  rightFile: string;
  lines: number;
}

export interface SummaryDuplicationFile {
  file: string;
  duplicatedLines: number;
  duplicatedPercentage: number;
}

export interface SummaryRevisionsEntry {
  file: string;
  revisions: number;
}

export interface SummaryOwnershipHotspot {
  file: string;
  owner: string;
  ownership: number;
  revisions: number;
}

export interface SummaryAgeEntry {
  file: string;
  ageDays: number;
}

export interface SummaryCouplingEntry {
  file: string;
  coupledFile: string;
  degree: number;
}

export interface SummaryEffortEntry {
  author: string;
  added: number;
  deleted: number;
}

export interface SummaryDependencyPackage {
  package: string;
  installedVersion: string;
  severity: string;
  advisoryCount: number;
}

export interface SummaryCoverageAssessment {
  status: "useful" | "partial" | "weak";
  reason: string;
}

export interface SummaryCountEntry {
  ruleId: string;
  count: number;
}

export interface SummaryFamilyCountEntry {
  ruleFamily: string;
  count: number;
}

export interface SummaryFileCountEntry {
  file: string;
  messageCount: number;
}

export interface SummaryFindingCountEntry {
  file: string;
  findingCount: number;
}

export interface SummaryHotspot {
  file: string;
  score: number;
  signals: string[];
  notes: string[];
}

export type FindingSource =
  | "gitleaks"
  | "trivy"
  | "knip"
  | "eslint"
  | "opengrep";

export type FindingCategory =
  | "secret"
  | "dependency-vulnerability"
  | "unused-code"
  | "maintainability"
  | "policy";

export type FindingSeverity =
  | "critical"
  | "high"
  | "medium"
  | "low"
  | "warning"
  | "info";

export type FindingSubjectType =
  | "file"
  | "dependency"
  | "repo"
  | "config"
  | "function"
  | "unknown";

export type FindingDependencyKind = "direct" | "transitive";

export interface NormalizedFinding {
  id: string;
  stepId: string;
  source: FindingSource;
  category: FindingCategory;
  severity: FindingSeverity;
  ruleId: string;
  ruleFamily: string | null;
  file: string | null;
  line: number | null;
  message: string;
  fingerprint: string | null;
  rawRef: string;
  subjectType: FindingSubjectType;
  subjectKey: string;
  packageName?: string;
  packageVersion?: string;
  dependencyKind?: FindingDependencyKind;
  bucket?: string;
}

export type NormalizedFindingList = NormalizedFinding[];

export interface DrilldownFilters {
  sources?: FindingSource[];
  categories?: FindingCategory[];
  severities?: FindingSeverity[];
  ruleIds?: string[];
  ruleFamilies?: string[];
  files?: string[];
  packages?: string[];
  buckets?: string[];
}

export interface DrilldownRef {
  type: "findings" | "file" | "artifact";
  filters?: DrilldownFilters;
  file?: string;
  artifact?: string;
}

export interface MetricCard {
  id: string;
  label: string;
  value: number | string;
  unit?: string;
  tone: "neutral" | "info" | "warning" | "critical" | "positive";
  subtitle?: string;
  drilldown?: DrilldownRef;
}

export interface BreakdownPoint {
  key: string;
  label: string;
  value: number;
  severity?: FindingSeverity;
  drilldown?: DrilldownRef;
}

export interface TableColumn {
  key: string;
  label: string;
}

export type TableRowValue = string | number | boolean | null;

export interface TableRow {
  key: string;
  label?: string;
  values: Record<string, TableRowValue>;
  drilldown?: DrilldownRef;
}

export interface TableBlock {
  id: string;
  title: string;
  columns: TableColumn[];
  rows: TableRow[];
}

export interface VisualReportLink {
  stepId: string;
  path: string;
}

export interface VisualReport {
  schemaVersion: "v1";
  run: {
    target: string;
    resultsDir: string;
    overallStatus: StepStatus;
    generatedAt: string;
    summaryPath: string;
    findingsPath: string;
  };
  facets: {
    sources: BreakdownPoint[];
    categories: BreakdownPoint[];
    severities: BreakdownPoint[];
    ruleFamilies: BreakdownPoint[];
    stepStatuses: BreakdownPoint[];
  };
  overview: {
    cards: MetricCard[];
    stepStatus: BreakdownPoint[];
    findingMix: BreakdownPoint[];
  };
  executive: {
    cards: MetricCard[];
    topRisks: TableBlock;
    security: {
      severityBreakdown: BreakdownPoint[];
      directPackages: TableBlock;
      transitivePackages: TableBlock;
    };
    quality: {
      cards: MetricCard[];
      notes: string[];
    };
  };
  engineering: {
    hotspots: TableBlock;
    complexity: {
      cards: MetricCard[];
      thresholds: BreakdownPoint[];
      hotspots: TableBlock;
    };
    duplication: {
      cards: MetricCard[];
      files: TableBlock;
      pairs: TableBlock;
    };
    changeRisk: {
      revisions: TableBlock;
      ownership: TableBlock;
      oldest: TableBlock;
    };
    maintainability: {
      rules: TableBlock;
      files: TableBlock;
    };
    deadCode: {
      counts: BreakdownPoint[];
      dependencies: TableBlock;
      devDependencies: TableBlock;
      unlistedPackages: TableBlock;
      unresolvedImports: TableBlock;
    };
    policy: {
      families: TableBlock;
      files: TableBlock;
    };
    secrets: {
      rules: TableBlock;
      files: TableBlock;
      noisyRules: string[];
    };
    architecture: {
      cards: MetricCard[];
      coverageAssessment: SummaryCoverageAssessment;
    };
  };
  links: {
    artifacts: VisualReportLink[];
  };
}

export interface RunSummary {
  schemaVersion: "v1";
  run: SummaryRunInfo;
  size: {
    filesTotal: number;
    linesTotal: number;
    codeLines: number;
    commentLines: number;
    blankLines: number;
    languages: SummaryLanguageMetric[];
  };
  complexity: {
    functionsTotal: number;
    thresholds: {
      ccnGte10: number;
      ccnGte20: number;
      nlocGte150: number;
    };
    hotspots: SummaryComplexityHotspot[];
  };
  duplication: {
    cloneGroups: number;
    duplicatedLines: number;
    duplicatedTokens: number;
    percentage: number;
    topPairs: SummaryDuplicationPair[];
    topFiles: SummaryDuplicationFile[];
  };
  changeRisk: {
    topRevisions: SummaryRevisionsEntry[];
    ownershipHotspots: SummaryOwnershipHotspot[];
    oldestFiles: SummaryAgeEntry[];
    topCouplings: SummaryCouplingEntry[];
    effortByAuthor: SummaryEffortEntry[];
    notes: string[];
  };
  dependencySecurity: {
    countsBySeverity: Record<string, number>;
    directPackages: SummaryDependencyPackage[];
    transitivePackages: SummaryDependencyPackage[];
    sbomArtifact: string | null;
  };
  architecture: {
    modulesCruised: number;
    dependenciesCruised: number;
    cycleCount: number;
    unresolvedCount: number;
    coverageAssessment: SummaryCoverageAssessment;
  };
  deadCode: {
    counts: {
      unusedFiles: number;
      unusedDependencies: number;
      unusedDevDependencies: number;
      unlistedPackages: number;
      unresolvedImports: number;
      unusedBinaries: number;
    };
    unusedDependencies: Array<{ name: string; file: string }>;
    unusedDevDependencies: Array<{ name: string; file: string }>;
    unlistedPackages: Array<{ name: string; file: string }>;
    unresolvedImports: Array<{ name: string; file: string }>;
  };
  maintainability: {
    errorCount: number;
    warningCount: number;
    topRules: SummaryCountEntry[];
    topFiles: SummaryFileCountEntry[];
  };
  policy: {
    topRuleFamilies: SummaryFamilyCountEntry[];
    topFiles: SummaryFindingCountEntry[];
  };
  secrets: {
    topRules: SummaryCountEntry[];
    topFiles: SummaryFindingCountEntry[];
    noisyRules: string[];
  };
  hotspots: SummaryHotspot[];
}

export type ReviewRiskLevel = "critical" | "high" | "medium" | "low";
export type ReviewConfidence = "high" | "medium";
export type RecommendationPriority = "p0" | "p1" | "p2";
export type ReviewClusterCategory =
  | "security"
  | "maintainability"
  | "duplication"
  | "change-risk"
  | "policy"
  | "dead-code"
  | "architecture";

export interface AgentReviewSummary {
  headline: string;
  riskLevel: ReviewRiskLevel;
  confidence: ReviewConfidence;
  why: string;
}

export interface AgentReviewScope {
  ownedPaths: string[];
  supportingPaths: string[];
  inputFiles: string[];
  rawArtifacts: string[];
}

export interface AgentFlow {
  id: string;
  name: string;
  entryPoints: string[];
  services: string[];
  stateOwners: string[];
  sensitiveData: string[];
  externalBoundaries: string[];
  riskNotes: string[];
}

export interface AgentHotspot {
  file: string;
  score: number;
  reasons: string[];
  sourceMetrics: {
    complexity: number;
    duplication: number;
    revisions: number;
    findings: number;
  };
  evidenceRefs: string[];
}

export interface AgentFindingCluster {
  clusterId: string;
  title: string;
  category: ReviewClusterCategory;
  severity: ReviewRiskLevel;
  files: string[];
  evidenceRefs: string[];
  recommendation: string;
}

export interface AgentRecommendation {
  id: string;
  priority: RecommendationPriority;
  action: string;
  affectedFiles: string[];
  reason: string;
}

export interface AgentAnalysis {
  schemaVersion: "v1";
  agentId: string;
  domain: string;
  summary: AgentReviewSummary;
  reviewScope: AgentReviewScope;
  metrics: Record<string, number>;
  flows: AgentFlow[];
  hotspots: AgentHotspot[];
  findingClusters: AgentFindingCluster[];
  recommendations: AgentRecommendation[];
}

export interface CoverageMapEntry {
  path: string;
  ownerAgentId: string;
  ownerDomain: string;
  supportingAgentIds: string[];
  supportingDomains: string[];
}

export interface CoverageMap {
  schemaVersion: "v1";
  kind: "coverage-map";
  datasetId: string;
  entries: CoverageMapEntry[];
  ownershipConflicts: string[];
  unownedHotspots: string[];
}

export interface ConsolidatedFlow extends AgentFlow {
  agentIds: string[];
  domains: string[];
}

export interface FlowCatalog {
  schemaVersion: "v1";
  kind: "flow-catalog";
  datasetId: string;
  flows: ConsolidatedFlow[];
}

export interface ConsolidatedHotspot {
  file: string;
  score: number;
  reasons: string[];
  agentIds: string[];
  domains: string[];
  sourceMetrics: {
    complexity: number;
    duplication: number;
    revisions: number;
    findings: number;
  };
  evidenceRefs: string[];
}

export interface HotspotCatalog {
  schemaVersion: "v1";
  kind: "hotspot-catalog";
  datasetId: string;
  hotspots: ConsolidatedHotspot[];
}

export interface ConsolidatedFindingCluster extends AgentFindingCluster {
  agentIds: string[];
  domains: string[];
}

export interface FindingCatalog {
  schemaVersion: "v1";
  kind: "finding-catalog";
  datasetId: string;
  findingClusters: ConsolidatedFindingCluster[];
}

export interface ConsolidatedOverview {
  schemaVersion: "v1";
  kind: "overview";
  datasetId: string;
  counts: {
    agentCount: number;
    distinctHotspotFiles: number;
    distinctFindingClusters: number;
    crossDomainFiles: number;
    sourceCoveragePercent: number;
    reportReadyDatasetCount: number;
    unownedHotspotCount: number;
  };
  topPriorities: Array<{
    priority: RecommendationPriority;
    action: string;
    domains: string[];
    affectedFiles: string[];
    recommendationIds: string[];
  }>;
  reportInputs: string[];
}

export type ConsolidatedReviewArtifact =
  | CoverageMap
  | FlowCatalog
  | HotspotCatalog
  | FindingCatalog
  | ConsolidatedOverview;
