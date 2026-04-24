/**
 * Supported genarch browser adapter for the residential review surface.
 *
 * The production boundary remains browser -> proxy/API -> separate genarch
 * backend deployment. This ESM path is the supported client entrypoint for
 * starting and monitoring those review jobs from the React app.
 */
export { default } from "../../_legacy/genarchPipelineService.js";
export * from "../../_legacy/genarchPipelineService.js";
