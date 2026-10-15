import { SiteFooter, SiteHeader } from "@/components/site-chrome";

/** Public website chrome (header and footer). The admin dashboard has its own layout. */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader />
      {children}
      <SiteFooter />
    </>
  );
}
