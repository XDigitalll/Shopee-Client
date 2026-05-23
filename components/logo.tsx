type LogoProps = {
  size?: "sm" | "md" | "lg";
  variant?: "full" | "icon";
  white?: boolean;
};

const sizes = {
  sm: { icon: 26, titleSize: "text-base", subtitleSize: "text-[10px]" },
  md: { icon: 32, titleSize: "text-lg", subtitleSize: "text-xs" },
  lg: { icon: 40, titleSize: "text-xl", subtitleSize: "text-sm" },
};

export function Logo({ size = "md", variant = "full", white = false }: LogoProps) {
  const { icon, titleSize } = sizes[size];
  const textColor = white ? "white" : "#1A1410";
  const accentColor = white ? "#FFE0D2" : "#E8431A";

  return (
    <div className="flex items-center gap-2">
      {/* Shopping bag icon */}
      <svg
        width={icon}
        height={icon}
        viewBox="0 0 40 40"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        {/* Bag body */}
        <rect x="5" y="15" width="30" height="21" rx="5" fill={white ? "rgba(255,255,255,0.25)" : "#E8431A"} />
        {/* Bag handle */}
        <path
          d="M14 15 C14 8.5 26 8.5 26 15"
          stroke={white ? "rgba(255,255,255,0.9)" : "#CC3315"}
          strokeWidth="3"
          strokeLinecap="round"
          fill="none"
        />
        {/* Shine */}
        <line x1="13" y1="23" x2="27" y2="23" stroke="white" strokeWidth="1.5" strokeLinecap="round" opacity="0.45" />
        {/* Center dot */}
        <circle cx="20" cy="28" r="2.5" fill="white" opacity="0.85" />
      </svg>

      {variant === "full" && (
        <span
          className={`${titleSize} font-black leading-none tracking-tight`}
          style={{ fontFamily: "'Sora', sans-serif", color: textColor }}
        >
          Shopee
          <span
            className="ml-0.5 inline-block font-black italic tracking-tighter"
            style={{
              color: accentColor,
              fontFamily: "'DM Sans', sans-serif",
              letterSpacing: "-0.04em",
              transform: "skewX(-4deg)",
            }}
          >
            Mz
          </span>
        </span>
      )}
    </div>
  );
}
