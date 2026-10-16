import { describe, expect, it } from "vitest";

import { FeatureNotImplementedError } from "@domain/index.js";

describe("feature availability", () => {
  it("retains the stable unavailable feature id", () => {
    const error = new FeatureNotImplementedError("full-react-loop");

    expect(error.feature).toBe("full-react-loop");
    expect(error.state).toBe("unavailable");
  });
});
