import { Helmet } from "react-helmet-async";

interface NoIndexMetaProps {
  nofollow?: boolean;
}

export default function NoIndexMeta({ nofollow = false }: NoIndexMetaProps) {
  const content = nofollow ? "noindex, nofollow" : "noindex, follow";

  return (
    <Helmet>
      <meta name="robots" content={content} />
      <meta name="googlebot" content={content} />
    </Helmet>
  );
}
