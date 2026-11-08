'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useContent } from './content-provider';
import { Reveal } from './reveal';
export function NextStepsExplorer() {
  const { content } = useContent();
  const steps = content.pages.steps;
  const [active, setActive] = useState(0);
  const current = (steps[active] ?? steps[0])!;
  return (
    <>
      <Reveal>
        <div
          className="step-tabs"
          role="tablist"
          aria-label="Next step options"
        >
          {steps.map((step, index) => (
            <button
              key={step.title}
              type="button"
              role="tab"
              aria-selected={index === active}
              aria-controls="step-panel"
              onClick={() => setActive(index)}
            >
              <span>{step.icon}</span>
              <strong>{step.title}</strong>
              <small>{step.subtitle}</small>
            </button>
          ))}
        </div>
      </Reveal>
      <Reveal direction="scale" delay={100}>
        <div className="step-panel" id="step-panel" role="tabpanel">
          <div>
            <h2>{current.heading}</h2>
            <p>{current.body}</p>
            <div className="step-actions">
              <Link className="button" href={current.memberHref}>
                {current.cta}
              </Link>
            </div>
          </div>
          <div className="path-card">
            <p className="eyebrow">The Path</p>
            <ol>
              {current.path.map((item, index) => (
                <li key={item}>
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  {item}
                </li>
              ))}
            </ol>
          </div>
        </div>
      </Reveal>
    </>
  );
}
