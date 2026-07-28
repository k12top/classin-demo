"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AlertTriangle, Check, Info, X } from "lucide-react";
import styles from "./portal-feedback.module.css";

type ToastTone = "info" | "success" | "error";
type ConfirmTone = "default" | "danger";

type ConfirmOptions = {
  title?: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
};

type ToastItem = {
  id: number;
  message: string;
  tone: ToastTone;
};

type PendingConfirmation = {
  options: ConfirmOptions;
  resolve: (result: boolean) => void;
};

type PortalFeedbackContextValue = {
  notify: (message: string, tone?: ToastTone) => void;
  confirmAction: (options: ConfirmOptions | string) => Promise<boolean>;
};

const PortalFeedbackContext = createContext<PortalFeedbackContextValue | null>(
  null,
);

export function PortalFeedbackProvider({ children }: { children: ReactNode }) {
  const nextId = useRef(1);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [confirmation, setConfirmation] =
    useState<PendingConfirmation | null>(null);

  const dismissToast = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const notify = useCallback(
    (message: string, tone: ToastTone = "info") => {
      const id = nextId.current++;
      setToasts((current) => [...current.slice(-2), { id, message, tone }]);
      window.setTimeout(() => dismissToast(id), 4200);
    },
    [dismissToast],
  );

  const confirmAction = useCallback(
    (options: ConfirmOptions | string) =>
      new Promise<boolean>((resolve) => {
        setConfirmation({
          options:
            typeof options === "string"
              ? { description: options }
              : options,
          resolve,
        });
      }),
    [],
  );

  const settleConfirmation = (result: boolean) => {
    setConfirmation((current) => {
      current?.resolve(result);
      return null;
    });
  };

  const value = useMemo(
    () => ({ notify, confirmAction }),
    [confirmAction, notify],
  );

  return (
    <PortalFeedbackContext.Provider value={value}>
      {children}

      <div className={styles.viewport} aria-live="polite" aria-atomic="false">
        {toasts.map((toast) => {
          const Icon =
            toast.tone === "success"
              ? Check
              : toast.tone === "error"
                ? AlertTriangle
                : Info;
          return (
            <div
              key={toast.id}
              className={styles.toast}
              data-tone={toast.tone}
              role={toast.tone === "error" ? "alert" : "status"}
            >
              <span className={styles.toastIcon}>
                <Icon aria-hidden="true" />
              </span>
              <p>{toast.message}</p>
              <button
                type="button"
                className={styles.toastClose}
                onClick={() => dismissToast(toast.id)}
                aria-label="Dismiss"
              >
                <X aria-hidden="true" />
              </button>
            </div>
          );
        })}
      </div>

      {confirmation ? (
        <div
          className={styles.backdrop}
          role="presentation"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) settleConfirmation(false);
          }}
        >
          <section
            className={styles.dialog}
            data-tone={confirmation.options.tone || "default"}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="portal-confirm-title"
            aria-describedby="portal-confirm-description"
          >
            <div className={styles.dialogBody}>
              <span className={styles.dialogIcon}>
                <AlertTriangle aria-hidden="true" />
              </span>
              <h2 id="portal-confirm-title">
                {confirmation.options.title || "Please confirm"}
              </h2>
              <p id="portal-confirm-description">
                {confirmation.options.description}
              </p>
            </div>
            <div className={styles.dialogActions}>
              <button
                type="button"
                autoFocus
                onClick={() => settleConfirmation(false)}
              >
                {confirmation.options.cancelLabel || "Cancel"}
              </button>
              <button
                type="button"
                className={styles.confirm}
                onClick={() => settleConfirmation(true)}
              >
                {confirmation.options.confirmLabel || "Confirm"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </PortalFeedbackContext.Provider>
  );
}

export function usePortalFeedback() {
  const context = useContext(PortalFeedbackContext);
  if (!context) {
    throw new Error("usePortalFeedback must be used within PortalFeedbackProvider");
  }
  return context;
}
