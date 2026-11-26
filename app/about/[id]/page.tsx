import React from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Member from "@/components/user/about/members/member";
import { members } from "@/data/members";

type Props = { params: Promise<{ id: string }> };

const getIndex = (id: string): number | null => {
  if (!/^\d+$/.test(id)) return null;
  const index = Number(id);
  return index < members.length ? index : null;
};

export function generateStaticParams() {
  return members.map((_, index) => ({ id: String(index) }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const index = getIndex(id);

  if (index === null) {
    return {
      title: "Member Not Found",
      robots: { index: false, follow: false },
    };
  }

  const member = members[index];
  const position = member.position.split(" | ")[0].trim();

  return {
    title: `${member.name} - ${position}`,
    description: `${member.name}, ${position} at Infinitech Advertising Corporation, a web and mobile app development company in Makati, Philippines.`,
    alternates: { canonical: `/about/members/${id}` },
    robots: { index: false, follow: true },
  };
}

const Page = async ({ params }: Props) => {
  const { id } = await params;
  const index = getIndex(id);

  if (index === null) notFound();

  return <Member id={index} />;
};

export default Page;
