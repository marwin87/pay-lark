"use client";

import { ChevronRight, Info } from "lucide-react";
import { useTranslations } from "next-intl";
import { copyright } from "@/lib/copyright";
import { Tile, type TileColor } from "@/components/settings/Tile";

const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "dev";
const REPO_URL = "https://github.com/marwin87/pay-lark";
const LINK_CLASS = "font-medium text-green-700 underline-offset-2 hover:underline dark:text-emerald-400";

// Direct runtime dependencies and shipped fonts; update when adding or removing one (PDF fonts: backend/app/assets/fonts/LICENSES.txt).
// Each entry links to its source and credits the copyright holder, as the licenses (MIT, BSD, Apache, OFL, LGPL...) require.
type LicenseItem = { name: string; license: string; url: string; licenseUrl: string; holder: string };

const LICENSES: { group: string; items: LicenseItem[] }[] = [
  {
    group: "Frontend",
    items: [
      { name: "Next.js", license: "MIT", url: "https://github.com/vercel/next.js", licenseUrl: "https://github.com/vercel/next.js/blob/HEAD/license.md", holder: "Vercel, Inc." },
      { name: "React, React DOM", license: "MIT", url: "https://github.com/facebook/react", licenseUrl: "https://github.com/facebook/react/blob/HEAD/LICENSE", holder: "Meta Platforms, Inc. and affiliates" },
      { name: "next-intl", license: "MIT", url: "https://github.com/amannn/next-intl", licenseUrl: "https://github.com/amannn/next-intl/blob/HEAD/LICENSE", holder: "Jan Amann" },
      { name: "lucide-react", license: "ISC", url: "https://github.com/lucide-icons/lucide", licenseUrl: "https://github.com/lucide-icons/lucide/blob/HEAD/LICENSE", holder: "Lucide Contributors; portions Cole Bemis (Feather)" },
      { name: "Tailwind CSS", license: "MIT", url: "https://github.com/tailwindlabs/tailwindcss", licenseUrl: "https://github.com/tailwindlabs/tailwindcss/blob/HEAD/LICENSE", holder: "Tailwind Labs, Inc." },
    ],
  },
  {
    group: "Backend",
    items: [
      { name: "FastAPI", license: "MIT", url: "https://github.com/fastapi/fastapi", licenseUrl: "https://github.com/fastapi/fastapi/blob/HEAD/LICENSE", holder: "Sebastián Ramírez" },
      { name: "Starlette", license: "BSD-3-Clause", url: "https://github.com/Kludex/starlette", licenseUrl: "https://github.com/Kludex/starlette/blob/HEAD/LICENSE.md", holder: "Encode OSS Ltd." },
      { name: "Uvicorn", license: "BSD-3-Clause", url: "https://github.com/Kludex/uvicorn", licenseUrl: "https://github.com/Kludex/uvicorn/blob/HEAD/LICENSE.md", holder: "Encode OSS Ltd." },
      { name: "SQLAlchemy", license: "MIT", url: "https://github.com/sqlalchemy/sqlalchemy", licenseUrl: "https://github.com/sqlalchemy/sqlalchemy/blob/HEAD/LICENSE", holder: "SQLAlchemy authors and contributors" },
      { name: "Alembic", license: "MIT", url: "https://github.com/sqlalchemy/alembic", licenseUrl: "https://github.com/sqlalchemy/alembic/blob/HEAD/LICENSE", holder: "Mike Bayer and contributors" },
      { name: "Pydantic", license: "MIT", url: "https://github.com/pydantic/pydantic", licenseUrl: "https://github.com/pydantic/pydantic/blob/HEAD/LICENSE", holder: "Pydantic Services Inc. and contributors" },
      { name: "pandas", license: "BSD-3-Clause", url: "https://github.com/pandas-dev/pandas", licenseUrl: "https://github.com/pandas-dev/pandas/blob/HEAD/LICENSE", holder: "AQR Capital Management, Lambda Foundry, PyData Development Team and contributors" },
      { name: "openpyxl", license: "MIT", url: "https://openpyxl.readthedocs.io", licenseUrl: "https://foss.heptapod.net/openpyxl/openpyxl/-/blob/branch/3.1/LICENCE.rst", holder: "openpyxl contributors" },
      { name: "fpdf2", license: "LGPL-3.0", url: "https://github.com/py-pdf/fpdf2", licenseUrl: "https://github.com/py-pdf/fpdf2/blob/HEAD/LICENSE", holder: "Olivier Plathey, Mariano Reingart and contributors" },
      { name: "bcrypt", license: "Apache-2.0", url: "https://github.com/pyca/bcrypt", licenseUrl: "https://github.com/pyca/bcrypt/blob/HEAD/LICENSE", holder: "The Python Cryptographic Authority developers" },
      { name: "python-jose", license: "MIT", url: "https://github.com/mpdavis/python-jose", licenseUrl: "https://github.com/mpdavis/python-jose/blob/HEAD/LICENSE", holder: "Michael Davis" },
      { name: "python-multipart", license: "Apache-2.0", url: "https://github.com/Kludex/python-multipart", licenseUrl: "https://github.com/Kludex/python-multipart/blob/HEAD/LICENSE.txt", holder: "Andrew Dunham, Marcelo Trylesinski" },
      { name: "APScheduler", license: "MIT", url: "https://github.com/agronholm/apscheduler", licenseUrl: "https://github.com/agronholm/apscheduler/blob/HEAD/LICENSE.txt", holder: "Alex Grönholm" },
      { name: "Apprise", license: "BSD-2-Clause", url: "https://github.com/caronc/apprise", licenseUrl: "https://github.com/caronc/apprise/blob/HEAD/LICENSE", holder: "Chris Caron" },
      { name: "tzdata", license: "Apache-2.0", url: "https://github.com/python/tzdata", licenseUrl: "https://github.com/python/tzdata/blob/HEAD/LICENSE", holder: "Paul Ganssle" },
    ],
  },
  {
    group: "Fonts",
    items: [
      { name: "DejaVu Sans", license: "Bitstream Vera License", url: "https://dejavu-fonts.github.io", licenseUrl: "https://github.com/dejavu-fonts/dejavu-fonts/blob/master/LICENSE", holder: "Bitstream, Inc.; Tavmjong Bah (Arev)" },
      { name: "Noto Sans SC", license: "SIL OFL 1.1", url: "https://github.com/notofonts/noto-cjk", licenseUrl: "https://github.com/notofonts/noto-cjk/blob/HEAD/Sans/LICENSE", holder: "Adobe; Noto is a trademark of Google LLC" },
      { name: "Geist, Geist Mono", license: "SIL OFL 1.1", url: "https://github.com/vercel/geist-font", licenseUrl: "https://github.com/vercel/geist-font/blob/HEAD/LICENSE.txt", holder: "Vercel, in collaboration with basement.studio" },
      { name: "Cinzel", license: "SIL OFL 1.1", url: "https://github.com/NDISCOVER/Cinzel", licenseUrl: "https://github.com/NDISCOVER/Cinzel/blob/HEAD/OFL.txt", holder: "The Cinzel Project Authors" },
    ],
  },
];

export function AboutTile({
  color,
  t,
  isCollapsed,
  onToggle,
}: {
  color: TileColor;
  t: ReturnType<typeof useTranslations>;
  isCollapsed?: boolean;
  onToggle?: () => void;
}) {
  return (
    <Tile color={color} icon={Info} title={t("about.title")} description={t("about.description")} t={t} isCollapsed={isCollapsed} onToggle={onToggle}>
      <p className="text-sm text-slate-600 dark:text-slate-300">{t("about.text")}</p>
      <dl className="divide-y divide-slate-200 rounded-lg border border-slate-200 text-sm dark:divide-slate-700 dark:border-slate-700">
        <InfoRow label={t("about.version")}>
          <span className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-xs font-medium text-slate-700 dark:bg-slate-700 dark:text-slate-200">
            {APP_VERSION}
          </span>
        </InfoRow>
        <InfoRow label={t("about.license")}>
          <a href={`${REPO_URL}/blob/main/LICENSE`} target="_blank" rel="noopener noreferrer" className={LINK_CLASS}>
            {t("about.licenseValue")}
          </a>
        </InfoRow>
      </dl>
      <details className="group rounded-lg border border-slate-200 dark:border-slate-700">
        <summary className="flex cursor-pointer list-none items-center gap-2 px-3.5 py-2.5 text-sm font-semibold text-slate-800 focus-visible:outline-2 focus-visible:outline-green-600 dark:text-slate-100 [&::-webkit-details-marker]:hidden">
          <ChevronRight size={14} className="shrink-0 text-slate-400 transition-transform group-open:rotate-90 dark:text-slate-500" />
          {t("about.licensesTitle")}
        </summary>
        <p className="px-3.5 pb-2 text-sm text-slate-500 dark:text-slate-400">{t("about.licensesText")}</p>
        <div className="overflow-x-auto px-1.5 pb-2">
          <table className="w-full border-collapse text-[13px]">
            <tbody>
              {LICENSES.map(({ group, items }) => (
                <GroupRows key={group} group={group} items={items} />
              ))}
            </tbody>
          </table>
        </div>
      </details>
      <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
        {copyright()}. {t("about.copyright")}
      </p>
    </Tile>
  );
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 px-3.5 py-2.5">
      <dt className="shrink-0 text-slate-500 dark:text-slate-400">{label}</dt>
      <dd className="min-w-0 text-right font-medium text-slate-800 dark:text-slate-100">{children}</dd>
    </div>
  );
}

function GroupRows({ group, items }: { group: string; items: LicenseItem[] }) {
  return (
    <>
      <tr>
        <th
          colSpan={2}
          className="bg-slate-100 px-2.5 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:bg-slate-700/40 dark:text-slate-400"
        >
          {group}
        </th>
      </tr>
      {items.map(({ name, license, url, licenseUrl, holder }) => (
        <tr key={name} className="border-b border-slate-200 last:border-0 dark:border-slate-700">
          <td className="px-2.5 py-1.5">
            <a href={url} target="_blank" rel="noopener noreferrer" className={`${LINK_CLASS} text-slate-800 dark:text-slate-100`}>
              {name}
            </a>
            <span className="block text-xs text-slate-500 dark:text-slate-400">© {holder}</span>
          </td>
          <td className="whitespace-nowrap px-2.5 py-1.5 align-top text-slate-600 dark:text-slate-300">
            <a href={licenseUrl} target="_blank" rel="noopener noreferrer" className={LINK_CLASS}>
              {license}
            </a>
          </td>
        </tr>
      ))}
    </>
  );
}
