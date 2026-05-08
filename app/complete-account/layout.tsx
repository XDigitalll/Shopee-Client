import { ReactNode } from "react";

export default function CompleteAccountLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[#FFF8F5]">
      {children}
    </div>
  );
}
