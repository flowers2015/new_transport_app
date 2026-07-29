import React, { useEffect, useRef, useState } from 'react';
import {
  CARGO_VALUE_LOCKED_UNIT,
  CARGO_VALUE_UNIT_LOCKED,
  CARGO_VALUE_UNIT_OPTIONS,
  CargoValueUnit,
  convertAmountToRials,
  formatCargoValueShort,
  formatRialsPreview,
  getCargoValueUnitLabel,
  normalizeAmountInput,
  rialsToAmountAndUnit,
} from '../utils/cargoValueUtils';

interface CargoValueInputProps {
  valueRials: number;
  onChangeRials: (rials: number) => void;
  resetKey?: string | number;
  required?: boolean;
  disabled?: boolean;
  inputClassName?: string;
  selectClassName?: string;
}

const CargoValueInput: React.FC<CargoValueInputProps> = ({
  valueRials,
  onChangeRials,
  resetKey,
  required = false,
  disabled = false,
  inputClassName = 'w-full px-3 py-2 border rounded',
  selectClassName = 'px-3 py-2 border rounded bg-white min-w-[140px]',
}) => {
  const [amount, setAmount] = useState('');
  const [unit, setUnit] = useState<CargoValueUnit>(CARGO_VALUE_LOCKED_UNIT);
  const skipExternalSyncRef = useRef(false);
  const unitLocked = CARGO_VALUE_UNIT_LOCKED;
  const effectiveUnit = unitLocked ? CARGO_VALUE_LOCKED_UNIT : unit;

  useEffect(() => {
    if (skipExternalSyncRef.current) {
      skipExternalSyncRef.current = false;
      return;
    }
    const display = rialsToAmountAndUnit(valueRials);
    setAmount(display.amount);
    setUnit(unitLocked ? CARGO_VALUE_LOCKED_UNIT : display.unit);
  }, [valueRials, resetKey, unitLocked]);

  const syncRials = (nextAmount: string, nextUnit: CargoValueUnit) => {
    skipExternalSyncRef.current = true;
    onChangeRials(convertAmountToRials(nextAmount, nextUnit));
  };

  const handleAmountChange = (raw: string) => {
    const normalized = normalizeAmountInput(raw);
    setAmount(normalized);
    syncRials(normalized, effectiveUnit);
  };

  const handleUnitChange = (nextUnit: CargoValueUnit) => {
    if (unitLocked) return;
    setUnit(nextUnit);
    syncRials(amount, nextUnit);
  };

  const previewRials = convertAmountToRials(amount, effectiveUnit);

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          inputMode="decimal"
          value={amount}
          onChange={(e) => handleAmountChange(e.target.value)}
          className={`${inputClassName} flex-1 min-w-[100px]${disabled ? ' bg-slate-100 text-slate-500 cursor-not-allowed' : ''}`}
          dir="ltr"
          required={required}
          disabled={disabled}
          readOnly={disabled}
          placeholder="مثال: 11.4"
        />
        {unitLocked ? (
          <div
            className={`${selectClassName} bg-slate-100 text-slate-700 cursor-not-allowed select-none flex items-center`}
            title="فعلاً فقط میلیارد تومان مجاز است"
            aria-disabled="true"
          >
            {getCargoValueUnitLabel(CARGO_VALUE_LOCKED_UNIT)}
          </div>
        ) : (
          <select
            value={unit}
            onChange={(e) => handleUnitChange(e.target.value as CargoValueUnit)}
            className={`${selectClassName}${disabled ? ' bg-slate-100 text-slate-500 cursor-not-allowed' : ''}`}
            disabled={disabled}
          >
            {CARGO_VALUE_UNIT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        )}
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
