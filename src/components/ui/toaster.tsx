import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast";
import { useToast } from "@/hooks/use-toast";

/** Global toast viewport — mount once in the app shell. */
export function Toaster() {
  const { toasts, dismiss } = useToast();

  return (
    <ToastProvider swipeDirection="right">
      {toasts.map(({ id, title, description, tone, open }) => (
        <Toast
          key={id}
          open={open}
          tone={tone}
          onOpenChange={(next) => {
            if (!next) dismiss(id);
          }}
        >
          <div className="grid min-w-0 flex-1 gap-1">
            <ToastTitle>{title}</ToastTitle>
            {description ? (
              <ToastDescription>{description}</ToastDescription>
            ) : null}
          </div>
          <ToastClose />
        </Toast>
      ))}
      <ToastViewport />
    </ToastProvider>
  );
}
