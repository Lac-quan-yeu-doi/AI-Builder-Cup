export interface ExecutionConnectionDescriptorState {
  readonly driverClass: string;
  readonly jdbcUrl: string;
  readonly publicOptions: Readonly<Record<string, string>>;
  readonly secretOptions: Readonly<Record<string, string>>;
}

/**
 * DBMS-neutral runtime details handed to the Spark gateway. Secret options remain
 * available to the process that builds the environment, but are redacted if this
 * descriptor is logged or serialized.
 */
export class ExecutionConnectionDescriptor {
  public readonly driverClass: string;
  public readonly jdbcUrl: string;
  public readonly publicOptions: Readonly<Record<string, string>>;
  public readonly secretOptions: Readonly<Record<string, string>>;

  private constructor(state: ExecutionConnectionDescriptorState) {
    this.driverClass = state.driverClass;
    this.jdbcUrl = state.jdbcUrl;
    this.publicOptions = { ...state.publicOptions };
    this.secretOptions = { ...state.secretOptions };
  }

  public static create(state: ExecutionConnectionDescriptorState): ExecutionConnectionDescriptor {
    return new ExecutionConnectionDescriptor(state);
  }

  public toJSON(): Record<string, unknown> {
    return {
      driverClass: this.driverClass,
      jdbcUrl: this.jdbcUrl,
      publicOptions: { ...this.publicOptions },
      secretOptions: Object.fromEntries(
        Object.keys(this.secretOptions).map((key) => [key, '[REDACTED]']),
      ),
    };
  }
}
