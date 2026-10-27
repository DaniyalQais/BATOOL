import { notFound } from "next/navigation";
import Link from "next/link";
const pages = {
  size: {
    title: "Find your fit",
    text: [
      "Our stitched 3-piece collection offers S, M, L and XL with interior seam allowance. Each ensemble includes a Stitched Shirt, Trouser & Dupatta. Choose your size on each product page.",
      "The client’s verified measurement chart will be added before launch. Please do not use these sample size labels as confirmed measurements.",
    ],
  },
  delivery: {
    title: "Delivery & returns",
    text: [
      "BATOOL is being designed for customers across Pakistan.",
      "Dispatched in 48 hours with 7-day size exchange. Delivery charges, cash-on-delivery availability and full exchange terms will be provided before checkout. No orders are accepted in this preview.",
    ],
  },
  contact: {
    title: "Let’s stay in touch",
    text: [
      "BATOOL’s customer care details will appear here once provided by the brand.",
      "This preview was created by Aonicon Valley.",
    ],
  },
};
export function generateStaticParams() {
  return Object.keys(pages).map((topic) => ({ topic }));
}
export async function generateMetadata({
  params,
}: {
  params: Promise<{ topic: string }>;
}) {
  const { topic } = await params;
  return { title: pages[topic as keyof typeof pages]?.title ?? "Help" };
}
export default async function HelpPage({
  params,
}: {
  params: Promise<{ topic: string }>;
}) {
  const { topic } = await params;
  if (!Object.hasOwn(pages, topic)) notFound();
  const page = pages[topic as keyof typeof pages];
  return (
    <main id="main" className="help-page">
      <p className="eyebrow">BATOOL CUSTOMER CARE</p>
      <h1>{page.title}</h1>
      {page.text.map((p) => (
        <p key={p}>{p}</p>
      ))}
      <Link href="/#collection" className="text-link">
        Back to collection →
      </Link>
    </main>
  );
}
