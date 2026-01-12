import * as React from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AlertTriangle, Trash2, LogOut, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export type ConfirmationVariant = "danger" | "warning" | "info";

interface ConfirmationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  variant?: ConfirmationVariant;
  onConfirm: () => void | Promise<void>;
  onCancel?: () => void;
  isLoading?: boolean;
}

const variantConfig = {
  danger: {
    icon: Trash2,
    iconClass: "text-destructive",
    buttonClass: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
  },
  warning: {
    icon: AlertTriangle,
    iconClass: "text-amber-500",
    buttonClass: "bg-amber-500 text-white hover:bg-amber-600",
  },
  info: {
    icon: AlertCircle,
    iconClass: "text-blue-500",
    buttonClass: "bg-blue-500 text-white hover:bg-blue-600",
  },
};

/**
 * Accessible confirmation dialog for destructive or important actions.
 *
 * @example
 * ```tsx
 * <ConfirmationDialog
 *   open={showDeleteDialog}
 *   onOpenChange={setShowDeleteDialog}
 *   title="Delete Item"
 *   description="Are you sure you want to delete this item? This action cannot be undone."
 *   variant="danger"
 *   confirmText="Delete"
 *   onConfirm={handleDelete}
 * />
 * ```
 */
export function ConfirmationDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmText = "Confirm",
  cancelText = "Cancel",
  variant = "danger",
  onConfirm,
  onCancel,
  isLoading = false,
}: ConfirmationDialogProps) {
  const config = variantConfig[variant];
  const Icon = config.icon;

  const handleConfirm = async () => {
    await onConfirm();
    onOpenChange(false);
  };

  const handleCancel = () => {
    onCancel?.();
    onOpenChange(false);
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent
        className="sm:max-w-[425px]"
        aria-describedby="confirmation-description"
      >
        <AlertDialogHeader>
          <div className="flex items-center gap-3">
            <div
              className={cn(
                "flex h-10 w-10 items-center justify-center rounded-full",
                variant === "danger" && "bg-destructive/10",
                variant === "warning" && "bg-amber-500/10",
                variant === "info" && "bg-blue-500/10"
              )}
            >
              <Icon
                className={cn("h-5 w-5", config.iconClass)}
                aria-hidden="true"
              />
            </div>
            <AlertDialogTitle className="text-lg">{title}</AlertDialogTitle>
          </div>
          <AlertDialogDescription
            id="confirmation-description"
            className="pt-2 text-sm text-muted-foreground"
          >
            {description}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2 sm:gap-0">
          <AlertDialogCancel
            onClick={handleCancel}
            disabled={isLoading}
            className="mt-0"
          >
            {cancelText}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={isLoading}
            className={cn(config.buttonClass)}
          >
            {isLoading ? (
              <span className="flex items-center gap-2">
                <span
                  className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
                  aria-hidden="true"
                />
                <span>Processing...</span>
              </span>
            ) : (
              confirmText
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * Hook for managing confirmation dialog state
 */
export function useConfirmation() {
  const [state, setState] = React.useState<{
    open: boolean;
    title: string;
    description: string;
    variant: ConfirmationVariant;
    confirmText: string;
    onConfirm: () => void | Promise<void>;
  }>({
    open: false,
    title: "",
    description: "",
    variant: "danger",
    confirmText: "Confirm",
    onConfirm: () => {},
  });

  const confirm = React.useCallback(
    (options: {
      title: string;
      description: string;
      variant?: ConfirmationVariant;
      confirmText?: string;
    }): Promise<boolean> => {
      return new Promise((resolve) => {
        setState({
          open: true,
          title: options.title,
          description: options.description,
          variant: options.variant || "danger",
          confirmText: options.confirmText || "Confirm",
          onConfirm: () => resolve(true),
        });
      });
    },
    []
  );

  const close = React.useCallback(() => {
    setState((prev) => ({ ...prev, open: false }));
  }, []);

  const DialogComponent = React.useMemo(
    () => (
      <ConfirmationDialog
        open={state.open}
        onOpenChange={(open) => {
          if (!open) close();
        }}
        title={state.title}
        description={state.description}
        variant={state.variant}
        confirmText={state.confirmText}
        onConfirm={state.onConfirm}
      />
    ),
    [state, close]
  );

  return {
    confirm,
    close,
    Dialog: DialogComponent,
  };
}

/**
 * Pre-configured confirmation dialogs for common actions
 */
export const confirmations = {
  delete: (itemName: string) => ({
    title: `Delete ${itemName}`,
    description: `Are you sure you want to delete this ${itemName.toLowerCase()}? This action cannot be undone.`,
    variant: "danger" as const,
    confirmText: "Delete",
  }),
  logout: () => ({
    title: "Sign Out",
    description: "Are you sure you want to sign out of your account?",
    variant: "warning" as const,
    confirmText: "Sign Out",
  }),
  discard: () => ({
    title: "Discard Changes",
    description: "You have unsaved changes. Are you sure you want to discard them?",
    variant: "warning" as const,
    confirmText: "Discard",
  }),
  cancel: (actionName: string) => ({
    title: `Cancel ${actionName}`,
    description: `Are you sure you want to cancel this ${actionName.toLowerCase()}?`,
    variant: "warning" as const,
    confirmText: "Yes, Cancel",
  }),
};

export default ConfirmationDialog;
