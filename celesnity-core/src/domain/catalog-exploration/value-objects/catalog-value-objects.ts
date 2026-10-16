import { CatalogError } from '@domain/catalog-exploration/errors/catalog.errors';
import { CatalogMessage } from '@domain/catalog-exploration/errors/catalog.messages';
import { SharedValidationMessage } from '@domain/shared/validation-messages';

/**
 * Safe identifier pattern for catalog, namespace, table, and column names.
 *
 * Only ASCII letters, digits, and underscores are permitted (Requirement 4.5).
 * Anything else - dots, quotes, whitespace, semicolons, dollar signs, control
 * characters - is rejected so that no unsafe token can ever reach composed SQL.
 */
const SAFE_IDENTIFIER_PATTERN = /^[A-Za-z0-9_]+$/u;
const MAX_IDENTIFIER_LENGTH = 255;

/**
 * Suffix pattern for Iceberg metadata tables (for example `snapshots` in
 * `orders$snapshots`). Constrained to lowercase letters so the composed
 * `<table>$<suffix>` identifier remains fully controlled by the application.
 */
const SAFE_METADATA_SUFFIX_PATTERN = /^[a-z]+$/u;

const MAX_COLUMN_TYPE_LENGTH = 65_535;

/**
 * Double-quotes a Trino identifier, escaping any embedded double-quote by
 * doubling it. Callers must only pass identifiers that have already passed
 * strict validation; quoting is a second line of defence, not a substitute for
 * validation (Requirement 4.5).
 */
export function quoteIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/gu, '""')}"`;
}

function validateIdentifier(label: string, value: string): string {
  if (typeof value !== 'string') {
    throw CatalogError.validation(SharedValidationMessage.isRequired(label));
  }
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw CatalogError.validation(SharedValidationMessage.isRequired(label));
  }
  if (normalized.length > MAX_IDENTIFIER_LENGTH) {
    throw CatalogError.validation(
      SharedValidationMessage.mustNotExceedCharacters(label, MAX_IDENTIFIER_LENGTH),
    );
  }
  if (!SAFE_IDENTIFIER_PATTERN.test(normalized)) {
    throw CatalogError.validation(CatalogMessage.identifierUnsupportedCharacters(label));
  }
  return normalized;
}

abstract class CatalogIdentifier {
  protected constructor(public readonly value: string) {
    Object.freeze(this);
  }

  /** The identifier rendered as a safely double-quoted Trino token. */
  public get quoted(): string {
    return quoteIdentifier(this.value);
  }

  public equals(other: CatalogIdentifier): boolean {
    return this.value === other.value;
  }

  public toString(): string {
    return this.value;
  }
}

export class CatalogName extends CatalogIdentifier {
  public static create(value: string): CatalogName {
    return new CatalogName(validateIdentifier('Catalog name', value));
  }
}

export class NamespaceName extends CatalogIdentifier {
  public static create(value: string): NamespaceName {
    return new NamespaceName(validateIdentifier('Namespace name', value));
  }
}

export class TableName extends CatalogIdentifier {
  public static create(value: string): TableName {
    return new TableName(validateIdentifier('Table name', value));
  }
}

export class ColumnName extends CatalogIdentifier {
  public static create(value: string): ColumnName {
    return new ColumnName(validateIdentifier('Column name', value));
  }
}

/**
 * A Trino-visible data type (for example `varchar(255)` or `row(a integer)`).
 *
 * This value originates from Trino metadata, never from user input, and is
 * never interpolated into SQL. Validation is therefore lax: it only guards
 * against empty or pathologically large values and control characters.
 */
export class ColumnType {
  private constructor(public readonly value: string) {
    Object.freeze(this);
  }

  public static create(value: string): ColumnType {
    const normalized = typeof value === 'string' ? value.trim() : '';
    if (normalized.length === 0) {
      throw CatalogError.validation(CatalogMessage.columnTypeRequired);
    }
    if (normalized.length > MAX_COLUMN_TYPE_LENGTH || normalized.includes('\0')) {
      throw CatalogError.validation(CatalogMessage.columnTypeInvalid);
    }
    return new ColumnType(normalized);
  }

  public equals(other: ColumnType): boolean {
    return this.value === other.value;
  }
}

/**
 * A fully validated, fully qualified path to a Trino table.
 *
 * Because every component is a validated identifier, the SQL rendering helpers
 * can safely double-quote each part. No raw string ever reaches this class.
 */
export class TablePath {
  private constructor(
    public readonly catalog: CatalogName,
    public readonly schema: NamespaceName,
    public readonly table: TableName,
  ) {
    Object.freeze(this);
  }

  public static create(catalog: string, schema: string, table: string): TablePath {
    return new TablePath(
      CatalogName.create(catalog),
      NamespaceName.create(schema),
      TableName.create(table),
    );
  }

  /** Renders `"catalog"."schema"."table"` for use in Trino SQL. */
  public toQualifiedSql(): string {
    return `${this.catalog.quoted}.${this.schema.quoted}.${this.table.quoted}`;
  }

  /**
   * Renders `"catalog"."schema"."table$suffix"` for Iceberg metadata tables
   * such as `$snapshots`. The suffix is constrained to a safe pattern and the
   * composed identifier is quoted as a single token.
   */
  public toMetadataTableSql(suffix: string): string {
    if (!SAFE_METADATA_SUFFIX_PATTERN.test(suffix)) {
      throw CatalogError.validation(CatalogMessage.metadataTableSuffixInvalid);
    }
    const metadataIdentifier = quoteIdentifier(`${this.table.value}$${suffix}`);
    return `${this.catalog.quoted}.${this.schema.quoted}.${metadataIdentifier}`;
  }
}
