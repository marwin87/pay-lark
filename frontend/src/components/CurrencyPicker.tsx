"use client";

import { useState } from "react";
import { CURRENCY_NAMES, PRESET_CURRENCIES } from "@/lib/currency";
import Dropdown from "@/components/ui/Dropdown";

type CurrencyOption = (typeof PRESET_CURRENCIES)[number] | "custom";

interface Props {
  id?: string;
  /** Show only the currency code in the closed trigger (narrow fields). */
  compact?: boolean;
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  customOption: string;
  customCurrencyAriaLabel: string;
  customCurrencyPlaceholder: string;
  inputClassName: string;
}

export default function CurrencyPicker({
  id,
  compact,
  value,
  onChange,
  ariaLabel,
  customOption,
  customCurrencyAriaLabel,
  customCurrencyPlaceholder,
  inputClassName,
}: Props) {
  const isPreset = (PRESET_CURRENCIES as readonly string[]).includes(value);
  const [currencyOption, setCurrencyOption] = useState<CurrencyOption>(
    isPreset ? (value as CurrencyOption) : "custom",
  );
  const [customCurrency, setCustomCurrency] = useState(isPreset ? "" : value);

  function handleOptionChange(option: CurrencyOption) {
    setCurrencyOption(option);
    if (option !== "custom") onChange(option);
    else onChange(customCurrency.trim().toUpperCase());
  }

  function handleCustomChange(v: string) {
    setCustomCurrency(v);
    onChange(v.trim().toUpperCase());
  }

  const options: { value: CurrencyOption; label: string; short?: string }[] = [
    ...PRESET_CURRENCIES.map((c) => ({ value: c, label: `${c} — ${CURRENCY_NAMES[c]}`, short: compact ? c : undefined })),
    { value: "custom" as const, label: customOption },
  ];

  return (
    <>
      <Dropdown
        id={id}
        ariaLabel={ariaLabel}
        value={currencyOption}
        onChange={handleOptionChange}
        options={options}
      />
      {currencyOption === "custom" && (
        <input
          aria-label={customCurrencyAriaLabel}
          value={customCurrency}
          onChange={(e) => handleCustomChange(e.target.value)}
          placeholder={customCurrencyPlaceholder}
          maxLength={10}
          className={inputClassName}
        />
      )}
    </>
  );
}
