import type {
  VizBackendImplementation,
  VizBackendOption,
  VizDatasetId,
  VizDiagnosticCode,
  VizDiagnosticSeverity,
  VizFrameDiagnostic,
  VizLayerId,
  VizResolvedBackend,
} from "./types";

export function createBackendDiagnostic(input: {
  code: VizDiagnosticCode;
  datasetId?: VizDatasetId;
  layerId?: VizLayerId;
  requested?: VizBackendOption;
  selected?: Exclude<VizResolvedBackend, "mixed">;
  implementation?: VizBackendImplementation;
  message: string;
  details?: Record<string, unknown>;
  severity?: VizDiagnosticSeverity;
}): VizFrameDiagnostic {
  return {
    backend: {
      implementation: input.implementation,
      requested: input.requested,
      selected: input.selected,
    },
    code: input.code,
    datasetId: input.datasetId,
    details: input.details,
    domain: "backend",
    layerId: input.layerId,
    message: input.message,
    severity: input.severity ?? "warning",
  };
}
