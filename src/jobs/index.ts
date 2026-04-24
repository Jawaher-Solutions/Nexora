import './moderation.worker';
import { moderationQueue } from './queues';

export function startWorkers() {
  console.log('[Workers] All background workers started');
}

export { moderationQueue };
