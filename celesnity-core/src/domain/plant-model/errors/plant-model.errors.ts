export enum PlantModelErrorCode {
  VALIDATION = 'PLANT_MODEL_INVALID',
  NOT_FOUND = 'PLANT_MODEL_NOT_FOUND',
  NAME_CONFLICT = 'PLANT_SITE_CODE_DUPLICATED',
  VERSION_CONFLICT = 'PLANT_MODEL_VERSION_CONFLICT',
  ALREADY_PUBLISHED = 'PLANT_MODEL_ALREADY_PUBLISHED',
  CATALOG_LOOKUP_AMBIGUOUS = 'PLANT_CATALOG_LOOKUP_AMBIGUOUS',
}

export class PlantModelError extends Error {
  private constructor(
    public readonly code: PlantModelErrorCode,
    message: string,
  ) {
    super(message);
    this.name = PlantModelError.name;
  }

  public static validation(message: string): PlantModelError {
    return new PlantModelError(PlantModelErrorCode.VALIDATION, message);
  }
  public static notFound(message = 'The plant site was not found.'): PlantModelError {
    return new PlantModelError(PlantModelErrorCode.NOT_FOUND, message);
  }
  public static nameConflict(): PlantModelError {
    return new PlantModelError(
      PlantModelErrorCode.NAME_CONFLICT,
      'A plant site with this code already exists.',
    );
  }
  public static versionConflict(): PlantModelError {
    return new PlantModelError(
      PlantModelErrorCode.VERSION_CONFLICT,
      'The plant model revision has changed. Reload before saving.',
    );
  }
  public static alreadyPublished(): PlantModelError {
    return new PlantModelError(
      PlantModelErrorCode.ALREADY_PUBLISHED,
      'This saved revision has already been published.',
    );
  }
  public static catalogLookupAmbiguous(): PlantModelError {
    return new PlantModelError(
      PlantModelErrorCode.CATALOG_LOOKUP_AMBIGUOUS,
      'The catalog lookup returned more than one row.',
    );
  }
}
