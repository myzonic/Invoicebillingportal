export function PageHeader({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <div className="flex items-center gap-2.5">
          <span className="h-6 w-1 rounded-full bg-gradient-to-b from-primary to-primary/60" />
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        </div>
        {description && <p className="mt-1 pl-3.5 text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}
