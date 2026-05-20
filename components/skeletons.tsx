/**
 * Skeleton components for async page sections.
 * Use these while fetching data to avoid layout shift and blank screens.
 */

function SkeletonLine({ w = "full", h = 3 }: { w?: string; h?: number }) {
  return (
    <div
      className={`w-${w} animate-pulse rounded-full bg-[#F4E6E0]`}
      style={{ height: `${h * 4}px` }}
    />
  );
}

function SkeletonCard({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="rounded-[22px] border bg-white p-4 shadow-sm sm:rounded-[28px] sm:p-5"
      style={{ borderColor: "#F2D4CC" }}
    >
      {children}
    </div>
  );
}

// ─── Order list skeleton ──────────────────────────────────────────────────────

function OrderRowSkeleton() {
  return (
    <div className="animate-pulse rounded-[20px] border p-4 space-y-3" style={{ borderColor: "#F5E7E2", background: "#FFFDFC" }}>
      <div className="flex items-center justify-between gap-3">
        <div className="h-4 w-32 rounded-full bg-[#F4E6E0]" />
        <div className="h-6 w-20 rounded-full bg-[#FAD9D0]" />
      </div>
      <div className="h-3 w-full rounded-full bg-[#F8EDEA]" />
      <div className="h-3 w-3/4 rounded-full bg-[#F8EDEA]" />
      <div className="flex gap-3 pt-1">
        <div className="h-8 w-24 rounded-2xl bg-[#F4E6E0]" />
        <div className="h-8 w-20 rounded-2xl bg-[#F8EDEA]" />
      </div>
    </div>
  );
}

export function OrderListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <SkeletonCard>
      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <OrderRowSkeleton key={i} />
        ))}
      </div>
    </SkeletonCard>
  );
}

// ─── Notification list skeleton ───────────────────────────────────────────────

function NotificationRowSkeleton() {
  return (
    <div className="animate-pulse flex items-start gap-3 rounded-[18px] border p-3" style={{ borderColor: "#F5E7E2", background: "#FFFDFC" }}>
      <div className="h-10 w-10 shrink-0 rounded-full bg-[#FAD9D0]" />
      <div className="flex-1 space-y-2 pt-1">
        <div className="h-3 w-2/3 rounded-full bg-[#F4E6E0]" />
        <div className="h-3 w-full rounded-full bg-[#F8EDEA]" />
        <div className="h-2.5 w-20 rounded-full bg-[#F8EDEA]" />
      </div>
    </div>
  );
}

export function NotificationListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <SkeletonCard>
      <div className="space-y-2">
        {Array.from({ length: rows }).map((_, i) => (
          <NotificationRowSkeleton key={i} />
        ))}
      </div>
    </SkeletonCard>
  );
}

// ─── Cart skeleton ────────────────────────────────────────────────────────────

function CartItemSkeleton() {
  return (
    <div className="animate-pulse flex items-start gap-3 rounded-[20px] border p-4" style={{ borderColor: "#F5E7E2", background: "#FFFDFC" }}>
      <div className="h-16 w-16 shrink-0 rounded-[14px] bg-[#FAD9D0]" />
      <div className="flex-1 space-y-2">
        <div className="h-4 w-3/4 rounded-full bg-[#F4E6E0]" />
        <div className="h-3 w-1/2 rounded-full bg-[#F8EDEA]" />
        <div className="flex items-center justify-between pt-1">
          <div className="h-8 w-24 rounded-2xl bg-[#F4E6E0]" />
          <div className="h-5 w-20 rounded-full bg-[#FAD9D0]" />
        </div>
      </div>
    </div>
  );
}

export function CartSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <SkeletonCard>
      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <CartItemSkeleton key={i} />
        ))}
      </div>
    </SkeletonCard>
  );
}

// ─── Profile skeleton ─────────────────────────────────────────────────────────

export function ProfileSkeleton() {
  return (
    <div className="space-y-4">
      <SkeletonCard>
        <div className="animate-pulse flex items-center gap-4">
          <div className="h-16 w-16 shrink-0 rounded-full bg-[#FAD9D0]" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-40 rounded-full bg-[#F4E6E0]" />
            <div className="h-3 w-56 rounded-full bg-[#F8EDEA]" />
          </div>
        </div>
      </SkeletonCard>
      <SkeletonCard>
        <div className="animate-pulse space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-1.5">
              <div className="h-3 w-24 rounded-full bg-[#F4E6E0]" />
              <div className="h-10 w-full rounded-2xl bg-[#F8EDEA]" />
            </div>
          ))}
          <div className="h-10 w-32 rounded-2xl bg-[#FAD9D0]" />
        </div>
      </SkeletonCard>
    </div>
  );
}

// ─── Order detail skeleton ────────────────────────────────────────────────────

export function OrderDetailSkeleton() {
  return (
    <div className="space-y-4">
      <SkeletonCard>
        <div className="animate-pulse space-y-3">
          <div className="flex items-center justify-between">
            <div className="h-5 w-40 rounded-full bg-[#F4E6E0]" />
            <div className="h-7 w-24 rounded-full bg-[#FAD9D0]" />
          </div>
          <SkeletonLine w="full" h={3} />
          <SkeletonLine w="3/4" h={3} />
        </div>
      </SkeletonCard>
      <SkeletonCard>
        <div className="animate-pulse space-y-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <CartItemSkeleton key={i} />
          ))}
        </div>
      </SkeletonCard>
    </div>
  );
}
