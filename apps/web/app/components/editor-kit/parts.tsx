'use client';
import { useId, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronUp, type LucideIcon } from 'lucide-react';
import { isImageRef } from '@grace-abounds/validation';
import Image from '../site-image';

/** A titled card that groups related fields or a list. */
export function SectionCard({
  icon: Icon,
  title,
  description,
  action,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section className="kit-card" aria-labelledby={id}>
      <header className="kit-card-head">
        <div>
          <h2 id={id}>
            <Icon aria-hidden="true" size={18} />
            {title}
          </h2>
          {description && <p>{description}</p>}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

export type BadgeTone = 'success' | 'neutral';
export function Badge({
  tone,
  children,
}: {
  tone: BadgeTone;
  children: ReactNode;
}) {
  return <span className={`kit-badge kit-badge-${tone}`}>{children}</span>;
}

/** One record in a list: media, name, one detail line, status and Edit. */
export function ListRow({
  media,
  title,
  detail,
  badge,
  editLabel,
  onEdit,
  onMoveUp,
  onMoveDown,
}: {
  media?: ReactNode;
  title: string;
  detail?: string;
  badge?: { tone: BadgeTone; label: string };
  editLabel: string;
  onEdit: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}) {
  return (
    <li className="kit-row">
      {media && <span className="kit-row-media">{media}</span>}
      <span className="kit-row-text">
        <strong>{title}</strong>
        {detail && <small>{detail}</small>}
      </span>
      {badge && <Badge tone={badge.tone}>{badge.label}</Badge>}
      {(onMoveUp || onMoveDown) && (
        <span className="kit-row-move">
          <button
            type="button"
            className="kit-icon-button"
            aria-label={`Move ${title} up`}
            disabled={!onMoveUp}
            onClick={onMoveUp}
          >
            <ChevronUp aria-hidden="true" size={18} />
          </button>
          <button
            type="button"
            className="kit-icon-button"
            aria-label={`Move ${title} down`}
            disabled={!onMoveDown}
            onClick={onMoveDown}
          >
            <ChevronDown aria-hidden="true" size={18} />
          </button>
        </span>
      )}
      <button
        type="button"
        className="kit-edit"
        aria-label={editLabel}
        onClick={onEdit}
      >
        Edit
      </button>
    </li>
  );
}

export function RowList({
  empty,
  children,
}: {
  empty: string;
  children: ReactNode[];
}) {
  if (!children.length) return <p className="kit-empty">{empty}</p>;
  return <ul className="kit-rows">{children}</ul>;
}

export type SaveState = 'clean' | 'dirty' | 'saving' | 'saved' | 'failed';
const saveText: Record<SaveState, string> = {
  clean: 'All changes published',
  dirty: 'Unsaved changes',
  saving: 'Saving…',
  saved: 'Published',
  failed: 'Not published — try again',
};
/** The page's save state, announced politely. */
export function SaveStatus({ state }: { state: SaveState }) {
  return (
    <span className={`kit-status kit-status-${state}`} role="status">
      <span aria-hidden="true" className="kit-status-dot" />
      {saveText[state]}
    </span>
  );
}

/** Labelled text input or textarea. */
export function KitText({
  label,
  value,
  onChange,
  multiline = false,
  rows = 4,
  hint,
  placeholder,
  error,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  multiline?: boolean;
  rows?: number;
  hint?: string;
  placeholder?: string;
  error?: string;
}) {
  const id = useId();
  const described = [hint && `${id}-hint`, error && `${id}-error`]
    .filter(Boolean)
    .join(' ');
  const shared = {
    id,
    value,
    placeholder,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': described || undefined,
  };
  return (
    <div className="kit-field">
      <label htmlFor={id}>{label}</label>
      {hint && (
        <small id={`${id}-hint`} className="kit-hint">
          {hint}
        </small>
      )}
      {multiline ? (
        <textarea
          {...shared}
          rows={rows}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <input {...shared} onChange={(event) => onChange(event.target.value)} />
      )}
      {error && (
        <small id={`${id}-error`} className="kit-error">
          {error}
        </small>
      )}
    </div>
  );
}

/** A photo field: thumbnail preview and the link it comes from. */
export function KitPhoto({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
}) {
  const [failed, setFailed] = useState('');
  const valid = isImageRef(value);
  return (
    <div className="kit-photo">
      <span className="kit-photo-thumb">
        {valid && failed !== value ? (
          <Image
            unoptimized
            src={value}
            alt=""
            width={160}
            height={100}
            onError={() => setFailed(value)}
          />
        ) : (
          <span aria-hidden="true">No photo</span>
        )}
      </span>
      <KitText
        label={label}
        value={value}
        onChange={onChange}
        hint="An https:// photo link, or a site image path starting with /images/."
        error={
          value && !valid
            ? 'Use an https:// photo link or a path starting with /images/.'
            : failed === value && value
              ? 'This photo couldn’t be loaded. Check the link.'
              : undefined
        }
      />
    </div>
  );
}
