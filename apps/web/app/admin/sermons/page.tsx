'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useCallback, useEffect, useId, useState } from 'react';
import {
  Archive,
  ArrowLeft,
  CircleCheck,
  Hourglass,
  Plus,
  RotateCcw,
  Send,
  Trash,
  Undo2,
  Video,
} from 'lucide-react';
import {
  isMediaRef,
  type SermonInput,
  type StaffSermon,
} from '@grace-abounds/validation';
import { AdminShell } from '../../components/admin-shell';
import { useToast } from '../../components/toast';
import { KitConfirm } from '../../components/editor-kit/confirm';
import { SidePanel } from '../../components/editor-kit/side-panel';
import {
  KitPhoto,
  KitText,
  ListRow,
  RowList,
  SectionCard,
} from '../../components/editor-kit/parts';
import { api, ApiError, errorMessage } from '../../lib/api-client';
import { formatSermonDate } from '../../lib/content-adapter';
import { getRoleNavigation } from '../../lib/role-navigation';
import { sermonBadge } from '../../lib/sermon-status';

/*
 * Sermons & videos. Save keeps changes private. The Pastor approves each
 * saved version before it reaches the website or members; the approved
 * version stays live while a newer one waits. The server enforces all of it.
 */

const today = () => new Date().toISOString().slice(0, 10);
const blank = (): SermonInput => ({
  title: '',
  series: '',
  speaker: '',
  date: today(),
  duration: '',
  image: '',
  summary: '',
  mediaUrl: '',
});
const editable = (row: StaffSermon): SermonInput => ({
  title: row.title,
  series: row.series,
  speaker: row.speaker,
  date: row.date,
  duration: row.duration,
  image: row.image,
  summary: row.summary,
  mediaUrl: row.mediaUrl,
});

type Panel = {
  id: string | null;
  value: SermonInput;
  original: SermonInput;
};
type Step =
  'submit' | 'approve' | 'reject' | 'unpublish' | 'archive' | 'restore';
const stepToast: Record<Step, string> = {
  submit: 'sent to the Pastor for approval.',
  approve: 'approved and published.',
  reject: 'sent back with your note.',
  unpublish: 'taken off the website.',
  archive: 'archived.',
  restore: 'restored as a draft.',
};

export default function SermonsPage() {
  const { data: session } = useSession();
  const role = session?.user?.role;
  const isPastor = role === 'pastor';
  const homeHref = getRoleNavigation(role).workspaceHref;
  const router = useRouter();
  const toast = useToast();
  const dateId = useId();
  const [rows, setRows] = useState<StaffSermon[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [query, setQuery] = useState('');
  const [panel, setPanel] = useState<Panel | null>(null);
  const [busy, setBusy] = useState(false);
  const [panelError, setPanelError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [conflict, setConflict] = useState(false);
  const [confirm, setConfirm] = useState<
    'delete' | 'unpublish' | 'archive' | null
  >(null);
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    setLoadError('');
    try {
      setRows((await api<StaffSermon[]>('/staff/sermons')).data);
    } catch (failure) {
      setLoadError(errorMessage(failure));
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const current = panel?.id
    ? rows?.find((row) => row.id === panel.id)
    : undefined;
  const dirty =
    !!panel && JSON.stringify(panel.value) !== JSON.stringify(panel.original);

  function open(row: StaffSermon | null) {
    const value = row ? editable(row) : blank();
    setPanel({ id: row?.id ?? null, value, original: value });
    setPanelError('');
    setFieldErrors({});
    setConflict(false);
    setRejecting(false);
    setNote('');
  }
  const change = (key: keyof SermonInput) => (next: string) =>
    setPanel(
      (state) => state && { ...state, value: { ...state.value, [key]: next } },
    );

  function adopt(saved: StaffSermon) {
    setRows((list) => {
      const others = (list ?? []).filter((row) => row.id !== saved.id);
      return [...others, saved].sort(
        (a, b) =>
          b.date.localeCompare(a.date) || a.title.localeCompare(b.title),
      );
    });
    setPanel({
      id: saved.id,
      value: editable(saved),
      original: editable(saved),
    });
  }
  function fail(failure: unknown) {
    if (failure instanceof ApiError && failure.code === 'VERSION_CONFLICT') {
      setConflict(true);
      setPanelError(
        'Someone else changed this sermon since you opened it. Your edits are still here.',
      );
      return;
    }
    if (failure instanceof ApiError && failure.fieldErrors)
      setFieldErrors(failure.fieldErrors);
    setPanelError(errorMessage(failure));
  }

  async function save() {
    if (!panel || busy) return;
    setBusy(true);
    setPanelError('');
    setFieldErrors({});
    try {
      const body = JSON.stringify(panel.value);
      const result = panel.id
        ? await api<StaffSermon>(`/staff/sermons/${panel.id}`, {
            method: 'PATCH',
            version: current?.version,
            body,
          })
        : await api<StaffSermon>('/staff/sermons', { method: 'POST', body });
      const saved = result.data;
      adopt(saved);
      toast.push(
        saved.review === 'approved'
          ? `${saved.title} saved. It matches the live version.`
          : saved.live
            ? `${saved.title} saved. The approved version stays live until the Pastor approves this one.`
            : `${saved.title} saved as a draft. It is not on the website.`,
        'success',
      );
    } catch (failure) {
      fail(failure);
    } finally {
      setBusy(false);
    }
  }

  async function step(name: Step, body?: object) {
    if (!current || busy) return;
    setBusy(true);
    setPanelError('');
    setConfirm(null);
    try {
      // Approving from a draft: the Pastor's own request comes first, so the
      // audit trail shows which version was approved.
      let row = current;
      if (name === 'approve' && row.review !== 'pending')
        row = (
          await api<StaffSermon>(`/staff/sermons/${row.id}/submit`, {
            method: 'POST',
            version: row.version,
          })
        ).data;
      const result = await api<StaffSermon>(
        `/staff/sermons/${row.id}/${name}`,
        {
          method: 'POST',
          version: row.version,
          ...(body && { body: JSON.stringify(body) }),
        },
      );
      adopt(result.data);
      setRejecting(false);
      setNote('');
      toast.push(`${result.data.title} ${stepToast[name]}`, 'success');
      router.refresh();
    } catch (failure) {
      fail(failure);
      void load();
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!current) return;
    setConfirm(null);
    setBusy(true);
    try {
      await api(`/staff/sermons/${current.id}`, {
        method: 'DELETE',
        version: current.version,
      });
      setRows((list) => (list ?? []).filter((row) => row.id !== current.id));
      setPanel(null);
      toast.push('Sermon deleted.', 'success');
    } catch (failure) {
      fail(failure);
    } finally {
      setBusy(false);
    }
  }

  async function reloadLatest() {
    if (!panel?.id) return;
    try {
      const list = (await api<StaffSermon[]>('/staff/sermons')).data;
      setRows(list);
      const latest = list.find((row) => row.id === panel.id);
      if (!latest) {
        setPanel(null);
        toast.push('That sermon was deleted by someone else.', 'info');
        return;
      }
      // Keep the editor's text; the next Save replaces the latest version.
      setPanel({ ...panel, original: editable(latest) });
      setConflict(false);
      setPanelError(
        'Loaded the latest version. Check your changes, then Save.',
      );
    } catch (failure) {
      setPanelError(errorMessage(failure));
    }
  }

  const visible = (rows ?? []).filter((row) =>
    `${row.title} ${row.series} ${row.speaker} ${row.date}`
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );
  const pending = (rows ?? []).filter((row) => row.review === 'pending');
  // The server keeps anything that has been on the website until archived.
  const canDelete =
    !!current && !current.live && (current.archived || !current.everApproved);
  const errorFor = (key: string) => fieldErrors[key];
  const playable = panel && isMediaRef(panel.value.mediaUrl);

  function reviewBlock() {
    if (!current) return null;
    const live = current.live;
    const needsApproval =
      !current.archived &&
      current.review !== 'pending' &&
      (!live || current.changedSinceApproval);
    // The server refuses approval without a saved recording; say so here.
    const noRecording = !isMediaRef(current.mediaUrl);
    return (
      <section className="sermon-review" aria-label="Publishing">
        <p className="sermon-review-state">
          <strong>{sermonBadge(current).label}.</strong>{' '}
          {current.archived
            ? 'Archived sermons are not on the website. Restore it to work on it again.'
            : current.review === 'pending'
              ? isPastor
                ? 'Check the details and the recording, then approve or send it back.'
                : 'Waiting for the Pastor. Saving a change withdraws the request.'
              : current.review === 'rejected'
                ? `The Pastor asked for changes: “${current.reviewNote}”`
                : live && !current.changedSinceApproval
                  ? 'This is the version on the website.'
                  : live
                    ? 'The approved version stays on the website until the Pastor approves these edits.'
                    : 'Not on the website. The Pastor approves it before anyone else can see it.'}
          {live && (
            <small>
              {' '}
              Live version approved{' '}
              {formatSermonDate(live.approvedAt.slice(0, 10))}.
            </small>
          )}
        </p>
        {dirty ? (
          <p className="kit-hint">
            Save your changes before sending or approving.
          </p>
        ) : (
          noRecording &&
          !current.archived && (
            <p className="kit-hint">
              Add the recording link and Save before it can be approved.
            </p>
          )
        )}
        <div className="sermon-review-actions">
          {needsApproval && !isPastor && (
            <button
              type="button"
              className="button"
              disabled={busy || dirty || noRecording}
              onClick={() => void step('submit')}
            >
              <Send aria-hidden="true" size={16} />
              Ask the Pastor to approve
            </button>
          )}
          {isPastor &&
            !current.archived &&
            (needsApproval || current.review === 'pending') && (
              <button
                type="button"
                className="button"
                disabled={busy || dirty || noRecording}
                onClick={() => void step('approve')}
              >
                <CircleCheck aria-hidden="true" size={16} />
                Approve and publish
              </button>
            )}
          {isPastor && current.review === 'pending' && !rejecting && (
            <button
              type="button"
              className="button button-outline"
              disabled={busy || dirty}
              onClick={() => setRejecting(true)}
            >
              <Undo2 aria-hidden="true" size={16} />
              Send back
            </button>
          )}
          {!isPastor && current.review === 'pending' && (
            <span className="kit-hint">
              <Hourglass aria-hidden="true" size={14} /> Waiting for the Pastor
            </span>
          )}
          {isPastor && live && (
            <button
              type="button"
              className="button button-outline"
              disabled={busy}
              onClick={() => setConfirm('unpublish')}
            >
              Unpublish
            </button>
          )}
          {current.archived ? (
            <button
              type="button"
              className="button button-outline"
              disabled={busy}
              onClick={() => void step('restore')}
            >
              <RotateCcw aria-hidden="true" size={16} />
              Restore
            </button>
          ) : (
            <button
              type="button"
              className="button button-outline"
              disabled={busy}
              onClick={() =>
                live ? setConfirm('archive') : void step('archive')
              }
            >
              <Archive aria-hidden="true" size={16} />
              Archive
            </button>
          )}
        </div>
        {rejecting && (
          <div className="sermon-review-note">
            <KitText
              label="What needs to change?"
              hint="The editor sees this note. The live version, if any, stays up."
              multiline
              rows={3}
              value={note}
              error={errorFor('note')}
              onChange={setNote}
            />
            <div className="sermon-review-actions">
              <button
                type="button"
                className="button button-outline"
                onClick={() => {
                  setRejecting(false);
                  setNote('');
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="button"
                disabled={busy || !note.trim()}
                onClick={() => void step('reject', { note })}
              >
                Send back
              </button>
            </div>
          </div>
        )}
      </section>
    );
  }

  return (
    <AdminShell>
      <div className="kit-page">
        <Link className="kit-back" href={homeHref}>
          <ArrowLeft aria-hidden="true" size={16} />
          Home
        </Link>
        <header className="kit-page-head">
          <h1>Sermons &amp; videos</h1>
        </header>
        <p className="kit-note">
          Save keeps your changes private. The Pastor approves each version
          before it appears on the website or for members, and the approved
          version stays live while a newer one waits.
        </p>
        {loadError && (
          <div className="publishing-errors" role="alert">
            <p>Sermons couldn’t be loaded. {loadError}</p>
            <button
              className="button button-outline"
              onClick={() => void load()}
            >
              Try again
            </button>
          </div>
        )}

        {isPastor && pending.length > 0 && (
          <SectionCard
            icon={Hourglass}
            title="Awaiting your approval"
            description="Open one to check the details and recording."
          >
            <RowList empty="">
              {pending.map((row) => (
                <ListRow
                  key={row.id}
                  title={row.title}
                  detail={[formatSermonDate(row.date), row.speaker]
                    .filter(Boolean)
                    .join(' · ')}
                  badge={sermonBadge(row)}
                  editLabel={`Review ${row.title}`}
                  onEdit={() => open(row)}
                />
              ))}
            </RowList>
          </SectionCard>
        )}

        <SectionCard
          icon={Video}
          title="All sermons"
          description="Newest first."
          action={
            <button
              type="button"
              className="kit-add"
              disabled={!rows}
              onClick={() => open(null)}
            >
              <Plus aria-hidden="true" size={16} />
              Add sermon
            </button>
          }
        >
          {!!rows?.length && (
            <input
              type="search"
              className="kit-search"
              aria-label="Search sermons"
              placeholder="Search by title, speaker or date"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          )}
          {!rows && !loadError && <p className="kit-empty">Loading…</p>}
          {rows && (
            <RowList
              empty={
                query ? 'No sermons match your search.' : 'No sermons yet.'
              }
            >
              {visible.map((row) => (
                <ListRow
                  key={row.id}
                  title={row.title}
                  detail={[formatSermonDate(row.date), row.speaker, row.series]
                    .filter(Boolean)
                    .join(' · ')}
                  badge={sermonBadge(row)}
                  editLabel={`Edit ${row.title}`}
                  onEdit={() => open(row)}
                />
              ))}
            </RowList>
          )}
        </SectionCard>

        <SidePanel
          open={!!panel}
          title={panel?.id ? 'Edit sermon' : 'Add sermon'}
          eyebrow="Sermons & videos"
          dirty={dirty}
          busy={busy}
          onClose={() => setPanel(null)}
          footer={(requestClose) => (
            <>
              {panel?.id && (
                <button
                  type="button"
                  className="kit-remove"
                  disabled={!canDelete || busy}
                  title={
                    canDelete
                      ? undefined
                      : 'Sermons that have been on the website are archived, not deleted.'
                  }
                  onClick={() => setConfirm('delete')}
                >
                  <Trash aria-hidden="true" size={16} />
                  Delete
                </button>
              )}
              <span className="kit-spacer" />
              <button
                type="button"
                className="button button-outline"
                disabled={busy}
                onClick={requestClose}
              >
                Cancel
              </button>
              <button
                type="button"
                className="button"
                disabled={busy || conflict || (!!panel?.id && !dirty)}
                onClick={() => void save()}
              >
                {busy ? 'Saving…' : 'Save'}
              </button>
            </>
          )}
        >
          {!panel?.id && (
            <p className="kit-note">
              Nothing is created until you select Save. A new sermon is a
              private draft until the Pastor approves it.
            </p>
          )}
          {reviewBlock()}
          {panel && (
            <>
              <KitText
                label="Title"
                value={panel.value.title}
                error={errorFor('title')}
                onChange={change('title')}
              />
              <KitText
                label="Speaker"
                value={panel.value.speaker}
                error={errorFor('speaker')}
                onChange={change('speaker')}
              />
              <KitText
                label="Series"
                value={panel.value.series}
                error={errorFor('series')}
                onChange={change('series')}
              />
              <div className="kit-field">
                <label htmlFor={dateId}>Date</label>
                <input
                  id={dateId}
                  type="date"
                  value={panel.value.date}
                  aria-invalid={errorFor('date') ? true : undefined}
                  onChange={(event) => change('date')(event.target.value)}
                />
                {errorFor('date') && (
                  <small className="kit-error">{errorFor('date')}</small>
                )}
              </div>
              <KitText
                label="Length"
                hint="For example 42 min."
                value={panel.value.duration}
                error={errorFor('duration')}
                onChange={change('duration')}
              />
              <KitText
                label="Summary"
                multiline
                value={panel.value.summary}
                error={errorFor('summary')}
                onChange={change('summary')}
              />
              <KitPhoto
                label="Cover photo"
                value={panel.value.image}
                onChange={change('image')}
              />
              <KitText
                label="Recording link"
                hint="An https:// link to an MP4, WebM, MP3 or M4A file. Uploads come later. Changing it needs the Pastor’s approval again."
                value={panel.value.mediaUrl}
                error={errorFor('mediaUrl')}
                onChange={change('mediaUrl')}
              />
              {playable && (
                <video
                  className="sermon-preview"
                  controls
                  preload="metadata"
                  src={panel.value.mediaUrl}
                  aria-label="Recording preview"
                >
                  Your browser can’t play this recording.
                </video>
              )}
            </>
          )}
          {panelError && (
            <div className="publishing-errors" role="alert">
              <p>{panelError}</p>
              {conflict && (
                <button
                  type="button"
                  className="button button-outline"
                  onClick={() => void reloadLatest()}
                >
                  Load latest version
                </button>
              )}
            </div>
          )}
        </SidePanel>
        <KitConfirm
          open={confirm === 'delete'}
          title="Delete this sermon?"
          confirmLabel="Delete"
          onCancel={() => setConfirm(null)}
          onConfirm={() => void remove()}
        >
          <p>This can’t be undone. Its saved history stays in the audit log.</p>
        </KitConfirm>
        <KitConfirm
          open={confirm === 'unpublish'}
          title="Take this sermon off the website?"
          confirmLabel="Unpublish"
          onCancel={() => setConfirm(null)}
          onConfirm={() => void step('unpublish')}
        >
          <p>
            It disappears from the website and for members straight away.
            Publishing it again needs your approval.
          </p>
        </KitConfirm>
        <KitConfirm
          open={confirm === 'archive'}
          title="Archive this live sermon?"
          confirmLabel="Archive"
          onCancel={() => setConfirm(null)}
          onConfirm={() => void step('archive')}
        >
          <p>
            It comes off the website straight away. Publishing it again needs
            the Pastor’s approval.
          </p>
        </KitConfirm>
      </div>
    </AdminShell>
  );
}
