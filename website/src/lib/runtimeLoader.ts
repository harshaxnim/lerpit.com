import type { LerpetteStepRuntime } from '@lerpit/framework/types';

const runtimeModules = import.meta.glob('../../../lerpettes/content/**/code/**/js/index.ts');
const runtimeCache = new Map<string, Promise<LerpetteStepRuntime>>();

export async function loadLerpetteStepRuntime(importKey: string): Promise<LerpetteStepRuntime> {
  if (runtimeCache.has(importKey)) {
    return runtimeCache.get(importKey)!;
  }

  const importer = runtimeModules[importKey];
  if (!importer) {
    throw new Error(`No step runtime was found for import key "${importKey}".`);
  }

  const pending = importer().then((module) => {
    const runtime = (module as { default?: LerpetteStepRuntime }).default;
    if (!runtime || typeof runtime.mount !== 'function') {
      throw new Error(`Runtime "${importKey}" is missing a default export with a mount() method.`);
    }

    return runtime;
  });
  // A failed load is not kept, so the next activation tries the module again.
  pending.catch(() => runtimeCache.delete(importKey));

  runtimeCache.set(importKey, pending);
  return pending;
}
