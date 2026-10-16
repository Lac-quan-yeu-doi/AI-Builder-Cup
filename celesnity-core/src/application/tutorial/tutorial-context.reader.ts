export const TUTORIAL_CONTEXT_READER = Symbol('TutorialContextReader');

export interface TutorialContextResource {
  readonly id: string;
  readonly name: string;
  readonly resourceType: string;
}

export interface TutorialContextReader {
  listAuthorized(resourceType: string): Promise<readonly TutorialContextResource[]>;
}
