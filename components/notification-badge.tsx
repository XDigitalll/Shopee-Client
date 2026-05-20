"use client";

type NotificationBadgeProps = {
  count?: number;
  dot?: boolean;
  tone?: "light" | "warm";
  className?: string;
};

export function NotificationBadge({ count = 0, dot = false, tone = "warm", className = "" }: NotificationBadgeProps) {
  if (count <= 0 && !dot) return null;

  const background = tone === "light" ? "#FFFFFF" : "#F97316";
  const color = tone === "light" ? "#E8431A" : "#FFFFFF";

  if (dot) {
    return (
      <span
        className={`inline-block h-2 w-2 rounded-full ${className}`}
        style={{ background }}
        aria-label="Tem novas atualizacoes"
      />
    );
  }

  return (
    <span
      className={`inline-flex min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-black leading-5 ${className}`}
      style={{ background, color, fontFamily: "'Sora', sans-serif" }}
      aria-label={`${count} notificacoes nao lidas`}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}
