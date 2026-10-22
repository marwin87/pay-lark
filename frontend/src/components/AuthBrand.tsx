import Image from "next/image";
import { useTranslations } from "next-intl";
import { BRAND } from "@/lib/brand";
import BrandWordmark from "@/components/BrandWordmark";

export default function AuthBrand() {
  const t = useTranslations("Auth");
  return (
    <div className="mb-8 flex flex-col items-center gap-3">
      <Image
        src="/paylark-logo.png"
        alt={BRAND.name}
        width={96}
        height={96}
        className="rounded-2xl shadow-md"
        priority
      />
      <div className="text-center">
        <p className="text-xl font-bold tracking-tight sm:text-2xl">
          <BrandWordmark />
        </p>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t("brandTagline")}</p>
      </div>
    </div>
  );
}
