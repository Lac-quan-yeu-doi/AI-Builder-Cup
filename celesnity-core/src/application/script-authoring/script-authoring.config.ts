/**
 * Deployment settings the Script Authoring context needs.
 *
 * Grouped into one object rather than passed as trailing positional parameters.
 * Two adjacent `string` and `number` arguments at the end of a thirteen-parameter
 * constructor are trivially swappable and the compiler cannot object; a named
 * field cannot be passed in the wrong slot.
 */
export interface ScriptAuthoringConfig {
  /** Object-storage bucket holding published script sources. */
  readonly artifactsBucket: string;
  /** Hard ceiling on a single script source, in bytes. */
  readonly sourceMaxBytes: number;
}
