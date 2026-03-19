import { createIssueZeroStepRuntime } from '@/lib/lerpettes/runtimes';

export default createIssueZeroStepRuntime({
  target: 0.75,
  runtimeLabel: 'Runtime / near-target',
  status: 't = 0.75 keeps the point on the same path, just close to B.'
});
