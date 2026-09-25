import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { SecurityUtils } from "@/lib/securityUtils";
import { EMAIL_FORMAT_MESSAGE } from "@/components/auth/SignInForm";

const forgotSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Enter your email address.")
    .refine((value) => SecurityUtils.validateEmail(value).isValid, EMAIL_FORMAT_MESSAGE),
});

export type ForgotPasswordValues = z.infer<typeof forgotSchema>;

interface ForgotPasswordFormProps {
  /** Whatever was in the sign-in email field (WP1 item 8). */
  defaultEmail?: string;
  onSubmit: (values: ForgotPasswordValues) => Promise<void>;
  onBack: () => void;
}

export function ForgotPasswordForm({ defaultEmail = "", onSubmit, onBack }: ForgotPasswordFormProps) {
  const form = useForm<ForgotPasswordValues>({
    resolver: zodResolver(forgotSchema),
    defaultValues: { email: defaultEmail },
  });
  const isSubmitting = form.formState.isSubmitting;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <h2 className="text-lg font-semibold">Reset your password</h2>
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input
                  type="email"
                  inputMode="email"
                  placeholder="you@example.com"
                  autoComplete="email"
                  aria-required="true"
                  autoFocus
                  {...field}
                />
              </FormControl>
              <FormDescription>We'll email you a link to choose a new password.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="space-y-2">
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? "Sending..." : "Send reset link"}
          </Button>
          <Button type="button" variant="ghost" className="w-full" onClick={onBack}>
            Back to sign in
          </Button>
        </div>
      </form>
    </Form>
  );
}
