"use client";

import Image, { type ImageLoaderProps } from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { ClientConfirmDialog, ClientFeedbackDock, ClientSectionSkeleton } from "@/components/client-feedback-state";
import { formatMoney } from "@/lib/format";
import type { Cart, CartItem, CouponValidation } from "@/lib/types";
import { useAuth } from "@/components/auth-provider";

const RED = "#E8431A";
const RED_PALE = "#FCEBEB";
const GREEN = "#2E8B57";
const DELIVERY_FEE = 150;
const CHECKOUT_SELECTION_KEY = "shopeex-checkout-selection";

const passthroughImageLoader = ({ src }: ImageLoaderProps) => src;


function MinusIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><line x1="5" y1="12" x2="19" y2="12" /></svg>;
}
function PlusIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>;
}
function TrashIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4h6v2" /></svg>;
}
function PaymentBadge({ label }: { label: string }) {
  return <span className="rounded-full px-3 py-1 text-xs font-bold" style={{ background: "#FFF3EE", color: RED, fontFamily: "'Sora', sans-serif" }}>{label}</span>;
}

async function fetchWithAuth<T>(url: string, token: string, init?: RequestInit) {
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (init?.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch(url, { ...init, headers, cache: "no-store" });
  if (response.status === 204) return null as T;
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.message || payload?.error || "Nao foi possivel concluir a operacao.");
  return payload as T;
}

export default function CartPage() {
  const router = useRouter();
  const { token } = useAuth();
  const [cart, setCart] = useState<Cart | null>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [feedback, setFeedback] = useState<{ type: "success" | "error" | "info"; msg: string } | null>(null);
  const [couponCode, setCouponCode] = useState("");
  const [coupon, setCoupon] = useState<CouponValidation | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [busyItemId, setBusyItemId] = useState<number | null>(null);
  const [isRemovingSelected, setIsRemovingSelected] = useState(false);
  const [isApplyingCoupon, setIsApplyingCoupon] = useState(false);
  const [confirmRemoveItem, setConfirmRemoveItem] = useState<CartItem | null>(null);
  const [confirmRemoveSelected, setConfirmRemoveSelected] = useState(false);

  const loadCart = useCallback(async () => {
    if (!token) {
      setCart({ cartId: 0, userId: 0, totalPrice: 0, items: [] });
      setSelectedIds([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const payload = await fetchWithAuth<Cart>("/api/cart", token);
      setCart(payload);
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("client:data-changed"));
      }
      setSelectedIds((current) => {
        const validIds = new Set((payload.items || []).map((item) => item.itemId));
        const preserved = current.filter((id) => validIds.has(id));
        return preserved.length ? preserved : (payload.items || []).map((item) => item.itemId);
      });
    } catch (error) {
      setFeedback({ type: "error", msg: error instanceof Error ? error.message : "Nao foi possivel carregar o carrinho." });
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void loadCart();
  }, [loadCart]);

  const selectedItems = useMemo(() => {
    const selected = new Set(selectedIds);
    return (cart?.items || []).filter((item) => selected.has(item.itemId));
  }, [cart, selectedIds]);

  const selectedLocalItems = selectedItems.filter((item) => item.itemType !== "EXTERNAL" && !item.madeToOrder);
  const selectedExternalItems = selectedItems.filter((item) => item.itemType === "EXTERNAL" || item.madeToOrder);
  const selectedLocalSubtotal = selectedLocalItems.reduce((sum, item) => sum + Number(item.subTotal || 0), 0);
  const discountAmount = Number(coupon?.discountAmount || 0);
  const estimatedDelivery = selectedLocalSubtotal > 0 ? DELIVERY_FEE : 0;
  const finalTotal = Math.max(selectedLocalSubtotal + estimatedDelivery - discountAmount, 0);
  const allSelected = cart?.items?.length ? cart.items.every((item) => selectedIds.includes(item.itemId)) : false;

  const patchLocalItem = (productId: number, quantity: number) => {
    setCart((current) => current ? {
      ...current,
      items: current.items.map((item) => item.productId === productId ? { ...item, quantity, subTotal: Number(item.price) * quantity } : item),
    } : current);
  };

  const updateQuantity = async (item: CartItem, quantity: number) => {
    if (!token || quantity < 1) return;
    patchLocalItem(item.productId, quantity);
    setBusyItemId(item.itemId);
    try {
      const payload = await fetchWithAuth<Cart>(`/api/cart/items/${item.productId}`, token, { method: "PUT", body: JSON.stringify({ quantity }) });
      setCart(payload);
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("client:data-changed"));
      }
    } catch (error) {
      setFeedback({ type: "error", msg: error instanceof Error ? error.message : "Erro ao atualizar a quantidade." });
      await loadCart();
    } finally {
      setBusyItemId(null);
    }
  };

  const removeItem = async (item: CartItem) => {
    if (!token) return;
    setBusyItemId(item.itemId);
    try {
      const payload = await fetchWithAuth<Cart>(`/api/cart/items/${item.productId}`, token, { method: "DELETE" });
      setCart(payload);
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("client:data-changed"));
      }
      setSelectedIds((current) => current.filter((id) => id !== item.itemId));
      setFeedback({ type: "info", msg: "Item removido do carrinho." });
    } catch (error) {
      setFeedback({ type: "error", msg: error instanceof Error ? error.message : "Erro ao remover o item." });
    } finally {
      setBusyItemId(null);
    }
  };

  const removeSelected = async () => {
    if (!token || !selectedItems.length) return;
    setIsRemovingSelected(true);
    try {
      for (const item of selectedItems) {
        await fetchWithAuth<Cart>(`/api/cart/items/${item.productId}`, token, { method: "DELETE" });
      }
      setFeedback({ type: "info", msg: "Itens selecionados removidos." });
      await loadCart();
    } catch (error) {
      setFeedback({ type: "error", msg: error instanceof Error ? error.message : "Nao foi possivel remover os selecionados." });
    } finally {
      setIsRemovingSelected(false);
    }
  };

  const applyCoupon = async () => {
    if (!token || !couponCode.trim()) return;
    setIsApplyingCoupon(true);
    try {
      const payload = await fetchWithAuth<CouponValidation>("/api/coupons/validate", token, { method: "POST", body: JSON.stringify({ code: couponCode.trim(), subtotal: selectedLocalSubtotal }) });
      setCoupon(payload);
      setFeedback({ type: "success", msg: payload.message || "Cupao aplicado com sucesso." });
    } catch (error) {
      setCoupon(null);
      setFeedback({ type: "error", msg: error instanceof Error ? error.message : "Nao foi possivel validar o cupao." });
    } finally {
      setIsApplyingCoupon(false);
    }
  };

  const proceedToCheckout = () => {
    if (!token) {
      router.push("/login?redirect=%2Fcheckout&reason=checkout");
      return;
    }

    if (!selectedItems.length) {
      setFeedback({ type: "error", msg: "Seleciona pelo menos um item antes de finalizar." });
      return;
    }

    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(CHECKOUT_SELECTION_KEY, JSON.stringify(selectedItems.map((item) => item.itemId)));
    }

    router.push("/checkout");
  };

  return (
    <div className="min-h-screen">


      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:px-8 xl:grid-cols-[minmax(0,1fr)_390px]">
        <section className="space-y-4">
          <div className="rounded-[28px] border bg-white p-5 shadow-sm" style={{ borderColor: "#F2D4CC" }}>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h1 className="text-2xl font-black" style={{ color: "#1A1410", fontFamily: "'Sora', sans-serif" }}>Carrinho de compras</h1>
                <p className="mt-1 text-sm" style={{ color: "#6B7280" }}>Seleciona os itens que queres fechar agora e nos mostramos claramente como a compra sera dividida.</p>
              </div>
              <div className="inline-flex items-center gap-3 rounded-full px-4 py-2" style={{ background: "#FFF4EF" }}>
                <label className="inline-flex items-center gap-2 text-sm font-medium" style={{ color: "#1A1410" }}><input type="checkbox" checked={allSelected} onChange={() => setSelectedIds(allSelected ? [] : (cart?.items || []).map((item) => item.itemId))} style={{ accentColor: RED }} />Seleccionar todos</label>
                <button type="button" onClick={() => setConfirmRemoveSelected(true)} disabled={!selectedItems.length || isRemovingSelected} className="rounded-full px-3 py-1.5 text-sm font-semibold transition" style={{ background: RED_PALE, color: !selectedItems.length || isRemovingSelected ? "#D1D5DB" : "#B42318", cursor: !selectedItems.length || isRemovingSelected ? "not-allowed" : "pointer" }}>{isRemovingSelected ? "A remover..." : "Remover seleccionados"}</button>
              </div>
            </div>
          </div>

          {isLoading ? (
            <ClientSectionSkeleton
              title="A carregar o carrinho"
              message="Estamos a recuperar os itens, quantidades e totais antes de fechar a tua compra."
              rows={3}
            />
          ) : !cart?.items?.length ? (
            <div className="rounded-[28px] border border-dashed bg-white px-6 py-20 text-center" style={{ borderColor: "#F2D4CC" }}>
              <h2 className="text-xl font-black" style={{ color: "#1A1410", fontFamily: "'Sora', sans-serif" }}>O teu carrinho esta vazio</h2>
              <p className="mt-2 text-sm" style={{ color: "#6B7280" }}>Volta para a loja e adiciona alguns produtos para continuares.</p>
              <Link href="/store" className="mt-6 inline-flex rounded-full px-5 py-3 text-sm font-bold text-white" style={{ background: RED }}>Continuar a comprar</Link>
            </div>
          ) : (
            <div className="space-y-4">
              {cart.items.map((item) => {
                const isSelected = selectedIds.includes(item.itemId);
                const hasDiscount = Number(item.originalPrice || 0) > Number(item.price || 0);
                const isExternal = item.itemType === "EXTERNAL" || item.madeToOrder;
                const isBusy = busyItemId === item.itemId;
                return (
                  <article key={item.itemId} className="rounded-[28px] border bg-white p-4 shadow-sm transition sm:p-5" style={{ borderColor: isSelected ? RED : "#F2D4CC", boxShadow: isSelected ? "0 0 0 1px rgba(232,67,26,0.12)" : "0 6px 18px rgba(15, 23, 42, 0.04)" }}>
                    <div className="flex flex-col gap-4 sm:flex-row">
                      <div className="flex items-start gap-4">
                        <input type="checkbox" checked={isSelected} onChange={() => setSelectedIds((current) => current.includes(item.itemId) ? current.filter((id) => id !== item.itemId) : [...current, item.itemId])} style={{ accentColor: RED, marginTop: 12 }} />
                        <div className="relative h-24 w-24 overflow-hidden rounded-2xl" style={{ background: "#FFF4EF" }}>
                          {item.imageUrl ? (
                            <Image
                              loader={passthroughImageLoader}
                              unoptimized
                              src={item.imageUrl}
                              alt={item.productName}
                              fill
                              sizes="96px"
                              className="object-cover"
                            />
                          ) : <div className="flex h-full w-full items-center justify-center text-sm font-black" style={{ color: RED, fontFamily: "'Sora', sans-serif" }}>{item.productName.slice(0, 2).toUpperCase()}</div>}
                        </div>
                      </div>

                      <div className="flex-1 space-y-3">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <h2 className="text-lg font-black" style={{ color: "#1A1410", fontFamily: "'Sora', sans-serif" }}>{item.productName}</h2>
                              {isExternal && <span className="rounded-full px-2.5 py-1 text-[11px] font-black text-white" style={{ background: "#F97316", fontFamily: "'Sora', sans-serif" }}>EXTERNO</span>}
                            </div>
                            <p className="text-sm" style={{ color: "#6B7280" }}>Variante: {item.variantLabel || "Variante padrÃƒÂ£o"}</p>
                            {isExternal ? <div className="rounded-2xl px-3 py-2 text-sm" style={{ background: "#FFF7ED", color: "#9A3412" }}><p className="font-semibold">Aguarda cotaÃƒÂ§ÃƒÂ£o</p><p className="truncate">{item.externalLink || item.availabilityNote || "Link externo submetido"}</p></div> : <p className="text-sm" style={{ color: "#6B7280" }}>{item.availabilityNote || "Produto local com preco ja definido."}</p>}
                          </div>

                          <div className="text-left sm:text-right">
                            {hasDiscount && <p className="text-sm line-through" style={{ color: "#9CA3AF" }}>{formatMoney(item.originalPrice)}</p>}
                            <p className="text-xl font-black" style={{ color: RED, fontFamily: "'Sora', sans-serif" }}>{formatMoney(item.price)}</p>
                          </div>
                        </div>

                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div className="inline-flex items-center gap-2 rounded-full border px-2 py-2" style={{ borderColor: "#F2D4CC" }}>
                            <button type="button" onClick={() => void updateQuantity(item, item.quantity - 1)} disabled={isBusy || item.quantity <= 1} className="flex h-9 w-9 items-center justify-center rounded-full border transition" style={{ borderColor: "#F2D4CC", color: isBusy || item.quantity <= 1 ? "#D1D5DB" : RED }}><MinusIcon /></button>
                            <span className="min-w-8 text-center text-base font-black" style={{ color: "#1A1410", fontFamily: "'Sora', sans-serif" }}>{item.quantity}</span>
                            <button type="button" onClick={() => void updateQuantity(item, item.quantity + 1)} disabled={isBusy} className="flex h-9 w-9 items-center justify-center rounded-full border transition" style={{ borderColor: "#F2D4CC", color: isBusy ? "#D1D5DB" : RED }}><PlusIcon /></button>
                          </div>

                          <div className="flex flex-wrap items-center gap-3 sm:justify-end">
                            <button type="button" onClick={() => setConfirmRemoveItem(item)} className="inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-semibold transition" style={{ background: RED_PALE, color: "#B42318" }}><TrashIcon />Remover</button>
                            <div className="rounded-2xl px-4 py-3 text-right" style={{ background: "#FFF4EF" }}>
                              <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#9CA3AF" }}>Subtotal</p>
                              <p className="text-lg font-black" style={{ color: RED, fontFamily: "'Sora', sans-serif" }}>{formatMoney(item.subTotal)}</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="space-y-4 rounded-[28px] border bg-white p-5 shadow-sm" style={{ borderColor: "#F2D4CC" }}>
            <div>
              <h2 className="text-xl font-black" style={{ color: "#1A1410", fontFamily: "'Sora', sans-serif" }}>Resumo do pedido</h2>
              <p className="mt-1 text-sm" style={{ color: "#6B7280" }}>Se misturares produtos locais e internacionais, fechamos a parte local agora e a internacional segue como proposta separada.</p>
            </div>

            <div className="space-y-3 rounded-2xl p-4" style={{ background: "#FFF8F5" }}>
              <div className="flex items-center justify-between text-sm"><span style={{ color: "#6B7280" }}>Subtotal local</span><strong style={{ color: "#1A1410", fontFamily: "'Sora', sans-serif" }}>{formatMoney(selectedLocalSubtotal)}</strong></div>
              <div className="flex items-center justify-between text-sm"><span style={{ color: "#6B7280" }}>Entrega estimada</span><strong style={{ color: "#1A1410", fontFamily: "'Sora', sans-serif" }}>{formatMoney(estimatedDelivery)}</strong></div>
              <div className="flex items-center justify-between text-sm"><span style={{ color: GREEN }}>Desconto aplicado</span><strong style={{ color: GREEN, fontFamily: "'Sora', sans-serif" }}>- {formatMoney(discountAmount)}</strong></div>
            </div>

            <div className="space-y-3">
              <label className="block text-sm font-semibold" style={{ color: "#1A1410" }}>CupÃƒÂ£o</label>
              <div className="flex gap-2">
                <input value={couponCode} onChange={(event) => setCouponCode(event.target.value.toUpperCase())} placeholder="Ex.: BEMVINDO10" className="w-full rounded-2xl border px-4 py-3 text-sm outline-none" style={{ borderColor: "#F2D4CC", background: "#FFFDFC", color: "#1A1410" }} />
                <button type="button" onClick={() => void applyCoupon()} disabled={isApplyingCoupon || !couponCode.trim()} className="rounded-2xl px-4 py-3 text-sm font-bold text-white transition" style={{ background: isApplyingCoupon || !couponCode.trim() ? "#FDB8A7" : RED, cursor: isApplyingCoupon || !couponCode.trim() ? "not-allowed" : "pointer" }}>{isApplyingCoupon ? "..." : "Aplicar"}</button>
              </div>
              {coupon?.valid && <p className="text-sm font-medium" style={{ color: GREEN }}>{coupon.message}</p>}
            </div>

            <div className="rounded-2xl border px-4 py-4" style={{ borderColor: "#F2D4CC", background: "#FFF4EF" }}>
              <div className="flex items-center justify-between"><span className="text-sm font-semibold" style={{ color: "#6B7280" }}>Total final</span><strong className="text-2xl font-black" style={{ color: RED, fontFamily: "'Sora', sans-serif" }}>{formatMoney(finalTotal)}</strong></div>
            </div>

            <div className="rounded-2xl px-4 py-3 text-sm" style={{ background: "#FFF7ED", color: "#9A3412" }}>
              <p className="font-semibold">Compra internacional em paralelo</p>
              <p>{selectedExternalItems.length} item(ns) externo(s) seleccionados. Eles seguem numa proposta separada com preco final e prazo estimado, sem travar a compra local.</p>
            </div>

            <div className="rounded-2xl border px-4 py-4 text-sm" style={{ borderColor: "#F2D4CC", background: "#FFFDFC", color: "#6B7280" }}>
              <p className="font-semibold" style={{ color: "#1A1410" }}>Como esta compra vai funcionar</p>
              <p className="mt-2">1. Os produtos locais fecham agora com o total acima.</p>
              <p className="mt-1">2. Os produtos internacionais seguem para uma proposta separada.</p>
              <p className="mt-1">3. Vais acompanhar tudo no mesmo painel de pedidos.</p>
            </div>

            <div className="grid gap-3">
              <button type="button" onClick={proceedToCheckout} className="rounded-2xl px-5 py-3.5 text-center text-sm font-black text-white transition" style={{ background: selectedItems.length ? RED : "#FDB8A7", fontFamily: "'Sora', sans-serif", cursor: selectedItems.length ? "pointer" : "not-allowed" }}>{selectedExternalItems.length > 0 && selectedLocalItems.length > 0 ? "Continuar compra composta" : "Finalizar compra"}</button>
              <Link href="/" className="rounded-2xl border px-5 py-3.5 text-center text-sm font-bold transition" style={{ borderColor: "#F2D4CC", color: RED, background: "white" }}>Continuar a comprar</Link>
            </div>

            <div className="space-y-3 border-t pt-4" style={{ borderColor: "#F5D7CE" }}>
              <p className="text-xs font-bold uppercase tracking-[0.24em]" style={{ color: "#9CA3AF", fontFamily: "'Sora', sans-serif" }}>Pagamentos</p>
              <div className="flex flex-wrap gap-2"><PaymentBadge label="M-Pesa" /><PaymentBadge label="e-Mola" /><PaymentBadge label="Visa" /><PaymentBadge label="Mastercard" /></div>
            </div>
          </div>
        </aside>
      </div>
      <ClientFeedbackDock feedback={feedback} onClose={() => setFeedback(null)} />
      <ClientConfirmDialog
        open={Boolean(confirmRemoveItem)}
        title="Remover este item?"
        message={`O item ${confirmRemoveItem?.productName ?? ""} sera retirado do carrinho.`}
        confirmLabel="Remover item"
        danger
        pending={busyItemId === confirmRemoveItem?.itemId}
        onCancel={() => setConfirmRemoveItem(null)}
        onConfirm={() => {
          if (!confirmRemoveItem) return;
          void removeItem(confirmRemoveItem).finally(() => setConfirmRemoveItem(null));
        }}
      />
      <ClientConfirmDialog
        open={confirmRemoveSelected}
        title="Remover itens selecionados?"
        message={`Vamos retirar ${selectedItems.length} item(ns) selecionado(s) do carrinho.`}
        confirmLabel="Remover selecionados"
        danger
        pending={isRemovingSelected}
        onCancel={() => setConfirmRemoveSelected(false)}
        onConfirm={() => {
          void removeSelected().finally(() => setConfirmRemoveSelected(false));
        }}
      />
    </div>
  );
}


