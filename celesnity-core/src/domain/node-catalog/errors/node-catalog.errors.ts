export enum NodeCatalogErrorCode {
  NOT_FOUND = 'NOT_FOUND',
  DISABLED = 'DISABLED',
  INVALID_CONFIGURATION = 'INVALID_CONFIGURATION',
}

export class NodeCatalogError extends Error {
  private constructor(
    public readonly code: NodeCatalogErrorCode,
    message: string,
  ) {
    super(message);
    this.name = NodeCatalogError.name;
  }

  public static notFound(): NodeCatalogError {
    return new NodeCatalogError(
      NodeCatalogErrorCode.NOT_FOUND,
      'The node definition was not found.',
    );
  }

  public static disabled(): NodeCatalogError {
    return new NodeCatalogError(NodeCatalogErrorCode.DISABLED, 'The node type is disabled.');
  }

  public static invalidConfiguration(): NodeCatalogError {
    return new NodeCatalogError(
      NodeCatalogErrorCode.INVALID_CONFIGURATION,
      'The stored node definition is invalid.',
    );
  }
}
