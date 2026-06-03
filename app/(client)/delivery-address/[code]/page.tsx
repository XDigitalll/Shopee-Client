"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useMemo, useState } from "react";
import { GoogleMapsLocationField } from "@/components/google-maps-location-field";
import { apiFetch } from "@/lib/api-client";

type FormState = {
  phone: string;
  city: string;
  neighborhood: string;
  street: string;
  houseNumber: string;
  deliveryReference: string;
  googleMapsLink: string;
};

const emptyForm: FormState = {
  phone: "+258",
  city: "",
  neighborhood: "",
  street: "",
  houseNumber: "",
  deliveryReference: "",
  googleMapsLink: "",
};

function normalizePhone(value: string) {
  const digits = value.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("258")) return `+${digits}`;
  if (digits.length === 9) return `+258${digits}`;
  return `+${digits}`;
}

function DeliveryAddressForm() {
  const params = useParams<{ code: string }>();
  const searchParams = useSearchParams();
  const orderCode = decodeURIComponent(params.code || "");
  const initialPhone = searchParams.get("phone") || "";
  const [form, setForm] = useState<FormState>(() => ({
    ...emptyForm,
    phone: normalizePhone(initialPhone) || emptyForm.phone,
  }));
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const normalizedPhone = useMemo(() => normalizePhone(form.phone), [form.phone]);

  function updateField(field: keyof FormState, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);

    if (!orderCode) {
      setError("Codigo do pedido em falta.");
      return;
    }

    if (!normalizedPhone) {
      setError("Confirma o telefone usado no pedido.");
      return;
    }

    if (!form.city.trim() || !form.neighborhood.trim() || !form.street.trim() || !form.deliveryReference.trim()) {
      setError("Preenche cidade, bairro, rua e uma referencia simples para a entrega.");
      return;
    }

    setLoading(true);
    try {
      await apiFetch(`orders/${encodeURIComponent(orderCode)}/delivery/public?phone=${encodeURIComponent(normalizedPhone)}`, {
        method: "PUT",
        body: JSON.stringify({
          deliveryMethod: "DELIVERY",
          primaryPhoneNumber: normalizedPhone,
          city: form.city.trim(),
          neighborhood: form.neighborhood.trim(),
          street: form.street.trim(),
          houseNumber: form.houseNumber.trim(),
          deliveryReference: form.deliveryReference.trim(),
          googleMapsLink: form.googleMapsLink.trim(),
        }),
      });

      setMessage("Morada recebida. A equipa de delivery vai confirmar contigo antes de sair para entrega.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nao foi possivel enviar a morada.");
    } finally {
      setLoading(false);
    }
  }

  const fieldClass = "mt-2 w-full rounded-[18px] border border-[#F2D4CC] bg-white px-4 py-3 text-sm outline-none transition focus:border-[#EF3B18]";

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10">
      <section className="rounded-[28px] border border-[#F2D4CC] bg-white p-6 shadow-sm sm:p-8">
        <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#EF3B18]">Dados de entrega</p>
        <h1 className="mt-3 text-3xl font-black text-[#14110F]">Confirmar morada do pedido</h1>
        <p className="mt-3 text-sm leading-7 text-[#5F6A7A]">
          Pedido {orderCode}. Preenche uma morada simples. Se quiseres, podes tambem adicionar um link do Google Maps para ajudar a equipa.
        </p>

        <form onSubmit={submit} className="mt-8 space-y-5">
          <div>
            <label className="text-sm font-bold text-[#14110F]">Telefone usado no pedido</label>
            <input value={form.phone} onChange={(event) => updateField("phone", event.target.value)} className={fieldClass} placeholder="+258..." />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-sm font-bold text-[#14110F]">Cidade</label>
              <input value={form.city} onChange={(event) => updateField("city", event.target.value)} className={fieldClass} placeholder="Maputo" />
            </div>
            <div>
              <label className="text-sm font-bold text-[#14110F]">Bairro</label>
              <input value={form.neighborhood} onChange={(event) => updateField("neighborhood", event.target.value)} className={fieldClass} placeholder="Ex: Malhangalene" />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-[1fr_160px]">
            <div>
              <label className="text-sm font-bold text-[#14110F]">Rua ou avenida</label>
              <input value={form.street} onChange={(event) => updateField("street", event.target.value)} className={fieldClass} placeholder="Rua, avenida ou zona" />
            </div>
            <div>
              <label className="text-sm font-bold text-[#14110F]">Casa</label>
              <input value={form.houseNumber} onChange={(event) => updateField("houseNumber", event.target.value)} className={fieldClass} placeholder="Opcional" />
            </div>
          </div>

          <div>
            <label className="text-sm font-bold text-[#14110F]">Referencia para encontrar</label>
            <textarea
              value={form.deliveryReference}
              onChange={(event) => updateField("deliveryReference", event.target.value)}
              className={`${fieldClass} min-h-24`}
              placeholder="Ex: portao azul, perto da bomba, ligar ao chegar"
            />
          </div>

          <div className="rounded-[22px] bg-[#FFF7F4] p-4">
            <GoogleMapsLocationField
              label="Localizacao Google Maps"
              value={form.googleMapsLink}
              onChange={(value) => updateField("googleMapsLink", value)}
              inputClassName={fieldClass}
              hint="Opcional. A morada manual e o principal; o link do Google Maps apenas ajuda a entrega."
            />
          </div>

          {error ? <p className="rounded-2xl bg-[#FFE8E1] px-4 py-3 text-sm font-semibold text-[#C71F00]">{error}</p> : null}
          {message ? <p className="rounded-2xl bg-[#E8F8EC] px-4 py-3 text-sm font-semibold text-[#137A3D]">{message}</p> : null}

          <div className="flex flex-wrap gap-3">
            <button type="submit" disabled={loading} className="rounded-full bg-[#EF3B18] px-6 py-3 text-sm font-black text-white shadow-lg shadow-[#EF3B18]/20 disabled:opacity-60">
              {loading ? "A enviar..." : "Enviar morada"}
            </button>
            <Link href="/store" className="rounded-full border border-[#F2D4CC] px-6 py-3 text-sm font-bold text-[#EF3B18]">
              Continuar comprando
            </Link>
          </div>
        </form>
      </section>
    </main>
  );
}

export default function DeliveryAddressPage() {
  return (
    <Suspense fallback={<main className="px-4 py-10 text-center text-sm text-[#5F6A7A]">A preparar formulario...</main>}>
      <DeliveryAddressForm />
    </Suspense>
  );
}
