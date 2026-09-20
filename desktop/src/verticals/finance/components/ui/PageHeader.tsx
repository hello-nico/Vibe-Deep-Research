import { type ReactNode } from "react";

interface Props {
  title: string;
  subtitle?: string;
  search?: ReactNode;
  actions?: ReactNode;
}

export function PageHeader({ title, subtitle, search, actions }: Props) {
  const actionBar = actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null;
  return (
    <div className="mb-7">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="workspace-kicker mb-2">Vibe Finance / Workspace</p>
          <h1 className="workspace-title">{title}</h1>
          {subtitle && <p className="mt-2 max-w-4xl text-sm leading-6 text-muted-foreground">{subtitle}</p>}
        </div>
        {!search && actionBar}
      </div>
      {search && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <div className="min-w-[12rem] flex-1 basis-64">{search}</div>
          {actionBar}
        </div>
      )}
    </div>
  );
}
