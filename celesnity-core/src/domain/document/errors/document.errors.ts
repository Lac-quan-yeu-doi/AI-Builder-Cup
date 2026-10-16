export class DocumentError extends Error {
  public readonly code: string;

  private constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'DocumentError';
  }

  public static notFound(id: string): DocumentError {
    return new DocumentError('DOCUMENT_NOT_FOUND', `Document not found: ${id}`);
  }

  public static unsupportedMimeType(mimeType: string, allowed: readonly string[]): DocumentError {
    return new DocumentError(
      'UNSUPPORTED_MIME_TYPE',
      `Unsupported document type: ${mimeType}. Accepted types: ${allowed.join(', ')}.`,
    );
  }

  public static tooLarge(byteSize: number, maxBytes: number): DocumentError {
    return new DocumentError(
      'DOCUMENT_TOO_LARGE',
      `Document is ${byteSize} bytes, which exceeds the ${maxBytes}-byte limit.`,
    );
  }

  public static tooManyPages(pageCount: number, maxPages: number): DocumentError {
    return new DocumentError(
      'TOO_MANY_PAGES',
      `Document has ${pageCount} pages, which exceeds the ${maxPages}-page limit.`,
    );
  }

  public static invalidPageRange(
    startPage: number,
    endPage: number,
    pageCount: number,
  ): DocumentError {
    return new DocumentError(
      'INVALID_PAGE_RANGE',
      `Requested pages ${startPage}-${endPage} are outside this document's 1-${pageCount} range.`,
    );
  }

  public static extractionFailed(reason: string): DocumentError {
    return new DocumentError('EXTRACTION_FAILED', `Failed to extract document text: ${reason}`);
  }
}
