import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  className?: string;
}

export function PageHeader({ title, subtitle, right, className }: PageHeaderProps) {
  return (
    <div
      className={cn(
        "sticky top-0 z-20 flex items-center justify-between gap-3 border-b-[2.5px] border-ink bg-cream/95 px-4 py-3 backdrop-blur lg:px-6",
        className
      )}
    >
      <div className="min-w-0">
        <h1 className="truncate font-display text-xl font-bold uppercase tracking-tight lg:text-2xl">
          {title}
        </h1>
        {subtitle && (
          <p className="truncate text-xs font-semibold text-ink/50">{subtitle}</p>
        )}
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  );
}
