import Header from "@/components/Header";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import SupportChat from "@/components/support/SupportChat";
import SEOHead from "@/components/SEOHead";

export default function Support() {
  return (
    <>
      <SEOHead
        title="Support - Des Moines Insider"
        description="Get help with your account, subscription, events, and more. Chat with our support assistant or connect with a human."
        keywords={["Des Moines Insider support", "help", "customer service", "contact support"]}
      />
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container mx-auto px-4 py-8">
          <div className="mx-auto max-w-2xl">
            <Breadcrumbs className="mb-4" items={[{ label: "Home", href: "/" }, { label: "Support" }]} />
            <div className="mb-6 text-center">
              <h1 className="text-2xl font-bold sm:text-3xl">How can we help?</h1>
              <p className="mt-2 text-muted-foreground">
                Ask our assistant — it answers from our help center and can connect you with a human anytime.
              </p>
            </div>
            <SupportChat />
          </div>
        </div>
      </div>
    </>
  );
}
