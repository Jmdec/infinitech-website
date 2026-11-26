// components/seo/json-ld.tsx
type JsonLdProps = {
  data: Record<string, unknown> | Record<string, unknown>[];
};

export default function JsonLd({ data }: JsonLdProps) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        // Escape "<" so content can never close the script tag
        __html: JSON.stringify(data).replace(/</g, "\\u003c"),
      }}
    />
  );
}
