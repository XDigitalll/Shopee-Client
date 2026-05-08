"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/auth-provider";
import { apiFetch } from "@/lib/api-client";
import type { CustomerProfile } from "@/lib/types";

const RED = "#E8431A";
const GREEN = "#2E8B57";

const SECTIONS = [
  { key: "profile", label: "Perfil" },
  { key: "delivery", label: "Entrega" },
  { key: "notifications", label: "Notificacoes" },
  { key: "security", label: "Seguranca" },
  { key: "privacy", label: "Privacidade" },
] as const;

type SectionKey = (typeof SECTIONS)[number]["key"];

function InputField({
  label,
  value,
  hint,
  onChange,
}: {
  label: string;
  value: string;
  hint?: string;
  onChange?: (event: ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <label className="grid gap-2">
      <span className="text-sm font-bold" style={{ color: "#1A1410" }}>{label}</span>
      <input
        type="text"
        value={value}
        onChange={onChange}
        className="w-full rounded-2xl border bg-[#FFFBFA] px-4 py-3 text-sm outline-none"
        style={{ borderColor: "#F2D4CC", color: "#4B5563" }}
      />
      {hint ? <span className="text-xs" style={{ color: "#8B7B74" }}>{hint}</span> : null}
    </label>
  );
}

function ToggleRow({
  title,
  copy,
  enabled,
  onToggle,
}: {
  title: string;
  copy: string;
  enabled?: boolean;
  onToggle?: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-[22px] border p-4" style={{ borderColor: "#F2D4CC", background: "#FFFDFC" }}>
      <div>
        <p className="text-sm font-bold" style={{ color: "#1A1410" }}>{title}</p>
        <p className="mt-1 text-sm leading-6" style={{ color: "#6B7280" }}>{copy}</p>
      </div>
      <button type="button" onClick={onToggle} className="rounded-full px-3 py-1 text-xs font-black" style={{ background: enabled ? "#ECFDF5" : "#FFF1EA", color: enabled ? GREEN : RED }}>
        {enabled ? "Ativo" : "Desligado"}
      </button>
    </div>
  );
}

export default function SettingsPage() {
  const { userLabel, userEmail, authSource, token } = useAuth();
  const [activeSection, setActiveSection] = useState<SectionKey>("profile");
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [form, setForm] = useState<CustomerProfile>({
    name: "",
    email: "",
    phoneNumber: "",
    deliveryCity: "",
    deliveryNeighborhood: "",
    deliveryStreet: "",
    houseNumber: "",
    deliveryReference: "",
    googleMapsLink: "",
    notifyOrderUpdates: true,
    notifyQuoteReady: true,
    notifyPromotions: false,
    authProvider: "LOCAL",
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  useEffect(() => {
    const loadProfile = async () => {
      if (!token) return;
      setIsLoading(true);
      try {
        const payload = await apiFetch<CustomerProfile>("me/profile", { token });
        setProfile(payload);
        setForm(payload);
      } catch (error) {
        setFeedback({ type: "error", msg: error instanceof Error ? error.message : "Nao foi possivel carregar as definicoes." });
      } finally {
        setIsLoading(false);
      }
    };

    void loadProfile();
  }, [token]);

  const authSourceLabel = (profile?.authProvider || authSource) === "GOOGLE" ? "Google" : "Conta local";

  const updateField = (field: keyof CustomerProfile, value: string | boolean) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleSave = async (event: FormEvent) => {
    event.preventDefault();
    if (!token) return;

    setIsSaving(true);
    setFeedback(null);
    try {
      const payload = await apiFetch<CustomerProfile>("me/profile", {
        method: "PUT",
        token,
        body: JSON.stringify({
          phoneNumber: form.phoneNumber,
          deliveryCity: form.deliveryCity,
          deliveryNeighborhood: form.deliveryNeighborhood,
          deliveryStreet: form.deliveryStreet,
          houseNumber: form.houseNumber,
          deliveryReference: form.deliveryReference,
          googleMapsLink: form.googleMapsLink,
          notifyOrderUpdates: form.notifyOrderUpdates,
          notifyQuoteReady: form.notifyQuoteReady,
          notifyPromotions: form.notifyPromotions,
        }),
      });
      setProfile(payload);
      setForm(payload);
      setFeedback({ type: "success", msg: "Definicoes guardadas com sucesso." });
    } catch (error) {
      setFeedback({ type: "error", msg: error instanceof Error ? error.message : "Nao foi possivel guardar as definicoes." });
    } finally {
      setIsSaving(false);
    }
  };

  const content = useMemo(() => {
    if (activeSection === "profile") {
      return (
        <div className="grid gap-4 md:grid-cols-2">
          <InputField label="Nome" value={form.name || userLabel || "Cliente ShopeeX"} hint="Este nome ja aparece no header e nos pedidos." />
          <InputField label="Email" value={(form.email?.endsWith("@xdigital.local") ? "" : form.email) || userEmail || "Email ainda nao configurado"} hint={form.email?.endsWith("@xdigital.local") ? "Adiciona um email real no teu perfil para receber confirmacoes de pedidos." : "Quando o Google entrar, este campo vai refletir os dados reais da conta."} />
          <InputField label="Telefone" value={form.phoneNumber || ""} onChange={(event) => updateField("phoneNumber", event.target.value)} hint="Vamos usar este numero para pagamentos e notificacoes." />
          <InputField label="Origem da conta" value={authSourceLabel} hint="Preparado para sincronizar dados reais do login Google." />
        </div>
      );
    }

    if (activeSection === "delivery") {
      return (
        <div className="grid gap-4 md:grid-cols-2">
          <InputField label="Cidade" value={form.deliveryCity || ""} onChange={(event) => updateField("deliveryCity", event.target.value)} />
          <InputField label="Bairro" value={form.deliveryNeighborhood || ""} onChange={(event) => updateField("deliveryNeighborhood", event.target.value)} />
          <InputField label="Rua" value={form.deliveryStreet || ""} onChange={(event) => updateField("deliveryStreet", event.target.value)} />
          <InputField label="Numero da casa" value={form.houseNumber || ""} onChange={(event) => updateField("houseNumber", event.target.value)} />
          <InputField label="Referencia" value={form.deliveryReference || ""} onChange={(event) => updateField("deliveryReference", event.target.value)} hint="Vai ajudar no checkout e nas entregas ao domicilio." />
          <InputField label="Google Maps" value={form.googleMapsLink || ""} onChange={(event) => updateField("googleMapsLink", event.target.value)} hint="Link opcional da localizacao para facilitar a entrega." />
        </div>
      );
    }

    if (activeSection === "notifications") {
      return (
        <div className="grid gap-4">
          <ToggleRow title="Atualizacoes do pedido" copy="Receber avisos sempre que o estado do pedido mudar." enabled={form.notifyOrderUpdates} onToggle={() => updateField("notifyOrderUpdates", !form.notifyOrderUpdates)} />
          <ToggleRow title="Cotacoes prontas" copy="Ser avisado quando um pedido externo ficar pronto para aprovacao." enabled={form.notifyQuoteReady} onToggle={() => updateField("notifyQuoteReady", !form.notifyQuoteReady)} />
          <ToggleRow title="Promocoes e novidades" copy="Receber campanhas e oportunidades especiais da loja." enabled={form.notifyPromotions} onToggle={() => updateField("notifyPromotions", !form.notifyPromotions)} />
        </div>
      );
    }

    if (activeSection === "security") {
      return (
        <div className="grid gap-4">
          <ToggleRow title="Login com Google" copy="Vamos ativar isto para captar nome, email e avatar reais da tua conta." enabled={authSource === "GOOGLE"} />
          <ToggleRow title="Alteracao de senha" copy="Disponivel para contas locais na proxima fase do perfil." />
          <ToggleRow title="Sessoes ativas" copy="No futuro vais poder terminar sessoes abertas noutros dispositivos." />
        </div>
      );
    }

    return (
      <div className="grid gap-4">
        <ToggleRow title="Dados pessoais" copy="Vamos permitir descarregar os teus dados quando a area de privacidade estiver completa." />
        <ToggleRow title="Consentimentos" copy="As preferencias de contacto e privacidade vao ficar centralizadas aqui." enabled />
        <ToggleRow title="Desativar conta" copy="Acao sensivel que vamos expor com confirmacao forte e historico." />
      </div>
    );
  }, [activeSection, authSource, authSourceLabel, form, userEmail, userLabel]);

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] border bg-white p-6 shadow-sm" style={{ borderColor: "#F2D4CC" }}>
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-semibold" style={{ color: RED }}>Conta do cliente</p>
            <h1 className="mt-1 text-3xl font-black" style={{ color: "#1A1410", fontFamily: "'Sora', sans-serif" }}>Definicoes</h1>
            <p className="mt-2 max-w-2xl text-sm leading-7" style={{ color: "#6B7280" }}>
              Esta area organiza os dados principais da conta e ja deixa tudo preparado para capturarmos informacao real quando o login com Google entrar.
            </p>
          </div>
          <Link href="/profile" className="rounded-2xl border px-4 py-2.5 text-sm font-bold" style={{ borderColor: "#F2D4CC", color: RED }}>
            Voltar ao perfil
          </Link>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="rounded-[28px] border bg-white p-4 shadow-sm" style={{ borderColor: "#F2D4CC" }}>
          <div className="space-y-2">
            {SECTIONS.map((section) => {
              const active = section.key === activeSection;
              return (
                <button
                  key={section.key}
                  type="button"
                  onClick={() => setActiveSection(section.key)}
                  className="w-full rounded-2xl px-4 py-3 text-left text-sm font-bold transition"
                  style={{
                    background: active ? RED : "#FFF8F5",
                    color: active ? "white" : "#6B7280",
                  }}
                >
                  {section.label}
                </button>
              );
            })}
          </div>
        </aside>

        <form className="rounded-[28px] border bg-white p-6 shadow-sm" style={{ borderColor: "#F2D4CC" }} onSubmit={handleSave}>
          <div className="mb-5">
            <h2 className="text-xl font-black" style={{ color: "#1A1410", fontFamily: "'Sora', sans-serif" }}>
              {SECTIONS.find((section) => section.key === activeSection)?.label}
            </h2>
            <p className="mt-2 text-sm leading-7" style={{ color: "#6B7280" }}>
              Estamos a montar estas definicoes com estrutura real, para depois ligarmos backend, Google e edicao de dados sem refazer a interface.
            </p>
          </div>

          {feedback ? (
            <div className="mb-5 rounded-2xl border px-4 py-3 text-sm font-medium" style={{ background: feedback.type === "success" ? "#ECFDF5" : "#FFF5F5", color: feedback.type === "success" ? "#166534" : "#B42318", borderColor: feedback.type === "success" ? "#BBF7D0" : "#FECACA" }}>
              {feedback.msg}
            </div>
          ) : null}

          {isLoading ? (
            <div className="h-56 animate-pulse rounded-[24px]" style={{ background: "#F3F4F6" }} />
          ) : (
            <>
          {content}

          <div className="mt-6 rounded-[24px] border px-4 py-4" style={{ borderColor: "#D1FAE5", background: "#ECFDF5" }}>
            <p className="text-sm font-bold" style={{ color: "#166534" }}>Proximo passo recomendado</p>
            <p className="mt-1 text-sm leading-6" style={{ color: "#166534" }}>
              Ligar backend para guardar telefone, morada padrao e preferencias de notificacao. Depois disso, integrar Google para preencher dados reais automaticamente.
            </p>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <button type="submit" disabled={isSaving} className="rounded-2xl px-4 py-2.5 text-sm font-black text-white" style={{ background: RED }}>
              {isSaving ? "A guardar..." : "Guardar definicoes"}
            </button>
            <Link href="/profile" className="rounded-2xl border px-4 py-2.5 text-sm font-bold" style={{ borderColor: "#F2D4CC", color: RED }}>
              Voltar ao perfil
            </Link>
          </div>
            </>
          )}
        </form>
      </section>
    </div>
  );
}
