import type { TaskView } from '@caime/core/api';
import { tr } from '@caime/core/i18n';

/**
 * Who the task is between, from the reader's side; null when it's only theirs. Apart from the row,
 * so the conversation's panel that says it doesn't take the Actions list's row into `__common`.
 */
export function taskWho(task: TaskView): string | null {
  if (task.direction === 'asked_me')
    return tr('{displayName} asked you', { displayName: task.owner.displayName });
  if (task.direction === 'mine') return null;
  return task.assignee.id
    ? tr('Waiting on {displayName}', { displayName: task.assignee.displayName })
    : tr('Waiting on a deleted account');
}
