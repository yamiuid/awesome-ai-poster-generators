import { LogoMark } from "@/components/logo";

/**
 * /account/billing 加载骨架屏：镜像 billing/page.tsx 的布局结构
 * （narrow-page + account-heading + billing-card）。
 * 服务端组件，纯标记 + CSS，不引客户端组件。
 */
export default function BillingLoading() {
  return (
    <main className="narrow-page">
      <header className="site-header">
        <span className="wordmark">
          <LogoMark className="wordmark-mark" />
          <span>Text to Poster</span>
        </span>
        <nav className="header-nav" aria-hidden="true">
          <span className="skeleton-nav" />
          <span className="skeleton-avatar" />
        </nav>
      </header>
      <section className="account-heading">
        <div>
          <p className="eyebrow">Billing</p>
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
