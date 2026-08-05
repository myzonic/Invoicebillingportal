import { useState } from "react";
import { useLogsQuery } from "@/app/apiSlice";
import { formatDate } from "@/lib/utils";
import { PageHeader } from "@/components/PageHeader";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR, Spinner, EmptyState } from "@/components/ui/table";
import { Pagination } from "@/components/Pagination";

const MODULES = ["", "auth", "clients", "invoices", "brands", "merchants", "users", "roles", "logs", "payments"];

export default function Logs() {
  const [page, setPage] = useState(1);
  const [module, setModule] = useState("");

  const { data, isLoading } = useLogsQuery({ page, limit: 20, status: undefined, ...(module ? { module } : {}) });

  return (
    <div>
      <PageHeader title="Logs" description="Audit trail of all activity" />
      <div className="mb-4 w-48">
        <Select value={module} onChange={(e) => { setModule(e.target.value); setPage(1); }}>
          {MODULES.map((m) => (
            <option key={m} value={m}>
              {m ? `Module: ${m}` : "All modules"}
            </option>
          ))}
        </Select>
      </div>

      {isLoading ? (
        <Spinner />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Time</TH>
              <TH>User</TH>
              <TH>Module</TH>
              <TH>Action</TH>
              <TH>IP</TH>
            </TR>
          </THead>
          <TBody>
            {data?.data.length === 0 && (
              <TR>
                <TD colSpan={5}>
                  <EmptyState title="No log entries" />
                </TD>
              </TR>
            )}
            {data?.data.map((log) => (
              <TR key={log.id}>
                <TD>{formatDate(log.createdAt)}</TD>
                <TD>{log.userEmail || "-"}</TD>
                <TD className="capitalize">{log.module}</TD>
                <TD>
                  <Badge tone={log.action === "DELETE" ? "OVERDUE" : log.action === "CREATE" ? "SENT" : "PAID"}>{log.action.toLowerCase()}</Badge>
                </TD>
                <TD>{log.ip || "-"}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}

      {data && data.meta.pages > 1 && <Pagination page={page} pages={data.meta.pages} total={data.meta.total} onChange={setPage} />}
    </div>
  );
}
