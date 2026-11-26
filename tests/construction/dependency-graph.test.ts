import { describe, expect, it } from "vitest";
import { createsDependencyCycle } from "@/server/construction/dependency-graph";
const edges = [{ predecessorTaskId: "A", successorTaskId: "B" }, { predecessorTaskId: "B", successorTaskId: "C" }];
describe("finish-to-start dependency graph", () => {
  it("rejects self dependency", () => expect(createsDependencyCycle([], "A", "A")).toBe(true));
  it("rejects a two-node cycle", () => expect(createsDependencyCycle(edges, "B", "A")).toBe(true));
  it("rejects a transitive cycle", () => expect(createsDependencyCycle(edges, "C", "A")).toBe(true));
  it("allows a forward edge", () => expect(createsDependencyCycle(edges, "A", "C")).toBe(false));
  it("allows unrelated tasks", () => expect(createsDependencyCycle(edges, "D", "A")).toBe(false));
});
