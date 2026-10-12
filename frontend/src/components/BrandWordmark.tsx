import { BRAND } from "@/lib/brand";

export default function BrandWordmark() {
  const [first, second] = BRAND.wordmark;
  return (
    <>
      <span className="text-[#10231A] dark:text-slate-100">{first}</span>
      <span className="text-[#079447] dark:text-emerald-500">{second}</span>
    </>
  );
}
