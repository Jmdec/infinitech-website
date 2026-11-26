import React from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPost } from "@/lib/blog";

type Props = { params: Promise<{ id: string }> };

export const revalidate = 300;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const post = await getPost(id);

  if (!post) {
    return { title: "Post Not Found", robots: { index: false, follow: false } };
  }

  const description = (post.description || "").slice(0, 160);
  const image = post.thumbnailUrl ?? post.imageUrl ?? undefined;

  return {
    title: post.title,
    description,
    alternates: { canonical: `/blog/${id}` },
    openGraph: {
      type: "article",
      title: post.title,
      description,
      publishedTime: post.publishedAt ?? undefined,
      authors: post.author ? [post.author] : undefined,
      images: image ? [image] : undefined,
    },
  };
}

function formatDate(value?: string | null) {
  if (!value) return "";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

const Page = async ({ params }: Props) => {
  const { id } = await params;
  const post = await getPost(id);

  if (!post) notFound();

  const image = post.thumbnailUrl ?? post.imageUrl ?? null;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.description,
    image: image ?? undefined,
    datePublished: post.publishedAt ?? undefined,
    author: {
      "@type": post.author ? "Person" : "Organization",
      name: post.author || "Infinitech Advertising Corporation",
    },
    publisher: {
      "@type": "Organization",
      name: "Infinitech Advertising Corporation",
      logo: {
        "@type": "ImageObject",
        url: "https://infinitechphil.com/android-chrome-512x512.png",
      },
    },
    mainEntityOfPage: `https://infinitechphil.com/blog/${id}`,
  };

  return (
    <div className="relative w-full overflow-hidden bg-[#070d1f]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <article className="relative mx-auto w-full max-w-3xl px-4 pb-20 pt-28 sm:px-6">
        <Link
          href="/blog"
          className="font-mono text-xs text-[#38bdf8] hover:underline"
        >
          ← back to blog
        </Link>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          {post.category && (
            <span className="rounded-full border border-[#f5a623]/30 bg-[#f5a623]/10 px-2.5 py-0.5 font-mono text-[11px] text-[#f5a623]">
              {post.category}
            </span>
          )}
          {post.publishedAt && (
            <time
              dateTime={post.publishedAt}
              className="font-mono text-xs text-[#8a97bd]"
            >
              {formatDate(post.publishedAt)}
            </time>
          )}
          {post.author && (
            <span className="font-mono text-xs text-[#8a97bd]">
              by {post.author}
            </span>
          )}
        </div>

        <h1 className="mt-4 font-['Poetsen_One'] text-3xl font-bold leading-tight text-white sm:text-4xl">
          {post.title}
        </h1>

        {post.description && (
          <p className="mt-4 text-lg text-[#b8c3e6]">{post.description}</p>
        )}

        {image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image}
            alt={post.title}
            className="mt-8 w-full rounded-2xl border border-white/10 object-cover"
          />
        )}

        {post.videoUrl && (
          <video
            src={post.videoUrl}
            controls
            playsInline
            className="mt-8 w-full rounded-2xl border border-white/10"
          />
        )}

        {post.content && (
          <div className="mt-8 whitespace-pre-line text-[#e6ecff] leading-relaxed">
            {post.content}
          </div>
        )}

        {post.imageUrls.length > 1 && (
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {post.imageUrls.slice(1).map((src, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={src}
                src={src}
                alt={`${post.title} ${i + 2}`}
                className="w-full rounded-xl border border-white/10 object-cover"
              />
            ))}
          </div>
        )}
      </article>
    </div>
  );
};

export default Page;
