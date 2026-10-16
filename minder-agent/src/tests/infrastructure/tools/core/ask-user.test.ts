import { describe, expect, it } from "vitest";
import { buildAskUserRequest } from "@infrastructure/tools/core/index.js";

describe("buildAskUserRequest", () => {
  it("normalizes valid options and defaults allow_other", () => {
    expect(
      buildAskUserRequest({
        question: "  Which database?  ",
        options: [
          { label: " Postgres ", description: " Existing service " },
          "SQLite",
          { label: "Postgres" },
          { label: "  " },
        ],
      }),
    ).toEqual({
      version: 1,
      kind: "choice",
      question: "Which database?",
      options: [
        { label: "Postgres", description: "Existing service" },
        { label: "SQLite" },
      ],
      allow_other: true,
    });
  });

  it("keeps at most eight options and falls back to free text", () => {
    const options = Array.from({ length: 10 }, (_, index) => ({
      label: `Option ${index}`,
    }));
    expect(
      buildAskUserRequest({ question: "Choose", options, allow_other: false }),
    ).toMatchObject({
      kind: "choice",
      allow_other: false,
      options: options.slice(0, 8),
    });
    expect(
      buildAskUserRequest({
        question: "  Explain the choice  ",
        options: ["", { label: " " }],
      }),
    ).toEqual({
      version: 1,
      kind: "free_text",
      question: "Explain the choice",
      options: [],
      allow_other: true,
    });
  });

  it("returns undefined when the question is missing or blank", () => {
    expect(buildAskUserRequest({})).toBeUndefined();
    expect(buildAskUserRequest({ question: "   " })).toBeUndefined();
  });
});
