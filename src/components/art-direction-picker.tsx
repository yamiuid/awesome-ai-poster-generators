"use client";

import { Check, ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  FEATURED_STYLES,
  isMoreStyle,
  MORE_STYLE_GROUPS,
  type PosterStyle,
  styleLabels,
} from "@/lib/domain/poster";

type Props = Readonly<{
  value: PosterStyle;
  disabled: boolean;
  onChange: (style: PosterStyle) => void;
}>;

export function ArtDirectionPicker({ value, disabled, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  function closeMenu(returnFocus: boolean): void {
    setOpen(false);
    if (returnFocus) {
      requestAnimationFrame(() => triggerRef.current?.focus());
    }
  }

  useEffect(() => {
    if (!open) {
      return;
    }

    function onPointerDown(event: PointerEvent): void {
      if (
        event.target instanceof Node &&
        !menuRef.current?.contains(event.target)
      ) {
        setOpen(false);
      }
    }

    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        requestAnimationFrame(() => triggerRef.current?.focus());
      }
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="art-direction-grid">
      {FEATURED_STYLES.map((style) => (
        <button
          key={style}
          className={`choice-chip ${value === style ? "is-active" : ""}`}
          type="button"
          onClick={() => onChange(style)}
          disabled={disabled}
          aria-pressed={value === style}
        >
          {styleLabels[style]}
        </button>
      ))}
      <div className="art-direction-more" ref={menuRef}>
        <button
          ref={triggerRef}
          className={`choice-chip art-direction-more-trigger ${isMoreStyle(value) ? "is-active" : ""}`}
          type="button"
          onClick={() => setOpen((current) => !current)}
          disabled={disabled}
          aria-expanded={open}
          aria-controls="more-styles-menu"
        >
          <span>More styles</span>
          <ChevronDown size={14} aria-hidden="true" />
        </button>
        {open && (
          <fieldset id="more-styles-menu" className="more-styles-menu">
            <legend>More art directions</legend>
            {MORE_STYLE_GROUPS.map((group) => (
              <section className="more-styles-group" key={group.label}>
                <p>{group.label}</p>
                <div>
                  {group.styles.map((style) => (
                    <button
                      key={style}
                      type="button"
                      className={value === style ? "is-selected" : ""}
                      onClick={() => {
                        onChange(style);
                        closeMenu(true);
                      }}
                      aria-pressed={value === style}
                    >
                      <span>{styleLabels[style]}</span>
                      {value === style && (
                        <Check size={14} aria-hidden="true" />
                      )}
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </fieldset>
        )}
      </div>
    </div>
  );
}
