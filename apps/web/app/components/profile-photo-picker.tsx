'use client';
import { useRef, useState } from 'react';
import Image from 'next/image';
import { Modal } from './modal';
export function ProfilePhotoPicker({
  photo,
  onApply,
}: {
  photo: string;
  onApply: (photo: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState('');
  const [zoom, setZoom] = useState(1);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const generation = useRef(0);
  async function choose(file?: File) {
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Choose a JPG, PNG or WebP image.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('Choose an image smaller than 5 MB.');
      return;
    }
    const token = ++generation.current;
    setError('');
    setSource('');
    setBusy(true);
    try {
      const url = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('read'));
        reader.readAsDataURL(file);
      });
      const image = await loadImage(url);
      if (image.width > 10000 || image.height > 10000)
        throw new Error('dimensions');
      if (token === generation.current) {
        setSource(url);
        setZoom(1);
      }
    } catch {
      if (token === generation.current)
        setError(
          'This image could not be decoded, or is larger than 10,000 pixels. Choose another image.',
        );
    } finally {
      if (token === generation.current) setBusy(false);
    }
  }
  function close() {
    generation.current++;
    setBusy(false);
    setOpen(false);
  }
  async function apply() {
    if (!source) return;
    const token = generation.current;
    setBusy(true);
    try {
      const image = await loadImage(source);
      const side = Math.min(image.width, image.height) / zoom;
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 512;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('canvas');
      context.drawImage(
        image,
        (image.width - side) / 2,
        (image.height - side) / 2,
        side,
        side,
        0,
        0,
        512,
        512,
      );
      if (token === generation.current) {
        onApply(canvas.toDataURL('image/png'));
        close();
      }
    } catch {
      setError('The image could not be cropped. Please choose another image.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button
        className="button button-outline"
        type="button"
        onClick={() => {
          setOpen(true);
          setSource('');
          setZoom(1);
          setError('');
        }}
      >
        Change photo
      </button>
      <Modal open={open} title="Change profile picture" onClose={close}>
        <p>
          Choose an image, then zoom to crop its centre. This changes your local
          profile preview only.
        </p>
        <div
          className={`photo-dropzone ${dragging ? 'dragging' : ''}`}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            choose(event.dataTransfer.files[0]);
          }}
        >
          <div className="photo-crop">
            <Image
              unoptimized
              src={source || photo}
              alt="Profile crop preview"
              width={240}
              height={240}
              style={{ transform: `scale(${source ? zoom : 1})` }}
            />
          </div>
          <button
            type="button"
            className="button button-outline"
            disabled={busy}
            onClick={() => input.current?.click()}
          >
            Choose image
          </button>
          <p>Or drag an image here · JPG, PNG, WebP · up to 5 MB</p>
          <input
            ref={input}
            className="sr-only"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            aria-label="Profile picture file"
            onChange={(event) => {
              choose(event.target.files?.[0]);
              event.target.value = '';
            }}
          />
        </div>
        <label className="form">
          Zoom
          <input
            type="range"
            min="1"
            max="3"
            step="0.05"
            disabled={!source || busy}
            value={zoom}
            onChange={(event) => setZoom(Number(event.target.value))}
          />
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <footer className="form-actions">
          <button
            type="button"
            className="button button-outline"
            onClick={close}
          >
            Cancel
          </button>
          <button
            type="button"
            className="button"
            disabled={!source || busy || !!error}
            onClick={apply}
          >
            {busy ? 'Preparing image…' : 'Apply cropped preview'}
          </button>
        </footer>
      </Modal>
    </>
  );
}
function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new window.Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = source;
  });
}
