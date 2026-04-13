import { describe, expect, test } from "bun:test";

import { analyzeGitHistory } from "./git-metrics";

describe("analyzeGitHistory", () => {
  test("derives revisions, churn, coupling, ownership, effort, and age from one git log stream", () => {
    const gitLog = [
      "--a1--2026-04-01--Alice",
      "3\t1\tsrc/a.ts",
      "1\t0\tsrc/b.ts",
      "--b2--2026-04-03--Bob",
      "2\t0\tsrc/a.ts",
      "4\t0\tsrc/c.ts",
      "--c3--2026-04-05--Alice",
      "0\t3\tsrc/b.ts",
      "",
    ].join("\n");

    const metrics = analyzeGitHistory(gitLog, new Date("2026-04-10T00:00:00Z"));

    expect(metrics.revisions).toEqual([
      { entity: "src/a.ts", nRevs: 2 },
      { entity: "src/b.ts", nRevs: 2 },
      { entity: "src/c.ts", nRevs: 1 },
    ]);

    expect(metrics.churn).toEqual([
      { entity: "src/a.ts", nRevs: 2 },
      { entity: "src/b.ts", nRevs: 2 },
      { entity: "src/c.ts", nRevs: 1 },
    ]);

    expect(metrics.coupling).toEqual([
      { entity: "src/a.ts", coupled: "src/b.ts", degree: 0.3333 },
      { entity: "src/a.ts", coupled: "src/c.ts", degree: 0.3333 },
    ]);

    expect(metrics.ownership).toEqual([
      { entity: "src/a.ts", owner: "Alice", ownership: 0.6667 },
      { entity: "src/b.ts", owner: "Alice", ownership: 1 },
      { entity: "src/c.ts", owner: "Bob", ownership: 1 },
    ]);

    expect(metrics.effort).toEqual([
      { author: "Alice", added: 4, deleted: 4 },
      { author: "Bob", added: 6, deleted: 0 },
    ]);

    expect(metrics.age).toEqual([
      { entity: "src/b.ts", ageDays: 5 },
      { entity: "src/a.ts", ageDays: 7 },
      { entity: "src/c.ts", ageDays: 7 },
    ]);
  });
});
