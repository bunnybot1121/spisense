import * as RAPIER from '@dimforge/rapier3d';

// Inject a mock init function to satisfy `@react-three/rapier`'s manual initialization call
const initializedRAPIER = { ...RAPIER };
initializedRAPIER.init = async () => {
  // WebAssembly is already loaded and initialized automatically by standard ES imports in @dimforge/rapier3d
};

export * from '@dimforge/rapier3d';
export default initializedRAPIER;
export const init = initializedRAPIER.init;
