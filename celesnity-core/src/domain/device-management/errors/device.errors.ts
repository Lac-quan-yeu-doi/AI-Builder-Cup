export enum DeviceErrorCode {
  VALIDATION = 'DEVICE_INVALID',
  NOT_FOUND = 'DEVICE_NOT_FOUND',
  ADAPTER_NOT_FOUND = 'DEVICE_ADAPTER_NOT_FOUND',
  ID_CONFLICT = 'DEVICE_ID_DUPLICATED',
  STATE_CONFLICT = 'DEVICE_STATE_CONFLICT',
}

export class DeviceError extends Error {
  private constructor(
    public readonly code: DeviceErrorCode,
    message: string,
  ) {
    super(message);
    this.name = DeviceError.name;
  }

  public static validation(message: string): DeviceError {
    return new DeviceError(DeviceErrorCode.VALIDATION, message);
  }

  public static notFound(): DeviceError {
    return new DeviceError(DeviceErrorCode.NOT_FOUND, 'The device was not found.');
  }

  public static adapterNotFound(): DeviceError {
    return new DeviceError(
      DeviceErrorCode.ADAPTER_NOT_FOUND,
      'The active MQTT adapter was not found.',
    );
  }

  public static idConflict(): DeviceError {
    return new DeviceError(
      DeviceErrorCode.ID_CONFLICT,
      'A device with this identifier already exists for the MQTT adapter.',
    );
  }

  public static stateConflict(message: string): DeviceError {
    return new DeviceError(DeviceErrorCode.STATE_CONFLICT, message);
  }
}
