export default function WidgetLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      {/* Hide Next.js dev tools overlay inside the widget iframe */}
      <style>{`
        [data-nextjs-toast], nextjs-portal, [id^="__next"],
        [class*="nextjs-toast"], [class*="react-refresh"] { display: none !important; }
      `}</style>
    </>
  );
}
