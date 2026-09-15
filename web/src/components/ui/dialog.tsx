"use client";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { NoticeRegion } from "./notice";
import { Icon } from "./icon";
import { Button } from "./button";

export function Dialog({
  title,
  children,
  onClose,
  back,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  back?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const dialog = ref.current;
    const trigger = document.activeElement;
    dialog?.showModal();
    return () => {
      dialog?.close();
      if (trigger instanceof HTMLElement) trigger.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby={id}
      onCancel={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }}
      className="handshake-dialog"
    >
      <div className="dialog-heading">
        {back}
        <h2 id={id}>{title}</h2>
        <Button aria-label={`Close ${title}`} onClick={onClose}>
          <Icon name="close" />
        </Button>
      </div>
      <NoticeRegion>{children}</NoticeRegion>
    </dialog>
  );
}
