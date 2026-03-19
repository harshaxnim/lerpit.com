import { createIssueZeroStepRuntime } from '@/lib/lerpettes/runtimes';

export default createIssueZeroStepRuntime({
  target: 0.25,
  runtimeLabel: 'Runtime / quarter',
  status: 't = 0.25 moves the point one quarter of the way from A toward B.'
});
