// ReisSlim v2 compatibility guard. Structural planning moved exclusively to canonical-plan-engine.js.
const disabled=()=>{throw new Error('LEGACY_STRUCTURAL_PLANNER_DISABLED: use createCanonicalPlan from canonical-plan-engine.js')};
export const legacyStructuralPlannerDisabled=true;
export const buildItinerary=disabled;
export const buildItineraryVariants=disabled;
export const solveDayAllocation=disabled;
export const selectRoadtripOvernights=disabled;
export const selectRoadtripBase=disabled;
export const selectBaseDayTrips=disabled;
export const optimisePlan=disabled;
export const applyOptimizationProposal=disabled;
export const buildProposalPortfolio=disabled;
export const buildAlternativeReturnNodes=disabled;
export default Object.freeze({legacyStructuralPlannerDisabled:true});
