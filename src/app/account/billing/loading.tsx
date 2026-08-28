import { getTranslations } from "next-intl/server";
import { SiteHeader } from "@/components/site-header";

/**
 * /account/billing 加载骨架屏：镜像 billing/page.tsx 的布局结构
 * （narrow-page + account-heading + billing-card）。
 * 服务端组件，纯标记 + CSS，不引客户端组件。
 */
export default async function BillingLoading() {
  const t = await getTranslations("billing");
  return (
    <main className="narrow-page">
      <SiteHeader />
      <section className="account-heading">
        <div>
          <p className="eyebrow">{t("billing")}</p>
          <div className="skeleton-title" />
        </div>
      </section>
      <section className="billing-card" aria-hidden="true">
        <div className="skeleton-line" />
        <div className="skeleton-line" />
      </section>
    </main>
  );
}
