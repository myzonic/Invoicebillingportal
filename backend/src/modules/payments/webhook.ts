import { Router, Request, Response } from "express";
import { InvoiceStatus, LogAction, PaymentMethod, PaymentStatus } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { getOrderReferenceId, verifyWebhookSignature } from "../../services/square";
import { audit } from "../../utils/audit";

const router = Router();

/**
 * Square webhooks: events like payment.updated, payment.completed.
 * The route must receive the RAW body (mounted before express.json with
 * express.raw({ type: "application/json" })) so the HMAC can be verified.
 */
router.post("/square", async (req: Request, res: Response) => {
  try {
    const signature = String(req.headers["x-square-hmac-sha256-signature"] || "");
    const rawBody = (req as Request & { rawBody?: string }).rawBody || JSON.stringify(req.body);
    if (!verifyWebhookSignature(signature, rawBody)) {
      return res.status(401).json({ success: false, message: "Invalid signature" });
    }

    const event = req.body as {
      type?: string;
      event_type?: string;
      merchant_id?: string;
      data?: { object?: { payment?: { id: string; status: string; order_id?: string; receipt_number?: string } } };
    };
    const eventType = event.event_type || event.type || "";

    if (eventType === "payment.updated" || eventType === "payment.completed") {
      const payment = event.data?.object?.payment;
      if (payment?.status === "COMPLETED") {
        await handleCompletedPayment(payment.id, payment.order_id);
      }
    }

    res.json({ success: true, received: true });
  } catch (err) {
    console.error("[square-webhook]", err);
    res.status(500).json({ success: false, message: "Webhook processing failed" });
  }
});

async function handleCompletedPayment(paymentId: string, orderId?: string) {
  let invoiceId: string | null = null;

  if (orderId) {
    try {
      invoiceId = await getOrderReferenceId(orderId);
    } catch (e) {
      console.error("[square] retrieve order failed", e);
    }
  }

  if (!invoiceId) {
    const pending = await prisma.payment.findFirst({
      where: { reference: paymentId, method: PaymentMethod.SQUARE },
      include: { invoice: true },
    });
    invoiceId = pending?.invoiceId || null;
  }

  if (!invoiceId) return;

  const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });
  if (!invoice || invoice.status === InvoiceStatus.PAID) return;

  await prisma.$transaction([
    prisma.invoice.update({
      where: { id: invoiceId },
      data: { status: InvoiceStatus.PAID, paidAt: new Date() },
    }),
    prisma.payment.updateMany({
      where: { invoiceId, status: PaymentStatus.PENDING },
      data: { status: PaymentStatus.SUCCEEDED, reference: paymentId, capturedAt: new Date() },
    }),
  ]);

  await audit({
    module: "payments",
    action: LogAction.PAYMENT,
    details: { invoiceId, squarePaymentId: paymentId },
  });
}

export default router;
