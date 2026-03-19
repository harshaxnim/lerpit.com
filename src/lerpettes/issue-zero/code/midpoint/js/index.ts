import { createIssueZeroStepRuntime } from '@/lib/lerpettes/runtimes';

export default createIssueZeroStepRuntime({
  target: 0.5,
  runtimeLabel: 'Runtime / midpoint',
  status: 't = 0.50 lands at the midpoint of the segment.'
});
