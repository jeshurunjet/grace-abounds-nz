import type { StaffSermon } from '@grace-abounds/validation';
import type { BadgeTone } from '../components/editor-kit/parts';

/** How a sermon's publishing state reads in staff lists. */
export function sermonBadge(row: StaffSermon): {
  tone: BadgeTone;
  label: string;
} {
  if (row.archived) return { tone: 'neutral', label: 'Archived' };
  if (row.review === 'pending')
    return { tone: 'pending', label: 'Awaiting approval' };
  if (row.review === 'rejected')
    return { tone: 'danger', label: 'Changes requested' };
  if (row.live && !row.changedSinceApproval)
    return { tone: 'success', label: 'Live' };
  if (row.live) return { tone: 'success', label: 'Live · new edits' };
  return { tone: 'neutral', label: 'Draft' };
}
