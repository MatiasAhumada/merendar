import { toast } from "sonner";
import type { ToastOptions } from "@/types/toast";

export function toastSuccess(message: string, options?: ToastOptions) {
  toast.success(message, {
    description: options?.description,
    duration: options?.duration,
  });
}

export function toastError(message: string, options?: ToastOptions) {
  toast.error(message, {
    description: options?.description,
    duration: options?.duration,
  });
}

export function toastWarning(message: string, options?: ToastOptions) {
  toast.warning(message, {
    description: options?.description,
    duration: options?.duration,
  });
}

export function toastInfo(message: string, options?: ToastOptions) {
  toast.info(message, {
    description: options?.description,
    duration: options?.duration,
  });
}
