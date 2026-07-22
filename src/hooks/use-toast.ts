import { useSyncExternalStore } from "react";

const TOAST_LIMIT = 3;
const TOAST_REMOVE_DELAY = 4200;

export type ToastTone = "default" | "success" | "error";

export type ToastItem = {
  id: string;
  title: string;
  description?: string;
  tone?: ToastTone;
  open: boolean;
};

type ToastInput = Omit<ToastItem, "id" | "open">;

type Store = {
  toasts: ToastItem[];
};

let memory: Store = { toasts: [] };
const listeners = new Set<() => void>();
const timeouts = new Map<string, ReturnType<typeof setTimeout>>();
let count = 0;

function emit() {
  for (const listener of listeners) listener();
}

function genId() {
  count = (count + 1) % Number.MAX_SAFE_INTEGER;
  return `toast-${count}`;
}

function dismiss(id: string) {
  memory = {
    toasts: memory.toasts.map((t) =>
      t.id === id ? { ...t, open: false } : t,
    ),
  };
  emit();

  const existing = timeouts.get(id);
  if (existing) clearTimeout(existing);
  timeouts.set(
    id,
    setTimeout(() => {
      memory = { toasts: memory.toasts.filter((t) => t.id !== id) };
      timeouts.delete(id);
      emit();
    }, 200),
  );
}

/** Imperative toast API for copy/save/error feedback. */
export function toast(input: ToastInput) {
  const id = genId();
  const item: ToastItem = {
    id,
    open: true,
    tone: "default",
    ...input,
  };
  memory = {
    toasts: [item, ...memory.toasts].slice(0, TOAST_LIMIT),
  };
  emit();

  timeouts.set(
    id,
    setTimeout(() => dismiss(id), TOAST_REMOVE_DELAY),
  );

  return {
    id,
    dismiss: () => dismiss(id),
  };
}

export function useToast() {
  const toasts = useSyncExternalStore(
    (onStoreChange) => {
      listeners.add(onStoreChange);
      return () => listeners.delete(onStoreChange);
    },
    () => memory.toasts,
    () => memory.toasts,
  );

  return {
    toasts,
    toast,
    dismiss,
  };
}
