export interface InstructionFrontmatter {
  readonly include?: readonly string[];
  readonly exclude?: readonly string[];
  readonly conditions?: readonly string[];
}
