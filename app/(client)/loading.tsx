import { ClientStateCard } from "@/components/client-feedback-state";

export default function ClientSegmentLoading() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <ClientStateCard
        title="A abrir a pagina"
        message="Estamos a preparar esta area da tua conta para responder ja com contexto visivel."
      />
    </div>
  );
}
