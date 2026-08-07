import Link from "next/link";
import type { CreditTransactionView } from "@/lib/server/credit-ledger";

export function CreditActivity({
  transactions,
  isPro,
}: Readonly<{
  transactions: readonly CreditTransactionView[];
  isPro: boolean;
}>) {
  if (!isPro) {
    return (
      <div className="empty-history">
        <p className="eyebrow">Credit activity</p>
        <h2>Track every run&apos;s cost.</h2>
        <p className="empty-history-copy">
          Credit activity is available on Pro. Upgrade to see exactly how many
          credits each generation used.
        </p>
        <Link className="solid-button" href="/pricing">
          Upgrade to Pro
        </Link>
      </div>
    );
  }
  if (transactions.length === 0) {
    return (
      <div className="empty-history">
        <p className="eyebrow">Credit activity</p>
        <h2>No credits spent yet.</h2>
        <p className="empty-history-copy">
          Your first Pro run will appear here with its exact credit cost.
        </p>
      </div>
    );
  }
  return (
    <div className="credit-activity">
      <table className="credit-activity-table">
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">Prompt</th>
            <th scope="col">Mode</th>
            <th scope="col">Resolution</th>
            <th scope="col">Quality</th>
            <th scope="col">Images</th>
            <th scope="col">Amount</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((transaction) => (
            <tr key={transaction.id}>
              <td>
                {new Date(transaction.createdAt).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </td>
              <td
                className="credit-prompt"
                title={transaction.generation?.prompt}
              >
                {transaction.generation?.prompt ?? "—"}
              </td>
              <td>{transaction.generation?.mode ?? "—"}</td>
              <td>{transaction.generation?.resolution ?? "—"}</td>
              <td>{transaction.generation?.quality ?? "—"}</td>
              <td>{transaction.generation?.imageCount ?? "—"}</td>
              <td className={`credit-amount is-${transaction.kind}`}>
                {transaction.kind === "refund" ? "+" : "−"}
                {transaction.amount}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
