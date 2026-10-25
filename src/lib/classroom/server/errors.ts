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

/**
 * The stop request may already have reached the recording worker even though
 * Shengwang did not return a definitive response. Treat this as an
 * asynchronous finalization state and reconcile the worker/OSS instead of
 * retrying the stop blindly or declaring the recording lost.
 */
export class ClassroomRecordingStopUncertainError extends Error {
  constructor(
    message: string,
    readonly causeValue?: unknown,
  ) {
    super(message);
    this.name = "ClassroomRecordingStopUncertainError";
  }
}

export class ClassroomConnectionEndedError extends Error {
  constructor() { super("Classroom has ended"); this.name = "ClassroomConnectionEndedError"; }
}

export class ClassroomDeviceConflictError extends Error {
  constructor(readonly devices: string[]) { super("Account is already in this classroom"); this.name = "ClassroomDeviceConflictError"; }
}

export class ClassroomConnectionReplacedError extends Error {
  constructor() { super("This classroom connection was replaced"); this.name = "ClassroomConnectionReplacedError"; }
}
