import React, { useEffect, useRef, useState } from 'react';
import {
  CARGO_VALUE_UNIT_OPTIONS,
  CargoValueUnit,
  convertAmountToRials,
  formatCargoValueShort,
  formatRialsPreview,
  normalizeAmountInput,
  rialsToAmountAndUnit,
} from '../utils/cargoValueUtils';

interface CargoValueInputProps {
  valueRials: number;
  onChangeRials: (rials: number) => void;
  resetKey?: string | number;
  required?: boolean;
  inputClassName?: string;
  selectClassName?: string;
}

const CargoValueInput: React.FC<CargoValueInputProps> = ({
  valueRials,
  onChangeRials,
  resetKey,
  required = false,
  inputClassName = 'w-full px-3 py-2 border rounded',
  selectClassName = 'px-3 py-2 border rounded bg-white min-w-[140px]',
}) => {
  const [amount, setAmount] = useState('');
  const [unit, setUnit] = useState<CargoValueUnit>('billion_toman');
  const skipExternalSyncRef = useRef(false);

  useEffect(() => {
    if (skipExternalSyncRef.current) {
      skipExternalSyncRef.current = false;
      return;
    }
    const display = rialsToAmountAndUnit(valueRials);
    setAmount(display.amount);
    setUnit(display.unit);
  }, [valueRials, resetKey]);

  const syncRials = (nextAmount: string, nextUnit: CargoValueUnit) => {
    skipExternalSyncRef.current = true;
    onChangeRials(convertAmountToRials(nextAmount, nextUnit));
  };

  const handleAmountChange = (raw: string) => {
    const normalized = normalizeAmountInput(raw);
    setAmount(normalized);
    syncRials(normalized, unit);
  };

  const handleUnitChange = (nextUnit: CargoValueUnit) => {
    setUnit(nextUnit);
    syncRials(amount, nextUnit);
  };

  const previewRials = convertAmountToRials(amount, unit);

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          inputMode="decimal"
          value={amount}
          onChange={(e) => handleAmountChange(e.target.value)}
          className={`${inputClassName} flex-1 min-w-[100px]`}
          dir="ltr"
          required={required}
          placeholder="مثال: 11.4"
        />
        <select
          value={unit}
          onChange={(e) => handleUnitChange(e.target.value as CargoValueUnit)}
          className={selectClassName}
        >
          {CARGO_VALUE_UNIT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      {previewRials > 0 && (
        <div className="text-xs text-slate-600 space-y-0.5">
          <div>معادل: {formatCargoValueShort(previewRials)}</div>
          <div dir="rtl">({formatRialsPreview(previewRials)})</div>
        </div>
      )}
    </div>
  );
};

export default CargoValueInput;
