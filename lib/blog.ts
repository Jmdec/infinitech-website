import { API_URL, BlogPostRecord } from "@/lib/api";
import type { BlogPost } from "@/components/blog/types";

export function mapToBlogPost(record: BlogPostRecord): BlogPost {
  return {
    id: String(record.id),
    title: record.title,
    description: record.description,
    content: record.content ?? "",
    thumbnailUrl: record.thumbnail_url ?? null,
    imageUrl: record.image_urls?.[0] ?? null,
    imageUrls: record.image_urls ?? [],
    videoUrl: record.video_url,
    category: record.category,
    author: record.author,
    publishedAt: record.published_at ?? record.created_at,
  };
}

export async function getPosts(): Promise<BlogPost[]> {
  try {
    const res = await fetch(
      `${API_URL}/api/blog-posts?is_published=true&per_page=100`,
      { next: { revalidate: 300 } },
    );
    if (!res.ok) return [];
    const json = await res.json();
    const records: BlogPostRecord[] = json.data ?? [];
    return records.map(mapToBlogPost);
  } catch {
    return [];
  }
}

export async function getPost(id: string): Promise<BlogPost | null> {
  const posts = await getPosts();
  return posts.find((p) => p.id === id) ?? null;
}
