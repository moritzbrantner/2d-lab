export type VizErrorCode =
  | "viz-aborted"
  | "viz-backend-unavailable"
  | "viz-disposed"
  | "viz-invalid-dataset"
  | "viz-invalid-layer"
  | "viz-invalid-query"
  | "viz-invalid-viewport"
  | "viz-missing-dataset"
  | "viz-missing-layer"
  | "viz-table-wasm-query-failed"
  | "viz-wasm-unavailable"
  | "viz-worker-request-failed"
  | "viz-worker-timeout";

export class VizEngineError extends Error {
  readonly code: VizErrorCode | string;
  readonly details?: Record<string, unknown>;

  constructor(
    code: VizErrorCode | string,
    message: string,
    options: { cause?: unknown; details?: Record<string, unknown> } = {},
  ) {
    super(message, options);
    this.name = "VizEngineError";
    this.code = code;
    this.details = options.details;
  }
}

export class VizAbortError extends VizEngineError {
  constructor(message = "Viz operation was aborted.", options?: ConstructorOptions) {
    super("viz-aborted", message, options);
    this.name = "VizAbortError";
  }
}

export class VizBackendError extends VizEngineError {
  constructor(code: VizErrorCode | string, message: string, options?: ConstructorOptions) {
    super(code, message, options);
    this.name = "VizBackendError";
  }
}

export class VizDisposedError extends VizEngineError {
  constructor(message = "Viz engine has been disposed.", options?: ConstructorOptions) {
    super("viz-disposed", message, options);
    this.name = "VizDisposedError";
  }
}

export class VizInvalidInputError extends VizEngineError {
  constructor(code: VizErrorCode | string, message: string, options?: ConstructorOptions) {
    super(code, message, options);
    this.name = "VizInvalidInputError";
  }
}

export class VizWorkerError extends VizEngineError {
  constructor(code: VizErrorCode | string, message: string, options?: ConstructorOptions) {
    super(code, message, options);
    this.name = "VizWorkerError";
  }
}

export class VizWasmUnavailableError extends VizBackendError {
  constructor(message = "Viz Engine WASM is not available.", options?: ConstructorOptions) {
    super("viz-wasm-unavailable", message, options);
    this.name = "VizWasmUnavailableError";
  }
}

export type SerializedVizEngineError = {
  code: string;
  details?: Record<string, unknown>;
  message: string;
  name: string;
  stack?: string;
};

type ConstructorOptions = { cause?: unknown; details?: Record<string, unknown> };

export function isVizEngineError(error: unknown): error is VizEngineError {
  return error instanceof VizEngineError;
}

export function serializeVizError(error: unknown): SerializedVizEngineError {
  if (isVizEngineError(error)) {
    return {
      code: String(error.code),
      details: error.details,
      message: error.message,
      name: error.name,
      stack: error.stack,
    };
  }

  if (error instanceof Error) {
    const code = "code" in error && error.code ? String(error.code) : "viz-worker-request-failed";
    return {
      code,
      message: error.message,
      name: error.name,
      stack: error.stack,
    };
  }

  return {
    code: "viz-worker-request-failed",
    message: String(error),
    name: "VizEngineError",
  };
}

export function deserializeVizError(error: SerializedVizEngineError): VizEngineError {
  const options = { details: error.details };
  let deserialized: VizEngineError;

  switch (error.name) {
    case "VizAbortError":
      deserialized = new VizAbortError(error.message, options);
      break;
    case "VizBackendError":
      deserialized = new VizBackendError(error.code, error.message, options);
      break;
    case "VizDisposedError":
      deserialized = new VizDisposedError(error.message, options);
      break;
    case "VizInvalidInputError":
      deserialized = new VizInvalidInputError(error.code, error.message, options);
      break;
    case "VizWorkerError":
      deserialized = new VizWorkerError(error.code, error.message, options);
      break;
    case "VizWasmUnavailableError":
      deserialized = new VizWasmUnavailableError(error.message, options);
      break;
    default:
      deserialized = new VizEngineError(error.code, error.message, options);
      deserialized.name = error.name || "VizEngineError";
      break;
  }

  deserialized.stack = error.stack;
  return deserialized;
}
