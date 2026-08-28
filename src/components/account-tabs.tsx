"use client";

import { useTranslations } from "next-intl";
import { type ReactNode, useState } from "react";

type TabPane = Readonly<{ id: string; label: string; content: ReactNode }>;

/**
 * 客户端 Tab 切换：所有面板内容由服务端在首次渲染时一并传入，
 * 切换只做显示/隐藏，不发任何请求，页面导航与头部保持不动。
 */
export function AccountTabs({
  initialTab,
  panes,
}: Readonly<{ initialTab: string; panes: readonly TabPane[] }>) {
  const t = useTranslations("account");
  const [active, setActive] = useState(initialTab);
  return (
    <>
      <div
        className="account-tabs"
        role="tablist"
        aria-label={t("accountSections")}
      >
        {panes.map((pane) => (
          <button
            key={pane.id}
            type="button"
            role="tab"
            aria-selected={active === pane.id}
            className={`account-tab ${active === pane.id ? "is-active" : ""}`}
            onClick={() => setActive(pane.id)}
          >
            {pane.label}
          </button>
        ))}
      </div>
      {panes.map((pane) => (
        <div
          key={pane.id}
          className="account-tabpanel"
          role="tabpanel"
          hidden={active !== pane.id}
        >
          {pane.content}
        </div>
      ))}
    </>
  );
}
