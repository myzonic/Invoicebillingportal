import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Pencil, Plus } from "lucide-react";
import { useClientQuery, useInvoicesQuery } from "@/app/apiSlice";
import { useCan } from "@/lib/permissions";
import { formatDate, money } from "@/lib/utils";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR, Spinner, EmptyState } from "@/components/ui/table";

export default function ClientDetail() {
  const { id = "" } = useParams();
  const can = useCan("clients");
  const { data, isLoading } = useClientQuery(id);
  const { data: invoices } = useInvoicesQuery({ limit: 100, clientId: id });

  if (isLoading) return <Spinner />;
  const client = data?.data;

  return (
    <div>
      <PageHeader
        title={client?.name || "Client"}
        description="Client details and invoices"
        action={
          <div className="flex gap-2">
            <Link to="/dashboard/clients">
              <Button variant="outline">
                <ArrowLeft className="size-4" /> Back
              </Button>
            </Link>
            {can("update") && (
              <Link to={`/dashboard/clients/update/${id}`}>
                <Button variant="outline">
                  <Pencil className="size-4" /> Edit
                </Button>
              </Link>
            )}
            {can("create") && (
              <Link to={`/dashboard/invoices/add?client=${id}`}>
                <Button>
                  <Plus className="size-4" /> New Invoice
                </Button>
              </Link>
            )}
          </div>
        }
      />

      <Card className="mb-6">
        <CardContent className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-muted-foreground">Email</p>
            <p className="font-medium">{client?.email || "-"}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Phone</p>
            <p className="font-medium">{client?.phone || "-"}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Brand</p>
            <p className="font-medium">{client?.brand?.name || "-"}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Since</p>
            <p className="font-medium">{client ? formatDate(client.createdAt) : "-"}</p>
          </div>
          {client?.address && (
            <div className="sm:col-span-2">
              <p className="text-muted-foreground">Address</p>
              <p className="font-medium">{client.address}</p>
            </div>
          )}
          {client?.notes && (
            <div className="sm:col-span-2">
              <p className="text-muted-foreground">Notes</p>
              <p className="font-medium">{client.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <h3 className="mb-3 text-base font-semibold">Invoices</h3>
      <Table>
        <THead>
          <TR>
            <TH>Invoice</TH>
            <TH>Date</TH>
            <TH>Due</TH>
            <TH>Amount</TH>
            <TH>Status</TH>
          </TR>
        </THead>
        <TBody>
          {invoices?.data.length === 0 && (
            <TR>
              <TD colSpan={5}>
                <EmptyState title="No invoices for this client" />
              </TD>
            </TR>
          )}
          {invoices?.data.map((inv) => (
            <TR key={inv.id}>
              <TD className="font-medium">
                <Link to={`/dashboard/invoices/${inv.id}`} className="hover:underline">
                  {inv.number}
                </Link>
              </TD>
              <TD>{formatDate(inv.issueDate)}</TD>
              <TD>{formatDate(inv.dueDate)}</TD>
              <TD>{money(inv.total, inv.currency)}</TD>
              <TD>
                <StatusBadge status={inv.status} />
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </div>
  );
}
