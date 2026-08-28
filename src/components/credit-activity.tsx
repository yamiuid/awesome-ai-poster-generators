import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { CreditTransactionView } from "@/lib/server/credit-ledger";

export function CreditActivity({
  transactions,
  isPro,
}: Readonly<{
  transactions: readonly CreditTransactionView[];
  isPro: boolean;
}>) {
  const locale = useLocale();
  const t = useTranslations("account");
  if (!isPro) {
    return (
      <div className="empty-history">
        <p className="eyebrow">{t("creditActivity")}</p>
        <h2>{t("trackEveryRun")}</h2>
        <p className="empty-history-copy">
          Credit activity is available on Pro. Upgrade to see exactly how many
          credits each generation used.
        </p>
        <Link className="solid-button" href="/pricing">
          {t("upgradeToPro")}
        </Link>
      </div>
    );
  }
  if (transactions.length === 0) {
    return (
      <div className="empty-history">
        <p className="eyebrow">{t("creditActivity")}</p>
        <h2>{t("noCreditsSpent")}</h2>
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
            <th scope="col">{t("date")}</th>
            <th scope="col">{t("prompt")}</th>
            <th scope="col">{t("mode")}</th>
            <th scope="col">{t("resolution")}</th>
            <th scope="col">{t("quality")}</th>
            <th scope="col">{t("images")}</th>
            <th scope="col">{t("amount")}</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((transaction) => (
            <tr key={transaction.id}>
              <td>
                {new Date(transaction.createdAt).toLocaleDateString(locale, {
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
