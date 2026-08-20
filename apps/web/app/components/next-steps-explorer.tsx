'use client';
import { useState } from 'react';
const steps = [
  {
    icon: '✦',
    title: 'New to Faith',
    subtitle: 'Starting Your Journey',
    heading: 'Welcome to the Family',
    body: 'Explore who Jesus is, ask honest questions, and build foundations for a lifelong journey of faith.',
    cta: 'Start Here',
    path: [
      'Meet a pastor after a Sunday gathering',
      'Join the Foundations introduction',
      'Begin a simple Bible reading plan',
    ],
  },
  {
    icon: '◈',
    title: 'Connect Groups',
    subtitle: 'Life in Community',
    heading: 'Find Your People',
    body: 'Share life, grow in faith, and find meaningful friendship in a smaller community.',
    cta: 'Find a Group',
    path: [
      'Visit a Sunday gathering',
      'Choose a group near you',
      'Meet your group leader',
    ],
  },
  {
    icon: '◎',
    title: 'Baptism',
    subtitle: 'A Public Declaration',
    heading: 'Take the Next Step',
    body: 'Celebrate new life in Jesus through a public declaration of faith.',
    cta: 'Ask About Baptism',
    path: [
      'Talk with a pastor',
      'Join a baptism conversation',
      'Celebrate with the church family',
    ],
  },
  {
    icon: '◇',
    title: 'Leadership',
    subtitle: 'Grow to Lead',
    heading: 'Lead Where You Are',
    body: 'Discover your gifts, serve others, and grow into Christ-centred leadership.',
    cta: 'Explore Leadership',
    path: [
      'Join a serving team',
      'Develop your gifts',
      'Walk with an experienced leader',
    ],
  },
];
export function NextStepsExplorer() {
  const [active, setActive] = useState(0);
  const current = steps[active]!;
  return (
    <>
      <div className="step-tabs" role="tablist" aria-label="Next step options">
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
      <div className="step-panel" id="step-panel" role="tabpanel">
        <div>
          <h2>{current.heading}</h2>
          <p>{current.body}</p>
          <button className="button" type="button">
            {current.cta}
          </button>
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
    </>
  );
}
