import type { LucideIcon } from "lucide-react";

interface StatCardProps {
  title: string;
  value: string;
  subValue?: string;
  icon: LucideIcon;
  color?: string;
}

export default function StatCard({ title, value, subValue, icon: Icon, color = "var(--color-primary)" }: StatCardProps) {
  return (
    <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-[var(--color-text-secondary)] mb-1">{title}</p>
          <p className="text-2xl font-bold text-[var(--color-text)]">{value}</p>
          {subValue && <p className="text-xs text-[var(--color-text-secondary)] mt-1">{subValue}</p>}
        </div>
        <div
          className="p-2.5 rounded-lg"
          style={{ backgroundColor: color + "15" }}
        >
          <Icon size={20} style={{ color }} />
        </div>
      </div>
    </div>
  );
}
