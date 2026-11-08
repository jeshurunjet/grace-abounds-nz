'use client';
import { useEffect, useState } from 'react';
import { ArrowUp } from 'lucide-react';
import { ThemeToggle } from './theme-toggle';
export function FloatingControls() { const [longPage, setLongPage] = useState(false); useEffect(() => { const update = () => setLongPage(document.documentElement.scrollHeight > window.innerHeight * 1.35); update(); window.addEventListener('resize', update); const timer = window.setTimeout(update, 250); return () => { window.removeEventListener('resize', update); window.clearTimeout(timer); }; }, []); return <div className="floating-controls">{longPage && <button className="scroll-top visible" onClick={() => window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })} aria-label="Scroll to top"><ArrowUp aria-hidden="true" /></button>}<ThemeToggle /></div>; }
