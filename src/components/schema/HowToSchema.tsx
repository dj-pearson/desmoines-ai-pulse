import { Helmet } from "react-helmet-async";

interface HowToStep {
  name: string;
  text: string;
  image?: string;
  url?: string;
}

interface HowToSchemaProps {
  name: string;
  description: string;
  image?: string;
  totalTime?: string;
  estimatedCost?: {
    value: string;
    currency?: string;
  };
  supply?: string[];
  tool?: string[];
  steps: HowToStep[];
}

export default function HowToSchema({
  name,
  description,
  image,
  totalTime,
  estimatedCost,
  supply,
  tool,
  steps,
}: HowToSchemaProps) {
  const schema = {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name,
    description,
    ...(image && { image }),
    ...(totalTime && { totalTime }),
    ...(estimatedCost && {
      estimatedCost: {
        "@type": "MonetaryAmount",
        value: estimatedCost.value,
        currency: estimatedCost.currency || "USD",
      },
    }),
    ...(supply && supply.length > 0 && {
      supply: supply.map((item) => ({
        "@type": "HowToSupply",
        name: item,
      })),
    }),
    ...(tool && tool.length > 0 && {
      tool: tool.map((item) => ({
        "@type": "HowToTool",
        name: item,
      })),
    }),
    step: steps.map((step, index) => ({
      "@type": "HowToStep",
      position: index + 1,
      name: step.name,
      text: step.text,
      ...(step.image && { image: step.image }),
      ...(step.url && { url: step.url }),
    })),
  };

  return (
    <Helmet>
      <script type="application/ld+json">{JSON.stringify(schema)}</script>
    </Helmet>
  );
}
