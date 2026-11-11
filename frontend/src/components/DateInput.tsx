import { useRef, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { parseDeadlineDate } from '../lib/workflow';
import { Input } from './ui';

export function DateInput({
  id,
  value,
  onChange,
  describedBy,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  describedBy?: string;
}) {
  const picker = useRef<HTMLInputElement>(null);
  const textInput = useRef<HTMLInputElement>(null);
  const [nativeFallback, setNativeFallback] = useState(false);
  let calendarDate = '';
  try {
    calendarDate = parseDeadlineDate(value);
  } catch {
    // Keep incomplete keyboard input while the calendar starts without a selection.
  }
  const chooseDate = (iso: string) => onChange(iso ? iso.split('-').reverse().join('/') : '');

  if (nativeFallback)
    return (
      <Input
        id={id}
        type="date"
        autoFocus
        required
        aria-describedby={describedBy}
        value={calendarDate}
        onChange={(event) => chooseDate(event.target.value)}
      />
    );

  return (
    <div className="deadline-text-input">
      <button
        type="button"
        className="deadline-calendar-trigger"
        aria-label="Chọn ngày trên lịch"
        aria-haspopup="dialog"
        onClick={() => {
          try {
            if (!picker.current?.showPicker) {
              setNativeFallback(true);
              return;
            }
            picker.current.showPicker();
          } catch {
            setNativeFallback(true);
          }
        }}
      >
        <CalendarDays size={18} aria-hidden="true" />
      </button>
      <Input
        ref={textInput}
        id={id}
        type="text"
        autoComplete="off"
        placeholder="DD/MM/YYYY"
        maxLength={10}
        required
        aria-describedby={describedBy}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      <input
        ref={picker}
        className="deadline-native-calendar"
        type="date"
        tabIndex={-1}
        aria-hidden="true"
        value={calendarDate}
        onChange={(event) => {
          chooseDate(event.target.value);
          textInput.current?.focus();
        }}
      />
    </div>
  );
}
