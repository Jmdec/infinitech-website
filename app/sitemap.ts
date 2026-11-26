import type { MetadataRoute } from "next";
import { getPosts } from "@/lib/blog";

const baseUrl = "https://infinitechphil.com";

const routes: {
  path: string;
  priority: number;
  changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"];
}[] = [
  { path: "", priority: 1, changeFrequency: "weekly" },
  { path: "/about", priority: 0.7, changeFrequency: "monthly" },
  { path: "/solutions", priority: 0.9, changeFrequency: "monthly" },
  { path: "/blog", priority: 0.8, changeFrequency: "weekly" },
  { path: "/pricing", priority: 0.7, changeFrequency: "monthly" },
  { path: "/contact", priority: 0.7, changeFrequency: "yearly" },
  { path: "/quote", priority: 0.6, changeFrequency: "yearly" },
  { path: "/faq", priority: 0.6, changeFrequency: "monthly" },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const pages: MetadataRoute.Sitemap = routes.map((route) => ({
    url: `${baseUrl}${route.path}`,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));

  const posts = await getPosts();
  const postPages: MetadataRoute.Sitemap = posts.map((post) => ({
    url: `${baseUrl}/blog/${post.id}`,
    ...(post.publishedAt && { lastModified: new Date(post.publishedAt) }),
    changeFrequency: "monthly" as const,
    priority: 0.7,
  }));

  return [...pages, ...postPages];
}
