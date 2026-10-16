import { afterEach, describe, expect, it, vi } from "vitest";
import { clearTtlCache, withTtlCache } from "./cache";

describe("in-memory TTL cache", () => {
  afterEach(() => {
    clearTtlCache();
  });

  it("shares one in-flight request among concurrent callers", async () => {
    const loader = vi.fn(async () => ({ value: "cached" }));
    const [first, second] = await Promise.all([
      withTtlCache("shared-request", 1_000, loader),
      withTtlCache("shared-request", 1_000, loader),
    ]);

    expect(first).toEqual({ value: "cached" });
    expect(second).toEqual({ value: "cached" });
    expect(loader).toHaveBeenCalledTimes(1);
  });
});
