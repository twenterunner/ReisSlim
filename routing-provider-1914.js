// Compatibility shim retained for existing app imports.
// The legacy 1914 implementation duplicated routing logic and had drifted behind
// the canonical provider. Keep one routing authority so map geometry, loop logic
// and route-derived rest/fuel waypoints all come from the current implementation.
export {
  enrichPlanWithLiveRouting,
  readRoutingSettings,
  routingConfigured,
  saveRoutingSettings
} from './routing-provider.js?v=1928';
