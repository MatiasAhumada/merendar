"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Cancel01Icon } from "hugeicons-react";
import { useReducedMotion } from "framer-motion";

interface GenericModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl" | "2xl" | "4xl";
  variant?: "default" | "dark";
}

const SIZE_CLASSES = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-xl",
  "2xl": "max-w-2xl",
  "4xl": "max-w-4xl",
};

export function GenericModal({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  size = "md",
  variant = "default",
}: GenericModalProps) {
  const isDark = variant === "dark";
  const shouldReduceMotion = useReducedMotion();

  const bgClass = isDark ? "bg-onyx" : "bg-neutral-950";
  const headerBgClass = isDark ? "bg-neutral-950" : "bg-neutral-900";
  const footerBgClass = isDark ? "bg-neutral-950" : "bg-neutral-900";
  const contentBgClass = isDark ? "bg-onyx" : "bg-neutral-950";

  const modalVariants = {
    hidden: { opacity: 0, scale: 0.95, y: 20 },
    visible: {
      opacity: 1,
      scale: 1,
      y: 0,
      transition: {
        type: "spring",
        stiffness: 300,
        damping: 30,
      },
    },
    exit: {
      opacity: 0,
      scale: 0.95,
      y: 20,
      transition: {
        type: "spring",
        stiffness: 300,
        damping: 30,
      },
    },
  };

  const backdropVariants = {
    hidden: { opacity: 0, backdropBlur: 0 },
    visible: {
      opacity: 1,
      backdropBlur: 4,
      transition: {
        duration: 0.2,
      },
    },
    exit: {
      opacity: 0,
      backdropBlur: 0,
      transition: {
        duration: 0.2,
      },
    },
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            variants={shouldReduceMotion ? undefined : backdropVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            onClick={() => onOpenChange(false)}
            className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm"
          />
          <motion.div
            variants={shouldReduceMotion ? undefined : modalVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
          >
            <div
              className={`${bgClass} border border-neutral-800 rounded-xl shadow-2xl ${SIZE_CLASSES[size]} w-full max-h-[90vh] overflow-y-auto pointer-events-auto`}
            >
              <div
                className={`flex items-center justify-between p-6 border-b border-neutral-800 ${headerBgClass}`}
              >
                <div>
                  <h2 className="text-lg font-semibold text-white">
                    {title}
                  </h2>
                  {description && (
                    <p className="text-sm text-neutral-400 mt-1">
                      {description}
                    </p>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onOpenChange(false)}
                  className="text-neutral-400 hover:text-white hover:bg-neutral-800"
                >
                  <Cancel01Icon size={20} />
                </Button>
              </div>
              <div className={`p-6 ${contentBgClass}`}>{children}</div>
              {footer && (
                <div
                  className={`flex justify-end gap-2 p-6 border-t border-neutral-800 ${footerBgClass}`}
                >
                  {footer}
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

interface ConfirmModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  onConfirm: () => void;
  onCancel?: () => void;
  confirmText?: string;
  cancelText?: string;
  variant?: "default" | "destructive";
  loading?: boolean;
}

export function ConfirmModal({
  open,
  onOpenChange,
  title,
  description,
  onConfirm,
  onCancel,
  confirmText = "Confirmar",
  cancelText = "Cancelar",
  variant = "default",
  loading = false,
}: ConfirmModalProps) {
  const handleCancel = () => {
    onCancel?.();
    onOpenChange(false);
  };

  const handleConfirm = () => {
    onConfirm();
  };

  return (
    <GenericModal
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={handleCancel} disabled={loading}>
            {cancelText}
          </Button>
          <Button variant={variant} onClick={handleConfirm} disabled={loading}>
            {loading ? "Procesando..." : confirmText}
          </Button>
        </>
      }
    >
      <p className="text-sm text-neutral-400">{description}</p>
    </GenericModal>
  );
}
