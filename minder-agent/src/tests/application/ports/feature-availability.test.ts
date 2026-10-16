import { describe, expect, it } from "vitest";

import {
  FeatureNotImplementedError,
  unavailable,
} from "@application/shared/ports/index.js";

describe("port availability", () => {
  it("throws the shared unavailable error with the requested feature id", () => {
    expect(() => unavailable("full-react-loop")).toThrow(
      FeatureNotImplementedError,
    );
    expect(() => unavailable("full-react-loop")).toThrow("full-react-loop");
  });
});
