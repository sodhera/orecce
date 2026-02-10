import { afterEach, describe, expect, it } from "vitest";
import { getOpenAiApiKey } from "../src/config/runtimeConfig";

const ORIGINAL_ENV = { ...process.env };

describe("runtimeConfig", () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("normalizes quoted OPENAI_API_KEY values", () => {
    process.env.OPENAI_API_KEY = "\"sk-test-quoted\"";
    expect(getOpenAiApiKey()).toBe("sk-test-quoted");
  });

  it("falls back to OPENAI_KEY and strips single quotes", () => {
    delete process.env.OPENAI_API_KEY;
    process.env.OPENAI_KEY = "'sk-test-fallback'";
    expect(getOpenAiApiKey()).toBe("sk-test-fallback");
  });
});
