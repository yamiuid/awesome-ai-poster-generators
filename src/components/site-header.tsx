"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { LogoMark } from "@/components/logo";

export function SiteHeader({ children }: Readonly<{ children: ReactNode }>) {
  const [open, setOpen] = useState(false);
  const headerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    function onDocumentClick(event: MouseEvent) {
      if (
        headerRef.current &&
        !event.composedPath().includes(headerRef.current)
      ) {
        setOpen(false);
        return;
      }
      const target = event.target as HTMLElement | null;
      if (target?.closest("a")) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }
    document.addEventListener("click", onDocumentClick);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("click", onDocumentClick);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  return (
    <header className="site-header" ref={headerRef}>
      <Link className="wordmark" href="/">
        <LogoMark className="wordmark-mark" />
        <span>Text to Poster</span>
      </Link>

      <button
        type="button"
        className="header-menu-button"
        aria-expanded={open}
        aria-controls="site-header-nav"
        aria-label={open ? "Close menu" : "Open menu"}
        onClick={() => setOpen((value) => !value)}
      >
        {open ? (
          <X size={20} aria-hidden="true" />
        ) : (
          <Menu size={20} aria-hidden="true" />
        )}
      </button>

      <nav
        id="site-header-nav"
        className={`header-nav${open ? " is-open" : ""}`}
        aria-label="Primary navigation"
      >
        {children}
      </nav>
    </header>
  );
}
