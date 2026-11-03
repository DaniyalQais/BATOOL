import { notFound } from "next/navigation";
import Link from "next/link";
import { publicBusinessSettings as settings } from "@/features/settings/model/generated/public-settings";
import { shippingDescription } from "@/features/settings/model/shipping";
import { checkoutIsWired, releaseCopy } from "@/features/checkout/model/release-copy";
const wired = checkoutIsWired();
const pages = {
  size: {
    title: "Find your fit",
    text: [
      "Choose from the sizes listed on each product page. A size label alone does not confirm garment measurements; ask BATOOL for style-specific measurements before ordering.",
      "Any sample measurements shown for preview items are illustrative and must not be used as verified garment measurements.",
    ],
  },
  delivery: {
    title: "Delivery & returns",
    text: [
      `BATOOL is a ready-stock business. Prices are in PKR. ${shippingDescription(settings.shipping)}`,
      settings.policy_text ?? "Delivery times and exchange/refund terms have not been approved for publication.",
      releaseCopy(wired, false).availability,
    ],
  },
  contact: {
    title: "Let’s stay in touch",
    text: [
      "Contact details appear below when provided by BATOOL.",
      wired ? "For product questions or an existing order, use BATOOL’s public contact details below." : "This preview was created by Aonicon Valley.",
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
  return { title: pages[topic as keyof typeof pages]?.title ?? "Help",
    ...(Object.hasOwn(pages, topic) ? { alternates: { canonical: `/help/${topic}/` } } : {}) };
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
      {topic === "contact" && <>
        {settings.public_whatsapp && <p><a href={`https://wa.me/${settings.public_whatsapp}`} rel="noopener noreferrer">WhatsApp: +{settings.public_whatsapp}</a></p>}
        {settings.support_email && <p><a href={`mailto:${settings.support_email}`}>{settings.support_email}</a></p>}
        {!settings.public_whatsapp && !settings.support_email && <p>Public contact details have not been provided yet.</p>}
      </>}
      {topic === "delivery" && settings.payment_instructions && <>
        <h2>Payment instructions</h2><p style={{ whiteSpace: "pre-wrap" }}>{settings.payment_instructions}</p>
      </>}
      <Link href="/#collection" className="text-link">
        Back to collection →
      </Link>
    </main>
  );
}
