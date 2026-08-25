import type { ReactNode } from "react";

// The deep-green section header band. Title + optional eyebrow/subtitle on the left,
// action buttons on the right (they sit inside the green bar, not floating in a corner).
export default function PageHeader({
  title, eyebrow, subtitle, actions,
}: {
  title: string;
  eyebrow?: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="page-header">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {subtitle && <p className="page-header__sub">{subtitle}</p>}
      </div>
      {actions && <div className="page-header__actions">{actions}</div>}
    </div>
  );
}
