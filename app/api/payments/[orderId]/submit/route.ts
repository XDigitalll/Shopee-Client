import { NextRequest, NextResponse } from "next/server";

// Manual proof-submission permanently disabled.
// Payments are now processed exclusively via PaySuite:
//   POST /orders/{id}/payment/paysuite
// Returns 410 Gone — a non-retryable signal to the client.

type RouteContext = {
  params: Promise<{ orderId: string }>;
};

export async function POST(_request: NextRequest, _context: RouteContext) {
  return NextResponse.json(
    {
      message:
        "O fluxo de submissao manual de pagamento foi desactivado. Usa a opcao PaySuite para pagar.",
      code: "PAYMENT_SUBMISSION_DISABLED",
    },
    { status: 410 },
  );
}
