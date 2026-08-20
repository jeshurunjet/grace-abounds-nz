export function PageHero({
  eyebrow,
  title,
  accent,
  children,
}: {
  eyebrow: string;
  title: string;
  accent: string;
  children: string;
}) {
  return (
    <section className="page-hero">
      <div className="container">
        <p className="eyebrow">{eyebrow}</p>
        <h1>
          {title}
          <br />
          <em>{accent}</em>
        </h1>
        <p>{children}</p>
      </div>
    </section>
  );
}
