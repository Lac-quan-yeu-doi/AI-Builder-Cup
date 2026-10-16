import type { ValidationReport } from "./contracts.js";

export interface OutputValidator {
  validate(output: string): ValidationReport;
}

export interface OutputValidatorOptions {
  readonly maxCharacters: number;
}

export function createOutputValidator(
  options: OutputValidatorOptions,
): OutputValidator {
  if (!Number.isInteger(options.maxCharacters) || options.maxCharacters < 1) {
    throw new Error("maxCharacters must be a positive integer.");
  }
  return {
    validate(output: string): ValidationReport {
      if (!output.trim())
        return { valid: false, errors: ["Output must not be empty."] };
      if (output.length > options.maxCharacters) {
        return {
          valid: false,
          errors: [
            `Output exceeds the ${options.maxCharacters} character limit.`,
          ],
        };
      }
      return { valid: true, errors: [] };
    },
  };
}

export type { ValidationReport } from "./contracts.js";
