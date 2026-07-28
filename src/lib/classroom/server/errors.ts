import "server-only";

export class ClassroomProviderConfigurationError extends Error {
  constructor(
    message: string,
    readonly missingVariables: readonly string[] = [],
  ) {
    super(message);
    this.name = "ClassroomProviderConfigurationError";
  }
}

export class ClassroomProviderRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly response: unknown,
  ) {
    super(message);
    this.name = "ClassroomProviderRequestError";
  }
}
