import { useInvoiceLogsQuery } from "@/app/apiSlice";
import { formatDate } from "@/lib/utils";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR, Spinner, EmptyState } from "@/components/ui/table";

export default function InvoiceLogs() {
  const { data, isLoading } = useInvoiceLogsQuery();

  return (
    <div>
      <PageHeader title="Invoice Logs" description="History of invoice emails sent" />
      {isLoading ? (
        <Spinner />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Invoice</TH>
              <TH>To</TH>
              <TH>Subject</TH>
              <TH>Status</TH>
              <TH>Sent</TH>
            </TR>
          </THead>
          <TBody>
            {data?.data.length === 0 && (
              <TR>
                <TD colSpan={5}>
                  <EmptyState title="No invoice emails sent yet" hint="Use 'Email invoice' on an invoice to send one" />
                </TD>
              </TR>
            )}
            {data?.data.map((log) => (
              <TR key={log.id}>
                <TD className="font-medium">{log.invoice?.number || "-"}</TD>
                <TD>{log.toEmail}</TD>
                <TD className="max-w-xs truncate">{log.subject}</TD>
                <TD>
                  <Badge tone={log.status === "sent" ? "PAID" : "OVERDUE"}>{log.status}</Badge>
                </TD>
                <TD>{formatDate(log.sentAt)}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </div>
  );
}
