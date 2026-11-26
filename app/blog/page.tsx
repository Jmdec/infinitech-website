import React from "react";
import type { Metadata } from "next";
import BlogList from "@/components/blog/blog-list";
import { getPosts } from "@/lib/blog";

export const metadata: Metadata = {
  title: "Blog",
  description:
    "Ideas, updates, and lessons on web development, mobile apps, digital marketing, and branding from Infinitech Advertising Corporation in Makati, Philippines.",
  alternates: { canonical: "/blog" },
};

export const revalidate = 300;

const Page = async () => {
  const posts = await getPosts();
  return <BlogList posts={posts} />;
};

export default Page;
