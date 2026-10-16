/**
 * The small, DBMS-neutral form contract exposed to Web. Connector adapters
 * own the field definitions; the UI only renders these descriptors and sends
 * the selected values back as `details`.
 */
export type DatabaseServiceFormFieldType = 'text' | 'number' | 'url' | 'password' | 'select';

export interface DatabaseServiceFormFieldOption {
  readonly value: string;
  readonly label: string;
}

export interface DatabaseServiceFormFieldDescriptor {
  readonly key: string;
  readonly label: string;
  readonly type: DatabaseServiceFormFieldType;
  readonly required?: boolean;
  readonly secret?: boolean;
  readonly mode?: 'structured' | 'url';
  readonly placeholder?: string;
  readonly options?: readonly DatabaseServiceFormFieldOption[];
}

export interface DatabaseServiceConnectorDescriptor {
  readonly connectorType: string;
  readonly label: string;
  readonly configSchemaVersion: number;
  readonly formSchema: {
    readonly fields: readonly DatabaseServiceFormFieldDescriptor[];
  };
}
